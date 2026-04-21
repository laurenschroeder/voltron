import { createSystem } from "@iwsdk/core";

// Minimal GameSystem — scanner game has no per-frame game logic.
export class GameSystem extends createSystem({}) {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  update(): void {}
}
