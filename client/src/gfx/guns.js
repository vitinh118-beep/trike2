// Mô hình súng dựng từ khối cơ bản nhưng có chi tiết: ốp, nòng, hộp tiếp đạn, ống ngắm...
// Mọi bộ phận được gộp theo vật liệu thành vài mesh nên rẻ cho cả súng cầm tay và súng của 9 đối thủ.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const GUN_MAT = {
  steel: new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.38, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.55, metalness: 0.55 }),
  poly: new THREE.MeshStandardMaterial({ color: 0x25272b, roughness: 0.7, metalness: 0.1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.5, metalness: 0.05 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a34a, roughness: 0.3, metalness: 0.9 }),
  dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15), toneMapped: false }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc58f6a, roughness: 0.75, metalness: 0 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.8, metalness: 0 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x4a5240, roughness: 0.9, metalness: 0 }),
};

function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

// Hình trụ nằm dọc trục -Z (nòng súng, ống).
function tube(r, len, x, y, zCenter, seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, zCenter);
  return g;
}

// parts: { vật liệu: [geometry...] } -> Group chỉ gồm vài mesh đã gộp.
function build(parts) {
  const g = new THREE.Group();
  for (const [name, geos] of Object.entries(parts)) {
    if (!geos.length) continue;
    const merged = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)));
    const mesh = new THREE.Mesh(merged, GUN_MAT[name]);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

const MODELS = {
  rifle() {
    const parts = { steel: [], dark: [], poly: [], wood: [], brass: [], dot: [] };
    // Thân + nắp hộp khoá nòng
    parts.dark.push(box(0.062, 0.085, 0.36, 0, 0, -0.04));
    parts.steel.push(box(0.052, 0.03, 0.3, 0, 0.056, -0.06)); // nắp trên
    parts.steel.push(box(0.03, 0.022, 0.2, 0, 0.082, -0.04)); // ray trên
    // Ốp lót nòng bằng gỗ + ốp trên
    parts.wood.push(box(0.058, 0.05, 0.22, 0, -0.012, -0.34));
    parts.wood.push(box(0.05, 0.03, 0.2, 0, 0.034, -0.34));
    // Nòng + ống dẫn khí + đầu giảm giật
    parts.steel.push(tube(0.011, 0.34, 0, 0.012, -0.64));
    parts.steel.push(tube(0.009, 0.28, 0, 0.044, -0.56));
    parts.steel.push(tube(0.02, 0.07, 0, 0.012, -0.82, 12));
    parts.dark.push(box(0.006, 0.035, 0.006, 0, 0.052, -0.78)); // đầu ruồi
    parts.dark.push(box(0.03, 0.012, 0.012, 0, 0.05, -0.78));
    // Hộp tiếp đạn cong
    parts.steel.push(box(0.04, 0.14, 0.075, 0, -0.105, -0.07, -0.12));
    parts.steel.push(box(0.04, 0.1, 0.07, 0, -0.205, -0.045, -0.35));
    // Tay cầm + cò
    parts.poly.push(box(0.04, 0.12, 0.05, 0, -0.1, 0.13, 0.35));
    parts.dark.push(box(0.008, 0.035, 0.012, 0, -0.058, 0.07));
    parts.dark.push(box(0.03, 0.006, 0.07, 0, -0.07, 0.06));
    // Báng súng
    parts.wood.push(box(0.045, 0.09, 0.2, 0, -0.01, 0.31, 0.06));
    parts.dark.push(box(0.05, 0.11, 0.025, 0, -0.012, 0.42));
    // Ống ngắm chấm đỏ
    parts.dark.push(box(0.044, 0.04, 0.075, 0, 0.115, 0.0));
    parts.dark.push(box(0.044, 0.012, 0.075, 0, 0.14, 0.0));
    parts.dot.push(box(0.004, 0.004, 0.004, 0, 0.12, -0.037));
    // Vỏ đạn sáng ở cửa thoát
    parts.brass.push(box(0.004, 0.02, 0.05, 0.034, 0.015, -0.01));
    return { group: build(parts), muzzle: new THREE.Vector3(0, 0.012, -0.87), eject: new THREE.Vector3(0.04, 0.02, -0.02), len: 0.88 };
  },

  pistol() {
    const parts = { steel: [], dark: [], poly: [], dot: [] };
    parts.steel.push(box(0.034, 0.042, 0.2, 0, 0.03, -0.06)); // thanh trượt
    parts.dark.push(box(0.03, 0.03, 0.17, 0, -0.002, -0.05)); // khung
    parts.steel.push(tube(0.008, 0.05, 0, 0.032, -0.185));
    parts.poly.push(box(0.034, 0.105, 0.048, 0, -0.075, 0.04, 0.22)); // báng cầm
    parts.dark.push(box(0.006, 0.036, 0.01, 0, -0.03, 0.0));
    parts.dark.push(box(0.026, 0.006, 0.07, 0, -0.04, -0.005));
    parts.dark.push(box(0.006, 0.01, 0.01, 0, 0.056, -0.15)); // đầu ruồi
    parts.dark.push(box(0.022, 0.012, 0.012, 0, 0.056, 0.03)); // khuyết
    parts.dot.push(box(0.003, 0.003, 0.003, 0, 0.0625, -0.149));
    return { group: build(parts), muzzle: new THREE.Vector3(0, 0.032, -0.215), eject: new THREE.Vector3(0.02, 0.05, -0.04), len: 0.24 };
  },

  shotgun() {
    const parts = { steel: [], dark: [], poly: [], wood: [] };
    parts.dark.push(box(0.056, 0.08, 0.26, 0, 0, 0.0)); // thân
    parts.steel.push(tube(0.017, 0.7, 0, 0.022, -0.45)); // nòng
    parts.steel.push(tube(0.015, 0.55, 0, -0.025, -0.4)); // ống đạn
    parts.steel.push(tube(0.018, 0.03, 0, 0.022, -0.8));
    parts.wood.push(box(0.05, 0.046, 0.2, 0, -0.032, -0.32)); // tay bơm
    parts.dark.push(box(0.006, 0.014, 0.02, 0, 0.056, -0.76)); // đầu ruồi
    parts.wood.push(box(0.05, 0.1, 0.28, 0, -0.02, 0.27, 0.12)); // báng
    parts.dark.push(box(0.05, 0.11, 0.025, 0, -0.03, 0.42));
    parts.poly.push(box(0.04, 0.1, 0.045, 0, -0.09, 0.1, 0.3));
    parts.dark.push(box(0.03, 0.006, 0.07, 0, -0.058, 0.07));
    return { group: build(parts), muzzle: new THREE.Vector3(0, 0.022, -0.84), eject: new THREE.Vector3(0.04, 0.03, -0.05), len: 0.86 };
  },
};

