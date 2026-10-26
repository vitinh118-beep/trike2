// Thế giới 3D: bản đồ PBR, bầu trời, ánh sáng, hậu kỳ, người chơi khác, hiệu ứng.
import * as THREE from 'three';
import MAP from '../../assets/map.json';
import { INTERP_DELAY_MS } from '../config.js';
import { EYE } from './controller.js';
import { SnapshotBuffer, ClockSync } from '../multiplayer/interp.js';
import { buildEnvironment } from '../gfx/environment.js';
import { makeSky, makeEnvironment } from '../gfx/sky.js';
import { Post } from '../gfx/post.js';
import { Fx } from '../gfx/fx.js';
import { Character, makeCorpse, updateCorpse } from '../gfx/characters.js';
import { faceNormalAt } from '../gfx/impact.js';

// Mức đồ họa. shadow: kích thước bóng đổ (0 = tắt); post: hậu kỳ (off|medium|high); ratio/maxDpr: độ phân giải.
export const QUALITY = {
  low: { shadow: 0, ratio: 0.8, maxDpr: 1, post: 'off' },
  medium: { shadow: 1024, ratio: 1, maxDpr: 1, post: 'medium' },
  high: { shadow: 2048, ratio: 1, maxDpr: 1.5, post: 'high' },
};

export const MAP_DATA = MAP;

const AABBS = MAP.boxes.map((b) => ({
  minX: b.p[0] - b.s[0] / 2, maxX: b.p[0] + b.s[0] / 2,
  minY: b.p[1] - b.s[1] / 2, maxY: b.p[1] + b.s[1] / 2,
  minZ: b.p[2] - b.s[2] / 2, maxZ: b.p[2] + b.s[2] / 2,
}));

class RemotePlayer {
  constructor(id, name, team, showName) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.alive = false;
    this.pitch = 0;
    this.buf = new SnapshotBuffer();
    this.lastX = 0;
    this.lastZ = 0;
    this.lastY = 0;
    this.hasLast = false;
    this.stepDist = 0;
    this.speed = 0;
    this.ch = new Character(name, team, showName);
    this.group = this.ch.group;
    this.head = this.ch.head;
    this.arms = this.ch.arms;
  }
  setSlot(slot) {
    this.ch.setSlot(slot);
  }
  dispose() {
    this.ch.dispose();
  }
}

export class World {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false; // ta reset tay mỗi khung để đếm đủ cả các lần vẽ
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.quality = 'medium';
    this.scale = 1;
    this.maxDpr = 1;
    this.onStep = null;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.sky = makeSky();
    this.scene.add(this.sky);
    this.envTex = null;
    try {
      this.envTex = makeEnvironment(this.renderer);
      this.scene.environment = this.envTex;
      this.scene.environmentIntensity = 0.9;
    } catch (e) {
      console.warn('[gfx] Không tạo được bản đồ môi trường:', e);
    }
    this.env = buildEnvironment(this.scene, MAP, this.renderer);
    this.sun = this.env.sun;
    this.fx = new Fx(this.scene);
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.corpses = [];
    this.time = 0;

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
    this.postMode = q.post;
    this.resize();
    this.post.build(q.post);
    this.post.setSize(window.innerWidth, window.innerHeight, this.pixelRatio);
  }

  // Hệ số độ phân giải động (0.6–1.25) do chế độ Tự động điều chỉnh.
  setScale(s) {
    this.scale = Math.max(0.6, Math.min(1.25, s));
    this.resize();
  }

  get pixelRatio() {
    return Math.max(0.5, Math.min(window.devicePixelRatio || 1, this.maxDpr) * this.scale);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.setSize(w, h, this.pixelRatio);
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
        if (rp.group.visible && rp.hasLast) this.spawnCorpse(rp);
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
  spawnCorpse(rp) {
    const c = makeCorpse(rp.ch, rp.group.position.x, rp.group.position.y, rp.group.position.z, rp.group.rotation.y);
    this.scene.add(c.pivot);
    this.corpses.push(c);
    while (this.corpses.length > 8) this.removeCorpse(this.corpses.shift());
  }

  removeCorpse(c) {
    this.scene.remove(c.pivot);
  }

  // Vệt đạn + va chạm. hit: trúng người (từ server). Trả về điểm trúng để nơi khác dùng nếu cần.
  addTracer(from, to, color, hit) {
    this.fx.tracer(from, to);
    const p = [to[0], to[1], to[2]];
    this.fx.impact(p, hit ? null : faceNormalAt(AABBS, p), !!hit);
  }

  muzzleFlash(pos, strength) {
    this.fx.muzzleFlash(pos, strength);
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
      if (rp.hasLast && dt > 0) {
        const inst = Math.hypot(s.x - rp.lastX, s.z - rp.lastZ) / dt;
        rp.speed += (Math.min(inst, 9) - rp.speed) * Math.min(1, dt * 10);
      }
      rp.ch.animate(dt, rp.speed, s.pitch, s.y > 0.12 && Math.abs(s.y - rp.lastY) > 0.002);
      rp.lastX = s.x;
      rp.lastY = s.y;
      rp.lastZ = s.z;
      rp.hasLast = true;
    }

    this.time += dt;
    this.fx.update(dt);
    this.env.update(dt, this.camera.position);
    this.sky.material.uniforms.uTime.value = this.time;
    this.sky.position.copy(this.camera.position);
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      if (!updateCorpse(this.corpses[i], dt)) {
        this.removeCorpse(this.corpses[i]);
        this.corpses.splice(i, 1);
      }
    }
  }

  setCamera(x, y, z, yaw, pitch) {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(pitch, yaw, 0);
  }

  render(viewmodel) {
    this.renderer.info.reset();
    if (this.post.enabled) {
      this.post.render(1 / 60, this.time);
    } else {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
    if (viewmodel) {
      this.renderer.clearDepth();
      this.renderer.render(viewmodel.scene, viewmodel.camera);
    }
  }

  clearEffects() {
    this.fx.clear();
    for (const c of this.corpses) this.removeCorpse(c);
    this.corpses.length = 0;
  }
}

export { EYE };
