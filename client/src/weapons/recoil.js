// Giật tâm ngắm (aim punch). Khác với giật hình ảnh của súng cầm tay:
// tâm ngắm thật sự bị đẩy lên nên người chơi phải kéo chuột xuống để bù, giống Counter-Strike.
// Góc giật được cộng vào góc nhìn gửi lên server nên đạn bay đúng chỗ tâm ngắm đang chỉ.

// Mỗi phát bắn cộng một lực giật theo "mẫu" của súng. pitch > 0: đẩy lên. yaw: lệch trái/phải.
export const RECOIL = {
  rifle: {
    pitch: [0.010, 0.014, 0.018, 0.022, 0.025, 0.026, 0.026, 0.025, 0.025, 0.024],
    yaw: [0, 0.0015, -0.002, 0.003, -0.0035, 0.004, -0.005, 0.005, -0.004, 0.0035, -0.003, 0.0045, -0.005, 0.004],
    decay: 7, // tốc độ tâm ngắm trở về khi ngừng bắn (1/giây)
    resetAfter: 0.32, // giây không bắn thì mẫu quay về phát đầu
    gunKick: 1,
  },
  pistol: {
    pitch: [0.03, 0.034, 0.038],
    yaw: [0, 0.003, -0.004],
    decay: 9,
    resetAfter: 0.5,
    gunKick: 1.4,
  },
  shotgun: {
    pitch: [0.075],
    yaw: [0],
    decay: 5,
    resetAfter: 1.2,
    gunKick: 2.4,
  },
};

// Khi đang xả liên tục tâm ngắm hồi chậm hơn nên giật dồn lại, người chơi phải kéo chuột xuống bù.
const SUSTAINED_DECAY = 0.45;
const MAX_PITCH = 0.22;
const MAX_YAW = 0.12;

export class Punch {
  constructor() {
    this.pitch = 0;
    this.yaw = 0;
    this.index = 0;
    this.lastShot = -1e9;
    this.decay = 7;
    this.resetAfter = 0.32;
  }

  reset() {
    this.pitch = 0;
    this.yaw = 0;
    this.index = 0;
    this.lastShot = -1e9;
  }

  // now: giây. Trả về cấu hình giật của súng để nơi gọi dùng cho hiệu ứng khác.
  kick(weaponId, now) {
    const def = RECOIL[weaponId] || RECOIL.rifle;
    if (now - this.lastShot > def.resetAfter) this.index = 0;
    const pi = Math.min(this.index, def.pitch.length - 1);
    const yi = this.index % def.yaw.length;
    this.pitch = Math.min(this.pitch + def.pitch[pi], MAX_PITCH);
    this.yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, this.yaw + def.yaw[yi]));
    this.index++;
    this.lastShot = now;
    this.decay = def.decay;
    this.resetAfter = def.resetAfter;
    return def;
  }

  // now: giây (cùng hệ với kick).
  update(dt, now) {
    const firing = now - this.lastShot < this.resetAfter;
    const k = Math.exp(-this.decay * (firing ? SUSTAINED_DECAY : 1) * dt);
    this.pitch *= k;
    this.yaw *= k;
    if (Math.abs(this.pitch) < 1e-5) this.pitch = 0;
    if (Math.abs(this.yaw) < 1e-5) this.yaw = 0;
  }
}
