'use strict';
const C = require('../config');
const { insideWall, supported } = require('./map');
const { isNum } = require('../security/validate');

function correct(p, now) {
  if (now - p.lastCorrect < 150) return;
  p.lastCorrect = now;
  p.send({ t: 'correct', x: p.x, y: p.y, z: p.z });
}

// Nhận vị trí/hướng nhìn từ client và kiểm tra hợp lệ.
// Vị trí sai (quá nhanh, bay, trong tường, ngoài bản đồ) bị từ chối và client bị kéo về vị trí cũ.
function applyPose(room, p, m, now) {
  if (
    !isNum(m.x, -100, 100) || !isNum(m.y, -5, 30) || !isNum(m.z, -100, 100) ||
    !isNum(m.yaw, -1e4, 1e4) || !isNum(m.pitch, -1.6, 1.6)
  ) return false;

  p.yaw = m.yaw;
  p.pitch = m.pitch;
  if (!p.alive) return false;

  const dt = Math.min(Math.max((now - p.lastMoveAt) / 1000, 0), 1);
  p.lastMoveAt = now;

  // Giai đoạn đóng băng đầu vòng: không được di chuyển.
  if (room.match.phase === 'freeze') {
    if (Math.hypot(m.x - p.x, m.z - p.z) > 0.05) correct(p, now);
    return true;
  }

  // Ngân sách tích luỹ theo thời gian thực: gửi dồn gói không giúp đi nhanh hơn.
  p.budget = Math.min(p.budget + dt * C.MAX_SPEED, 3.5);
  p.vUp = Math.min(p.vUp + dt * C.RISE_RATE, C.RISE_CAP);
  p.vDown = Math.min(p.vDown + dt * C.FALL_RATE, C.FALL_CAP);

  const dist = Math.hypot(m.x - p.x, m.z - p.z);
  const dy = m.y - p.y;
  const bad =
    dist > p.budget + 0.05 ||
    (dy > 0 && (dy > p.vUp + 0.05 || p.riseSince + dy > C.RISE_MAX)) ||
    (dy < 0 && -dy > p.vDown + 0.05) ||
    m.y > C.MAX_Y || m.y < -0.3 ||
    Math.abs(m.x) > C.BOUNDS || Math.abs(m.z) > C.BOUNDS ||
    insideWall(m.x, m.y, m.z);
  if (bad) {
    correct(p, now);
    return false;
  }

  p.budget -= dist;
  if (dy > 0) {
    p.vUp -= dy;
    p.riseSince += dy;
  } else {
    p.vDown += dy;
  }
  if (supported(m.x, m.y, m.z)) p.riseSince = 0;
  if (Math.abs(dy) > 0.03) p.airUntil = now + 150;
  if (dt > 0.005) p.speed = p.speed * 0.6 + (dist / dt) * 0.4;
  p.x = m.x; p.y = m.y; p.z = m.z;
  return true;
}

module.exports = { applyPose };
