// Vật liệu PBR được vẽ hoàn toàn bằng code (canvas): không cần file ảnh bên ngoài, game vẫn chạy offline.
// Mỗi vật liệu gồm map (màu), normalMap (gồ ghề, tạo từ bản đồ độ cao) và roughnessMap.
import * as THREE from 'three';

// ---------------------------------------------------------------- tiện ích
export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(c, k) {
  const [r, g, b] = hex(c);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// Rắc đốm nhỏ ngẫu nhiên để tạo hạt vật liệu.
function speckle(g, w, h, n, rand, lo = 0, hi = 255, alpha = 0.18, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = lo + rand() * (hi - lo);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(rand() * w, rand() * h, size, size);
  }
}

// Vết loang mờ: tạo cảm giác bẩn, ố, không đều.
function blotches(g, w, h, n, rand, rgb, alphaMax, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rmin + rand() * (rmax - rmin);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${rand() * alphaMax})`);
    grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// Bản đồ độ cao (canvas xám) -> normal map. strength càng lớn bề mặt càng gồ ghề. Cuộn vòng để lát gạch liền mạch.
export function heightToNormal(heightCanvas, strength = 2) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

function toTexture(canvas, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Gói map + height -> bộ vật liệu. rough: canvas độ nhám (kênh G), nếu thiếu dùng roughness cố định.
function pbrSet(color, height, normalStrength, rough) {
  return {
    map: toTexture(color),
    normalMap: toTexture(heightToNormal(height, normalStrength), { srgb: false }),
    roughnessMap: rough ? toTexture(rough, { srgb: false }) : null,
  };
}

function grayCanvas(size, fill = 128) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${fill},${fill},${fill})`;
  g.fillRect(0, 0, size, size);
  return c;
}

// ---------------------------------------------------------------- bê tông
function drawConcrete(g, size, rand, base = [142, 145, 149]) {
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, size, size);
  blotches(g, size, size, 46, rand, [95, 97, 100], 0.32, 30, 120);
  blotches(g, size, size, 34, rand, [190, 190, 188], 0.22, 30, 110);
  speckle(g, size, size, size * 6, rand, 70, 210, 0.22, 1);
  speckle(g, size, size, size * 2, rand, 40, 120, 0.3, 2);
}

