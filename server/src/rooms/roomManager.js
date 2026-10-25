'use strict';
const C = require('../config');
const { Room } = require('./room');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.idCounter = 0;
    this.timer = null;
  }

  nextId() {
    return ++this.idCounter;
  }

  get(pin) {
    return this.rooms.get(String(pin));
  }

  createRoom() {
    if (this.rooms.size >= C.MAX_ROOMS) return null;
    let pin;
    do {
      pin = String(1000 + Math.floor(Math.random() * 9000));
    } while (this.rooms.has(pin));
    const room = new Room(pin, this);
    this.rooms.set(pin, room);
    return room;
  }

  playerCount() {
    let n = 0;
    for (const r of this.rooms.values()) n += r.players.size;
    return n;
  }

  startLoop() {
    this.timer = setInterval(() => this.tick(), C.TICK_MS);
  }

  stopLoop() {
    clearInterval(this.timer);
  }

  tick() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      try {
        room.update(now);
      } catch (err) {
        console.error('[HACHIHI] Lỗi cập nhật phòng', room.pin, err);
      }
      if (room.players.size === 0) this.rooms.delete(room.pin);
    }
  }
}

module.exports = { RoomManager };
