import {
  createSystem,
  Entity,
  Interactable,
  PanelDocument,
  PanelUI,
  ScreenSpace,
  UIKit,
  UIKitDocument,
  Visibility,
  VisibilityState,
  eq,
} from "@iwsdk/core";
import { startCamera } from "./scanner.js";

// ─── App screen state (read by HUDSystem) ─────────────────────────────────────

export type AppScreen = "splash" | "instructions" | "game";

export const FlowState = {
  screen: "splash" as AppScreen,
};

// ─── FlowSystem ───────────────────────────────────────────────────────────────

export class FlowSystem extends createSystem({
  instructionsPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/instructions.json")],
  },
}) {
  private splashOverlay: HTMLDivElement | null = null;
  private instructionsEntity: Entity | null = null;
  private startRowEl: UIKit.Text | null = null;
  private cursorEl: UIKit.Text | null = null;

  private splashElapsed = 0;
  private blinkTimer = 0;
  private blinkOn = true;
  private transitioned = false;

  init(): void {
    // ── DOM splash overlay (works in 2D and as fallback) ──────────────────
    const overlay = document.createElement("div");
    document.body.style.background = "#000";
    // Override Three.js sky dome — opaque black until game starts
    this.world.renderer.setClearColor(0x000000, 1);
    this.world.scene.background = null;

    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:#000",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "z-index:99",
    ].join(";");
    const img = document.createElement("img");
    img.src = "/voltron.png";
    img.style.cssText = "max-width:60%;max-height:60%;object-fit:contain";
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    this.splashOverlay = overlay;

    // ── Instructions panel (hidden until splash times out) ────────────────
    this.instructionsEntity = this.world.createTransformEntity();
    this.instructionsEntity
      .addComponent(PanelUI, {
        config: "./ui/instructions.json",
        maxWidth: 1.8,
        maxHeight: 0.9,
      })
      .addComponent(Interactable)
      .addComponent(Visibility, { isVisible: false });
    this.instructionsEntity.object3D!.position.set(0, 1.6, -1.5);

    // ScreenSpace for instructions in 2D mode
    const instructions = this.instructionsEntity;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((vs) => {
        if (FlowState.screen !== "instructions") return;
        const is2D = vs === VisibilityState.NonImmersive;
        if (is2D && !instructions.hasComponent(ScreenSpace)) {
          instructions.addComponent(ScreenSpace, {
            bottom: "20px",
            left: "10%",
            width: "80%",
          });
        } else if (!is2D && instructions.hasComponent(ScreenSpace)) {
          instructions.removeComponent(ScreenSpace);
        }
      }),
    );

    // Wire START button once instructions panel document is ready
    this.queries.instructionsPanel.subscribe("qualify", (entity) => {
      const doc = PanelDocument.data.document[entity.index] as
        | UIKitDocument
        | undefined;
      if (!doc) return;
      this.startRowEl = doc.getElementById("start-row") as UIKit.Text;
      this.cursorEl = doc.getElementById("cursor") as UIKit.Text;
      if (this.startRowEl) {
        this.startRowEl.addEventListener("click", () => this.startGame());
      }

      this.setInstructionsPanelVisible(FlowState.screen === "instructions");
    });
  }

  private setInstructionsPanelVisible(visible: boolean): void {
    const ent = this.instructionsEntity;
    if (!ent) return;
    ent.setValue(Visibility, "isVisible", visible);
    const doc = PanelDocument.data.document[ent.index] as
      | UIKitDocument
      | undefined;
    if (doc) doc.visible = visible;
    if (!visible && ent.hasComponent(ScreenSpace)) {
      ent.removeComponent(ScreenSpace);
    }
  }

  private startGame(): void {
    FlowState.screen = "game";
    this.setInstructionsPanelVisible(false);
    // Restore transparent canvas so camera feed shows through
    this.world.renderer.setClearColor(0x000000, 0);
    this.world.renderer.setClearAlpha(0);
    startCamera();
  }

  update(delta: number): void {
    if (FlowState.screen === "splash") {
      this.splashElapsed += delta;
      if (!this.transitioned && this.splashElapsed >= 6) {
        this.transitioned = true;
        FlowState.screen = "instructions";

        // Remove splash overlay
        if (this.splashOverlay) {
          this.splashOverlay.style.display = "none";
        }

        // Show instructions panel
        this.setInstructionsPanelVisible(true);

        // Add ScreenSpace if already in 2D mode
        const vs = this.world.visibilityState.peek();
        if (
          vs === VisibilityState.NonImmersive &&
          this.instructionsEntity &&
          !this.instructionsEntity.hasComponent(ScreenSpace)
        ) {
          this.instructionsEntity.addComponent(ScreenSpace, {
            top: "20px",
            left: "10%",
            width: "80%",
          });
        }
      }
    } else if (FlowState.screen === "instructions") {
      // Blink the START button every 0.5 s
      this.blinkTimer += delta;
      if (this.blinkTimer >= 0.5) {
        this.blinkTimer = 0;
        this.blinkOn = !this.blinkOn;
        this.cursorEl?.setProperties({ opacity: this.blinkOn ? 1 : 0 });
      }
    }
  }
}
