// Bộ tích luỹ thời gian: chạy mô phỏng theo bước cố định dù FPS thay đổi.
export class FixedStepper {
  constructor(step, maxStepsPerFrame = 12) {
    this.step = step;
    this.max = maxStepsPerFrame;
    this.acc = 0;
  }

  // Gọi mỗi khung hình với thời gian đã trôi qua (giây). Trả về alpha (0..1) để nội suy hình ảnh.
  advance(dt, fn) {
    this.acc += Math.min(Math.max(dt, 0), 0.25);
    let n = 0;
    while (this.acc >= this.step && n < this.max) {
      fn(this.step);
      this.acc -= this.step;
      n++;
    }
    // Máy bị đứng quá lâu: bỏ phần thời gian dư thay vì chạy bù mãi (tránh vòng xoáy tử thần).
    if (this.acc >= this.step) this.acc = 0;
    return this.acc / this.step;
  }

  reset() {
    this.acc = 0;
  }
}
