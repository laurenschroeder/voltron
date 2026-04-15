import {
  createComponent,
  createSystem,
  Types,
  Mesh,
} from "@iwsdk/core";
import {
  GameData,
  LANE_X,
  SCORE_PER_ORB,
  ENERGY_PER_ORB,
} from "./game.js";
import { PlayerData, CHARACTER_Z } from "./player.js";
import { orbStyleRegistry, ACTIVE_STYLE, type OrbStyle, type CollectEffect } from "./orbStyles.js";

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
  /** Index into orbStyleRegistry.list() assigned in init() */
  styleIndex: { type: Types.Int8, default: 0 },
});

// ─── Active-effect tracking ───────────────────────────────────────────────────

interface ActiveEffect {
  elapsed: number;
  duration: number;
  effect: CollectEffect;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any[];
}

// ─── OrbSystem ────────────────────────────────────────────────────────────────

export class OrbSystem extends createSystem({
  orbs: { required: [Orb] },
}) {
  private spawnTimer = 0;
  private prevState = GameData.state;
  private time = 0;

  /** Cached style list (populated in init, consistent for the session) */
  private styles: OrbStyle[] = [];

  /** Live collection effects being animated this frame */
  private activeEffects: ActiveEffect[] = [];

  init(): void {
    this.styles = orbStyleRegistry.list();
    if (this.styles.length === 0) {
      console.warn("OrbSystem: orbStyleRegistry has no styles registered.");
      return;
    }

    for (let i = 0; i < ORB_POOL_SIZE; i++) {
      // Determine which style this pool slot uses
      const styleIndex = this._styleIndexFor(i);
      const style = this.styles[styleIndex];
      const mesh = style.createMesh();
      mesh.visible = false;
      const entity = this.world.createTransformEntity(mesh);
      entity.addComponent(Orb);
      entity.setValue(Orb, "styleIndex", styleIndex);
    }
  }

  /** Pick a style index for a given pool slot */
  private _styleIndexFor(poolSlot: number): number {
    if (ACTIVE_STYLE !== null) {
      const idx = this.styles.findIndex((s) => s.id === ACTIVE_STYLE);
      return idx >= 0 ? idx : 0;
    }
    return poolSlot % this.styles.length;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private activateOrb(entity: any): void {
    const lane = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    entity.setValue(Orb, "active", true);
    entity.setValue(Orb, "lane", lane);
    const obj = entity.object3D!;
    obj.position.set(LANE_X[lane], ORB_Y, SPAWN_Z);
    obj.scale.setScalar(1); // reset scale (pulsing styles may have changed it)
    obj.visible = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private deactivateOrb(entity: any): void {
    entity.setValue(Orb, "active", false);
    if (entity.object3D) {
      entity.object3D.visible = false;
      entity.object3D.scale.setScalar(1);
    }
  }

  private resetAll(): void {
    for (const entity of this.queries.orbs.entities) {
      if (Orb.data.active[entity.index]) {
        this.deactivateOrb(entity);
      }
    }
    this.spawnTimer = 0;
    // Dispose any lingering effects
    for (const ae of this.activeEffects) {
      for (const en of ae.entities) en.dispose();
    }
    this.activeEffects.length = 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private triggerCollectEffect(entity: any): void {
    const styleIndex: number = Orb.data.styleIndex[entity.index];
    const style = this.styles[styleIndex];
    if (!style) return;

    const effect = style.createCollectEffect();
    const orbPos = (entity.object3D! as Mesh).position;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const effectEntities: any[] = effect.objects.map((obj) => {
      const en = this.world.createTransformEntity(obj);
      en.object3D!.position.copy(orbPos);
      return en;
    });

    this.activeEffects.push({
      elapsed: 0,
      duration: effect.duration,
      effect,
      entities: effectEntities,
    });
  }

  update(delta: number): void {
    this.time += delta;

    // Detect state transitions to reset pool on game end / restart
    const state = GameData.state;
    if (state !== this.prevState) {
      if (state !== "playing") this.resetAll();
      this.prevState = state;
    }

    // ── Advance active collection effects ────────────────────────────────
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const ae = this.activeEffects[i];
      ae.elapsed += delta;
      const t = Math.min(ae.elapsed / ae.duration, 1);
      ae.effect.update(t);
      if (t >= 1) {
        for (const en of ae.entities) en.dispose();
        this.activeEffects.splice(i, 1);
      }
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

    // ── Move + collect + animate ──────────────────────────────────────────
    const px = PlayerData.x;
    const py = PlayerData.y;
    const time = this.time;

    for (const entity of this.queries.orbs.entities) {
      if (!Orb.data.active[entity.index]) continue;

      const obj = entity.object3D!;
      obj.position.z += speed * delta;

      // Collect check
      if (
        Math.abs(obj.position.x - px) < COLLECT_R_XZ &&
        Math.abs(obj.position.z - CHARACTER_Z) < COLLECT_R_XZ &&
        Math.abs(obj.position.y - py) < COLLECT_R_Y
      ) {
        GameData.score += SCORE_PER_ORB;
        GameData.energy = Math.min(100, GameData.energy + ENERGY_PER_ORB);
        this.triggerCollectEffect(entity);
        this.deactivateOrb(entity);
        continue;
      }

      // Passed the player — reclaim
      if (obj.position.z > 3) {
        this.deactivateOrb(entity);
        continue;
      }

      // Per-style idle animation
      const styleIndex: number = Orb.data.styleIndex[entity.index];
      const style = this.styles[styleIndex];
      if (style) style.update(obj, time);
    }
  }
}
