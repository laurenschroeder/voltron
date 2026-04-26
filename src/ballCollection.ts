import {
  createSystem,
  createComponent,
  Types,
  Mesh,
  Group,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  AdditiveBlending,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Color,
  Vector3,
  Interactable,
  Pressed,
} from "@iwsdk/core";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";


// ─── Shared spark texture ────────────────────────────────────────────────────
// Loaded once at module init; all spark sprites share this single texture.

const sparkTextures = [
  new TextureLoader().load("/textures/spark.png"),
  new TextureLoader().load("/textures/spark2.png"),
  new TextureLoader().load("/textures/spark3.png"),
];

function pickRandomSparkTexture() {
  return sparkTextures[Math.floor(Math.random() * sparkTextures.length)];
}

const PARTICLE_COLORS = [
  0x00e5ff, // cyan
  0x9d4dff, // purple
  0xffffff, // white
];

function pickRandomParticleColor() {
  return PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
}

// ─── Energy ball model ───────────────────────────────────────────────────────
// Load the GLB once at startup. spawnBall() clones it for each new ball.
// While the model is loading, energyBallTemplate is null — spawnBall() falls
// back to the procedural sphere, so the game keeps working.

let energyBallTemplate: Group | null = null;

new GLTFLoader().load(
  "/gltf/energyBall/energy-ball.glb",
  (gltf) => {
    energyBallTemplate = gltf.scene;
    console.log("[BallCollectionSystem] energy-ball.glb loaded");
  },
  undefined,
  (err) => {
    console.error("[BallCollectionSystem] failed to load energy-ball.glb:", err);
  },
);

// ─── Event bus ────────────────────────────────────────────────────────────────
// Anyone (scanner, debug button, fake test) can fire "scan-succeeded" on this
// bus, and BallCollectionSystem will react.
//
// To trigger from another file:
//   import { ballEventBus } from "./ballCollection.js";
//   ballEventBus.dispatchEvent(new CustomEvent("scan-succeeded"));

export const ballEventBus = new EventTarget();

// ─── Ball component ──────────────────────────────────────────────────────────
// Data attached to each energy ball entity in the world.
//   value     — how many points this ball is worth
//   collected — flag set to true when the user collects it (so we don't double-count)

export const Ball = createComponent("Ball", {
  value: { type: Types.Float32, default: 1 },
  collected: { type: Types.Boolean, default: false },
  age: { type: Types.Float32, default: 0 }, //lifetime
  collectAge: { type: Types.Float32, default: 0 }, //how long since ball collected
});

// ─── Particle component ─────────────────────────────────────────────────────
// Data for each spark in the collection burst.
//   life       — total lifetime in seconds (when age >= life, particle dies)
//   age        — how long this particle has existed
//   vx, vy, vz — velocity vector components (m/s)

export const Particle = createComponent("Particle", {
  life: { type: Types.Float32, default: 0.6 },
  age: { type: Types.Float32, default: 0 },
  vx: { type: Types.Float32, default: 0 },
  vy: { type: Types.Float32, default: 0 },
  vz: { type: Types.Float32, default: 0 },
});


// ─── Score state + persistence ───────────────────────────────────────────────
// Total score is persisted to localStorage so it survives page refreshes.
// Other modules (coupon system, HUD, etc.) can read BallScore.total.
//
// To use from another file:
//   import { BallScore } from "./ballCollection.js";
//   const points = BallScore.total;

const STORAGE_KEY = "voltron.ballScore";

function loadSavedScore(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 0 : parsed;
}

export const BallScore = {
  total: loadSavedScore(),
};

// ─── BallCollectionSystem ────────────────────────────────────────────────────
// Listens for "scan-succeeded" events and (later) spawns balls + handles
// collection logic. For now, just logs that it heard the event so we can
// verify wiring works before adding 3D logic.

