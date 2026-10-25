// Nội suy chuyển động đối thủ từ các snapshot có timestamp của server.
// Không phụ thuộc Three.js nên dễ kiểm thử.

const TWO_PI = Math.PI * 2;

function lerpAngle(a, b, k) {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return a + d * k;
}

// Đổi giờ server sang giờ client. Lấy độ trễ nhỏ nhất đã thấy làm gốc, trôi chậm lên khi mạng xấu đi,
// nhờ đó jitter của từng gói không làm chuyển động giật.
export class ClockSync {
  constructor() {
    this.offset = null;
  }

  // Trả về thời điểm của snapshot theo đồng hồ client.
  map(serverTs, recvNow) {
    const d = recvNow - serverTs;
    if (this.offset === null || d < this.offset) this.offset = d;
    else this.offset += (d - this.offset) * 0.01;
    return serverTs + this.offset;
  }
}

export class SnapshotBuffer {
  constructor(maxMs = 1000) {
    this.maxMs = maxMs;
    this.s = [];
  }

  get size() {
    return this.s.length;
  }

  clear() {
    this.s.length = 0;
  }

  push(t, x, y, z, yaw, pitch) {
    const s = this.s;
    if (s.length && t <= s[s.length - 1].t) return; // gói cũ hoặc đến sai thứ tự
    s.push({ t, x, y, z, yaw, pitch });
    while (s.length > 2 && t - s[0].t > this.maxMs) s.shift();
  }

  // Lấy trạng thái tại thời điểm t (đã trừ độ trễ nội suy). Ghi vào out; trả về false nếu chưa có dữ liệu.
  sample(t, out) {
    const s = this.s;
    const n = s.length;
    if (!n) return false;
    let a;
    let b;
    let k = 0;
    if (t <= s[0].t) {
      a = b = s[0];
    } else if (t >= s[n - 1].t) {
      // Hết dữ liệu: giữ ở trạng thái cuối. Không ngoại suy để tránh nhân vật "trượt" ra khỏi tường.
      a = b = s[n - 1];
    } else {
      let i = n - 1;
      while (i > 0 && s[i - 1].t > t) i--;
      a = s[i - 1];
      b = s[i];
      k = (t - a.t) / (b.t - a.t);
    }
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    out.z = a.z + (b.z - a.z) * k;
    out.yaw = lerpAngle(a.yaw, b.yaw, k);
    out.pitch = a.pitch + (b.pitch - a.pitch) * k;
    return true;
  }
}
