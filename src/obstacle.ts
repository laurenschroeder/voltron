import {
  createComponent,
  createSystem,
  Types,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Color,
} from "@iwsdk/core";
import { GameData, LANE_X, DUCK_THRESHOLD_Y, endGame } from "./game.js";
import { PlayerData, CHARACTER_Z } from "./player.js";

// ─── Obstacle types ───────────────────────────────────────────────────────────

/** LANE: occupies one lane at body height → dodge by changing lane. */
export const OBS_LANE = 0;
/** OVERHEAD: spans all lanes at head height → dodge by ducking. */
export const OBS_OVERHEAD = 1;

// ─── Constants ────────────────────────────────────────────────────────────────

const LANE_POOL_SIZE = 8;
const OVERHEAD_POOL_SIZE = 4;
const SPAWN_INTERVAL_S = 2.8;
const SPAWN_Z = -28;
const LANE_OBS_Y = 1.2;
const OVERHEAD_OBS_Y = 1.6;
/** Collision half-width on X for lane obstacles (matches narrower lane spacing) */
const HIT_R_X = 0.45;
/** Z range centred on the visible character where collisions are evaluated */
const HIT_Z_NEAR = CHARACTER_Z - 0.7; // obstacle front edge reaching the character
const HIT_Z_FAR  = CHARACTER_Z + 0.5; // obstacle back edge clearing the character
/** Fraction of spawns that are overhead (rest are lane) */
const OVERHEAD_CHANCE = 0.35;

// ─── Component ────────────────────────────────────────────────────────────────

export const Obstacle = createComponent("Obstacle", {
  active: { type: Types.Boolean, default: false },
  lane: { type: Types.Int8, default: 1 },
  obsType: { type: Types.Int8, default: OBS_LANE },
});

// ─── ObstacleSystem ───────────────────────────────────────────────────────────

export class ObstacleSystem extends createSystem({
  obstacles: { required: [Obstacle] },
}) {
  private spawnTimer = 0;
  private prevState = GameData.state;

  init(): void {
    // Lane-obstacle mesh: rotated box (diamond silhouette = "spiky" feel)
    const laneGeo = new BoxGeometry(0.38, 0.38, 0.38);
    const laneMat = new MeshStandardMaterial({
      color: new Color(0xff2200),
      emissive: new Color(0xdd1100),
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.25,
    });

    // Overhead-obstacle mesh: wide horizontal bar across the whole track
    const overheadGeo = new BoxGeometry(2.0, 0.28, 0.32);
    const overheadMat = new MeshStandardMaterial({
      color: new Color(0xff8800),
      emissive: new Color(0xff6600),
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.3,
    });

    // ── Lane obstacle pool ─────────────────────────────────────────────────
    for (let i = 0; i < LANE_POOL_SIZE; i++) {
      const mesh = new Mesh(laneGeo, laneMat);
      mesh.rotation.y = Math.PI / 4; // 45° gives a diamond look
      mesh.visible = false;
      this.world
        .createTransformEntity(mesh)
        .addComponent(Obstacle, { obsType: OBS_LANE });
    }

    // ── Overhead obstacle pool ─────────────────────────────────────────────
    for (let i = 0; i < OVERHEAD_POOL_SIZE; i++) {
      const mesh = new Mesh(overheadGeo, overheadMat);
      mesh.visible = false;
      this.world
        .createTransformEntity(mesh)
        .addComponent(Obstacle, { obsType: OBS_OVERHEAD });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private activate(entity: any): void {
    const type = Obstacle.data.obsType[entity.index];
    const lane = Math.floor(Math.random() * 3);
    entity.setValue(Obstacle, "active", true);
    entity.setValue(Obstacle, "lane", lane);
    const obj = entity.object3D!;
    if (type === OBS_OVERHEAD) {
      obj.position.set(0, OVERHEAD_OBS_Y, SPAWN_Z);
    } else {
      obj.position.set(LANE_X[lane as 0 | 1 | 2], LANE_OBS_Y, SPAWN_Z);
    }
    obj.visible = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private deactivate(entity: any): void {
    entity.setValue(Obstacle, "active", false);
    if (entity.object3D) entity.object3D.visible = false;
  }

  private resetAll(): void {
    for (const entity of this.queries.obstacles.entities) {
      if (Obstacle.data.active[entity.index]) {
        this.deactivate(entity);
      }
    }
    this.spawnTimer = 0;
  }

  update(delta: number): void {
    // State transition handling
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
      const wantOverhead = Math.random() < OVERHEAD_CHANCE;
      for (const entity of this.queries.obstacles.entities) {
        if (Obstacle.data.active[entity.index]) continue;
        const isOH = Obstacle.data.obsType[entity.index] === OBS_OVERHEAD;
        if (isOH === wantOverhead) {
          this.activate(entity);
          break;
        }
      }
    }

    // ── Move + collision ──────────────────────────────────────────────────
    const px = PlayerData.x;
    const py = PlayerData.y;

    for (const entity of this.queries.obstacles.entities) {
      if (!Obstacle.data.active[entity.index]) continue;

      const obj = entity.object3D!;
      obj.position.z += speed * delta;

      // Evaluate collision when obstacle is in the danger zone
      if (obj.position.z > HIT_Z_NEAR && obj.position.z < HIT_Z_FAR) {
        const type = Obstacle.data.obsType[entity.index];
        let hit = false;

        if (type === OBS_OVERHEAD) {
          // Overhead bar: hit if player is standing (head above duck threshold)
          hit = py > DUCK_THRESHOLD_Y;
        } else {
          // Lane obstacle: hit if player is in the same lane
          const lane = Obstacle.data.lane[entity.index];
          hit = Math.abs(LANE_X[lane as 0 | 1 | 2] - px) < HIT_R_X;
        }

        if (hit) {
          endGame();
          return; // Stop processing after game ends
        }
      }

      // Passed the player — reclaim
      if (obj.position.z > 3) {
        this.deactivate(entity);
      }
    }
  }
}
