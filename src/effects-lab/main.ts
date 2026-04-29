import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { LightningStrike } from "./lib/LightningStrike.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x999999);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.01,
  100,
);
camera.position.set(0, 0.5, 2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// High-contrast environment map for chrome reflections
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.background = new THREE.Color(0x555555);
const envKey = new THREE.DirectionalLight(0x666666, 3);
envKey.position.set(1, 2, 1);
envScene.add(envKey);
const envFill = new THREE.DirectionalLight(0x555555, 2);
envFill.position.set(-2, 0.5, -1);
envScene.add(envFill);
const envBottom = new THREE.DirectionalLight(0x444444, 1.5);
envBottom.position.set(0, -2, 0.5);
envScene.add(envBottom);
const envAccent1 = new THREE.DirectionalLight(0xffffff, 3);
envAccent1.position.set(3, 1, 0.5);
envScene.add(envAccent1);
const envAccent2 = new THREE.DirectionalLight(0xffffff, 2);
envAccent2.position.set(-1, 3, -2);
envScene.add(envAccent2);
const darkPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshBasicMaterial({ color: 0x111111 }),
);
darkPanel.position.set(0, 0, -5);
envScene.add(darkPanel);
envScene.add(new THREE.AmbientLight(0x444444, 0.5));
const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
scene.environment = envMap;
pmremGenerator.dispose();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.3, 0);

// ─── Shared lights ───────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
keyLight.position.set(2, 3, 2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xcccccc, 0.4);
fillLight.position.set(-2, 1, -1);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xaaaaaa, 0.5);
rimLight.position.set(0, -1, -3);
scene.add(rimLight);

// ─── Shared material ─────────────────────────────────────────────────────────
const texLoader = new THREE.TextureLoader();
const metallic = texLoader.load("/textures/Metal_scratched_009_metallic.jpg");
const roughness = texLoader.load("/textures/Metal_scratched_009_roughness.jpg");
const normal = texLoader.load("/textures/Metal_scratched_009_normal.jpg");
const ao = texLoader.load("/textures/Metal_scratched_009_ambientOcclusion.jpg");

[metallic, roughness, ao].forEach((t) => {
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
});
normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
normal.repeat.set(3, 3);

const scratchedMetalMat = new THREE.MeshPhysicalMaterial({
  color: 0xcccccc,
  metalnessMap: metallic,
  roughnessMap: roughness,
  normalMap: normal,
  normalScale: new THREE.Vector2(1, -1),
  aoMap: ao,
  metalness: 1.0,
  roughness: 1.0,
  clearcoat: 0.5,
  clearcoatRoughness: 0.1,
  side: THREE.DoubleSide,
  envMapIntensity: 1.0,
});

// ─── Ball configs ────────────────────────────────────────────────────────────
interface BallConfig {
  glb: string;
  arcCount: number;
  fillColor: number;
  rimColor: number;
  ambientColor: number;
  pointColor: number;
  boltColor: THREE.Color;
  boltCoreColor: THREE.Color;
}

const CONFIGS: Record<string, BallConfig> = {
  "1": {
    glb: "/gltf/energyball1/ball1.glb",
    arcCount: 2,
    fillColor: 0x88ff00,
    rimColor: 0x66cc00,
    ambientColor: 0x88ff00,
    pointColor: 0x88ff00,
    boltColor: new THREE.Color(0.8, 3.0, 0.6),
    boltCoreColor: new THREE.Color(1.0, 3.5, 0.5),
  },
  "2": {
    glb: "/gltf/energyball2/ball2.glb",
    arcCount: 4,
    fillColor: 0x8844cc,
    rimColor: 0x6633aa,
    ambientColor: 0x8844cc,
    pointColor: 0x8844cc,
    boltColor: new THREE.Color(0.8, 1.5, 3.0),
    boltCoreColor: new THREE.Color(3.0, 3.0, 3.5),
  },
  "3": {
    glb: "/gltf/energyball3/ball3.glb",
    arcCount: 8,
    fillColor: 0x2266dd,
    rimColor: 0x3377ee,
    ambientColor: 0x4488ff,
    pointColor: 0x4488ff,
    boltColor: new THREE.Color(0.8, 1.5, 3.0),
    boltCoreColor: new THREE.Color(3.0, 3.0, 3.5),
  },
};

// ─── State ───────────────────────────────────────────────────────────────────
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
);
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

let activeBall: THREE.Object3D | null = null;
let ballCenter = new THREE.Vector3();
let ballRadius = 0.3;
const arcStrikes: LightningStrike[] = [];
const arcMeshes: THREE.Mesh[] = [];

