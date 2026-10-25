'use strict';
const C = require('../config');
const { spawn } = require('./map');

// Luật trận: đóng băng đầu vòng -> đang đánh -> kết thúc vòng -> ... -> kết thúc trận -> về phòng chờ.
class Match {
  constructor(room) {
    this.room = room;
    this.reset();
  }

  reset() {
    this.phase = 'lobby'; // lobby | freeze | live | roundEnd | matchEnd
    this.round = 0;
    this.score = { A: 0, B: 0 };
    this.phaseEnd = 0;
    this.participants = { A: 0, B: 0 };
    this.twoSided = false;
    this.lastWinner = null;
    this.matchWinner = null;
  }

  get running() {
    return this.phase !== 'lobby';
  }

  aliveCount(team) {
    let n = 0;
    for (const p of this.room.players.values()) if (p.team === team && p.alive) n++;
    return n;
  }

  start(now) {
    if (this.phase !== 'lobby') return false;
    const room = this.room;
    this.reset();
    this.twoSided = room.teamCount('A') > 0 && room.teamCount('B') > 0;
    for (const p of room.players.values()) { p.kills = 0; p.deaths = 0; }
    this.startRound(now);
    return true;
  }

  startRound(now) {
    const room = this.room;
    this.round++;
    this.phase = 'freeze';
    this.phaseEnd = now + C.FREEZE_MS;
    this.lastWinner = null;
    this.participants = { A: 0, B: 0 };
    const idx = { A: 0, B: 0 };

    for (const p of room.players.values()) {
      if (!p.team) continue;
      if (!p.connected) {
        p.alive = false;
        p.inRound = false;
        continue;
      }
      const s = spawn(p.team, idx[p.team]++);
      p.spawn(s, now);
      this.participants[p.team]++;
      p.send({ t: 'spawn', x: s.x, y: s.y, z: s.z, yaw: s.yaw });
      room.sendSelf(p);
    }
    room.broadcastRound(now);
    room.sendInfo();
  }

  endRound(winner, now) {
    this.lastWinner = winner;
    if (winner) this.score[winner]++;
    if (winner && this.score[winner] >= C.ROUNDS_TO_WIN) {
      this.phase = 'matchEnd';
      this.matchWinner = winner;
      this.phaseEnd = now + C.MATCH_END_MS;
    } else {
      this.phase = 'roundEnd';
      this.phaseEnd = now + C.ROUND_END_MS;
    }
    this.room.broadcastRound(now);
    this.room.sendInfo();
  }

  // Gọi mỗi khi có người chết hoặc rời trận.
  checkElimination(now) {
    if (this.phase !== 'live') return;
    if (this.participants.A === 0 || this.participants.B === 0) return; // chế độ thử một mình: chỉ hết giờ mới kết thúc vòng
    const a = this.aliveCount('A');
    const b = this.aliveCount('B');
    if (a === 0 || b === 0) this.endRound(a > 0 ? 'A' : b > 0 ? 'B' : null, now);
  }

  toLobby() {
    for (const p of this.room.players.values()) {
      p.alive = false;
      p.inRound = false;
    }
    this.phase = 'lobby';
    this.round = 0;
    this.room.sendInfo();
  }

  update(now) {
    switch (this.phase) {
      case 'freeze':
        if (now >= this.phaseEnd) {
          this.phase = 'live';
          this.phaseEnd = now + C.ROUND_MS;
          this.room.broadcastRound(now);
        }
        break;
      case 'live':
        if (now >= this.phaseEnd) {
          const a = this.aliveCount('A');
          const b = this.aliveCount('B');
          this.endRound(a > b ? 'A' : b > a ? 'B' : null, now);
        }
        break;
      case 'roundEnd':
        if (now >= this.phaseEnd) this.startRound(now);
        break;
      case 'matchEnd':
        if (now >= this.phaseEnd) this.toLobby();
        break;
      default:
        break;
    }
  }
}

module.exports = { Match };
