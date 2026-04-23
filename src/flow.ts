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
import { screenSpaceBottomStyle } from "./safeArea.js";
import { startCamera } from "./scanner.js";

// ─── App screen state (read by HUDSystem) ─────────────────────────────────────

export type AppScreen = "splash" | "instructions" | "game";

export const FlowState = {
  screen: "splash" as AppScreen,
};

// ─── FlowSystem ───────────────────────────────────────────────────────────────

export class FlowSystem extends createSystem({
  instructionsTextPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/instructions-text.json")],
  },
  instructionsStartPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/instructions-start.json")],
  },
}) {
  private splashOverlay: HTMLDivElement | null = null;
  private instructionsTextEntity: Entity | null = null;
  private instructionsStartEntity: Entity | null = null;
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

    // ── Instructions: copy (top) and START (bottom) — separate panels ─────
    this.instructionsTextEntity = this.world.createTransformEntity();
    this.instructionsTextEntity
      .addComponent(PanelUI, {
        config: "./ui/instructions-text.json",
        maxWidth: 1.8,
        maxHeight: 0.9,
      })
      .addComponent(Interactable)
      .addComponent(Visibility, { isVisible: false });
    this.instructionsTextEntity.object3D!.position.set(0, 1.65, -1.5);

    this.instructionsStartEntity = this.world.createTransformEntity();
    this.instructionsStartEntity
      .addComponent(PanelUI, {
        config: "./ui/instructions-start.json",
        maxWidth: 1.8,
        maxHeight: 0.35,
      })
      .addComponent(Interactable)
      .addComponent(Visibility, { isVisible: false });
    this.instructionsStartEntity.object3D!.position.set(0, 1.12, -1.5);

    const textEnt = this.instructionsTextEntity;
    const startEnt = this.instructionsStartEntity;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((vs) => {
        if (FlowState.screen !== "instructions") return;
        const is2D = vs === VisibilityState.NonImmersive;
        if (is2D) {
          if (textEnt && !textEnt.hasComponent(ScreenSpace)) {
            textEnt.addComponent(ScreenSpace, {
              top: "20px",
              left: "16px",
              width: "calc(100vw - 32px)",
            });
          }
          if (startEnt && !startEnt.hasComponent(ScreenSpace)) {
            startEnt.addComponent(ScreenSpace, {
              bottom: screenSpaceBottomStyle(),
              left: "16px",
              width: "calc(100vw - 32px)",
            });
          }
        } else {
          textEnt?.removeComponent(ScreenSpace);
          startEnt?.removeComponent(ScreenSpace);
        }
      }),
    );

    this.queries.instructionsTextPanel.subscribe("qualify", () => {
      this.syncInstructionsDocumentsVisible();
    });

    this.queries.instructionsStartPanel.subscribe("qualify", (entity) => {
      const doc = PanelDocument.data.document[entity.index] as
        | UIKitDocument
        | undefined;
      if (!doc) return;
      this.startRowEl = doc.getElementById("start-row") as UIKit.Text;
      this.cursorEl = doc.getElementById("cursor") as UIKit.Text;
      if (this.startRowEl) {
        this.startRowEl.addEventListener("click", () => this.startGame());
      }
      this.syncInstructionsDocumentsVisible();
    });
  }

  private syncInstructionsDocumentsVisible(): void {
    const show = FlowState.screen === "instructions";
    this.setInstructionsPanelsVisible(show);
  }

  private setInstructionsPanelsVisible(visible: boolean): void {
    for (const ent of [
      this.instructionsTextEntity,
      this.instructionsStartEntity,
    ]) {
      if (!ent) continue;
      ent.setValue(Visibility, "isVisible", visible);
      const doc = PanelDocument.data.document[ent.index] as
        | UIKitDocument
        | undefined;
      if (doc) doc.visible = visible;
      if (!visible && ent.hasComponent(ScreenSpace)) {
        ent.removeComponent(ScreenSpace);
      }
    }
  }

  private startGame(): void {
    FlowState.screen = "game";
    this.setInstructionsPanelsVisible(false);
    // Restore transparent canvas so camera feed shows through
    this.world.renderer.setClearColor(0x000000, 0);
    this.world.renderer.setClearAlpha(0);
    startCamera();
  }

  update(delta: number): void {
    if (FlowState.screen === "splash") {
      this.splashElapsed += delta;
      if (!this.transitioned && this.splashElapsed >= 5) {
        this.transitioned = true;
        FlowState.screen = "instructions";

        // Add ScreenSpace first so panels are correctly positioned before becoming visible
        const vs = this.world.visibilityState.peek();
        if (vs === VisibilityState.NonImmersive) {
          const textEnt = this.instructionsTextEntity;
          const startEnt = this.instructionsStartEntity;
          if (textEnt && !textEnt.hasComponent(ScreenSpace)) {
            textEnt.addComponent(ScreenSpace, {
              top: "20px",
              left: "16px",
              width: "calc(100vw - 32px)",
            });
          }
          if (startEnt && !startEnt.hasComponent(ScreenSpace)) {
            startEnt.addComponent(ScreenSpace, {
              bottom: screenSpaceBottomStyle(),
              left: "16px",
              width: "calc(100vw - 32px)",
            });
          }
        }

        // Make panels visible, then wait two frames for ScreenSpace to reposition
        // before removing the splash — prevents the flash at raw 3D position
        this.setInstructionsPanelsVisible(true);
        const overlay = this.splashOverlay;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (overlay) overlay.style.display = "none";
        }));
      }
    } else if (FlowState.screen === "instructions") {
      // Blink the START cursor every 0.5 s
      this.blinkTimer += delta;
      if (this.blinkTimer >= 0.5) {
        this.blinkTimer = 0;
        this.blinkOn = !this.blinkOn;
        this.cursorEl?.setProperties({ opacity: this.blinkOn ? 1 : 0 });
      }
    }
  }
}
