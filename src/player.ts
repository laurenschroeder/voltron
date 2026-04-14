import {
  createSystem,
  Vector3,
  VisibilityState,
  InputComponent,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Color,
} from "@iwsdk/core";
import {
  GameData,
  LANE_X,
  STAND_Y,
  DUCK_Y,
  DUCK_THRESHOLD_Y,
  startGame,
  resetGame,
} from "./game.js";

// ─── Shared player state (read by orb/obstacle systems) ───────────────────────

export const PlayerData = {
  /** 0 = left, 1 = center, 2 = right */
  lane: 1,
  ducking: false,
  /** World-space X used for collision */
  x: 0 as number,
  /** Effective head Y used for collision */
  y: STAND_Y,
};

/** Z position of the visible character on the track — collision zone centred here. */
export const CHARACTER_Z = -1.0;

// ─── Internal constants ───────────────────────────────────────────────────────

/** Minimum horizontal pixels before a touch is classified as a swipe. */
const SWIPE_THRESHOLD_PX = 50;
/** Tap auto-duck duration in seconds. */
const DUCK_DURATION_S = 0.6;
/** Y centre of the vehicle body above the floor. */
const CHAR_BODY_Y = 0.2;
/** Y centre when ducked. */
const CHAR_DUCK_Y = 0.09;
/** Camera lerp speed. */
const CAM_LERP = 6;

// ─── PlayerSystem ─────────────────────────────────────────────────────────────

export class PlayerSystem extends createSystem({}) {
  private headPos!: Vector3;
  private lookTarget!: Vector3;
  /** The visible vehicle mesh (hidden in VR). */
  private characterMesh!: Mesh;

  private duckTimer = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  private swiped = false;

  init(): void {
    this.headPos = new Vector3();
    this.lookTarget = new Vector3();

    // ── Vehicle mesh (third-person character) ────────────────────────────────
    const bodyGeo = new BoxGeometry(0.44, 0.28, 0.68);
    const bodyMat = new MeshStandardMaterial({
      color: new Color(0x1155ee),
      emissive: new Color(0x0033bb),
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.45,
    });
    this.characterMesh = new Mesh(bodyGeo, bodyMat);
    this.characterMesh.position.set(LANE_X[1], CHAR_BODY_Y, CHARACTER_Z);
    this.world.createTransformEntity(this.characterMesh);

    // Hide the vehicle in VR — the player IS the character via head tracking.
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((vs) => {
        this.characterMesh.visible = vs === VisibilityState.NonImmersive;
      })
    );

    // ── Touch input ──────────────────────────────────────────────────────────
    const onTouchStart = (e: TouchEvent): void => {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.swiped = false;
    };

    const onTouchMove = (e: TouchEvent): void => {
      if (this.swiped) return;
      const dx = e.touches[0].clientX - this.touchStartX;
      const dy = e.touches[0].clientY - this.touchStartY;
      // Must be a clearly horizontal gesture to count as a lane-change swipe.
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

      this.swiped = true;
      if (GameData.state === "playing") {
        const cur = PlayerData.lane;
        if (dx < 0 && cur > 0) PlayerData.lane = cur - 1;
        if (dx > 0 && cur < 2) PlayerData.lane = cur + 1;
      } else {
        this.beginOrRestartGame();
      }
    };

    const onTouchEnd = (): void => {
      // Only treat as a tap if no swipe was detected.
      if (this.swiped) return;
      if (GameData.state === "playing") {
        PlayerData.ducking = true;
        this.duckTimer = DUCK_DURATION_S;
      } else {
        this.beginOrRestartGame();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    this.cleanupFuncs.push(() => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    });

    // ── Keyboard fallback (desktop / emulator) ───────────────────────────────
    const onKeyDown = (e: KeyboardEvent): void => {
      if (GameData.state !== "playing") {
        this.beginOrRestartGame();
        return;
      }
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          if (PlayerData.lane > 0) PlayerData.lane--;
          break;
        case "ArrowRight":
        case "KeyD":
          if (PlayerData.lane < 2) PlayerData.lane++;
          break;
        case "Space":
        case "ArrowDown":
        case "KeyS":
          PlayerData.ducking = true;
          this.duckTimer = DUCK_DURATION_S;
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    this.cleanupFuncs.push(() => window.removeEventListener("keydown", onKeyDown));
  }

  private beginOrRestartGame(): void {
    if (GameData.state === "gameover") {
      resetGame();
      PlayerData.lane = 1;
      PlayerData.ducking = false;
      PlayerData.x = 0;
      PlayerData.y = STAND_Y;
      this.duckTimer = 0;
    }
    startGame();
  }

  update(delta: number): void {
    const isXR =
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;

    if (isXR) {
      // ── VR: head tracking drives lane and duck ──────────────────────────
      this.player.head.getWorldPosition(this.headPos);
      const hx = this.headPos.x;
      PlayerData.lane = hx < -0.2 ? 0 : hx > 0.2 ? 2 : 1;
      PlayerData.x = hx;
      PlayerData.y = this.headPos.y;
      PlayerData.ducking = this.headPos.y < DUCK_THRESHOLD_Y;

      const leftGamepad = this.input.gamepads.left;
      const rightGamepad = this.input.gamepads.right;
      if (GameData.state !== "playing") {
        const anyPress =
          leftGamepad?.getButtonDown(InputComponent.Trigger) ||
          rightGamepad?.getButtonDown(InputComponent.Trigger) ||
          leftGamepad?.getButtonDown(InputComponent.Squeeze) ||
          rightGamepad?.getButtonDown(InputComponent.Squeeze);
        if (anyPress) this.beginOrRestartGame();
      }
    } else {
      // ── Non-XR: lane + duck state drives vehicle mesh and camera ────────

      // Snap collision position to lane immediately (responsive feel).
      PlayerData.x = LANE_X[PlayerData.lane];

      // Duck timer
      if (PlayerData.ducking) {
        this.duckTimer -= delta;
        if (this.duckTimer <= 0) {
          PlayerData.ducking = false;
          this.duckTimer = 0;
        }
      }
      PlayerData.y = PlayerData.ducking ? DUCK_Y : STAND_Y;

      // ── Animate vehicle mesh ─────────────────────────────────────────────
      const laneX = LANE_X[PlayerData.lane];
      const targetBodyY = PlayerData.ducking ? CHAR_DUCK_Y : CHAR_BODY_Y;
      const targetScaleY = PlayerData.ducking ? 0.45 : 1.0;

      this.characterMesh.position.x +=
        (laneX - this.characterMesh.position.x) * Math.min(1, delta * 12);
      this.characterMesh.position.y +=
        (targetBodyY - this.characterMesh.position.y) * Math.min(1, delta * 10);
      this.characterMesh.scale.y +=
        (targetScaleY - this.characterMesh.scale.y) * Math.min(1, delta * 10);

      // ── Camera: behind and slightly above, looks where the vehicle is going
      const cam = this.world.camera;
      const camTargetX = this.characterMesh.position.x * 0.35;
      cam.position.x +=
        (camTargetX - cam.position.x) * Math.min(1, delta * CAM_LERP);
      cam.position.y = 1.55;
      cam.position.z = 0.45;

      this.lookTarget.set(
        this.characterMesh.position.x * 0.2,
        1.0,
        -2.0
      );
      cam.lookAt(this.lookTarget);
    }
  }
}
