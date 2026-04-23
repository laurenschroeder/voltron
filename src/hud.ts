import {
  Entity,
  Interactable,
  PanelDocument,
  PanelUI,
  ScreenSpace,
  UIKit,
  UIKitDocument,
  Visibility,
  VisibilityState,
  createSystem,
  eq,
} from "@iwsdk/core";
import { FlowState } from "./flow.js";
import { ScanData, triggerScan } from "./scanner.js";

// ─── HUDSystem ────────────────────────────────────────────────────────────────

export class HUDSystem extends createSystem({
  hud: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/scanner.json")],
  },
}) {
  private panelEntity: Entity | null = null;
  private hudVisible = false;

  private scoreEl: UIKit.Text | null = null;
  private reasoningLabelEl: UIKit.Text | null = null;
  private reasoningEl: UIKit.Text | null = null;
  private elementsEl: UIKit.Text | null = null;
  private scanBtn: UIKit.Text | null = null;
  private statusEl: UIKit.Text | null = null;
  private highscoreEl: UIKit.Text | null = null;

  private prevState = ScanData.state;

  init(): void {
    // Panel starts hidden — shown by update() when FlowState.screen === "game"
    this.panelEntity = this.world.createTransformEntity();
    this.panelEntity
      .addComponent(PanelUI, {
        config: "./ui/scanner.json",
        maxHeight: 0.9,
        maxWidth: 1.8,
      })
      .addComponent(Interactable)
      .addComponent(Visibility, { isVisible: false });

    this.panelEntity.object3D!.position.set(0, 1.75, -1.4);

    const panelEntity = this.panelEntity;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((vs) => {
        if (!this.hudVisible) return;
        if (vs === VisibilityState.NonImmersive) {
          if (!panelEntity.hasComponent(ScreenSpace)) {
            panelEntity.addComponent(ScreenSpace, {
              bottom: "20px",
              left: "10%",
              width: "80%",
            });
          }
        } else {
          if (panelEntity.hasComponent(ScreenSpace)) {
            panelEntity.removeComponent(ScreenSpace);
          }
        }
      }),
    );

    // Wire UI elements once panel document loads
    this.queries.hud.subscribe("qualify", (entity) => {
      const doc = PanelDocument.data.document[entity.index] as
        | UIKitDocument
        | undefined;
      if (!doc) return;

      this.scoreEl = doc.getElementById("score-text") as UIKit.Text;
      this.reasoningLabelEl = doc.getElementById("reasoning-label") as UIKit.Text;
      this.reasoningEl = doc.getElementById("reasoning-text") as UIKit.Text;
      this.elementsEl = doc.getElementById("elements-text") as UIKit.Text;
      this.scanBtn = doc.getElementById("scan-btn") as UIKit.Text;
      this.statusEl = doc.getElementById("status-text") as UIKit.Text;
      this.highscoreEl = doc.getElementById("highscore-text") as UIKit.Text;

      if (this.scanBtn) {
        this.scanBtn.addEventListener("click", () => triggerScan());
      }
    });
  }

  update(): void {
    // Reveal panel the first frame the game screen is active
    if (!this.hudVisible && FlowState.screen === "game") {
      this.hudVisible = true;
      this.panelEntity?.setValue(Visibility, "isVisible", true);
      const vs = this.world.visibilityState.peek();
      if (
        vs === VisibilityState.NonImmersive &&
        this.panelEntity &&
        !this.panelEntity.hasComponent(ScreenSpace)
      ) {
        this.panelEntity.addComponent(ScreenSpace, {
          top: "20px",
          right: "20px",
          height: "65%",
        });
      }
    }

    if (!this.hudVisible) return;

    const state = ScanData.state;
    if (state === this.prevState) return;
    this.prevState = state;

    switch (state) {
      case "idle":
        this.scoreEl?.setProperties({ text: "--" });
        this.reasoningLabelEl?.setProperties({ text: "" });
        this.reasoningEl?.setProperties({ text: "Scan something to get a score" });
        this.elementsEl?.setProperties({ text: "" });
        this.scanBtn?.setProperties({ text: "Scan", opacity: 1 });
        this.statusEl?.setProperties({ text: "" });
        break;

      case "scanning":
        this.reasoningLabelEl?.setProperties({ text: "" });
        this.reasoningEl?.setProperties({ text: "Analysing…" });
        this.scanBtn?.setProperties({ text: "Scanning…", opacity: 0.5 });
        this.statusEl?.setProperties({ text: "" });
        break;

      case "result": {
        const score = ScanData.score;
        const color =
          score >= 70 ? "#00e5ff" : score >= 40 ? "#ffd700" : "#a1a1aa";
        this.scoreEl?.setProperties({ text: `${score} / 100`, color });
        this.reasoningLabelEl?.setProperties({ text: "WHY" });
        this.reasoningEl?.setProperties({ text: ScanData.reasoning });
        this.elementsEl?.setProperties({
          text: ScanData.elements.length
            ? ScanData.elements.join(" · ")
            : "",
        });
        this.scanBtn?.setProperties({ text: "Scan Again", opacity: 1 });
        this.statusEl?.setProperties({ text: "" });
        this.highscoreEl?.setProperties({
          text: ScanData.highScore > 0 ? `Best: ${ScanData.highScore}` : "",
        });
        break;
      }

      case "error":
        this.scoreEl?.setProperties({ text: "!" });
        this.reasoningLabelEl?.setProperties({ text: "ERROR" });
        this.reasoningEl?.setProperties({ text: ScanData.errorMessage });
        this.scanBtn?.setProperties({ text: "Try Again", opacity: 1 });
        this.statusEl?.setProperties({ text: "" });
        break;
    }
  }
}
