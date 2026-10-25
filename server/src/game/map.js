'use strict';
const data = require('../map.json');
const C = require('../config');

// Tiền xử lý các khối thành hộp AABB để kiểm tra va chạm và tia bắn.
const boxes = data.boxes.map((b) => ({
  minX: b.p[0] - b.s[0] / 2,
  maxX: b.p[0] + b.s[0] / 2,
  minY: b.p[1] - b.s[1] / 2,
  maxY: b.p[1] + b.s[1] / 2,
  minZ: b.p[2] - b.s[2] / 2,
  maxZ: b.p[2] + b.s[2] / 2,
}));

// Người chơi (hình trụ) có nằm trong tường không? Dùng bán kính nhỏ hơn client một chút để tránh báo nhầm.
function insideWall(x, y, z) {
  const r = C.PLAYER_RADIUS - 0.08;
  for (const b of boxes) {
    if (
      x + r > b.minX && x - r < b.maxX &&
      z + r > b.minZ && z - r < b.maxZ &&
      y + 0.1 < b.maxY && y + C.PLAYER_HEIGHT > b.minY
    ) return true;
  }
  return false;
}

// Người chơi có đang đứng trên một mặt đỡ (sàn hoặc đỉnh thùng) không?
function supported(x, y, z) {
  if (y < 0.06) return true;
  const r = C.PLAYER_RADIUS - 0.08;
  for (const b of boxes) {
    if (
      Math.abs(b.maxY - y) < 0.06 &&
      x + r > b.minX && x - r < b.maxX &&
      z + r > b.minZ && z - r < b.maxZ
    ) return true;
  }
  return false;
}

// Tia vs hộp (slab test). Trả về t gần nhất hoặc Infinity.
function rayBoxes(o, d, maxT) {
  let nearest = Infinity;
  for (const b of boxes) {
    let tmin = 0;
    let tmax = maxT;
    let miss = false;
    const mins = [b.minX, b.minY, b.minZ];
    const maxs = [b.maxX, b.maxY, b.maxZ];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < mins[i] || o[i] > maxs[i]) { miss = true; break; }
      } else {
        let t1 = (mins[i] - o[i]) / d[i];
        let t2 = (maxs[i] - o[i]) / d[i];
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { miss = true; break; }
      }
    }
    if (!miss && tmin < nearest) nearest = tmin;
  }
  return nearest;
}

// Khoảng cách tới mặt sàn (y = 0) theo hướng tia.
function rayFloor(o, d) {
  if (d[1] >= -1e-9) return Infinity;
  return -o[1] / d[1];
}

function spawn(team, index) {
  const s = data.spawns[team];
  const p = s.points[index % s.points.length];
  return { x: p[0], y: 0, z: p[1], yaw: s.yaw };
}

module.exports = { boxes, insideWall, supported, rayBoxes, rayFloor, spawn, data };
