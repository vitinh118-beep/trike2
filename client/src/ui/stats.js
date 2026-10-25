// Thống kê khung hình: FPS trung bình, 1% thấp nhất (1% low), thời gian khung hình.
// Không phụ thuộc DOM nên dễ kiểm thử.

export class FrameStats {
  constructor(size = 300) {
    this.size = size;
    this.buf = new Float32Array(size);
    this.n = 0;
    this.i = 0;
  }

  push(ms) {
    this.buf[this.i] = ms;
    this.i = (this.i + 1) % this.size;
    if (this.n < this.size) this.n++;
  }

  reset() {
    this.n = 0;
    this.i = 0;
  }

  avgMs() {
    if (!this.n) return 0;
    let s = 0;
    for (let k = 0; k < this.n; k++) s += this.buf[k];
    return s / this.n;
  }

  avgFps() {
    const a = this.avgMs();
    return a > 0 ? 1000 / a : 0;
  }

  // FPS trung bình của 1% khung hình chậm nhất: phản ánh độ giật tốt hơn FPS trung bình.
  low1Fps() {
    if (!this.n) return 0;
    const arr = Array.from(this.buf.subarray(0, this.n)).sort((a, b) => b - a);
    const cnt = Math.max(1, Math.ceil(this.n * 0.01));
    let s = 0;
    for (let k = 0; k < cnt; k++) s += arr[k];
    const worst = s / cnt;
    return worst > 0 ? 1000 / worst : 0;
  }
}
