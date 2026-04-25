import {
  createSystem,
  createComponent,
  Types,
  Mesh,
  Group,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Color,
  Vector3,
  Interactable,
  Pressed,
} from "@iwsdk/core";


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

// ─── Score state ─────────────────────────────────────────────────────────────
// Total score, lives module-level so other modules (HUD, etc.) can read it.

export const BallScore = {
  total: 0,
};

// ─── BallCollectionSystem ────────────────────────────────────────────────────
// Listens for "scan-succeeded" events and (later) spawns balls + handles
// collection logic. For now, just logs that it heard the event so we can
// verify wiring works before adding 3D logic.

export class BallCollectionSystem extends createSystem({
  balls: { required: [Ball] },
  pressedBalls: { required: [Ball, Pressed] },
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

  private spawnBall(): void {
  // 1. Build a group containing CORE (solid sphere) + HALO (translucent outer)
  const group = new Group();

  // Core sphere — violet/purple, glowing, the "click target"
  const coreGeometry = new SphereGeometry(0.1, 32, 32);
  const coreMaterial = new MeshStandardMaterial({
    color: new Color(0x8a2be2),         // blue-violet
    emissive: new Color(0xb966ff),      // brighter violet glow
    emissiveIntensity: 0.6,
    metalness: 0.4,
    roughness: 0.3,
    transparent: true,
    opacity: 1,
  });
  const core = new Mesh(coreGeometry, coreMaterial);
  group.add(core);

  // Halo — larger, translucent cyan, no lighting (always glowing)
  const haloGeometry = new SphereGeometry(0.18, 24, 24);
  const haloMaterial = new MeshBasicMaterial({
    color: new Color(0x00e5ff),         // cyan
    transparent: true,
    opacity: 0.25,
    depthWrite: false,                  // halo doesn't block what's behind it
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
        const core = group.children[0] as Mesh;
        const halo = group.children[1] as Mesh;
        const coreMat = core.material as MeshStandardMaterial;
        const haloMat = halo.material as MeshBasicMaterial;

        // Core pulses 0.4..0.9 emissive
        coreMat.emissiveIntensity =
          0.4 + 0.5 * (0.5 + 0.5 * Math.sin(age * 3));

        // Halo pulses 0.15..0.35 opacity, slightly different rate
        haloMat.opacity = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(age * 2.3));
      }
    } else {
      // ── Collect-out animation (scale up + fade out) ───────────────
      const collectAge =
        (entity.getValue(Ball, "collectAge") as number) + delta;
      entity.setValue(Ball, "collectAge", collectAge);

      const t = Math.min(collectAge / COLLECT_DURATION, 1);

      // Scale up (1.0 → 1.4)
      group.scale.setScalar(1 + 0.4 * t);

      // Fade out core and halo
      const core = group.children[0] as Mesh;
      const halo = group.children[1] as Mesh;
      const coreMat = core.material as MeshStandardMaterial;
      const haloMat = halo.material as MeshBasicMaterial;
      coreMat.opacity = 1 - t;
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
    BallScore.total += value;

    console.log(
      `[BallCollectionSystem] ball collected! +${value} pts (total: ${BallScore.total})`
    );

    entity.setValue(Ball, "collected", true);
  }
}


//update end

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