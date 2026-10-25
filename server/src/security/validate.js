'use strict';

function isNum(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

// Nickname: 2–14 ký tự, chỉ chữ, số, khoảng trắng, _ - .
function cleanName(s) {
  if (typeof s !== 'string') return null;
  const out = s.replace(/[^\p{L}\p{N} _\-.]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return out.length >= 2 ? out : null;
}

function cleanPin(s) {
  const pin = String(s == null ? '' : s).trim();
  return /^\d{4}$/.test(pin) ? pin : null;
}

module.exports = { isNum, cleanName, cleanPin };
