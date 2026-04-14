import {
  createComponent,
  createSystem,
  Types,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Color,
  PanelUI,
  PanelDocument,
  ScreenSpace,
  Interactable,
  Pressed,
  UIKitDocument,
  UIKit,
  eq,
  VisibilityState,
} from "@iwsdk/core";
import {
  GameData,
  triggerBlast,
  startGame,
  resetGame,
} from "./game.js";

// ─── BlastButton component (marks the 3D VR button entity) ───────────────────

export const BlastButton = createComponent("BlastButton", {
  dummy: { type: Types.Boolean, default: false },
});

// ─── HUDSystem ────────────────────────────────────────────────────────────────

export class HUDSystem extends createSystem({
  /** The game HUD panel (qualifies once the panel JSON has loaded) */
  hud: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/game.json")],
  },
  /** 3D BLAST button when the player presses it via controller ray */
  blastPressed: { required: [BlastButton, Pressed] },
}) {
  // Cached UIKit element references (set when panel qualifies)
  private scoreEl: UIKit.Text | null = null;
  private energyEl: UIKit.Text | null = null;
  private blastBtn: UIKit.Text | null = null; // <button> in UIKit is typed as Text
  private statusEl: UIKit.Text | null = null;

  // 3D BLAST button material for glow updates
  private blastMat: MeshStandardMaterial | null = null;

  // Track previous state for status-text refresh
  private prevState = GameData.state;
  // Track previous energy >= 100 to avoid calling setProperties every frame
  private wasBlastReady = false;

  init(): void {
    // ── HUD panel ─────────────────────────────────────────────────────────
    // Non-XR: ScreenSpace makes it a 2D corner overlay.
    // VR:     ScreenSpace is removed so the panel floats at world position.
    const panelEntity = this.world
      .createTransformEntity()
      .addComponent(PanelUI, {
        config: "./ui/game.json",
        maxHeight: 0.75,
        maxWidth: 1.6,
      })
      .addComponent(Interactable);

    // World-space position: centred in front of player, just above eye line.
    // Visible in VR (head at ~1.7 m, panel 1.4 m ahead) and in non-XR
    // (camera at z=1 looking −Z; panel 2.4 m ahead at z=−1.4).
    panelEntity.object3D!.position.set(0, 1.75, -1.4);

    // Add ScreenSpace when NOT in XR so the panel becomes a crisp 2D overlay.
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((vs) => {
        if (vs === VisibilityState.NonImmersive) {
          if (!panelEntity.hasComponent(ScreenSpace)) {
            panelEntity.addComponent(ScreenSpace, {
              top: "20px",
              right: "20px",
              height: "55%",
            });
          }
        } else {
          if (panelEntity.hasComponent(ScreenSpace)) {
            panelEntity.removeComponent(ScreenSpace);
          }
        }
      })
    );

    // ── 3D BLAST button (visible in VR, at comfortable reach height) ──────
    const blastGeo = new BoxGeometry(0.32, 0.1, 0.16);
    this.blastMat = new MeshStandardMaterial({
      color: new Color(0x001166),
      emissive: new Color(0x0033ff),
      emissiveIntensity: 0.1,
      roughness: 0.3,
      metalness: 0.5,
    });
    const blastMesh = new Mesh(blastGeo, this.blastMat);
    blastMesh.position.set(0.55, 1.0, -0.6);

    this.world
      .createTransformEntity(blastMesh)
      .addComponent(Interactable)
      .addComponent(BlastButton);

    // ── React to PanelDocument becoming ready ─────────────────────────────
    this.queries.hud.subscribe("qualify", (entity) => {
      const doc = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument | undefined;
      if (!doc) return;

      this.scoreEl = doc.getElementById("score-text") as UIKit.Text;
      this.energyEl = doc.getElementById("energy-text") as UIKit.Text;
      this.blastBtn = doc.getElementById("blast-btn") as UIKit.Text;
      this.statusEl = doc.getElementById("status-text") as UIKit.Text;

      // Wire up panel BLAST button (non-XR / smartphone tap)
      if (this.blastBtn) {
        this.blastBtn.addEventListener("click", () => {
          if (GameData.state !== "playing") {
            resetGame();
            startGame();
          } else {
            triggerBlast();
          }
        });
      }

      this.refreshStatusText();
    });

    // ── React to 3D button presses (VR controller) ────────────────────────
    this.queries.blastPressed.subscribe("qualify", () => {
      if (GameData.state !== "playing") {
        resetGame();
        startGame();
      } else {
        triggerBlast();
      }
    });
  }

  private refreshStatusText(): void {
    if (!this.statusEl) return;
    const messages: Record<string, string> = {
      idle: "Swipe / lean to start",
      playing: "",
      gameover: `Game Over!  Score: ${GameData.score | 0}  —  Tap to restart`,
    };
    this.statusEl.setProperties({
      text: messages[GameData.state] ?? "",
    });
  }

  update(): void {
    const state = GameData.state;

    // Status text (only re-render on state change)
    if (state !== this.prevState) {
      this.refreshStatusText();
      this.prevState = state;
    }

    // Score
    if (this.scoreEl) {
      this.scoreEl.setProperties({ text: `Score: ${GameData.score | 0}` });
    }

    // Energy bar as Unicode block characters
    if (this.energyEl) {
      const bars = Math.round(GameData.energy / 10);
      const empty = 10 - bars;
      this.energyEl.setProperties({
        text: `Energy: ${"█".repeat(bars)}${"░".repeat(empty)}`,
      });
    }

    // BLAST button readiness (only update when threshold crosses)
    const blastReady = GameData.energy >= 100;
    if (blastReady !== this.wasBlastReady) {
      this.wasBlastReady = blastReady;

      if (this.blastBtn) {
        this.blastBtn.setProperties({
          opacity: blastReady ? 1.0 : 0.4,
        });
      }
    }

    // 3D button glow
    if (this.blastMat) {
      this.blastMat.emissiveIntensity = blastReady ? 2.0 : 0.1;
    }
  }
}