// Trả về { group, muzzle, eject, len } cho súng id; group hướng nòng về -Z, gốc ở khối thân.
export function buildGun(id) {
  return (MODELS[id] || MODELS.rifle)();
}

// Cánh tay + găng cầm súng cho góc nhìn thứ nhất (gộp thành vài mesh).
export function buildHands(id) {
  const parts = { sleeve: [], glove: [] };
  if (id === 'pistol') {
    parts.glove.push(box(0.05, 0.055, 0.08, 0.0, -0.055, 0.05));
    parts.sleeve.push(box(0.06, 0.06, 0.3, 0.03, -0.1, 0.27, -0.25));
    parts.glove.push(box(0.04, 0.05, 0.07, -0.035, -0.06, 0.03));
  } else {
    parts.glove.push(box(0.05, 0.055, 0.085, 0.0, -0.09, 0.12));
    parts.sleeve.push(box(0.062, 0.062, 0.3, 0.035, -0.16, 0.3, -0.4));
    const ox = -0.05;
    parts.glove.push(box(0.055, 0.05, 0.12, ox, -0.045, -0.33));
    parts.glove.push(box(0.026, 0.04, 0.045, ox + 0.04, -0.025, -0.3));
    parts.sleeve.push(box(0.062, 0.062, 0.3, ox - 0.04, -0.13, -0.14, 0.45, 0.25));
  }
  return build(parts);
}
