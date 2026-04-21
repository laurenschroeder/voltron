import {
  createSystem,
  PanelUI,
  PanelDocument,
  ScreenSpace,
  Interactable,
  UIKitDocument,
  UIKit,
  eq,
  VisibilityState,
} from "@iwsdk/core";
import { ScanData, triggerScan } from "./scanner.js";

// ─── HUDSystem ────────────────────────────────────────────────────────────────

export class HUDSystem extends createSystem({
  hud: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/scanner.json")],
  },
}) {
  private scoreEl: UIKit.Text | null = null;
  private reasoningLabelEl: UIKit.Text | null = null;
  private reasoningEl: UIKit.Text | null = null;
  private elementsEl: UIKit.Text | null = null;
  private scanBtn: UIKit.Text | null = null;
  private statusEl: UIKit.Text | null = null;
  private highscoreEl: UIKit.Text | null = null;

  private prevState = ScanData.state;

  init(): void {

    // ── HUD panel ─────────────────────────────────────────────────────────
    const panelEntity = this.world
      .createTransformEntity()
      .addComponent(PanelUI, {
        config: "./ui/scanner.json",
        maxHeight: 0.9,
        maxWidth: 1.8,
      })
      .addComponent(Interactable);

    panelEntity.object3D!.position.set(0, 1.75, -1.4);

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((vs) => {
        if (vs === VisibilityState.NonImmersive) {
          if (!panelEntity.hasComponent(ScreenSpace)) {
            panelEntity.addComponent(ScreenSpace, {
              top: "20px",
              right: "20px",
              height: "65%",
            });
          }
        } else {
          if (panelEntity.hasComponent(ScreenSpace)) {
            panelEntity.removeComponent(ScreenSpace);
          }
        }
      }),
    );

    // ── Wire up UI elements once panel doc is ready ───────────────────────
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
        this.scanBtn.addEventListener("click", () => this.doScan());
      }
    });
  }

  private doScan(): void {
    triggerScan();
  }

  update(): void {
    const state = ScanData.state;
    if (state === this.prevState) return;
    this.prevState = state;

    switch (state) {
      case "idle":
        this.scoreEl?.setProperties({ text: "⚡" });
        this.reasoningLabelEl?.setProperties({ text: "" });
        this.reasoningEl?.setProperties({ text: "Scan something to get a score" });
        this.elementsEl?.setProperties({ text: "" });
        this.scanBtn?.setProperties({ text: "⚡ Scan", opacity: 1 });
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
        const color = score >= 70 ? "#00e5ff" : score >= 40 ? "#ffd700" : "#a1a1aa";
        this.scoreEl?.setProperties({ text: `${score} / 100`, color });
        this.reasoningLabelEl?.setProperties({ text: "WHY" });
        this.reasoningEl?.setProperties({ text: ScanData.reasoning });
        this.elementsEl?.setProperties({
          text: ScanData.elements.length ? ScanData.elements.join(" · ") : "",
        });
        this.scanBtn?.setProperties({ text: "⚡ Scan Again", opacity: 1 });
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
        this.scanBtn?.setProperties({ text: "⚡ Try Again", opacity: 1 });
        this.statusEl?.setProperties({ text: "" });
        break;
    }
  }
}
