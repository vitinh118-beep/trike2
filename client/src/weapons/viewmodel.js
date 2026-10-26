// Súng cầm trên tay (góc nhìn thứ nhất), vẽ trong một scene riêng để không bị xuyên tường.
import * as THREE from 'three';
import { WEAPON_ORDER } from './weapons.js';

import { buildGun as buildGunModel, buildHands, GUN_MAT } from '../gfx/guns.js';
import { glowSprite } from '../gfx/textures.js';

let flashTex = null;

function buildGun(id) {
  const g = new THREE.Group();
  const model = buildGunModel(id);
  g.add(model.group);
  g.add(buildHands(id));
  // Loé nòng: hai tấm chéo + quầng sáng, vật liệu cộng sáng (đi qua bloom)
  if (!flashTex) flashTex = glowSprite(64);
  const fm = new THREE.SpriteMaterial({
    map: flashTex, color: new THREE.Color(4, 2.6, 1.2), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const flash = new THREE.Sprite(fm);
  flash.scale.set(0.34, 0.34, 1);
  flash.position.copy(model.muzzle).add(new THREE.Vector3(0, 0, -0.04));
  flash.visible = false;
  g.add(flash);
  g.userData.flash = flash;
  g.userData.muzzle = model.muzzle;
  g.userData.eject = model.eject;
  g.visible = false;
  return g;
}

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    // Ánh sáng hoàng hôn ấm từ phía mặt trời + sáng nền xanh lạnh; bản đồ môi trường cho phản chiếu kim loại
    this.scene.add(new THREE.HemisphereLight(0x9fb4e0, 0x6a5444, 1.1));
    const dir = new THREE.DirectionalLight(0xffc690, 2.6);
    dir.position.set(-1, 1.2, -1.4);
    this.scene.add(dir);

    this.root = new THREE.Group();
    this.root.scale.setScalar(0.82);
    this.scene.add(this.root);
    this.guns = {};
    for (const id of WEAPON_ORDER) {
      this.guns[id] = buildGun(id);
      this.root.add(this.guns[id]);
    }
    this.current = 'rifle';
    this.guns.rifle.visible = true;

    this.recoil = 0;
    this.flash = 0;
    this.bob = 0;
    this.reloading = false;
    this.reloadBlend = 0;
    this.deploy = 0;
    this.swayX = 0; // súng trễ theo hướng xoay chuột
    this.swayY = 0;
    this.landDip = 0; // súng chúi xuống khi tiếp đất
    this.wasGrounded = true;
  }

  // Gọi khi xoay chuột: súng hơi "trễ" lại rồi bắt kịp, cho cảm giác có trọng lượng.
  look(dx, dy) {
    this.swayX = Math.max(-0.06, Math.min(0.06, this.swayX + dx * 0.00025));
    this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY + dy * 0.00025));
  }

  setEnv(tex) {
    this.scene.environment = tex;
    this.scene.environmentIntensity = 0.8;
  }

  // Vị trí nòng/cửa thoát vỏ đạn trong không gian thế giới (dựa vào camera súng, đã đồng bộ với camera chính).
  muzzleWorld(cam, out) {
    const g = this.guns[this.current];
    this.root.updateMatrixWorld(true);
    out.copy(g.userData.muzzle).applyMatrix4(this.root.matrixWorld);
    return out.applyMatrix4(cam.matrixWorld);
  }

  ejectWorld(cam, out) {
    const g = this.guns[this.current];
    out.copy(g.userData.eject).applyMatrix4(this.root.matrixWorld);
    return out.applyMatrix4(cam.matrixWorld);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setWeapon(id) {
    if (!this.guns[id]) return;
    this.guns[this.current].visible = false;
    this.current = id;
    this.guns[id].visible = true;
    this.deploy = 1;
    this.flash = 0;
  }

  setReloading(on) {
    this.reloading = on;
  }

  // strength: 1 = súng trường; shotgun giật mạnh hơn. Bắn liên tiếp thì dồn lại (tối đa 1.6) thay vì reset.
  kick(strength = 1) {
    this.recoil = Math.min(this.recoil * 0.6 + strength, 1.6 * Math.max(1, strength * 0.6));
    this.flash = 0.045;
  }

  update(dt, speed, grounded) {
    this.recoil *= Math.exp(-14 * dt);
    this.deploy = Math.max(0, this.deploy - dt * 4);
    this.reloadBlend += ((this.reloading ? 1 : 0) - this.reloadBlend) * (1 - Math.exp(-9 * dt));
    if (grounded && speed > 0.5) this.bob += dt * speed * 1.7;

    const sd = Math.exp(-10 * dt);
    this.swayX *= sd;
    this.swayY *= sd;
    if (grounded && !this.wasGrounded) this.landDip = 1;
    this.wasGrounded = grounded;
    this.landDip *= Math.exp(-9 * dt);

    const move = Math.min(speed / 5, 1);
    const bx = Math.cos(this.bob) * 0.006 * move;
    const by = Math.abs(Math.sin(this.bob)) * 0.01 * move;
    const airLift = grounded ? 0 : 0.012;

    this.root.position.set(
      0.17 + bx - this.swayX * 0.5,
      -0.2 + by - this.reloadBlend * 0.17 - this.deploy * 0.3 + airLift - this.landDip * 0.03 + this.swayY * 0.4,
      -0.52 + this.recoil * 0.07
    );
    this.root.rotation.set(
      this.recoil * 0.1 - this.reloadBlend * 0.55 + this.swayY,
      -this.swayX * 1.5,
      this.reloadBlend * 0.3
    );

    const gun = this.guns[this.current];
    this.flash -= dt;
    gun.userData.flash.visible = this.flash > 0;
    if (this.flash > 0) gun.userData.flash.material.rotation = (this.recoil * 7) % 6.28;
  }
}
