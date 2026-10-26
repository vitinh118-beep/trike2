// Hậu kỳ: khử răng cưa (MSAA), bloom cho nguồn sáng, AO ở mức Cao, tone mapping ACES, chỉnh màu, tối góc, nhiễu hạt.
// Nếu thiết bị không hỗ trợ, tự tắt và game vẫn vẽ bình thường (xem World.render).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1280, 720) },
    uVig: { value: 0.55 },
    uGrain: { value: 0.035 },
    uAber: { value: 0.0018 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVig, uGrain, uAber;
    uniform vec2 uRes;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float ca = uAber * dot(c, c) * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      // Chỉnh màu: tương phản nhẹ, bão hoà, ấm
      col = (col - 0.5) * 1.07 + 0.5;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.12);
      col *= vec3(1.03, 1.0, 0.95);
      // Tối góc
      float v = smoothstep(0.95, 0.25, length(c * vec2(1.0, 0.92)));
      col *= mix(1.0, v, uVig);
      // Nhiễu hạt phim
      col += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.bloom = null;
    this.ao = null;
    this.grade = null;
    this.mode = 'off'; // off | medium | high
    this.failed = false;
    this.w = 1280;
    this.h = 720;
    this.pr = 1;
  }

  build(mode) {
    this.dispose();
    if (mode === 'off' || this.failed) {
      this.mode = 'off';
      return;
    }
    try {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x || this.w, size.y || this.h, {
        type: THREE.HalfFloatType,
        samples: mode === 'high' ? 4 : 2,
      });
      const composer = new EffectComposer(this.renderer, rt);
      composer.setPixelRatio(this.pr);
      composer.setSize(this.w, this.h);
      composer.addPass(new RenderPass(this.scene, this.camera));
      if (mode === 'high') {
        const ao = new GTAOPass(this.scene, this.camera, this.w, this.h);
        ao.output = GTAOPass.OUTPUT.Default;
        ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
        composer.addPass(ao);
        this.ao = ao;
      }
      const bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), 0.34, 0.65, 0.95);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      const grade = new ShaderPass(GradeShader);
      composer.addPass(grade);
      this.composer = composer;
      this.bloom = bloom;
      this.grade = grade;
      this.mode = mode;
    } catch (e) {
      console.warn('[gfx] Không bật được hậu kỳ, dùng vẽ trực tiếp:', e);
      this.failed = true;
      this.dispose();
      this.mode = 'off';
    }
  }

  get enabled() {
    return !!this.composer;
  }

  setSize(w, h, pr) {
    this.w = w;
    this.h = h;
    this.pr = pr;
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.grade.uniforms.uRes.value.set(w * pr, h * pr);
    }
  }

  render(dt, time) {
    this.grade.uniforms.uTime.value = time;
    this.composer.render(dt);
  }

  dispose() {
    if (this.composer) {
      for (const p of this.composer.passes) if (p.dispose) p.dispose();
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    this.composer = null;
    this.bloom = null;
    this.ao = null;
    this.grade = null;
  }
}
