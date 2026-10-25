// Kết nối WebSocket tới game server, có thử lại để chờ server Render Free "thức dậy".

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Net {
  constructor() {
    this.ws = null;
    this.open = false;
    this.rtt = 0;
    this.avgRtt = 0;
    this.jitter = 0;
    this.snapGap = 33; // khoảng cách trung bình giữa 2 snapshot (ms)
    this.lastSnapAt = 0;
    this.handlers = new Map();
    this.pingTimer = 0;
    this.cancelled = false;
    this.pending = null;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, data) {
    const list = this.handlers.get(type);
    if (!list) return;
    for (const fn of list) {
      try {
        fn(data);
      } catch (e) {
        console.error('[net] lỗi xử lý', type, e);
      }
    }
  }

  cancel() {
    this.cancelled = true;
    if (this.pending) {
      try { this.pending.close(); } catch { /* bỏ qua */ }
    }
  }

  // Thử kết nối lặp lại cho tới khi thành công hoặc hết totalMs.
  async connect(url, { totalMs = 90000, onTick } = {}) {
    this.cancelled = false;
    const start = Date.now();
    let attempt = 0;
    const ticker = setInterval(() => {
      if (onTick) onTick({ elapsed: Date.now() - start, attempt });
    }, 1000);
    try {
      while (!this.cancelled && Date.now() - start < totalMs) {
        attempt++;
        try {
          await this.tryOpen(url, 20000);
          return;
        } catch (e) {
          if (e && e.name === 'SyntaxError') throw e; // địa chỉ không hợp lệ, không thử lại
          if (this.cancelled) break;
          await sleep(1500);
        }
      }
    } finally {
      clearInterval(ticker);
    }
    throw new Error(this.cancelled ? 'cancelled' : 'timeout');
  }

  tryOpen(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }
      this.pending = ws;
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try { ws.close(); } catch { /* bỏ qua */ }
        reject(new Error('timeout'));
      }, timeoutMs);
      ws.onopen = () => {
        if (done) {
          ws.close();
          return;
        }
        done = true;
        clearTimeout(timer);
        this.pending = null;
        this.attach(ws);
        resolve();
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error('closed'));
      };
    });
  }

  attach(ws) {
    this.ws = ws;
    this.open = true;
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'pong') {
        const r = performance.now() - m.ts;
        // Làm mượt RTT và đo jitter (độ dao động) để biết mạng có ổn định không.
        this.avgRtt = this.avgRtt ? this.avgRtt * 0.8 + r * 0.2 : r;
        this.jitter = this.jitter * 0.8 + Math.abs(r - this.avgRtt) * 0.2;
        this.rtt = Math.round(this.avgRtt);
        this.emit('rtt', this.rtt);
        return;
      }
      if (m.t === 'sp') {
        // Server tự đo RTT để bù trễ: trả lời ngay lập tức.
        this.send({ t: 'sq', ts: m.ts });
        return;
      }
      if (m.t === 'snap') {
        const now = performance.now();
        if (this.lastSnapAt) this.snapGap = this.snapGap * 0.9 + (now - this.lastSnapAt) * 0.1;
        this.lastSnapAt = now;
      }
      this.emit(m.t, m);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.open = false;
      clearInterval(this.pingTimer);
      this.emit('disconnect');
    };
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 1000);
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  // Đóng chủ động: không phát sự kiện 'disconnect'.
  close() {
    const ws = this.ws;
    this.ws = null;
    this.open = false;
    clearInterval(this.pingTimer);
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      try { ws.close(); } catch { /* bỏ qua */ }
    }
  }
}
