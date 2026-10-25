// Súng cầm trên tay (góc nhìn thứ nhất), vẽ trong một scene riêng để không bị xuyên tường.
import * as THREE from 'three';
import { WEAPON_ORDER } from './weapons.js';

const MAT = {
  dark: new THREE.MeshLambertMaterial({ color: 0x23272d }),
  metal: new THREE.MeshLambertMaterial({ color: 0x4a5059 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x7a5232 }),
  skin: new THREE.MeshLambertMaterial({ color: 0xd9a37e }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffd36b }),
};

function box(w, h, d, mat, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
}

function buildGun(id) {
  const g = new THREE.Group();
  let muzzleZ = -0.7;
  let muzzleY = 0.02;
  if (id === 'rifle') {
    g.add(box(0.07, 0.1, 0.55, MAT.dark, 0, 0, -0.1));
    g.add(box(0.03, 0.03, 0.35, MAT.metal, 0, 0.02, -0.5));
    g.add(box(0.08, 0.07, 0.26, MAT.wood, 0, -0.01, -0.3));
    g.add(box(0.06, 0.12, 0.22, MAT.wood, 0, -0.02, 0.25));
    g.add(box(0.05, 0.16, 0.08, MAT.metal, 0, -0.12, -0.02, 0.2));
    g.add(box(0.02, 0.04, 0.02, MAT.metal, 0, 0.075, -0.35));
    g.add(box(0.07, 0.07, 0.1, MAT.skin, 0.0, -0.1, 0.12));
    g.add(box(0.08, 0.07, 0.12, MAT.skin, 0.0, -0.06, -0.32));
    muzzleZ = -0.7;
  } else if (id === 'pistol') {
    g.add(box(0.05, 0.06, 0.28, MAT.metal, 0, 0.03, -0.1));
    g.add(box(0.05, 0.14, 0.07, MAT.dark, 0, -0.07, 0.03, 0.2));
    g.add(box(0.07, 0.07, 0.09, MAT.skin, 0, -0.08, 0.05));
    muzzleZ = -0.26;
    muzzleY = 0.03;
  } else {
    g.add(box(0.04, 0.04, 0.7, MAT.metal, 0, 0.02, -0.35));
    g.add(box(0.035, 0.035, 0.55, MAT.dark, 0, -0.025, -0.3));
    g.add(box(0.07, 0.09, 0.3, MAT.dark, 0, 0, 0.05));
    g.add(box(0.06, 0.11, 0.3, MAT.wood, 0, -0.03, 0.35));
    g.add(box(0.06, 0.05, 0.14, MAT.wood, 0, -0.025, -0.35));
    g.add(box(0.07, 0.07, 0.1, MAT.skin, 0, -0.09, 0.14));
    g.add(box(0.08, 0.07, 0.12, MAT.skin, 0, -0.06, -0.35));
    muzzleZ = -0.72;
  }
  const flash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), MAT.flash);
  flash.position.set(0, muzzleY, muzzleZ - 0.03);
  flash.visible = false;
  g.add(flash);
  g.userData.flash = flash;
  g.visible = false;
  return g;
}

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(1, 2, 1);
    this.scene.add(dir);

    this.root = new THREE.Group();
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
    this.flash = 0.05;
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
      0.2 + bx - this.swayX * 0.5,
      -0.21 + by - this.reloadBlend * 0.17 - this.deploy * 0.3 + airLift - this.landDip * 0.03 + this.swayY * 0.4,
      -0.42 + this.recoil * 0.07
    );
    this.root.rotation.set(
      this.recoil * 0.1 - this.reloadBlend * 0.55 + this.swayY,
      -this.swayX * 1.5,
      this.reloadBlend * 0.3
    );

    const gun = this.guns[this.current];
    this.flash -= dt;
    gun.userData.flash.visible = this.flash > 0;
  }
}
