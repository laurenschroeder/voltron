import {
  createComponent,
  createSystem,
  Types,
  Mesh,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
} from "@iwsdk/core";
import {
  GameData,
  LANE_X,
  SCORE_PER_ORB,
  ENERGY_PER_ORB,
} from "./game.js";
import { PlayerData, CHARACTER_Z } from "./player.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ORB_POOL_SIZE = 20;
const SPAWN_INTERVAL_S = 2.0;
const SPAWN_Z = -28;
const ORB_Y = 1.2;
/** Half-width of collect zone on X and Z */
const COLLECT_R_XZ = 0.8;
/** Half-height of collect zone on Y */
const COLLECT_R_Y = 0.55;

// ─── Component ────────────────────────────────────────────────────────────────

export const Orb = createComponent("Orb", {
  active: { type: Types.Boolean, default: false },
  lane: { type: Types.Int8, default: 1 },
});

// ─── OrbSystem ────────────────────────────────────────────────────────────────

export class OrbSystem extends createSystem({
  orbs: { required: [Orb] },
}) {
  private spawnTimer = 0;
  private prevState = GameData.state;

  init(): void {
    const geo = new SphereGeometry(0.13, 8, 6);
    const mat = new MeshStandardMaterial({
      color: new Color(0x00e5ff),
      emissive: new Color(0x00b0cc),
      emissiveIntensity: 1.0,
      roughness: 0.15,
      metalness: 0.1,
    });

    for (let i = 0; i < ORB_POOL_SIZE; i++) {
      const mesh = new Mesh(geo, mat);
      mesh.visible = false;
      this.world.createTransformEntity(mesh).addComponent(Orb);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private activateOrb(entity: any): void {
    const lane = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    entity.setValue(Orb, "active", true);
    entity.setValue(Orb, "lane", lane);
    const obj = entity.object3D!;
    obj.position.set(LANE_X[lane], ORB_Y, SPAWN_Z);
    obj.visible = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private deactivateOrb(entity: any): void {
    entity.setValue(Orb, "active", false);
    if (entity.object3D) entity.object3D.visible = false;
  }

  private resetAll(): void {
    for (const entity of this.queries.orbs.entities) {
      if (Orb.data.active[entity.index]) {
        this.deactivateOrb(entity);
      }
    }
    this.spawnTimer = 0;
  }

  update(delta: number): void {
    // Detect state transitions to reset pool on game end / restart
    const state = GameData.state;
    if (state !== this.prevState) {
      if (state !== "playing") this.resetAll();
      this.prevState = state;
    }

    if (state !== "playing") return;

    const speed = GameData.speed;

    // ── Spawning ──────────────────────────────────────────────────────────
    this.spawnTimer += delta;
    if (this.spawnTimer >= SPAWN_INTERVAL_S) {
      this.spawnTimer -= SPAWN_INTERVAL_S;
      for (const entity of this.queries.orbs.entities) {
        if (!Orb.data.active[entity.index]) {
          this.activateOrb(entity);
          break;
        }
      }
    }

    // ── Move + collect ────────────────────────────────────────────────────
    const px = PlayerData.x;
    const py = PlayerData.y;

    for (const entity of this.queries.orbs.entities) {
      if (!Orb.data.active[entity.index]) continue;

      const obj = entity.object3D!;
      obj.position.z += speed * delta;

      // Collect check: orb must pass through the character's Z position.
      if (
        Math.abs(obj.position.x - px) < COLLECT_R_XZ &&
        Math.abs(obj.position.z - CHARACTER_Z) < COLLECT_R_XZ &&
        Math.abs(obj.position.y - py) < COLLECT_R_Y
      ) {
        GameData.score += SCORE_PER_ORB;
        GameData.energy = Math.min(100, GameData.energy + ENERGY_PER_ORB);
        this.deactivateOrb(entity);
        continue;
      }

      // Passed the player — reclaim
      if (obj.position.z > 3) {
        this.deactivateOrb(entity);
      }
    }
  }
}
