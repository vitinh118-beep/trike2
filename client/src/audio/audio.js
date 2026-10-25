// Âm thanh tổng hợp bằng WebAudio, không cần file âm thanh bên ngoài.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  // Phải gọi sau một thao tác của người dùng (nhấp chuột) để trình duyệt cho phép phát âm thanh.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  out(vol, pan) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = vol;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      g.connect(p);
      p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  burst({ dur, freq, gain, vol = 1, pan = 0, type = 'lowpass', q = 0.7 }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out(vol, pan));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  tone({ f0, f1, dur, gain, vol = 1, pan = 0, type = 'sine', delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.out(vol, pan));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(id, vol = 1, pan = 0) {
    if (!this.ctx) return;
    if (id === 'shotgun') {
      this.burst({ dur: 0.3, freq: 1800, gain: 1.1, vol, pan });
      this.tone({ f0: 120, f1: 35, dur: 0.26, gain: 1.0, vol, pan });
    } else if (id === 'pistol') {
      this.burst({ dur: 0.1, freq: 3500, gain: 0.7, vol, pan });
      this.tone({ f0: 220, f1: 70, dur: 0.09, gain: 0.6, vol, pan });
    } else {
      this.burst({ dur: 0.14, freq: 2800, gain: 0.9, vol, pan });
      this.tone({ f0: 160, f1: 50, dur: 0.12, gain: 0.8, vol, pan });
    }
  }

  // Tiếng súng của người khác: nhỏ dần theo khoảng cách, lệch trái/phải theo hướng.
  shotAt(id, dx, dz, listenerYaw) {
    const dist = Math.hypot(dx, dz);
    const vol = Math.pow(Math.max(0, 1 - dist / 70), 1.5) * 0.9;
    if (vol < 0.02) return;
    const rx = Math.cos(listenerYaw);
    const rz = -Math.sin(listenerYaw);
    const pan = (dx * rx + dz * rz) / Math.max(dist, 1);
    this.shot(id, vol, pan);
  }

  reload(ms) {
    if (!this.ctx) return;
    this.tone({ f0: 900, f1: 500, dur: 0.05, gain: 0.35, type: 'square', delay: ms * 0.001 * 0.15 });
    this.tone({ f0: 600, f1: 900, dur: 0.06, gain: 0.35, type: 'square', delay: ms * 0.001 * 0.85 });
  }

  empty() {
    this.tone({ f0: 1200, f1: 800, dur: 0.03, gain: 0.3, type: 'square' });
  }

  // Trúng đạn: thân = tiếng "tạch" thấp, đầu = tiếng "keng" cao hai nhịp, hạ gục = thêm nhịp kết thúc.
  hit(kill, head) {
    if (head) {
      this.tone({ f0: 2600, f1: 1800, dur: 0.06, gain: 0.55, type: 'triangle' });
      this.tone({ f0: 3400, f1: 2400, dur: 0.09, gain: 0.45, type: 'triangle', delay: 0.04 });
    } else {
      this.tone({ f0: kill ? 1900 : 1400, f1: 1000, dur: 0.07, gain: 0.5 });
    }
    if (kill) this.tone({ f0: 1300, f1: 900, dur: 0.1, gain: 0.45, delay: 0.09 });
  }

  // Bước chân của người khác: nhỏ dần theo khoảng cách, lệch trái/phải theo hướng.
  stepAt(dx, dz, listenerYaw) {
    if (!this.ctx) return;
    const dist = Math.hypot(dx, dz);
    const vol = Math.pow(Math.max(0, 1 - dist / 28), 1.6) * 0.8;
    if (vol < 0.03) return;
    const rx = Math.cos(listenerYaw);
    const rz = -Math.sin(listenerYaw);
    const pan = (dx * rx + dz * rz) / Math.max(dist, 1);
    this.burst({ dur: 0.06, freq: 260, gain: 0.35, vol, pan });
  }

  hurt() {
    this.tone({ f0: 120, f1: 55, dur: 0.18, gain: 0.8 });
    this.burst({ dur: 0.15, freq: 500, gain: 0.5 });
  }

  step() {
    this.burst({ dur: 0.05, freq: 320, gain: 0.12 });
  }

  beep(freq = 880, dur = 0.12) {
    this.tone({ f0: freq, f1: freq, dur, gain: 0.35, type: 'triangle' });
  }
}