export class BallCollectionSystem extends createSystem({
  balls: { required: [Ball] },
  pressedBalls: { required: [Ball, Pressed] },
  particles: { required: [Particle] },
}) {
  init(): void {
    console.log("[BallCollectionSystem] init — listening for scan-succeeded");

    ballEventBus.addEventListener("scan-succeeded", () => {
      console.log("[BallCollectionSystem] scan-succeeded received — spawning ball");
      this.spawnBall();
    });
  }

// TODO: object pool: create n balls at init, activate/deactivate
// instead of create/dispose. 
// "one scan, one ball." Pool gives better perf + supports rarity tiers cleanly.


//----spawn ball------

 private spawnBall(): void {
  // 1. Build a group containing CORE + HALO
  const group = new Group();

  // Core: GLB model if loaded, fallback to procedural sphere otherwise
  let core: Group | Mesh;
  if (energyBallTemplate) {
    core = energyBallTemplate.clone(true);  // deep clone so each ball is independent
    core.scale.setScalar(0.15);              // tweak as needed for model size
  } else {
    // Fallback if model hasn't loaded yet
    const coreGeometry = new SphereGeometry(0.1, 32, 32);
    const coreMaterial = new MeshStandardMaterial({
      color: new Color(0x8a2be2),
      emissive: new Color(0xb966ff),
      emissiveIntensity: 0.6,
      metalness: 0.4,
      roughness: 0.3,
      transparent: true,
      opacity: 1,
    });
    core = new Mesh(coreGeometry, coreMaterial);
  }
  group.add(core);

  // Halo — larger, translucent cyan, no lighting (always glowing)
  const haloGeometry = new SphereGeometry(0.18, 24, 24);
  const haloMaterial = new MeshBasicMaterial({
    color: new Color(0x9d4dff),         // vivid purple
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const halo = new Mesh(haloGeometry, haloMaterial);
  group.add(halo);

  // 2. Wrap the group in an ECS entity, position 3m in front of camera
  const entity = this.world.createTransformEntity(group);
  const camera = this.world.camera;
  const forward = new Vector3();
  camera.getWorldDirection(forward);
  const spawnPos = camera.position.clone().add(forward.multiplyScalar(3));
  entity.object3D!.position.copy(spawnPos);
  entity.object3D!.scale.setScalar(0); // start invisible, will grow in

  // 3. Attach Ball component (data) and Interactable (so it can be clicked/tapped)
  entity.addComponent(Ball, { value: 1, collected: false });
  entity.addComponent(Interactable);

  console.log(
    `[BallCollectionSystem] ball spawned at (${spawnPos.x.toFixed(2)}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)})`
  );
}


//-------spawn burst---------------------------
private spawnBurst(position: Vector3): void {
  const PARTICLE_COUNT = 24;          // doubled for more impact
  const SPEED_MIN = 1.0;
  const SPEED_MAX = 3.0;              // some particles fly fast, some slow

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Random spark texture from the pool
    const material = new SpriteMaterial({
      map: pickRandomSparkTexture(),
      color: new Color(pickRandomParticleColor()),
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new Sprite(material);

    // Random size variation — some particles are bigger
    const baseSize = 0.12 + Math.random() * 0.18;  // 0.12..0.30
    sprite.scale.setScalar(baseSize);

    // Random direction (spherical)
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
    const vx = speed * Math.sin(phi) * Math.cos(theta);
    const vy = speed * Math.sin(phi) * Math.sin(theta);
    const vz = speed * Math.cos(phi);

    // Wrap in entity, place at burst origin
    const entity = this.world.createTransformEntity(sprite);
    entity.object3D!.position.copy(position);

    // Particle component — slightly varied lifetimes
    entity.addComponent(Particle, {
      life: 0.4 + Math.random() * 0.5,
      age: 0,
      vx, vy, vz,
    });
  }
}
  
//---spawn ambient---
private spawnAmbientSparks(position: Vector3, count: number): void {
  for (let i = 0; i < count; i++) {
    const material = new SpriteMaterial({
      map: pickRandomSparkTexture(),
      color: new Color(0x00e5ff),
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new Sprite(material);
    sprite.scale.setScalar(0.05 + Math.random() * 0.06);  // small: 0.05–0.11

    // Slow drift in a random direction (much slower than burst)
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 0.2 + Math.random() * 0.3;  // 0.2–0.5 m/s, gentle
    const vx = speed * Math.sin(phi) * Math.cos(theta);
    const vy = speed * Math.sin(phi) * Math.sin(theta);
    const vz = speed * Math.cos(phi);

    const entity = this.world.createTransformEntity(sprite);
    entity.object3D!.position.copy(position);

    entity.addComponent(Particle, {
      life: 0.3 + Math.random() * 0.4,  // short-lived
      age: 0,
      vx, vy, vz,
    });
  }
}

//update start

update(delta: number): void {
  const SPAWN_DURATION = 0.3;
  const COLLECT_DURATION = 0.3;

  for (const entity of this.queries.balls.entities) {
    const collected = entity.getValue(Ball, "collected");
    const group = entity.object3D as Group;

    if (!collected) {
      // ── Spawn-in animation (scale 0 → 1) ──────────────────────────
      const age = (entity.getValue(Ball, "age") as number) + delta;
      entity.setValue(Ball, "age", age);

      if (age < SPAWN_DURATION) {
        const t = age / SPAWN_DURATION;
        const eased = 1 - (1 - t) * (1 - t);
        group.scale.setScalar(eased);
      } else {
        group.scale.setScalar(1);
      }

      // ── Slow rotation (always, for life) ──────────────────────────
      group.rotation.y += delta * 0.5;  // half radian per second

      // ── Pulse on core + halo (independent rates for shimmer) ──────
      if (age > SPAWN_DURATION) {
      const halo = group.children[1] as Mesh;
      const haloMat = halo.material as MeshBasicMaterial;

      // Halo pulses 0.15..0.35 opacity
      haloMat.opacity = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(age * 2.3));

      // Ambient sparks
      if (Math.random() < delta * 10) {
        this.spawnAmbientSparks(group.position, 1 + Math.floor(Math.random() * 2));
      }
    }
    } else {
      // ── Collect-out animation (scale up + fade out) ───────────────
      const collectAge =
        (entity.getValue(Ball, "collectAge") as number) + delta;
      entity.setValue(Ball, "collectAge", collectAge);

      const t = Math.min(collectAge / COLLECT_DURATION, 1);

      // Scale up (1.0 → 1.4)
      group.scale.setScalar(1 + 0.4 * t);

      // Fade out halo (the GLB core fades naturally via scale; visible briefly)
      const halo = group.children[1] as Mesh;
      const haloMat = halo.material as MeshBasicMaterial;
      haloMat.opacity = 0.3 * (1 - t);

      // Animation done
      if (collectAge >= COLLECT_DURATION) {
        entity.dispose();
      }
    }
  }

  // ── Tap-to-collect ──────────────────────────────────────────────────
  for (const entity of this.queries.pressedBalls.entities) {
    const collected = entity.getValue(Ball, "collected");
    if (collected) continue;

    const age = entity.getValue(Ball, "age") as number;
    if (age < SPAWN_DURATION) continue;

    const value = entity.getValue(Ball, "value") as number;
    addScore(value);

    console.log(
    `[BallCollectionSystem] ball collected! +${value} pts (total: ${BallScore.total})`
    );
    // Spawn burst at the ball's position
    this.spawnBurst(entity.object3D!.position.clone());
    

    entity.setValue(Ball, "collected", true);
  }

// ── Animate burst particles ─────────────────────────────────────────
for (const entity of this.queries.particles.entities) {
  const age = (entity.getValue(Particle, "age") as number) + delta;
  entity.setValue(Particle, "age", age);
  const life = entity.getValue(Particle, "life") as number;

  if (age >= life) {
    entity.dispose();
    continue;
  }

  // Move outward at velocity
  const vx = entity.getValue(Particle, "vx") as number;
  const vy = entity.getValue(Particle, "vy") as number;
  const vz = entity.getValue(Particle, "vz") as number;
  const obj = entity.object3D!;
  obj.position.x += vx * delta;
  obj.position.y += vy * delta;
  obj.position.z += vz * delta;

  // Fade out as particle ages
  const t = age / life;
  const sprite = obj as Sprite;
  const mat = sprite.material as SpriteMaterial;
  mat.opacity = 1 - t;

  // Shrink slightly as it fades
  obj.scale.setScalar(0.15 * (1 - t * 0.4));
}

}


//update end

}

// ─── Score helpers ──────────────────────────────────────────────────────────
// All score changes go through addScore() so localStorage stays in sync.
// Don't mutate BallScore.total directly elsewhere.

function addScore(value: number): void {
  BallScore.total += value;
  localStorage.setItem(STORAGE_KEY, BallScore.total.toString());
}

// ─── DEBUG: Fake scan trigger ────────────────────────────────────────────────
// Temporary button so we can test the system without Lauren's scanner.
// Remove this block once the real scanner fires "scan-succeeded".

function createDebugButton(): void {
  const btn = document.createElement("button");
  btn.textContent = "🐛 Fake Scan Success";
  btn.style.cssText = [
    "position:fixed",
    "top:16px",
    "right:16px",
    "z-index:9999",
    "padding:10px 14px",
    "background:#ff00aa",
    "color:white",
    "border:none",
    "border-radius:8px",
    "font-size:14px",
    "font-weight:600",
    "cursor:pointer",
    "box-shadow:0 4px 12px rgba(0,0,0,0.3)",
  ].join(";");

  btn.addEventListener("click", () => {
    console.log("[Debug] firing scan-succeeded event");
    ballEventBus.dispatchEvent(new CustomEvent("scan-succeeded"));
  });

  document.body.appendChild(btn);
}

// ─── Score display ───────────────────────────────────────────────────────────
// Tiny on-screen score counter so we can see points go up without the console.
// Polls BallScore.total a few times per second; cheap and avoids signal wiring.

function createScoreDisplay(): void {
  const display = document.createElement("div");
  display.id = "ball-score-display";
  display.style.cssText = [
    "position:fixed",
    "top:16px",
    "left:16px",
    "z-index:9999",
    "padding:10px 16px",
    "background:rgba(0,0,0,0.6)",
    "color:#00e5ff",
    "border:2px solid #00e5ff",
    "border-radius:8px",
    "font-size:18px",
    "font-weight:700",
    "font-family:system-ui,sans-serif",
    "letter-spacing:1px",
    "box-shadow:0 0 16px rgba(0,229,255,0.4)",
    "user-select:none",
    "pointer-events:none",
  ].join(";");
  display.textContent = "⚡ 0 pts";
  document.body.appendChild(display);

  // Update the text 4x per second based on BallScore.total
  setInterval(() => {
    display.textContent = `⚡ ${BallScore.total} pts`;
  }, 250);
}

createDebugButton();
createScoreDisplay();

// ─── DEBUG: Reset score helper ───────────────────────────────────────────────
// Type `resetScore()` in browser console to wipe saved score.

(window as any).resetScore = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  BallScore.total = 0;
  console.log("[Debug] score reset to 0. Refresh page to verify persistence.");
};