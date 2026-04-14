import {
  createComponent,
  createSystem,
  Types,
  Mesh,
  BoxGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  Color,
} from "@iwsdk/core";
import { GameData } from "./game.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const TRACK_WIDTH = 2.2; // matches LANE_X = [-0.6, 0, 0.6] with shoulder room
const TILE_LENGTH = 30;
const TILE_COUNT = 3;
const TOTAL_LOOP = TILE_COUNT * TILE_LENGTH; // 90 units

// ─── Component ────────────────────────────────────────────────────────────────

export const FloorTile = createComponent("FloorTile", {
  index: { type: Types.Int8, default: 0 },
});

// ─── TrackSystem ──────────────────────────────────────────────────────────────

export class TrackSystem extends createSystem({
  tiles: { required: [FloorTile] },
}) {
  init(): void {
    const floorMat = new MeshStandardMaterial({
      color: new Color(0x1a1a2e),
      roughness: 0.85,
      metalness: 0.05,
    });

    const laneMat = new MeshStandardMaterial({
      color: new Color(0x3333bb),
      emissive: new Color(0x2222aa),
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.3,
    });

    const wallMat = new MeshStandardMaterial({
      color: new Color(0x0d0d1f),
      roughness: 0.9,
    });

    // ── Floor tiles (3 tiles for seamless infinite scroll) ────────────────
    for (let i = 0; i < TILE_COUNT; i++) {
      const geo = new PlaneGeometry(TRACK_WIDTH, TILE_LENGTH);
      const mesh = new Mesh(geo, floorMat);
      mesh.rotation.x = -Math.PI / 2;
      // Tiles start in front of the player; spread at -15, -45, -75
      mesh.position.set(0, 0, -(TILE_LENGTH / 2) - i * TILE_LENGTH);
      this.world
        .createTransformEntity(mesh)
        .addComponent(FloorTile, { index: i });
    }

    // ── Lane dividers at ±0.3 (midpoints between lanes at 0 and ±0.6) ─────
    const dividerX = 0.3;
    const dividerLength = 300;
    for (const sx of [-1, 1]) {
      const geo = new BoxGeometry(0.045, 0.015, dividerLength);
      const mesh = new Mesh(geo, laneMat);
      mesh.position.set(sx * dividerX, 0.008, -dividerLength / 2);
      this.world.createTransformEntity(mesh);
    }

    // ── Side walls ────────────────────────────────────────────────────────
    for (const sx of [-1, 1]) {
      const geo = new BoxGeometry(0.12, 2.5, dividerLength);
      const mesh = new Mesh(geo, wallMat);
      mesh.position.set(
        sx * (TRACK_WIDTH / 2 + 0.06),
        1.25,
        -dividerLength / 2
      );
      this.world.createTransformEntity(mesh);
    }
  }

  update(delta: number): void {
    const speed = GameData.speed;
    if (speed === 0) return;

    for (const entity of this.queries.tiles.entities) {
      const obj = entity.object3D!;
      obj.position.z += speed * delta;

      // When tile centre passes the player, loop it to the back of the queue
      if (obj.position.z > TILE_LENGTH / 2) {
        obj.position.z -= TOTAL_LOOP;
      }
    }
  }
}