function concreteHeight(size, rand) {
  const c = grayCanvas(size, 128);
  const g = c.getContext('2d');
  blotches(g, size, size, 60, rand, [255, 255, 255], 0.25, 20, 90);
  blotches(g, size, size, 60, rand, [0, 0, 0], 0.25, 20, 90);
  speckle(g, size, size, size * 8, rand, 60, 200, 0.5, 1);
  for (let i = 0; i < 40; i++) { // lỗ rỗ
    g.fillStyle = 'rgba(0,0,0,0.6)';
    const r = 1 + rand() * 2.2;
    g.beginPath();
    g.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

// Bê tông tường: tấm lớn có đường ron, bu-lông, vệt rỉ/bẩn chảy dọc.
function concreteWall() {
  const S = 1024;
  const rand = rng(11);
  const col = makeCanvas(S);
  const g = col.getContext('2d');
  drawConcrete(g, S, rand, [150, 152, 154]);
  const hc = concreteHeight(S, rand);
  const hg = hc.getContext('2d');
  // Vệt bẩn chảy từ trên xuống
  for (let i = 0; i < 26; i++) {
    const x = rand() * S;
    const len = 80 + rand() * 360;
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, `rgba(70,55,40,${0.05 + rand() * 0.16})`);
    grad.addColorStop(1, 'rgba(70,55,40,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 4 + rand() * 14, len);
  }
  // Ron giữa các tấm (tile = 3m: 2 tấm ngang, 2 tấm dọc)
  for (const p of [0, S / 2]) {
    g.fillStyle = 'rgba(30,30,32,0.75)';
    g.fillRect(p - 2, 0, 4, S);
    g.fillRect(0, p - 2, S, 4);
    hg.fillStyle = 'rgb(20,20,20)';
    hg.fillRect(p - 3, 0, 6, S);
    hg.fillRect(0, p - 3, S, 6);
  }
  // Bu-lông ở góc tấm
  for (const cx of [S * 0.06, S * 0.44, S * 0.56, S * 0.94]) {
    for (const cy of [S * 0.06, S * 0.44, S * 0.56, S * 0.94]) {
      g.fillStyle = 'rgba(40,40,44,0.9)';
      g.beginPath();
      g.arc(cx, cy, 5, 0, Math.PI * 2);
      g.fill();
      hg.fillStyle = 'rgb(230,230,230)';
      hg.beginPath();
      hg.arc(cx, cy, 5, 0, Math.PI * 2);
      hg.fill();
    }
  }
  return pbrSet(col, hc, 3.2);
}

function concretePlain(seed, base) {
  const S = 512;
  const rand = rng(seed);
  const col = makeCanvas(S);
  drawConcrete(col.getContext('2d'), S, rand, base);
  return pbrSet(col, concreteHeight(S, rand), 3);
}

// ---------------------------------------------------------------- sọc cảnh báo
function hazardStripes(g, x, y, w, h, stripe = 40, a = '#e2b21a', b = '#1a1a1c') {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = a;
  g.fillRect(x, y, w, h);
  g.fillStyle = b;
  for (let i = -h; i < w + h; i += stripe * 2) {
    g.beginPath();
    g.moveTo(x + i, y + h);
    g.lineTo(x + i + stripe, y + h);
    g.lineTo(x + i + stripe + h, y);
    g.lineTo(x + i + h, y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

// Trụ bê tông: sọc cảnh báo ở chân, dải vàng trên cao.
function pillar() {
  const S = 512;
  const rand = rng(23);
  const col = makeCanvas(S);
  const g = col.getContext('2d');
  drawConcrete(g, S, rand, [128, 131, 135]);
  const hc = concreteHeight(S, rand);
  const hg = hc.getContext('2d');
  // tile cao 3m: sọc ở dưới đáy tile (0..0.9m) — vì trụ cao 6m nên lặp 2 lần, chấp nhận
  hazardStripes(g, 0, S * 0.9, S, S * 0.1, 22);
  hg.fillStyle = 'rgb(150,150,150)';
  hg.fillRect(0, S * 0.9, S, S * 0.1);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, S * 0.9 - 3, S, 3);
  return pbrSet(col, hc, 3);
}

// ---------------------------------------------------------------- kim loại gợn sóng
// Container/nhà kho: các gân dọc, sơn bong tróc, rỉ sét. tile 1.2m, 16 gân.
function corrugated(color, seed, { rust = 0.5, horizontal = false } = {}) {
  const S = 512;
  const rand = rng(seed);
  const col = makeCanvas(S);
  const g = col.getContext('2d');
  const hc = makeCanvas(S);
  const hg = hc.getContext('2d');
  const ribs = 16;
  const rw = S / ribs;
  for (let i = 0; i < ribs; i++) {
    // gân: bóng sáng ở nửa trái, tối ở nửa phải
    const grad = g.createLinearGradient(i * rw, 0, (i + 1) * rw, 0);
    grad.addColorStop(0, shade(color, 1.25));
    grad.addColorStop(0.5, shade(color, 1.0));
    grad.addColorStop(1, shade(color, 0.7));
    g.fillStyle = grad;
    g.fillRect(i * rw, 0, rw + 1, S);
    const hgr = hg.createLinearGradient(i * rw, 0, (i + 1) * rw, 0);
    hgr.addColorStop(0, 'rgb(40,40,40)');
    hgr.addColorStop(0.5, 'rgb(240,240,240)');
    hgr.addColorStop(1, 'rgb(40,40,40)');
    hg.fillStyle = hgr;
    hg.fillRect(i * rw, 0, rw + 1, S);
  }
  // Vết xước dọc, bụi bẩn
  for (let i = 0; i < 120; i++) {
    g.strokeStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + rand() * 0.1})`;
    g.lineWidth = 1;
    const x = rand() * S;
    g.beginPath();
    g.moveTo(x, rand() * S);
    g.lineTo(x + (rand() - 0.5) * 6, rand() * S);
    g.stroke();
  }
  // Rỉ sét: nhiều ở đáy, rải rác ở trên
  const rustCol = [128, 64, 28];
  const grad = g.createLinearGradient(0, S * 0.55, 0, S);
  grad.addColorStop(0, `rgba(${rustCol},0)`);
  grad.addColorStop(1, `rgba(${rustCol},${0.5 * rust})`);
  g.fillStyle = grad;
  g.fillRect(0, S * 0.55, S, S * 0.45);
  blotches(g, S, S, Math.round(30 * rust), rand, rustCol, 0.55, 8, 40);
  blotches(g, S, S, 30, rand, [20, 18, 16], 0.3, 20, 80);
  speckle(g, S, S, 3000, rand, 0, 255, 0.12, 1);
  // Sơn bong lộ kim loại: vết nhỏ sáng
  for (let i = 0; i < 40 * rust; i++) {
    g.fillStyle = 'rgba(150,140,130,0.45)';
    g.fillRect(rand() * S, rand() * S, 1 + rand() * 6, 1 + rand() * 4);
  }
  if (horizontal) { // xoay 90 độ cho nhà kho
    const r = makeCanvas(S);
    const rg = r.getContext('2d');
    rg.translate(S / 2, S / 2);
    rg.rotate(Math.PI / 2);
    rg.drawImage(col, -S / 2, -S / 2);
    const rh = makeCanvas(S);
    const rhg = rh.getContext('2d');
    rhg.translate(S / 2, S / 2);
    rhg.rotate(Math.PI / 2);
    rhg.drawImage(hc, -S / 2, -S / 2);
    return pbrSet(r, rh, 4.5);
  }
  return pbrSet(col, hc, 4.5);
}

// Cửa container ở đầu thùng: hai cánh, thanh khoá, tay nắm, số hiệu.
function containerDoor(color, seed) {
  const S = 512;
  const rand = rng(seed);
  const col = makeCanvas(S);
  const g = col.getContext('2d');
  const hc = grayCanvas(S, 120);
  const hg = hc.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  const grad = g.createLinearGradient(0, 0, S, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(0,0,0,0.15)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // Khung + hai cánh
  g.strokeStyle = shade(color, 0.55);
  g.lineWidth = 6;
  g.strokeRect(12, 12, S - 24, S - 24);
  g.beginPath();
  g.moveTo(S / 2, 12);
  g.lineTo(S / 2, S - 12);
  g.stroke();
  hg.strokeStyle = 'rgb(60,60,60)';
  hg.lineWidth = 8;
  hg.strokeRect(12, 12, S - 24, S - 24);
  hg.beginPath();
  hg.moveTo(S / 2, 12);
  hg.lineTo(S / 2, S - 12);
  hg.stroke();
  // Thanh khoá dọc + tay nắm
  for (const cx of [S * 0.2, S * 0.38, S * 0.62, S * 0.8]) {
    g.fillStyle = '#7d8083';
    g.fillRect(cx - 5, 40, 10, S - 80);
    g.fillStyle = '#2a2c2e';
    g.fillRect(cx - 12, S * 0.45, 24, 10);
    g.fillRect(cx - 12, S * 0.12, 24, 8);
    g.fillRect(cx - 12, S * 0.84, 24, 8);
    hg.fillStyle = 'rgb(225,225,225)';
    hg.fillRect(cx - 5, 40, 10, S - 80);
    hg.fillRect(cx - 12, S * 0.45, 24, 10);
  }
  // Số hiệu container
  g.fillStyle = 'rgba(245,245,245,0.9)';
  g.font = 'bold 26px Consolas, monospace';
  g.textAlign = 'right';
  g.fillText('HCH 482913 0', S - 24, 70 + 12);
  g.font = 'bold 20px Consolas, monospace';
  g.fillText('22G1  MAX 30480 KG', S - 24, 100 + 12);
  blotches(g, S, S, 20, rand, [110, 60, 25], 0.5, 8, 50);
  blotches(g, S, S, 16, rand, [10, 10, 10], 0.28, 20, 90);
  speckle(g, S, S, 2500, rand, 0, 255, 0.12, 1);
  return pbrSet(col, hc, 3.5);
}

// ---------------------------------------------------------------- gỗ (thùng hàng)
function woodCrate(color, seed) {
  const S = 512;
  const rand = rng(seed);
  const col = makeCanvas(S);
  const g = col.getContext('2d');
  const hc = grayCanvas(S, 120);
  const hg = hc.getContext('2d');
  const planks = 5;
  const ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const tone = 0.82 + rand() * 0.3;
    g.fillStyle = shade(color, tone);
    g.fillRect(0, i * ph, S, ph);
    // vân gỗ
    for (let k = 0; k < 90; k++) {
      g.strokeStyle = `rgba(${rand() < 0.5 ? '60,35,15' : '230,200,150'},${0.05 + rand() * 0.12})`;
      g.lineWidth = 1 + rand() * 1.5;
      const y = i * ph + rand() * ph;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(S * 0.3, y + (rand() - 0.5) * 6, S * 0.7, y + (rand() - 0.5) * 6, S, y + (rand() - 0.5) * 4);
      g.stroke();
    }
    // khe giữa các tấm
    g.fillStyle = 'rgba(15,8,2,0.85)';
    g.fillRect(0, i * ph, S, 3);
    hg.fillStyle = 'rgb(10,10,10)';
    hg.fillRect(0, i * ph, S, 5);
  }
  // Khung gỗ viền + thanh chéo
  const frame = 38;
  g.fillStyle = shade(color, 0.7);
  g.fillRect(0, 0, S, frame);
  g.fillRect(0, S - frame, S, frame);
  g.fillRect(0, 0, frame, S);
  g.fillRect(S - frame, 0, frame, S);
  hg.fillStyle = 'rgb(190,190,190)';
  hg.fillRect(0, 0, S, frame);
  hg.fillRect(0, S - frame, S, frame);
  hg.fillRect(0, 0, frame, S);
  hg.fillRect(S - frame, 0, frame, S);
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(Math.atan2(S - 2 * frame, S - 2 * frame));
  g.fillStyle = shade(color, 0.72);
  g.fillRect(-S * 0.62, -frame / 2, S * 1.24, frame);
  g.restore();
  hg.save();
  hg.translate(S / 2, S / 2);
  hg.rotate(Math.PI / 4);
  hg.fillStyle = 'rgb(190,190,190)';
  hg.fillRect(-S * 0.62, -frame / 2, S * 1.24, frame);
  hg.restore();
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 3;
  g.strokeRect(frame, frame, S - 2 * frame, S - 2 * frame);
  // Đinh
  for (const [x, y] of [[19, 19], [S - 19, 19], [19, S - 19], [S - 19, S - 19], [S / 2, 19], [S / 2, S - 19], [19, S / 2], [S - 19, S / 2]]) {
    g.fillStyle = '#3a3a3a';
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
  }
  // Nhãn "FRAGILE"/mũi tên
  g.fillStyle = 'rgba(20,20,20,0.7)';
  g.font = 'bold 34px Arial';
  g.textAlign = 'center';
  g.fillText('HCH', S * 0.3, S * 0.43);
  g.fillText('▲▲', S * 0.7, S * 0.6);
  blotches(g, S, S, 22, rand, [40, 25, 10], 0.3, 15, 70);
  speckle(g, S, S, 2500, rand, 0, 255, 0.1, 1);
  return pbrSet(col, hc, 3);
}

// ---------------------------------------------------------------- thùng phuy (quấn quanh trụ)
function barrelTex(color, seed) {
  const W = 256;
  const H = 256;
  const rand = rng(seed);
  const col = makeCanvas(W, H);
  const g = col.getContext('2d');
  const hc = grayCanvas(W, 128);
  hc.height = H;
  const hg = hc.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0.0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Hai gờ nổi quanh thân
  for (const y of [H * 0.28, H * 0.5, H * 0.72]) {
    g.fillStyle = shade(color, 0.62);
    g.fillRect(0, y - 5, W, 10);
    g.fillStyle = shade(color, 1.4);
    g.fillRect(0, y - 5, W, 2);
    hg.fillStyle = 'rgb(240,240,240)';
    hg.fillRect(0, y - 5, W, 10);
  }
  // Nhãn nguy hiểm
  g.fillStyle = '#e6e0cf';
  g.fillRect(W * 0.2, H * 0.34, W * 0.28, H * 0.14);
  g.fillStyle = '#222';
  g.font = 'bold 18px Arial';
  g.textAlign = 'center';
  g.fillText('FLAM', W * 0.34, H * 0.435);
  hazardStripes(g, W * 0.6, H * 0.34, W * 0.2, H * 0.14, 8);
  blotches(g, W, H, 24, rand, [120, 60, 20], 0.5, 6, 30);
  blotches(g, W, H, 20, rand, [10, 10, 10], 0.3, 10, 40);
  speckle(g, W, H, 1500, rand, 0, 255, 0.12, 1);
  for (let i = 0; i < 20; i++) {
    g.fillStyle = 'rgba(160,150,140,0.5)';
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 4, 1 + rand() * 3);
  }
  return pbrSet(col, hc, 3);
}

// ---------------------------------------------------------------- rào bê tông
function barrierTex() {
  const S = 512;
  const rand = rng(31);
  const col = makeCanvas(S);
  const g = col.getContext('2d');
  drawConcrete(g, S, rand, [160, 160, 158]);
  const hc = concreteHeight(S, rand);
  // dải đỏ/trắng phản quang
  g.fillStyle = '#c23a30';
  g.fillRect(0, S * 0.18, S, S * 0.16);
  g.fillStyle = '#e8e6e0';
  for (let x = 0; x < S; x += 128) g.fillRect(x, S * 0.18, 64, S * 0.16);
  blotches(g, S, S, 30, rand, [30, 28, 26], 0.3, 15, 60);
  speckle(g, S, S, 2500, rand, 0, 255, 0.12, 1);
  return pbrSet(col, hc, 3);
}

function shedTex(color, seed) {
  return corrugated(color, seed, { rust: 1, horizontal: true });
}

// ---------------------------------------------------------------- mặt đất
// Một texture lớn 60x60m: nhựa đường + tấm bê tông, vạch sơn, vết dầu, khu xuất phát hai đội.
function groundTex(size = 60) {
  const S = 2048;
  const px = S / size;
  const rand = rng(77);
  const col = makeCanvas(S);
  const g = col.getContext('2d');
  const hc = grayCanvas(S, 128);
  const hg = hc.getContext('2d');
  g.fillStyle = '#4a4d52';
  g.fillRect(0, 0, S, S);
  blotches(g, S, S, 160, rand, [30, 30, 32], 0.35, 20, 160);
  blotches(g, S, S, 120, rand, [120, 120, 118], 0.2, 20, 140);
  speckle(g, S, S, 160000, rand, 20, 150, 0.22, 1);
  speckle(g, S, S, 60000, rand, 60, 200, 0.18, 2);
  // Tấm bê tông 6x6m
  for (let i = 0; i <= size; i += 6) {
    g.fillStyle = 'rgba(10,10,12,0.8)';
    g.fillRect(i * px - 2, 0, 4, S);
    g.fillRect(0, i * px - 2, S, 4);
    hg.fillStyle = 'rgb(35,35,35)';
    hg.fillRect(i * px - 3, 0, 6, S);
    hg.fillRect(0, i * px - 3, S, 6);
  }
  for (let k = 0; k < 90; k++) { // nứt
    g.strokeStyle = 'rgba(8,8,8,0.55)';
    hg.strokeStyle = 'rgb(30,30,30)';
    g.lineWidth = hg.lineWidth = 1 + rand() * 1.5;
    let x = rand() * S;
    let y = rand() * S;
    g.beginPath();
    hg.beginPath();
    g.moveTo(x, y);
    hg.moveTo(x, y);
    for (let s = 0; s < 12; s++) {
      x += (rand() - 0.5) * 60;
      y += (rand() - 0.2) * 60;
      g.lineTo(x, y);
      hg.lineTo(x, y);
    }
    g.stroke();
    hg.stroke();
  }
  blotches(g, S, S, 40, rand, [10, 10, 12], 0.7, 20, 90); // vết dầu
  // Hai khu xuất phát (22x8m) tại z = ±26
  const zone = (zc, rgb, letter) => {
    const x0 = (size / 2 - 11) * px;
    const y0 = (size / 2 + zc - 4) * px;
    g.fillStyle = `rgba(${rgb},0.34)`;
    g.fillRect(x0, y0, 22 * px, 8 * px);
    g.strokeStyle = `rgba(${rgb},0.95)`;
    g.lineWidth = 8;
    g.strokeRect(x0 + 6, y0 + 6, 22 * px - 12, 8 * px - 12);
    g.fillStyle = `rgba(${rgb},0.55)`;
    g.font = `bold ${Math.round(4 * px)}px Arial`;
    g.textAlign = 'center';
    g.fillText(letter, S / 2, y0 + 6 * px);
  };
  zone(26, '232,83,74', 'A');
  zone(-26, '74,144,232', 'B');
  // Vạch vàng chia làn dọc giữa bản đồ và vạch ngang
  g.setLineDash([60, 40]);
  g.strokeStyle = 'rgba(226,178,26,0.85)';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(S / 2, 0);
  g.lineTo(S / 2, S);
  g.moveTo(0, S / 2);
  g.lineTo(S, S / 2);
  g.stroke();
  g.setLineDash([]);
  // Vạch trắng viền ô đỗ
  g.strokeStyle = 'rgba(235,235,235,0.55)';
  g.lineWidth = 6;
  for (const [cx, cz] of [[-12, 8], [12, 8], [-12, -8], [12, -8]]) {
    g.strokeRect((size / 2 + cx - 5) * px, (size / 2 + cz - 3) * px, 10 * px, 6 * px);
  }
  // Dải sọc cảnh báo dọc chân tường
  hazardStripes(g, 0, 0, S, 14, 14);
  hazardStripes(g, 0, S - 14, S, 14, 14);
  hazardStripes(g, 0, 0, 14, S, 14);
  hazardStripes(g, S - 14, 0, 14, S, 14);
  return pbrSet(col, hc, 3.2);
}

// ---------------------------------------------------------------- sprite (hạt, ánh sáng, vết đạn)
export function glowSprite(size = 128) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return toTexture(c, { repeat: false });
}

export function smokeSprite(size = 128) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rand = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = size / 2 + (rand() - 0.5) * size * 0.4;
    const y = size / 2 + (rand() - 0.5) * size * 0.4;
    const r = size * (0.12 + rand() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(c, { repeat: false });
}

export function bulletHoleTex(size = 128) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rand = rng(9);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(8,8,8,1)');
  grad.addColorStop(0.2, 'rgba(8,8,8,0.95)');
  grad.addColorStop(0.28, 'rgba(25,22,20,0.55)');
  grad.addColorStop(1, 'rgba(25,22,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(210,210,205,0.5)'; // vết nứt/vỡ quanh lỗ
  g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r1 = size * 0.12;
    const r2 = size * (0.22 + rand() * 0.22);
    g.beginPath();
    g.moveTo(size / 2 + Math.cos(a) * r1, size / 2 + Math.sin(a) * r1);
    g.lineTo(size / 2 + Math.cos(a) * r2, size / 2 + Math.sin(a) * r2);
    g.stroke();
  }
  return toTexture(c, { repeat: false });
}

// Biển hiệu/chữ sơn lên tường.
export function signTexture(lines, { w = 1024, h = 256, bg = null, fg = '#f2efe6', font = 'bold 120px Arial', stripe = false } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  if (stripe) hazardStripes(g, 0, h - 28, w, 28, 14);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((t, i) => g.fillText(t, w / 2, (h * (i + 1)) / (n + 1) - (stripe ? 10 : 0)));
  const rand = rng(3);
  speckle(g, w, h, 8000, rand, 0, 255, 0.18, 2); // sơn bong
  const t = toTexture(c, { repeat: false });
  return t;
}

// ---------------------------------------------------------------- kho vật liệu theo kiểu khối
const cache = new Map();
function memo(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function mat(set, { roughness = 0.8, metalness = 0, color = 0xffffff, envMapIntensity = 1 } = {}) {
  return new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: set.roughnessMap || null,
    roughness,
    metalness,
    color,
    envMapIntensity,
  });
}

// Trả về { mats, tiles }: mats là vật liệu cho từng mặt hộp (px, nx, py, ny, pz, nz) hoặc một vật liệu;
// tiles là kích thước (mét) một lần lặp texture cho từng mặt, để texture không bị kéo giãn.
export function materialFor(box) {
  const type = box.m || 'concrete';
  const [w, h, d] = box.s;
  const col = box.c || '#888888';
  switch (type) {
    case 'wall': {
      const m = memo('wall', () => mat(concreteWall(), { roughness: 0.92 }));
      return { mats: m, tiles: [3, 3] };
    }
    case 'container': {
      const side = memo('cside' + col, () => mat(corrugated(col, hashStr(col), { rust: 0.7 }), { roughness: 0.55, metalness: 0.35 }));
      const end = memo('cdoor' + col, () => mat(containerDoor(col, hashStr(col) + 1), { roughness: 0.55, metalness: 0.35 }));
      const roof = memo('croof', () => mat(corrugated('#6d7074', 91, { rust: 0.4 }), { roughness: 0.65, metalness: 0.3 }));
      const bottom = roof;
      // Hộp dài theo x: ±x là đầu thùng (cửa), ±z là thành bên.
      return {
        mats: [end, end, roof, bottom, side, side],
        tilesPerFace: [[d, h], [d, h], [1.2, 1.2], [1.2, 1.2], [1.2, 1.2], [1.2, 1.2]],
        // Chiều dài thành bên là 8m: tile 1.2m cho gân đều
      };
    }
    case 'crate': {
      const m = memo('crate' + col, () => mat(woodCrate(col, hashStr(col)), { roughness: 0.85 }));
      return { mats: m, tilesPerFace: Array(6).fill([1.2, 1.2]) };
    }
    case 'barrier': {
      const m = memo('barrier', () => mat(barrierTex(), { roughness: 0.9 }));
      return { mats: m, tiles: [2.4, 2.4] };
    }
    case 'pillar': {
      const m = memo('pillar', () => mat(pillar(), { roughness: 0.9 }));
      const top = memo('pillartop', () => mat(concretePlain(41, [120, 122, 126]), { roughness: 0.95 }));
      return { mats: [m, m, top, top, m, m], tiles: [3, 6] };
    }
    case 'shed': {
      const m = memo('shed' + col, () => mat(shedTex(col, hashStr(col)), { roughness: 0.6, metalness: 0.4 }));
      return { mats: m, tiles: [1.2, 1.2] };
    }
    case 'center': {
      const m = memo('center', () => mat(concretePlain(61, [132, 136, 140]), { roughness: 0.88 }));
      return { mats: m, tiles: [2.5, 2.5] };
    }
    default: {
      const m = memo('conc' + col, () => mat(concretePlain(hashStr(col), [140, 143, 147]), { roughness: 0.9 }));
      return { mats: m, tiles: [2.5, 2.5] };
    }
  }
}

export function barrelMaterial(color) {
  return memo('barrel' + color, () => mat(barrelTex(color, hashStr(color)), { roughness: 0.45, metalness: 0.55 }));
}

export function groundMaterial(size) {
  return memo('ground', () => mat(groundTex(size), { roughness: 0.92 }));
}

export function concreteMaterial(seed = 1, tone = [140, 143, 147]) {
  return memo('cm' + seed, () => mat(concretePlain(seed, tone), { roughness: 0.92 }));
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function disposeTextureCache() {
  cache.clear();
}
