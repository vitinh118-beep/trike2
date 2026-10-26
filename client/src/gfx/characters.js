// Nhân vật đối thủ/đồng đội: có đầu đội mũ, giáp, tay chân khớp, chạy có sải chân; súng đúng loại đang cầm.
import * as THREE from 'three';
import { TEAM_COLORS } from '../config.js';
import { buildGun, GUN_MAT } from './guns.js';

const mats = new Map();
function teamMats(team) {
  if (mats.has(team)) return mats.get(team);
  const c = new THREE.Color(TEAM_COLORS[team] || '#888888');
  const m = {
    uniform: new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.42), roughness: 0.85 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.9 }),
    vest: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7, metalness: 0.15 }),
    team: new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, emissive: c.clone().multiplyScalar(0.25) }),
    boot: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.8 }),
    skin: GUN_MAT.skin,
    glove: GUN_MAT.glove,
    visor: new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.1, metalness: 0.9 }),
  };
  mats.set(team, m);
  return m;
}

const GEO = {
  cap: new THREE.CapsuleGeometry(0.075, 0.3, 4, 10),
  shin: new THREE.CapsuleGeometry(0.065, 0.32, 4, 10),
  arm: new THREE.CapsuleGeometry(0.055, 0.2, 4, 8),
  torso: new THREE.BoxGeometry(0.46, 0.56, 0.26),
  vest: new THREE.BoxGeometry(0.5, 0.44, 0.3),
  pouch: new THREE.BoxGeometry(0.1, 0.1, 0.06),
  head: new THREE.SphereGeometry(0.105, 16, 12),
  helmet: new THREE.SphereGeometry(0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  boot: new THREE.BoxGeometry(0.12, 0.1, 0.24),
  hand: new THREE.BoxGeometry(0.07, 0.07, 0.08),
  pack: new THREE.BoxGeometry(0.34, 0.4, 0.14),
  visor: new THREE.BoxGeometry(0.19, 0.05, 0.03),
  neck: new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8),
};

