// Hộp có UV theo kích thước thật (mét): texture lặp đều, không bị kéo giãn dù hộp dài hay ngắn.
import * as THREE from 'three';

// Thứ tự mặt của BoxGeometry: +x, -x, +y, -y, +z, -z. Mỗi mặt 4 đỉnh.
export function worldUvBox(w, h, d, tiles = [2, 2], tilesPerFace = null) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faceDims = [
    [d, h], [d, h], // ±x: rộng theo z
    [w, d], [w, d], // ±y
    [w, h], [w, h], // ±z
  ];
  for (let f = 0; f < 6; f++) {
    const t = tilesPerFace ? tilesPerFace[f] : tiles;
    const su = faceDims[f][0] / t[0];
    const sv = faceDims[f][1] / t[1];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
    }
  }
  uv.needsUpdate = true;
  return g;
}

// Mặt phẳng có UV theo mét (cho sàn, decal lớn).
export function worldUvPlane(w, h, tile = 2) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  uv.needsUpdate = true;
  return g;
}
