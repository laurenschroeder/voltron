import { createSystem } from "@iwsdk/core";

// ─── Constants ────────────────────────────────────────────────────────────────

export const BASE_SPEED = 8;
export const BLAST_SPEED = 16;
export const BLAST_DURATION = 5.0;
export const ENERGY_PER_ORB = 20;
export const SCORE_PER_ORB = 50;
export const BLAST_SCORE_BONUS = 500;

/** World-space X positions for lanes 0 (left), 1 (center), 2 (right). */
export const LANE_X = [-0.6, 0, 0.6] as const;

/** Player head Y while standing (non-XR virtual, or approximate real). */
export const STAND_Y = 1.5;
/** Player head Y while ducking (non-XR virtual). */
export const DUCK_Y = 0.85;
/** Y threshold: head below this counts as ducking. */
export const DUCK_THRESHOLD_Y = 1.05;

// ─── Shared mutable game state ────────────────────────────────────────────────

export type GameState = "idle" | "playing" | "gameover";

export const GameData = {
  state: "idle" as GameState,
  score: 0,
  energy: 0, // 0–100
  speed: BASE_SPEED,
  blastActive: false,
  blastTimer: 0,
};

// ─── State-transition helpers (called from systems / input handlers) ──────────

export function triggerBlast(): void {
  if (GameData.energy < 100) return;
  if (GameData.state !== "playing") return;
  GameData.score += BLAST_SCORE_BONUS;
  GameData.energy = 0;
  GameData.speed = BLAST_SPEED;
  GameData.blastActive = true;
  GameData.blastTimer = BLAST_DURATION;
}

export function startGame(): void {
  GameData.state = "playing";
  GameData.score = 0;
  GameData.energy = 0;
  GameData.speed = BASE_SPEED;
  GameData.blastActive = false;
  GameData.blastTimer = 0;
}

export function endGame(): void {
  if (GameData.state !== "playing") return;
  GameData.state = "gameover";
  GameData.speed = 0;
}

export function resetGame(): void {
  GameData.state = "idle";
  GameData.score = 0;
  GameData.energy = 0;
  GameData.speed = BASE_SPEED;
  GameData.blastActive = false;
  GameData.blastTimer = 0;
}

// ─── GameSystem ───────────────────────────────────────────────────────────────
// Runs every frame; owns score/energy accumulation and blast timer.

export class GameSystem extends createSystem({}) {
  update(delta: number): void {
    if (GameData.state !== "playing") return;

    // Passive score: +1 per second (×2 during blast)
    GameData.score += delta * (GameData.blastActive ? 2 : 1);

    // Energy fills passively: 0→100 in ~33 s at base pace
    if (GameData.energy < 100) {
      GameData.energy = Math.min(100, GameData.energy + delta * 3);
    }

    // Blast cooldown
    if (GameData.blastActive) {
      GameData.blastTimer -= delta;
      if (GameData.blastTimer <= 0) {
        GameData.blastActive = false;
        GameData.speed = BASE_SPEED;
      }
    }
  }
}