const coloredAmbient = new THREE.AmbientLight(0xffffff, 0.3);
coloredAmbient.visible = false;
scene.add(coloredAmbient);

const pointLight = new THREE.PointLight(0xffffff, 1.5, 2.0);
pointLight.visible = false;
scene.add(pointLight);

function randomPointOnSphere(r: number, c: THREE.Vector3): THREE.Vector3 {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  return new THREE.Vector3(
    c.x + r * Math.sin(phi) * Math.cos(theta),
    c.y + r * Math.sin(phi) * Math.sin(theta),
    c.z + r * Math.cos(phi),
  );
}

function clearCurrentBall() {
  if (activeBall) {
    scene.remove(activeBall);
    activeBall = null;
  }
  for (const m of arcMeshes) scene.remove(m);
  arcStrikes.length = 0;
  arcMeshes.length = 0;
  coloredAmbient.visible = false;
  pointLight.visible = false;
}

function loadBall(key: string) {
  clearCurrentBall();
  const cfg = CONFIGS[key];

  fillLight.color.setHex(cfg.fillColor);
  rimLight.color.setHex(cfg.rimColor);
  coloredAmbient.color.setHex(cfg.ambientColor);
  pointLight.color.setHex(cfg.pointColor);

  const boltMat = new THREE.MeshBasicMaterial({
    color: cfg.boltColor,
    transparent: true, opacity: 1.0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const boltCoreMat = new THREE.MeshBasicMaterial({
    color: cfg.boltCoreColor,
    transparent: true, opacity: 1.0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  loader.load(cfg.glb, (gltf) => {
    activeBall = gltf.scene;
    scene.add(activeBall);

    const box = new THREE.Box3().setFromObject(activeBall);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    activeBall.position.sub(center);
    activeBall.position.y += size.y / 2;
    activeBall.scale.setScalar(0.9);

    ballCenter.set(0, size.y / 2, 0);
    ballRadius = Math.min(size.x, size.y, size.z) / 2;

    pointLight.position.copy(ballCenter);
    pointLight.visible = true;
    coloredAmbient.visible = true;

    controls.target.copy(ballCenter);
    controls.update();

    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(0, size.y / 2, maxDim * 2.5);

    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).material = scratchedMetalMat;
      }
    });

    for (let i = 0; i < cfg.arcCount; i++) {
      const src = randomPointOnSphere(ballRadius * 0.15, ballCenter);
      const dst = randomPointOnSphere(ballRadius * 0.85, ballCenter);
      const strike = new LightningStrike({
        sourceOffset: src,
        destOffset: dst,
        radius0: 0.015,
        radius1: 0.005,
        minRadius: 0.002,
        maxIterations: 7,
        isEternal: true,
        timeScale: 0.7,
        roughness: 0.85,
        straightness: 0.6,
        ramification: 3,
        maxSubrayRecursion: 2,
        recursionProbability: 0.4,
        subrayPeriod: 1.5,
        subrayDutyCycle: 0.5,
        radius0Factor: 0.4,
        radius1Factor: 0.15,
      });
      const mat = i % 3 === 0 ? boltCoreMat : boltMat;
      const mesh = new THREE.Mesh(strike, mat);
      scene.add(mesh);
      arcStrikes.push(strike);
      arcMeshes.push(mesh);
    }

    console.log(`Loaded ${cfg.glb} — ${cfg.arcCount} arcs`);
  });
}

// ─── Radio switcher ──────────────────────────────────────────────────────────
const radios = document.querySelectorAll<HTMLInputElement>('input[name="ball"]');
radios.forEach((radio) => {
  radio.addEventListener("change", () => loadBall(radio.value));
});

const checkedRadio = document.querySelector<HTMLInputElement>('input[name="ball"]:checked');
loadBall(checkedRadio?.value ?? "3");

// ─── Animate ─────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let respawnTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  if (activeBall) {
    activeBall.rotation.y = elapsed * 0.3;
    activeBall.rotation.x = elapsed * 0.15;
  }

  for (const strike of arcStrikes) {
    strike.update(elapsed);
  }

  respawnTimer += delta;
  if (respawnTimer > 0.8 && arcStrikes.length > 0) {
    respawnTimer = 0;
    const idx = Math.floor(Math.random() * arcStrikes.length);
    const src = randomPointOnSphere(ballRadius * 0.15, ballCenter);
    const dst = randomPointOnSphere(ballRadius * 0.85, ballCenter);
    arcStrikes[idx].rayParameters.sourceOffset.copy(src);
    arcStrikes[idx].rayParameters.destOffset.copy(dst);
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

Object.assign(window, {
  scene, camera, renderer, THREE,
  activeBall: () => activeBall,
  arcStrikes, arcMeshes,
});
