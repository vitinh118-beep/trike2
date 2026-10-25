'use strict';
const C = require('../config');
const { Match } = require('../game/match');
const { WEAPONS } = require('../combat/weapons');
const { finishReload } = require('../combat/combat');

const r2 = (v) => Math.round(v * 100) / 100;

class Room {
  constructor(pin, manager) {
    this.pin = pin;
    this.manager = manager;
    this.players = new Map();
    this.hostId = 0;
    this.match = new Match(this);
  }

  teamCount(team) {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team) n++;
    return n;
  }

  findByToken(token) {
    if (typeof token !== 'string') return null;
    for (const p of this.players.values()) if (p.token === token) return p;
    return null;
  }

  nameTaken(name) {
    const low = name.toLowerCase();
    for (const p of this.players.values()) if (p.name.toLowerCase() === low) return true;
    return false;
  }

  // Tự chia đội cho cân bằng. Trả về false nếu phòng đã đầy.
  addPlayer(p) {
    if (this.players.size >= C.MAX_PER_TEAM * 2) return false;
    const team = this.teamCount('A') <= this.teamCount('B') ? 'A' : 'B';
    if (this.teamCount(team) >= C.MAX_PER_TEAM) return false;
    p.team = team;
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    return true;
  }

  switchTeam(p, team) {
    if (this.match.phase !== 'lobby') return false;
    if (team !== 'A' && team !== 'B') return false;
    if (p.team === team) return true;
    if (this.teamCount(team) >= C.MAX_PER_TEAM) return false;
    p.team = team;
    this.sendInfo();
    return true;
  }

  removePlayer(id, now = Date.now()) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    p.alive = false;
    p.connected = false;

    if (this.hostId === id) {
      const list = [...this.players.values()];
      const next = list.find((x) => x.connected) || list[0];
      this.hostId = next ? next.id : 0;
    }
    if (this.players.size === 0) return;

    // Một đội hết người giữa trận hai đội: huỷ trận, về phòng chờ.
    if (this.match.running && this.match.twoSided && (this.teamCount('A') === 0 || this.teamCount('B') === 0)) {
      this.match.toLobby();
      return;
    }
    this.sendInfo();
    this.match.checkElimination(now);
  }

  // ---------- Gửi dữ liệu ----------
  broadcast(obj) {
    const str = JSON.stringify(obj);
    for (const p of this.players.values()) p.sendRaw(str);
  }

  info() {
    const m = this.match;
    return {
      t: 'room',
      pin: this.pin,
      host: this.hostId,
      phase: m.phase,
      round: m.round,
      scoreA: m.score.A,
      scoreB: m.score.B,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths,
        on: p.connected ? 1 : 0, alive: p.alive ? 1 : 0,
      })),
    };
  }

  sendInfo() {
    this.broadcast(this.info());
  }

  roundMsg(now) {
    const m = this.match;
    return {
      t: 'round',
      phase: m.phase,
      round: m.round,
      scoreA: m.score.A,
      scoreB: m.score.B,
      msLeft: Math.max(0, m.phaseEnd - now),
      winner: m.lastWinner,
      matchWinner: m.matchWinner,
      toWin: C.ROUNDS_TO_WIN,
    };
  }

  broadcastRound(now = Date.now()) {
    this.broadcast(this.roundMsg(now));
  }

  sendSelf(p) {
    const ammo = {};
    for (const id of Object.keys(WEAPONS)) ammo[id] = [p.ammo[id].mag, p.ammo[id].reserve];
    p.send({ t: 'self', hp: p.hp, alive: p.alive ? 1 : 0, weapon: p.weapon, reloading: p.reloadEnd ? 1 : 0, ammo });
  }

  // Snapshot có timestamp của server (ts) để client nội suy chuyển động đối thủ cho mượt.
  broadcastSnapshot(now) {
    const list = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      list.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), p.hp, WEAPONS[p.weapon].slot]);
    }
    this.broadcast({ t: 'snap', ts: now, p: list });
  }

  update(now) {
    for (const p of this.players.values()) {
      if (p.reloadEnd && now >= p.reloadEnd) finishReload(this, p);
      if (!p.connected && now - p.disconnectedAt > C.RECONNECT_GRACE_MS) this.removePlayer(p.id, now);
      else if (p.connected && now - p.lastPingAt >= C.PING_EVERY_MS) {
        p.lastPingAt = now;
        p.send({ t: 'sp', ts: now }); // client trả lại ngay, server đo RTT thật
      }
    }
    this.match.update(now);
    for (const p of this.players.values()) if (p.alive) p.pushHistory(now);
    if (this.match.phase !== 'lobby') this.broadcastSnapshot(now);
  }
}

module.exports = { Room };