function mesh(geo, mat, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

function makeNameSprite(name, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.font = 'bold 34px Segoe UI, Arial, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.strokeText(name, 128, 44);
    g.fillStyle = color;
    g.fillText(name, 128, 44);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
  sp.scale.set(1.5, 0.375, 1);
  sp.position.y = 2.2;
  sp.renderOrder = 10;
  return sp;
}

// Mẫu súng dùng chung (clone nhẹ vì geometry/vật liệu được chia sẻ).
const gunCache = {};
function gunFor(id) {
  if (!gunCache[id]) gunCache[id] = buildGun(id);
  return gunCache[id];
}

export class Character {
  constructor(name, team, showName) {
    const m = teamMats(team);
    this.team = team;
    this.group = new THREE.Group();
    this.phase = Math.random() * 6;
    this.slot = 1;

    // Chân: pivot ở hông, đầu gối gập khi bước
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.12, 0.92, 0);
      mesh(GEO.cap, m.uniform, 0, -0.21, 0, hip);
      const knee = new THREE.Group();
      knee.position.set(0, -0.43, 0);
      hip.add(knee);
      mesh(GEO.shin, m.cloth, 0, -0.19, 0, knee);
      mesh(GEO.boot, m.boot, 0, -0.4, -0.04, knee);
      this.group.add(hip);
      this.legs.push({ hip, knee });
    }

    // Thân
    this.torso = new THREE.Group();
    this.torso.position.set(0, 1.2, 0);
    this.group.add(this.torso);
    mesh(GEO.torso, m.uniform, 0, 0, 0, this.torso);
    mesh(GEO.vest, m.vest, 0, 0.02, 0, this.torso);
    for (const sx of [-1, 1]) mesh(GEO.pouch, m.vest, sx * 0.14, -0.1, -0.17, this.torso);
    mesh(GEO.pack, m.vest, 0, 0.04, 0.2, this.torso);
    mesh(new THREE.BoxGeometry(0.46, 0.05, 0.28), m.team, 0, 0.21, 0, this.torso); // yếm vai màu đội

    // Đầu
    this.head = new THREE.Group();
    this.head.position.set(0, 1.62, 0);
    this.group.add(this.head);
    mesh(GEO.neck, m.skin, 0, -0.1, 0, this.head, false);
    mesh(GEO.head, m.skin, 0, 0.02, 0, this.head);
    const helmet = mesh(GEO.helmet, m.vest, 0, 0.04, 0, this.head);
    helmet.rotation.x = -0.12;
    mesh(new THREE.BoxGeometry(0.27, 0.025, 0.03), m.team, 0, 0.06, -0.12, this.head, false); // dải màu đội trước mũ
    mesh(GEO.visor, m.visor, 0, 0.03, -0.095, this.head, false);

    // Tay + súng: nhóm xoay theo góc ngắm
    this.arms = new THREE.Group();
    this.arms.position.set(0, 1.4, 0);
    this.group.add(this.arms);
    this.gunHolder = new THREE.Group();
    this.gunHolder.position.set(0.12, -0.06, -0.28);
    this.arms.add(this.gunHolder);
    // Tay phải ôm báng, tay trái đỡ ốp
    const ra = mesh(GEO.arm, m.uniform, 0.2, -0.1, -0.12, this.arms);
    ra.rotation.set(-1.2, 0, 0.15);
    const la = mesh(GEO.arm, m.uniform, -0.12, -0.12, -0.28, this.arms);
    la.rotation.set(-1.35, 0, -0.3);
    mesh(GEO.hand, m.glove, 0.14, -0.08, -0.26, this.arms);
    mesh(GEO.hand, m.glove, -0.02, -0.07, -0.52, this.arms);

    this.guns = {};
    for (const [id, slot] of [['rifle', 1], ['pistol', 2], ['shotgun', 3]]) {
      const g = gunFor(id).group.clone();
      g.visible = slot === 1;
      this.gunHolder.add(g);
      this.guns[slot] = g;
    }

    if (showName) {
      this.label = makeNameSprite(name, TEAM_COLORS[team] || '#ffffff');
      this.group.add(this.label);
    }
    this.group.visible = false;
  }

  setSlot(slot) {
    if (slot === this.slot) return;
    this.slot = slot;
    for (const [s, g] of Object.entries(this.guns)) g.visible = Number(s) === slot;
  }

  // speed: m/s mặt phẳng ngang (từ nội suy). airborne: đang nhảy.
  animate(dt, speed, pitch, airborne) {
    const k = Math.min(speed / 5.6, 1);
    this.phase += dt * (3 + speed * 1.55);
    const sw = Math.sin(this.phase) * 0.75 * k;
    const air = airborne ? 1 : 0;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? sw : -sw;
      const leg = this.legs[i];
      leg.hip.rotation.x = air ? (i ? 0.5 : -0.4) : s;
      leg.knee.rotation.x = air ? 0.9 : Math.max(0, -s) * 1.1;
    }
    const bob = Math.abs(Math.cos(this.phase)) * 0.035 * k;
    this.torso.position.y = 1.2 + bob - (air ? 0.04 : 0);
    this.torso.rotation.z = Math.sin(this.phase) * 0.03 * k;
    this.head.position.y = 1.62 + bob * 0.8;
    this.head.rotation.x = pitch * 0.8;
    this.arms.position.y = 1.4 + bob;
    this.arms.rotation.x = pitch;
  }

  dispose() {
    if (this.label) {
      this.label.material.map.dispose();
      this.label.material.dispose();
    }
  }
}

// Xác chết: giữ nguyên tư thế lúc ngã rồi đổ ngửa ra sau, nằm lại vài giây.
export function makeCorpse(character, x, y, z, yaw) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.rotation.y = yaw;
  const body = character.group.clone(true);
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  body.visible = true;
  body.traverse((o) => {
    if (o.isSprite) o.visible = false;
  });
  pivot.add(body);
  return { pivot, body, t: 0, life: 7, side: Math.random() < 0.5 ? -1 : 1 };
}

export function updateCorpse(c, dt) {
  c.t += dt;
  const k = Math.min(c.t / 0.55, 1);
  const ease = 1 - Math.pow(1 - k, 3);
  c.body.rotation.x = ease * (Math.PI / 2 - 0.12);
  c.body.rotation.z = ease * 0.25 * c.side;
  c.body.position.y = ease * 0.12;
  if (c.t > c.life - 1) c.pivot.position.y -= dt * 0.25; // chìm xuống trước khi biến mất
  return c.t < c.life;
}
