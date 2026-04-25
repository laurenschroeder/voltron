import {
  createSystem,
  createComponent,
  Types,
  Mesh,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
  Vector3,
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
});

// ─── BallCollectionSystem ────────────────────────────────────────────────────
// Listens for "scan-succeeded" events and (later) spawns balls + handles
// collection logic. For now, just logs that it heard the event so we can
// verify wiring works before adding 3D logic.

export class BallCollectionSystem extends createSystem({}) {
  init(): void {
    console.log("[BallCollectionSystem] init — listening for scan-succeeded");

    ballEventBus.addEventListener("scan-succeeded", () => {
      console.log("[BallCollectionSystem] scan-succeeded received — spawning ball");
      this.spawnBall();
    });
  }

  private spawnBall(): void {
    // 1. Build the 3D mesh: a glowing cyan sphere
    const geometry = new SphereGeometry(0.1, 32, 32);  // radius 0.1m (10cm)
    const material = new MeshStandardMaterial({
      color: new Color(0x00e5ff),       // cyan
      emissive: new Color(0x00e5ff),    // glowing
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4,
    });
    const mesh = new Mesh(geometry, material);

    // 2. Wrap it in an ECS entity at a fixed test position
    const entity = this.world.createTransformEntity(mesh);
    //entity.object3D!.position.set(0, 1.5, -1.5);  // 1.5m forward, eye level
    // Position the ball 1.5m in front of wherever the camera is looking
    const camera = this.world.camera;
    const forward = new Vector3();
    camera.getWorldDirection(forward);   // unit vector pointing where camera looks
    const spawnPos = camera.position.clone().add(forward.multiplyScalar(3));
    entity.object3D!.position.copy(spawnPos);
    


    // 3. Attach the Ball component so we can identify and update it later
    entity.addComponent(Ball, { value: 1, collected: false });

    console.log(`[BallCollectionSystem] ball spawned at (${spawnPos.x.toFixed(2)}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)})`);
  }

  update(): void {
    // Frame logic will go here later (distance check, collection)
  }
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

createDebugButton();