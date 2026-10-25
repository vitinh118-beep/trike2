// Thế giới 3D: bản đồ, ánh sáng, người chơi khác, vệt đạn.
import * as THREE from 'three';
import MAP from '../../assets/map.json';
import { TEAM_COLORS, INTERP_DELAY_MS } from '../config.js';
import { EYE } from './controller.js';
import { SnapshotBuffer, ClockSync } from '../multiplayer/interp.js';

// Mức đồ họa. shadow: kích thước bóng đổ (0 = tắt); ratio: tỉ lệ độ phân giải render (nhân với DPR, tối đa maxDpr).
export const QUALITY = {
  low: { shadow: 0, ratio: 0.8, maxDpr: 1 },
  medium: { shadow: 1024, ratio: 1, maxDpr: 1 },
  high: { shadow: 2048, ratio: 1, maxDpr: 1.5 },
};

export const MAP_DATA = MAP;

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  spark: new THREE.SphereGeometry(0.07, 6, 4),
};

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = MAP.floorColor;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const v = 50 + Math.random() * 25;
    g.fillStyle = `rgba(${v},${v + 3},${v + 8},0.35)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(15, 15);
  tex.anisotropy = 4;
  return tex;
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
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(1.5, 0.375, 1);
  sp.position.y = 2.15;
  sp.renderOrder = 10;
  return sp;
}

class RemotePlayer {
  constructor(id, name, team, showName) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.alive = false;
    this.pitch = 0;
    this.buf = new SnapshotBuffer(); // các snapshot có timestamp để nội suy
    this.lastX = 0;
    this.lastZ = 0;
    this.hasLast = false;
    this.stepDist = 0; // quãng đường đã đi kể từ tiếng bước chân gần nhất

    const color = new THREE.Color(TEAM_COLORS[team] || '#888888');
    const body = new THREE.MeshLambertMaterial({ color });
    const dark = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.55) });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a37e });
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x23272d });

    const add = (w, h, d, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(GEO.box, mat);
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.castShadow = true;
      (parent || this.group).add(m);
      return m;
    };

    this.group = new THREE.Group();
    add(0.22, 0.8, 0.26, dark, -0.13, 0.4, 0);
    add(0.22, 0.8, 0.26, dark, 0.13, 0.4, 0);
    add(0.56, 0.7, 0.32, body, 0, 1.15, 0);

    this.head = new THREE.Group();
    this.head.position.set(0, 1.62, 0);
    add(0.3, 0.3, 0.3, skin, 0, 0.05, 0, this.head);
    this.group.add(this.head);

    this.arms = new THREE.Group();
    this.arms.position.set(0, 1.35, 0);
    add(0.14, 0.14, 0.5, skin, 0.3, -0.1, -0.25, this.arms);
    add(0.14, 0.14, 0.5, skin, -0.2, -0.1, -0.3, this.arms);
    this.gun = add(0.09, 0.12, 0.7, gunMat, 0.15, -0.08, -0.45, this.arms);
    this.group.add(this.arms);

    if (showName) {
      this.label = makeNameSprite(name, TEAM_COLORS[team] || '#ffffff');
      this.group.add(this.label);
    }
    this.group.visible = false;
  }

  setSlot(slot) {
    const len = slot === 2 ? 0.35 : slot === 3 ? 0.85 : 0.7;
    this.gun.scale.z = len;
    this.gun.position.z = -0.1 - len / 2;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.material && o.material.map) o.material.map.dispose();
      if (o.material && o.isSprite) o.material.dispose();
    });
  }
}

export class World {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false; // ta reset tay mỗi khung để đếm đủ cả 2 lần vẽ (thế giới + súng)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.quality = 'medium';
    this.scale = 1; // hệ số độ phân giải động (chế độ Tự động)
    this.maxDpr = 1;
    this.onStep = null; // (x, z) => tiếng bước chân của đối thủ
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(MAP.sky);
    this.scene.fog = new THREE.Fog(MAP.sky, 45, 120);

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
    this.camera.rotation.order = 'YXZ';

    this.scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x4a4036, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(22, 42, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 120;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.sun = sun;

    this.buildMap();

    this.roster = new Map();
    this.remotes = new Map();
    this.hiddenId = 0;
    this.effects = [];
    this.onResize = null;
    this.clock = new ClockSync();
    this._s = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

    window.addEventListener('resize', () => this.resize());
    this.setQuality('medium');
  }

  // Đổi mức đồ họa lúc đang chạy: bóng đổ + độ phân giải.
  setQuality(name) {
    const q = QUALITY[name] || QUALITY.medium;
    this.quality = QUALITY[name] ? name : 'medium';
    this.maxDpr = q.maxDpr;
    this.scale = q.ratio;
    const on = q.shadow > 0;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    if (on) {
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.scene.traverse((o) => {
      if (o.material && !o.isSprite) o.material.needsUpdate = true;
    });
    this.resize();
  }

  // Hệ số độ phân giải động (0.6–1.25) do chế độ Tự động điều chỉnh.
  setScale(s) {
    this.scale = Math.max(0.6, Math.min(1.25, s));
    this.resize();
  }

  get pixelRatio() {
    return Math.max(0.5, Math.min(window.devicePixelRatio || 1, this.maxDpr) * this.scale);
  }

  buildMap() {
    const floorTex = makeFloorTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP.size + 2, MAP.size + 2),
      new THREE.MeshLambertMaterial(floorTex ? { map: floorTex } : { color: MAP.floorColor })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Vùng xuất phát của hai đội
    const zone = (z, color) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(22, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16 })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.015, z);
      this.scene.add(m);
    };
    zone(26, TEAM_COLORS.A);
    zone(-26, TEAM_COLORS.B);

    const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    for (const b of MAP.boxes) {
      const geo = new THREE.BoxGeometry(b.s[0], b.s[1], b.s[2]);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: b.c }));
      mesh.position.set(b.p[0], b.p[1], b.p[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      edges.position.copy(mesh.position);
      this.scene.add(edges);
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.onResize) this.onResize(w / h);
  }

  // ---------- Người chơi khác ----------
  setRoster(roster) {
    this.roster = roster;
    for (const [id, rp] of this.remotes) {
      const info = roster.get(id);
      if (!info || info.team !== rp.team) this.removeRemote(id);
    }
  }

  removeRemote(id) {
    const rp = this.remotes.get(id);
    if (!rp) return;
    this.scene.remove(rp.group);
    rp.dispose();
    this.remotes.delete(id);
  }

  clearRemotes() {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
  }

  // ts: thời điểm snapshot theo đồng hồ server; recvNow: lúc nhận theo đồng hồ client (performance.now()).
  applySnapshot(list, ts, recvNow, myId, myTeam) {
    const t = this.clock.map(ts, recvNow);
    const seen = new Set();
    for (const e of list) {
      const [id, x, y, z, yaw, pitch, , slot] = e;
      if (id === myId) continue;
      const info = this.roster.get(id);
      if (!info) continue;
      let rp = this.remotes.get(id);
      if (!rp) {
        rp = new RemotePlayer(id, info.name, info.team, info.team === myTeam);
        this.scene.add(rp.group);
        this.remotes.set(id, rp);
      }
      if (!rp.alive) {
        // Vừa hồi sinh: bỏ dữ liệu cũ để không nội suy từ vị trí vòng trước.
        rp.buf.clear();
        rp.hasLast = false;
      }
      rp.buf.push(t, x, y, z, yaw, pitch);
      rp.setSlot(slot);
      rp.alive = true;
      seen.add(id);
    }
    for (const rp of this.remotes.values()) {
      if (!seen.has(rp.id) && rp.alive) {
        rp.alive = false;
        rp.buf.clear();
        rp.group.visible = false;
      }
    }
  }

  aliveRemotes() {
    const out = [];
    for (const rp of this.remotes.values()) if (rp.alive) out.push(rp);
    return out.sort((a, b) => a.id - b.id);
  }

  // ---------- Hiệu ứng ----------
  addTracer(from, to, color) {
    // Giới hạn số hiệu ứng cùng lúc để xả đạn liên tục không làm tụt FPS.
    while (this.effects.length > 48) {
      const old = this.effects.shift();
      this.scene.remove(old.mesh);
      old.mat.dispose();
    }
    const a = new THREE.Vector3(from[0], from[1], from[2]);
    const b = new THREE.Vector3(to[0], to[1], to[2]);
    const len = a.distanceTo(b);
    if (len < 0.2) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(GEO.box, mat);
    m.scale.set(0.02, 0.02, len);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.lookAt(b);
    this.scene.add(m);
    this.effects.push({ mesh: m, mat, life: 0.09, max: 0.09 });

    const sm = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 1 });
    const spark = new THREE.Mesh(GEO.spark, sm);
    spark.position.copy(b);
    this.scene.add(spark);
    this.effects.push({ mesh: spark, mat: sm, life: 0.15, max: 0.15 });
  }

  // ---------- Cập nhật & vẽ ----------
  // now: performance.now() (ms). Đối thủ được vẽ ở quá khứ INTERP_DELAY_MS để luôn có 2 snapshot để nội suy.
  update(dt, now) {
    const renderT = now - INTERP_DELAY_MS;
    const s = this._s;
    for (const rp of this.remotes.values()) {
      if (!rp.alive || !rp.buf.sample(renderT, s)) continue;
      const g = rp.group;
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = s.yaw;
      rp.pitch = s.pitch;
      rp.head.rotation.x = s.pitch * 0.8;
      rp.arms.rotation.x = s.pitch;
      g.visible = rp.id !== this.hiddenId;

      // Tiếng bước chân: mỗi ~2.3m đi bộ trên mặt đất.
      if (rp.hasLast) {
        const d = Math.hypot(s.x - rp.lastX, s.z - rp.lastZ);
        if (d < 1.5) rp.stepDist += d;
        if (rp.stepDist > 2.3) {
          rp.stepDist = 0;
          if (this.onStep) this.onStep(s.x, s.z, rp.id);
        }
      }
      rp.lastX = s.x;
      rp.lastZ = s.z;
      rp.hasLast = true;
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      e.mat.opacity = Math.max(0, e.life / e.max);
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mat.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  setCamera(x, y, z, yaw, pitch) {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(pitch, yaw, 0);
  }

  render(viewmodel) {
    this.renderer.info.reset();
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (viewmodel) {
      this.renderer.clearDepth();
      this.renderer.render(viewmodel.scene, viewmodel.camera);
    }
  }
}

export { EYE };
