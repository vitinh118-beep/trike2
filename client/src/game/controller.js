// Điều khiển nhân vật người chơi: di chuyển, nhảy, va chạm với bản đồ.
// File này không phụ thuộc Three.js nên dễ kiểm thử. Luôn gọi update() với bước thời gian cố định.

export const EYE = 1.6;

const R = 0.4; // bán kính thân
const H = 1.8; // chiều cao
const STEP_GROUND = 0.45; // bước lên bậc thấp khi đứng trên mặt đất
const STEP_AIR = 0.3; // hỗ trợ trèo mép khi đang nhảy

// Thông số chuyển động (tách riêng từng loại để dễ chỉnh cảm giác).
export const MOVE = {
  run: 5.6, // m/s
  walk: 2.8, // giữ Shift
  jump: 7.6, // vận tốc nhảy; đỉnh ~1.31m, đủ trèo thùng cao 1.2m
  gravity: 22,
  maxFall: 40,
  groundAccel: 14, // tốc độ đạt vận tốc mong muốn khi có input (càng cao càng nhạy)
  groundFriction: 20, // tốc độ phanh khi nhả phím (dừng gần hẳn sau ~0.1s)
  airAccel: 2.5, // kiểm soát trên không (không có input thì giữ nguyên đà)
};

export function makeBoxes(mapData) {
  return mapData.boxes.map((b) => ({
    minX: b.p[0] - b.s[0] / 2, maxX: b.p[0] + b.s[0] / 2,
    minY: b.p[1] - b.s[1] / 2, maxY: b.p[1] + b.s[1] / 2,
    minZ: b.p[2] - b.s[2] / 2, maxZ: b.p[2] + b.s[2] / 2,
  }));
}

export class Controller {
  constructor(boxes) {
    this.boxes = boxes;
    this.x = 0; this.y = 0; this.z = 0;
    this.px = 0; this.py = 0; this.pz = 0; // vị trí bước trước, để nội suy hình ảnh
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.grounded = true;
    this.canMove = true;
    this.speed = 0;
    this.keys = { f: false, b: false, l: false, r: false, jump: false, walk: false };
    // Độ lệch hình ảnh khi server kéo vị trí lại: giảm dần về 0 thay vì giật camera.
    this.cx = 0; this.cy = 0; this.cz = 0;
    this._out = { x: 0, y: 0, z: 0 };
  }

  setPosition(x, y, z, yaw) {
    this.x = x; this.y = y; this.z = z;
    this.px = x; this.py = y; this.pz = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.cx = 0; this.cy = 0; this.cz = 0;
    if (typeof yaw === 'number') this.yaw = yaw;
  }

  // Server sửa vị trí (reconciliation). Sai lệch nhỏ thì làm mượt, sai lệch lớn thì dịch chuyển luôn.
  correct(x, y, z) {
    const dx = this.x - x;
    const dy = this.y - y;
    const dz = this.z - z;
    const big = Math.hypot(dx, dy, dz) > 2;
    this.x = x; this.y = y; this.z = z;
    this.px = x; this.py = y; this.pz = z;
    this.vx *= 0.3; this.vz *= 0.3;
    if (this.vy > 0) this.vy = 0;
    if (big) {
      this.cx = 0; this.cy = 0; this.cz = 0;
    } else {
      this.cx += dx; this.cy += dy; this.cz += dz;
    }
  }

  clearKeys() {
    for (const k of Object.keys(this.keys)) this.keys[k] = false;
  }

  look(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    if (this.pitch > 1.55) this.pitch = 1.55;
    if (this.pitch < -1.55) this.pitch = -1.55;
  }

  // Vị trí để vẽ camera: nội suy giữa 2 bước vật lý (alpha) cộng độ lệch reconciliation.
  renderPos(alpha) {
    const o = this._out;
    o.x = this.px + (this.x - this.px) * alpha + this.cx;
    o.y = this.py + (this.y - this.py) * alpha + this.cy;
    o.z = this.pz + (this.z - this.pz) * alpha + this.cz;
    return o;
  }

