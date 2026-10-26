// Hiệu ứng chiến đấu: vệt đạn, tia lửa, khói bụi, vết đạn trên tường, vỏ đạn, đèn loé nòng. Tất cả dùng pool cố định.
import * as THREE from 'three';
import { glowSprite, smokeSprite, bulletHoleTex } from './textures.js';

const MAX_SPARKS = 220;
const MAX_DECALS = 70;
const MAX_PUFFS = 40;
const MAX_CASINGS = 24;
const MAX_TRACERS = 32;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Đèn loé nòng (một đèn dùng chung, cường độ giảm nhanh)
    this.flashLight = new THREE.PointLight(0xffb060, 0, 9, 2);
    this.flashLight.position.set(0, -999, 0);
    scene.add(this.flashLight);
    this.flashT = 0;

    // Tia lửa: một Points với bộ đệm cố định
    this.sparkPos = new Float32Array(MAX_SPARKS * 3);
    this.sparkVel = new Float32Array(MAX_SPARKS * 3);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    this.sparkCol = new Float32Array(MAX_SPARKS * 3);
    for (let i = 0; i < MAX_SPARKS; i++) this.sparkPos[i * 3 + 1] = -999;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 0.07, map: glowSprite(32), vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
    this.sparkNext = 0;

    // Vết đạn: vòng đệm các tấm phẳng
    const holeTex = bulletHoleTex(64);
    this.holeMat = new THREE.MeshBasicMaterial({
      map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.holeGeo = new THREE.PlaneGeometry(1, 1);
    this.decals = [];
    this.decalNext = 0;

    // Khói bụi
    this.puffTex = smokeSprite(64);
    this.puffs = [];
    for (let i = 0; i < MAX_PUFFS; i++) {
      const m = new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, depthWrite: false, opacity: 0, color: 0xcdbfa8 });
      const s = new THREE.Sprite(m);
      s.visible = false;
      this.group.add(s);
      this.puffs.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1, a0: 0.4 });
    }
    this.puffNext = 0;

    // Vỏ đạn
    this.casingGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 6);
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xc9a34a, metalness: 0.9, roughness: 0.3 });
    this.casings = [];
    for (let i = 0; i < MAX_CASINGS; i++) {
      const m = new THREE.Mesh(this.casingGeo, this.casingMat);
      m.visible = false;
      this.group.add(m);
      this.casings.push({ m, life: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    this.casingNext = 0;

    // Vệt đạn
    this.tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(3.0, 2.2, 1.1), transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      });
      const m = new THREE.Mesh(this.tracerGeo, mat);
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.tracers.push({ m, mat, life: 0, max: 0.08 });
    }
    this.tracerNext = 0;
  }

  // ---- Đèn loé nòng ----
  muzzleFlash(pos, strength = 1) {
    this.flashLight.position.set(pos[0], pos[1], pos[2]);
    this.flashLight.intensity = 55 * strength;
    this.flashT = 0.06;
  }

  // ---- Vệt đạn ----
  tracer(from, to) {
    const t = this.tracers[this.tracerNext++ % MAX_TRACERS];
    const a = _v.set(from[0], from[1], from[2]);
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.3) return;
    t.m.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
    t.m.scale.set(0.012, 0.012, len);
    t.m.lookAt(to[0], to[1], to[2]);
    t.m.visible = true;
    t.life = t.max = 0.07;
    t.mat.opacity = 0.9;
    void a;
  }

  // ---- Va chạm ----
  // p: điểm trúng; n: pháp tuyến bề mặt hoặc null; hitPlayer: trúng người; mat: loại vật liệu để đổi màu tia lửa
  impact(p, n, hitPlayer, rnd = Math.random) {
    if (hitPlayer) {
      this.burst(p, [0, 1, 0], 7, [1.8, 0.15, 0.1], 2.5);
      this.puff(p, 0.25, 0.55, [0.55, 0.05, 0.05], 0.3);
      return;
    }
    const nn = n || [0, 1, 0];
    this.burst(p, nn, 9, [3.0, 1.9, 0.8], 4);
    this.puff(p, 0.45, 0.9, [0.78, 0.7, 0.6], 0.35, nn);
    this.decal(p, nn, rnd);
  }

  burst(p, n, count, col, speed) {
    for (let i = 0; i < count; i++) {
      const k = this.sparkNext++ % MAX_SPARKS;
      const o = k * 3;
      this.sparkPos[o] = p[0] + n[0] * 0.02;
      this.sparkPos[o + 1] = p[1] + n[1] * 0.02;
      this.sparkPos[o + 2] = p[2] + n[2] * 0.02;
      const sp = speed * (0.4 + Math.random() * 0.9);
      this.sparkVel[o] = n[0] * sp + (Math.random() - 0.5) * speed * 0.9;
      this.sparkVel[o + 1] = n[1] * sp + Math.random() * speed * 0.5;
      this.sparkVel[o + 2] = n[2] * sp + (Math.random() - 0.5) * speed * 0.9;
      this.sparkLife[k] = 0.25 + Math.random() * 0.35;
      this.sparkCol[o] = col[0];
      this.sparkCol[o + 1] = col[1];
      this.sparkCol[o + 2] = col[2];
    }
  }

  puff(p, size, life, rgb, alpha, n = [0, 1, 0]) {
    const e = this.puffs[this.puffNext++ % MAX_PUFFS];
    e.s.position.set(p[0] + n[0] * 0.05, p[1] + n[1] * 0.05, p[2] + n[2] * 0.05);
    e.s.material.color.setRGB(rgb[0], rgb[1], rgb[2]);
    e.s.scale.setScalar(size);
    e.s.visible = true;
    e.life = e.max = life;
    e.a0 = alpha;
    e.grow = 1.6;
    e.vel.set(n[0] * 0.5, 0.3 + Math.random() * 0.3, n[2] * 0.5);
  }

  decal(p, n, rnd) {
    let d = this.decals[this.decalNext % MAX_DECALS];
    if (!d) {
      d = new THREE.Mesh(this.holeGeo, this.holeMat);
      d.renderOrder = 2;
      this.group.add(d);
      this.decals.push(d);
    }
    this.decalNext++;
    d.position.set(p[0] + n[0] * 0.012, p[1] + n[1] * 0.012, p[2] + n[2] * 0.012);
    _q.setFromUnitVectors(Z, _v.set(n[0], n[1], n[2]));
    d.quaternion.copy(_q);
    d.rotateZ(rnd() * Math.PI * 2);
    d.scale.setScalar(0.12 + rnd() * 0.08);
    d.visible = true;
  }

  // ---- Vỏ đạn ----
  casing(pos, right, up) {
    const c = this.casings[this.casingNext++ % MAX_CASINGS];
    c.m.position.set(pos[0], pos[1], pos[2]);
    c.vel.set(
      right[0] * (1.6 + Math.random()) + up[0] * (1.4 + Math.random() * 0.6),
      right[1] * (1.6 + Math.random()) + up[1] * (1.4 + Math.random() * 0.6),
      right[2] * (1.6 + Math.random()) + up[2] * (1.4 + Math.random() * 0.6)
    );
    c.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    c.life = 1.6;
    c.m.visible = true;
  }

  update(dt) {
    // Đèn loé nòng
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashLight.intensity *= Math.exp(-40 * dt);
      if (this.flashT <= 0) {
        this.flashLight.intensity = 0;
        this.flashLight.position.y = -999;
      }
    }

    // Vệt đạn
    for (const t of this.tracers) {
      if (!t.m.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.m.visible = false;
      else t.mat.opacity = (t.life / t.max) * 0.9;
    }

    // Tia lửa
    let any = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      any = true;
      this.sparkLife[i] -= dt;
      const o = i * 3;
      this.sparkVel[o + 1] -= 9.8 * dt;
      this.sparkPos[o] += this.sparkVel[o] * dt;
      this.sparkPos[o + 1] += this.sparkVel[o + 1] * dt;
      this.sparkPos[o + 2] += this.sparkVel[o + 2] * dt;
      if (this.sparkPos[o + 1] < 0.01) {
        this.sparkPos[o + 1] = 0.01;
        this.sparkVel[o + 1] *= -0.3;
      }
      if (this.sparkLife[i] <= 0) {
        this.sparkPos[o + 1] = -999;
      } else {
        const f = Math.min(1, this.sparkLife[i] * 3);
        this.sparkCol[o] *= 0.94 + f * 0.05;
        this.sparkCol[o + 1] *= 0.92 + f * 0.05;
        this.sparkCol[o + 2] *= 0.9 + f * 0.05;
      }
    }
    if (any) {
      this.sparks.geometry.attributes.position.needsUpdate = true;
      this.sparks.geometry.attributes.color.needsUpdate = true;
    }

    // Khói
    for (const e of this.puffs) {
      if (!e.s.visible) continue;
      e.life -= dt;
      if (e.life <= 0) {
        e.s.visible = false;
        continue;
      }
      const k = e.life / e.max;
      e.s.position.addScaledVector(e.vel, dt);
      e.vel.multiplyScalar(Math.exp(-2 * dt));
      e.s.scale.multiplyScalar(1 + (e.grow - 1) * dt * 1.8);
      e.s.material.opacity = e.a0 * k * k;
    }

    // Vỏ đạn
    for (const c of this.casings) {
      if (!c.m.visible) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.m.visible = false;
        continue;
      }
      c.vel.y -= 9.8 * dt;
      c.m.position.addScaledVector(c.vel, dt);
      if (c.m.position.y < 0.01) {
        c.m.position.y = 0.01;
        c.vel.y *= -0.35;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
        c.spin.multiplyScalar(0.5);
      }
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.y += c.spin.y * dt;
      c.m.rotation.z += c.spin.z * dt;
    }
  }

  clear() {
    for (const d of this.decals) d.visible = false;
    this.sparkLife.fill(0);
    for (let i = 0; i < MAX_SPARKS; i++) this.sparkPos[i * 3 + 1] = -999;
    for (const e of this.puffs) e.s.visible = false;
    for (const c of this.casings) c.m.visible = false;
    for (const t of this.tracers) t.m.visible = false;
  }
}
