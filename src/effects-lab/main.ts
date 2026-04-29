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
// Soft grey fills with a couple of bright accent highlights
const envKey = new THREE.DirectionalLight(0x666666, 3);
envKey.position.set(1, 2, 1);
envScene.add(envKey);
const envFill = new THREE.DirectionalLight(0x555555, 2);
envFill.position.set(-2, 0.5, -1);
envScene.add(envFill);
const envBottom = new THREE.DirectionalLight(0x444444, 1.5);
envBottom.position.set(0, -2, 0.5);
envScene.add(envBottom);
// Sharp accent highlights
const envAccent1 = new THREE.DirectionalLight(0xffffff, 3);
envAccent1.position.set(3, 1, 0.5);
envScene.add(envAccent1);
const envAccent2 = new THREE.DirectionalLight(0xffffff, 2);
envAccent2.position.set(-1, 3, -2);
envScene.add(envAccent2);
// Dark panel for contrast (chrome needs darks too)
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

// Lighting — dim so the lightning pops
const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xccee44, 0.6);
keyLight.position.set(2, 3, 2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x88ff00, 0.4);
fillLight.position.set(-2, 1, -1);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x66cc00, 0.5);
rimLight.position.set(0, -1, -3);
scene.add(rimLight);

const purpleTop = new THREE.DirectionalLight(0x77dd00, 0.6);
purpleTop.position.set(1, 3, 0);
scene.add(purpleTop);

// Grid helper
const grid = new THREE.GridHelper(4, 20, 0x222244, 0x181830);
scene.add(grid);

// Load model
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
);
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

let energyBall: THREE.Object3D | null = null;
let ballCenter = new THREE.Vector3();
let ballRadius = 0.3;

// Lightning arcs state
const ARC_COUNT = 2;
const arcMeshes: THREE.Mesh[] = [];
const arcStrikes: LightningStrike[] = [];

const lightningMaterial = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0.8, 3.0, 0.6),
  transparent: true,
  opacity: 1.0,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const lightningCoreMaterial = new THREE.MeshBasicMaterial({
  color: new THREE.Color(1.0, 3.5, 0.5),
  transparent: true,
  opacity: 1.0,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function randomPointOnSphere(
  radius: number,
  center: THREE.Vector3,
): THREE.Vector3 {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  return new THREE.Vector3(
    center.x + radius * Math.sin(phi) * Math.cos(theta),
    center.y + radius * Math.sin(phi) * Math.sin(theta),
    center.z + radius * Math.cos(phi),
  );
}

function createArc(index: number) {
  const innerRadius = ballRadius * 0.15;
  const outerRadius = ballRadius * 1.0;

  const src = randomPointOnSphere(innerRadius, ballCenter);
  const dst = randomPointOnSphere(outerRadius, ballCenter);

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

  const mat = index % 3 === 0 ? lightningCoreMaterial : lightningMaterial;
  const mesh = new THREE.Mesh(strike, mat);
  scene.add(mesh);

  arcStrikes.push(strike);
  arcMeshes.push(mesh);
}

function respawnArc(index: number) {
  const innerRadius = ballRadius * 0.15;
  const outerRadius = ballRadius * 1.0;

  const src = randomPointOnSphere(innerRadius, ballCenter);
  const dst = randomPointOnSphere(outerRadius, ballCenter);

  arcStrikes[index].rayParameters.sourceOffset.copy(src);
  arcStrikes[index].rayParameters.destOffset.copy(dst);
}

loader.load(
  "/gltf/energyball1/ball1.glb",
  (gltf) => {
    energyBall = gltf.scene;
    scene.add(energyBall);

    // Center the model
    const box = new THREE.Box3().setFromObject(energyBall);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    energyBall.position.sub(center);
    energyBall.position.y += size.y / 2;
    energyBall.scale.setScalar(0.9);

    ballCenter.set(0, size.y / 2, 0);
    ballRadius = Math.min(size.x, size.y, size.z) / 2;

    controls.target.copy(ballCenter);
    controls.update();

    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(0, size.y / 2, maxDim * 2.5);

    console.log("Energy ball loaded", {
      size: {
        x: size.x.toFixed(3),
        y: size.y.toFixed(3),
        z: size.z.toFixed(3),
      },
      ballRadius: ballRadius.toFixed(3),
      children: gltf.scene.children.length,
    });

    const texLoader = new THREE.TextureLoader();
    const metallic = texLoader.load(
      "/textures/Metal_scratched_009_metallic.jpg",
    );
    const roughness = texLoader.load(
      "/textures/Metal_scratched_009_roughness.jpg",
    );
    const normal = texLoader.load("/textures/Metal_scratched_009_normal.jpg");
    const ao = texLoader.load(
      "/textures/Metal_scratched_009_ambientOcclusion.jpg",
    );

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

    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.Material;
        console.log(
          `  Mesh: "${mesh.name}" — material: "${mat.name}" (${mat.type})`,
        );
        mesh.material = scratchedMetalMat;
      }
    });

    // Create lightning arcs inside the ball
    for (let i = 0; i < ARC_COUNT; i++) {
      createArc(i);
    }

    console.log(`Created ${ARC_COUNT} tesla arcs inside the ball`);
  },
  undefined,
  (error) => {
    console.error("Failed to load energy ball:", error);
  },
);

// Animate
const clock = new THREE.Clock();
let respawnTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Rotate ball diagonally
  if (energyBall) {
    energyBall.rotation.y = elapsed * 0.3;
    energyBall.rotation.x = elapsed * 0.15;
  }

  // Update lightning
  for (const strike of arcStrikes) {
    strike.update(elapsed);
  }

  // Periodically move arc endpoints so they crawl around inside
  respawnTimer += delta;
  if (respawnTimer > 0.8 && arcStrikes.length > 0) {
    respawnTimer = 0;
    const idx = Math.floor(Math.random() * arcStrikes.length);
    respawnArc(idx);
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Expose for console tweaking
Object.assign(window, {
  scene,
  camera,
  renderer,
  THREE,
  energyBall: () => energyBall,
  arcStrikes,
  arcMeshes,
  lightningMaterial,
  lightningCoreMaterial,
});