  // Trả về mặt trên cao nhất của các hộp đang chồng lên thân người ở vị trí (x,y,z); -Infinity nếu không va chạm.
  collideTop(x, y, z) {
    let top = -Infinity;
    for (const b of this.boxes) {
      if (
        x + R > b.minX && x - R < b.maxX &&
        z + R > b.minZ && z - R < b.maxZ &&
        y + 0.001 < b.maxY && y + H > b.minY
      ) {
        if (b.maxY > top) top = b.maxY;
      }
    }
    return top;
  }

  moveHoriz(dx, dz) {
    if (!dx && !dz) return;
    const nx = this.x + dx;
    const nz = this.z + dz;
    const top = this.collideTop(nx, this.y, nz);
    if (top === -Infinity) {
      this.x = nx;
      this.z = nz;
      return;
    }
    // Thử bước/trèo lên mép thấp.
    const stepMax = this.grounded ? STEP_GROUND : STEP_AIR;
    if (top - this.y <= stepMax && this.collideTop(nx, top, nz) === -Infinity) {
      this.x = nx;
      this.z = nz;
      this.y = top;
      if (this.vy > 0) this.vy = 0;
      return;
    }
    if (dx) this.vx = 0;
    if (dz) this.vz = 0;
  }

  // Một bước vật lý. dt nên là bước cố định (xem PHYSICS_STEP).
  update(dt) {
    this.px = this.x; this.py = this.y; this.pz = this.z;

    // Độ lệch hình ảnh từ reconciliation giảm dần.
    const decay = Math.exp(-12 * dt);
    this.cx *= decay; this.cy *= decay; this.cz *= decay;
    if (Math.abs(this.cx) < 1e-4) this.cx = 0;
    if (Math.abs(this.cy) < 1e-4) this.cy = 0;
    if (Math.abs(this.cz) < 1e-4) this.cz = 0;

    // Hướng muốn đi (yaw=0 nhìn về -Z).
    let wx = 0;
    let wz = 0;
    let hasInput = false;
    if (this.canMove) {
      const f = (this.keys.f ? 1 : 0) - (this.keys.b ? 1 : 0);
      const s = (this.keys.r ? 1 : 0) - (this.keys.l ? 1 : 0);
      if (f || s) {
        hasInput = true;
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        wx = -sin * f + cos * s;
        wz = -cos * f - sin * s;
        const len = Math.hypot(wx, wz);
        wx /= len;
        wz /= len;
      }
    }

    const sp = this.keys.walk ? MOVE.walk : MOVE.run;
    if (this.grounded) {
      const a = 1 - Math.exp(-(hasInput ? MOVE.groundAccel : MOVE.groundFriction) * dt);
      this.vx += (wx * sp - this.vx) * a;
      this.vz += (wz * sp - this.vz) * a;
    } else if (hasInput) {
      const a = 1 - Math.exp(-MOVE.airAccel * dt);
      this.vx += (wx * sp - this.vx) * a;
      this.vz += (wz * sp - this.vz) * a;
    } // trên không không có input: giữ nguyên đà

    if (this.canMove && this.keys.jump && this.grounded) {
      this.vy = MOVE.jump;
      this.grounded = false;
    }

    this.moveHoriz(this.vx * dt, 0);
    this.moveHoriz(0, this.vz * dt);

    // Trục đứng
    this.vy = Math.max(this.vy - MOVE.gravity * dt, -MOVE.maxFall);
    const ny = this.y + this.vy * dt;
    this.grounded = false;
    if (this.vy <= 0) {
      let land = ny <= 0 ? 0 : -Infinity;
      for (const b of this.boxes) {
        if (
          this.x + R > b.minX && this.x - R < b.maxX &&
          this.z + R > b.minZ && this.z - R < b.maxZ &&
          b.maxY <= this.y + 0.05 && b.maxY >= ny && b.maxY > land
        ) land = b.maxY;
      }
      if (land > -Infinity) {
        this.y = land;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.y = ny;
      }
    } else if (this.collideTop(this.x, ny, this.z) !== -Infinity) {
      this.vy = 0; // đụng đầu
    } else {
      this.y = ny;
    }

    this.speed = Math.hypot(this.vx, this.vz);
  }
}
