// Bầu trời hoàng hôn: gradient, mặt trời phát sáng, mây (shader), cộng bản đồ môi trường để vật liệu PBR phản chiếu trời.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.86, 0.36, -0.3).normalize(); // thấp trên đường chân trời: bóng đổ dài
export const SUN_COLOR = new THREE.Color(1.0, 0.78, 0.55);
export const FOG_COLOR = new THREE.Color(0.86, 0.66, 0.52);

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // luôn ở xa nhất
}`;

const frag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSun;
uniform float uTime;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunCol;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
  col = mix(col, uTop, smoothstep(0.18, 0.85, h));

  // Quầng sáng mặt trời + đĩa mặt trời
  float s = max(dot(d, uSun), 0.0);
  col += uSunCol * pow(s, 6.0) * 0.35;
  col += uSunCol * pow(s, 64.0) * 0.9;
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9985, 0.9996, s) * 3.0;

  // Mây: chiếu lên mặt phẳng ở cao, sáng viền theo hướng mặt trời
  if (d.y > 0.02) {
    vec2 uv = d.xz / (d.y + 0.25) * 1.4 + vec2(uTime * 0.004, 0.0);
    float c = fbm(uv * 1.6);
    float cover = smoothstep(0.48, 0.78, c);
    float lit = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), 3.0);
    vec3 cloudCol = mix(vec3(0.42, 0.38, 0.44), vec3(1.0, 0.72, 0.5), lit);
    cloudCol += uSunCol * 0.4 * lit * (1.0 - cover);
    col = mix(col, cloudCol, cover * smoothstep(0.02, 0.25, d.y) * 0.85);
  }
  // Dưới đường chân trời: sương mù
  col = mix(col, uHorizon * 0.8, smoothstep(0.0, -0.2, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uTime: { value: 0 },
      uTop: { value: new THREE.Color(0.1, 0.2, 0.46) },
      uMid: { value: new THREE.Color(0.62, 0.46, 0.5) },
      uHorizon: { value: new THREE.Color(1.0, 0.55, 0.28) },
      uSunCol: { value: new THREE.Color(1.0, 0.6, 0.3) },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// Bản đồ môi trường (PMREM) chụp từ chính bầu trời, để kim loại/nhựa phản chiếu màu trời hoàng hôn.
export function makeEnvironment(renderer) {
  const envScene = new THREE.Scene();
  const sky = makeSky();
  envScene.add(sky);
  // Mặt đất giả có màu ấm để phản chiếu ánh nền dưới chân
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(300, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.27, 0.24) })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.02);
  pmrem.dispose();
  sky.geometry.dispose();
  sky.material.dispose();
  ground.geometry.dispose();
  ground.material.dispose();
  return rt.texture;
}
