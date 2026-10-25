'use strict';
const C = require('../config');
const { rayBoxes, rayFloor } = require('../game/map');

// Hướng nhìn từ yaw/pitch, khớp với camera three.js (thứ tự YXZ, nhìn về -Z khi yaw = 0).
function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// Lệch tia ngẫu nhiên trong hình nón. rand cho phép kiểm thử có kết quả cố định.
function applySpread(dir, spread, rand = Math.random) {
  if (spread <= 0) return dir;
  let right = cross(dir, [0, 1, 0]);
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = [1, 0, 0];
  right = normalize(right);
  const up = cross(right, dir);
  const ang = spread * Math.sqrt(rand());
  const phi = rand() * Math.PI * 2;
  const a = Math.cos(phi) * ang;
  const b = Math.sin(phi) * ang;
  return normalize([
    dir[0] + right[0] * a + up[0] * b,
    dir[1] + right[1] * a + up[1] * b,
    dir[2] + right[2] * a + up[2] * b,
  ]);
}

// Tia vs hình trụ đứng (thân người). Trả về t hoặc null.
function rayCylinder(o, d, cx, cy, cz, r, h) {
  const fx = o[0] - cx;
  const fz = o[2] - cz;
  const a = d[0] * d[0] + d[2] * d[2];
  if (a < 1e-9) return null;
  const b = 2 * (fx * d[0] + fz * d[2]);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) {
    t = (-b + sq) / (2 * a);
    if (t < 0) return null;
  }
  const y = o[1] + d[1] * t;
  if (y < cy || y > cy + h) return null;
  return t;
}

// Tia vs hình cầu (đầu). Trả về t hoặc null.
function raySphere(o, d, cx, cy, cz, r) {
  const ox = o[0] - cx;
  const oy = o[1] - cy;
  const oz = o[2] - cz;
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) {
    t = -b + sq;
    if (t < 0) return null;
  }
  return t;
}

// Kiểm tra một mục tiêu {x,y,z}: trả về { t, head } hoặc null.
function hitTarget(o, d, tg) {
  const body = rayCylinder(o, d, tg.x, tg.y, tg.z, C.BODY_RADIUS, C.BODY_HEIGHT);
  const head = raySphere(o, d, tg.x, tg.y + C.HEAD_CENTER, tg.z, C.HEAD_RADIUS);
  if (head !== null && (body === null || head <= body + 0.02)) return { t: head, head: true };
  if (body !== null) return { t: body, head: false };
  return null;
}

// Bắn một tia: trả về điểm kết thúc (t) và mục tiêu trúng đầu tiên (nếu có, và không bị tường chắn).
// targets: [{ ref, x, y, z }] — vị trí đã được tua về thời điểm bắn (bù trễ).
function traceRay(origin, dir, range, targets) {
  const tWorld = Math.min(range, rayBoxes(origin, dir, range), rayFloor(origin, dir));
  let best = null;
  for (const tg of targets) {
    const h = hitTarget(origin, dir, tg);
    if (h && h.t < tWorld && (!best || h.t < best.t)) best = { ref: tg.ref, t: h.t, head: h.head };
  }
  return { t: best ? best.t : tWorld, hit: best };
}

module.exports = { dirFromAngles, applySpread, rayCylinder, raySphere, hitTarget, traceRay };
