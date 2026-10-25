'use strict';
const crypto = require('crypto');
const C = require('../config');
const { freshAmmo } = require('../combat/weapons');

class Player {
  constructor(id, name, ws) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    this.token = crypto.randomBytes(12).toString('hex');
    this.connected = true;
    this.disconnectedAt = 0;

    this.team = null; // 'A' | 'B'
    this.kills = 0;
    this.deaths = 0;

    this.alive = false;
    this.inRound = false;
    this.hp = C.MAX_HP;
    this.x = 0; this.y = 0; this.z = 0;
    this.yaw = 0; this.pitch = 0;
    this.speed = 0;

    this.weapon = 'rifle';
    this.ammo = freshAmmo();
    this.reloadEnd = 0;
    this.nextShot = 0;
    this.spray = 0; // số phát bắn liên tiếp (làm tăng tản đạn)
    this.lastShotAt = 0;

    this.budget = 3.5; // ngân sách di chuyển ngang (chống teleport/speedhack)
    this.vUp = C.RISE_CAP; // ngân sách leo/nhảy
    this.vDown = C.FALL_CAP; // ngân sách rơi
    this.riseSince = 0; // tổng độ cao đã leo kể từ lần cuối đứng trên mặt đỡ
    this.airUntil = 0; // đang trên không tới thời điểm này (để tính tản đạn)
    this.lastMoveAt = 0;
    this.lastCorrect = 0;

    this.rtt = 80; // ms, do SERVER đo (không tin số liệu từ client)
    this.lastPingAt = 0;

    this.history = []; // lịch sử vị trí để bù trễ: [{ t, x, y, z }]
  }

  spawn(s, now) {
    this.alive = true;
    this.inRound = true;
    this.hp = C.MAX_HP;
    this.x = s.x; this.y = s.y; this.z = s.z;
    this.yaw = s.yaw; this.pitch = 0;
    this.speed = 0;
    this.weapon = 'rifle';
    this.ammo = freshAmmo();
    this.reloadEnd = 0;
    this.nextShot = now + 300;
    this.spray = 0;
    this.lastShotAt = 0;
    this.budget = 3.5;
    this.vUp = C.RISE_CAP;
    this.vDown = C.FALL_CAP;
    this.riseSince = 0;
    this.airUntil = 0;
    this.lastMoveAt = now;
    this.history.length = 0; // dịch chuyển về điểm xuất phát: xoá lịch sử cũ
    this.pushHistory(now);
  }

  pushHistory(now) {
    const h = this.history;
    h.push({ t: now, x: this.x, y: this.y, z: this.z });
    while (h.length > 2 && now - h[0].t > C.HISTORY_MS) h.shift();
  }

  // Vị trí của người chơi tại thời điểm t (mili giây, cùng hệ với Date.now()).
  posAt(t) {
    const h = this.history;
    const n = h.length;
    if (n === 0) return { x: this.x, y: this.y, z: this.z };
    if (t >= h[n - 1].t) return { x: this.x, y: this.y, z: this.z }; // mới hơn bản ghi cuối: dùng vị trí hiện tại
    if (t <= h[0].t) return h[0];
    for (let i = n - 1; i > 0; i--) {
      const a = h[i - 1];
      const b = h[i];
      if (t >= a.t) {
        const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
      }
    }
    return h[0];
  }

  attach(ws) {
    this.ws = ws;
    this.connected = true;
    this.disconnectedAt = 0;
  }

  send(obj) {
    this.sendRaw(JSON.stringify(obj));
  }

  sendRaw(str) {
    const ws = this.ws;
    if (!this.connected || !ws || ws.readyState !== 1) return;
    if (ws.bufferedAmount > 1e6) return; // client quá chậm, bỏ gói thay vì dồn bộ nhớ
    try { ws.send(str); } catch { /* bỏ qua */ }
  }
}

module.exports = { Player };
