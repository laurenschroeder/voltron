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
import { screenSpaceBottomStyle } from "./safeArea.js";
import { ScanData, triggerScan } from "./scanner.js";

// ─── HUDSystem ────────────────────────────────────────────────────────────────

export class HUDSystem extends createSystem({
  hudBody: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/scanner-body.json")],
  },
  hudScan: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/scanner-scan.json")],
  },
}) {
  private hudBodyEntity: Entity | null = null;
  private hudScanEntity: Entity | null = null;
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
    this.hudBodyEntity = this.world.createTransformEntity();
    this.hudBodyEntity
      .addComponent(PanelUI, {
        config: "./ui/scanner-body.json",
        maxHeight: 0.9,
        maxWidth: 1.8,
      })
      .addComponent(Interactable)
      .addComponent(Visibility, { isVisible: false });
    this.hudBodyEntity.object3D!.position.set(0, 1.75, -1.4);

    this.hudScanEntity = this.world.createTransformEntity();
    this.hudScanEntity
      .addComponent(PanelUI, {
        config: "./ui/scanner-scan.json",
        maxHeight: 0.35,
        maxWidth: 1.8,
      })
      .addComponent(Interactable)
      .addComponent(Visibility, { isVisible: false });
    this.hudScanEntity.object3D!.position.set(0, 1.12, -1.4);

    const bodyEnt = this.hudBodyEntity;
    const scanEnt = this.hudScanEntity;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((vs) => {
        if (!this.hudVisible) return;
        if (vs === VisibilityState.NonImmersive) {
          if (bodyEnt && !bodyEnt.hasComponent(ScreenSpace)) {
            bodyEnt.addComponent(ScreenSpace, {
              top: "20px",
              left: "10%",
              width: "80%",
            });
          }
          if (scanEnt && !scanEnt.hasComponent(ScreenSpace)) {
            scanEnt.addComponent(ScreenSpace, {
              bottom: screenSpaceBottomStyle(),
              left: "10%",
              width: "80%",
            });
          }
        } else {
          bodyEnt?.removeComponent(ScreenSpace);
          scanEnt?.removeComponent(ScreenSpace);
        }
      }),
    );

    this.queries.hudBody.subscribe("qualify", (entity) => {
      this.wireBodyElements(entity);
      this.syncHudDocumentsVisible();
    });

    this.queries.hudScan.subscribe("qualify", (entity) => {
      const doc = PanelDocument.data.document[entity.index] as
        | UIKitDocument
        | undefined;
      if (!doc) return;
      this.scanBtn = doc.getElementById("scan-btn") as UIKit.Text;
      if (this.scanBtn) {
        this.scanBtn.addEventListener("click", () => triggerScan());
      }
      this.syncHudDocumentsVisible();
    });
  }

  /** Keep UIKit roots in sync when ScreenSpace reparents them to the camera. */
  private syncHudDocumentsVisible(): void {
    for (const ent of [this.hudBodyEntity, this.hudScanEntity]) {
      if (!ent) continue;
      const doc = PanelDocument.data.document[ent.index] as
        | UIKitDocument
        | undefined;
      if (doc) {
        doc.visible = ent.getValue(Visibility, "isVisible") ?? false;
      }
    }
  }

  private setHudPanelsVisible(visible: boolean): void {
    for (const ent of [this.hudBodyEntity, this.hudScanEntity]) {
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

  private wireBodyElements(entity: Entity): void {
    const doc = PanelDocument.data.document[entity.index] as
      | UIKitDocument
      | undefined;
    if (!doc) return;
    this.scoreEl = doc.getElementById("score-text") as UIKit.Text;
    this.reasoningLabelEl = doc.getElementById("reasoning-label") as UIKit.Text;
    this.reasoningEl = doc.getElementById("reasoning-text") as UIKit.Text;
    this.elementsEl = doc.getElementById("elements-text") as UIKit.Text;
    this.statusEl = doc.getElementById("status-text") as UIKit.Text;
    this.highscoreEl = doc.getElementById("highscore-text") as UIKit.Text;
  }

  update(): void {
    if (!this.hudVisible && FlowState.screen === "game") {
      this.hudVisible = true;
      this.setHudPanelsVisible(true);
      const vs = this.world.visibilityState.peek();
      if (vs === VisibilityState.NonImmersive) {
        const bodyEnt = this.hudBodyEntity;
        const scanEnt = this.hudScanEntity;
        if (bodyEnt && !bodyEnt.hasComponent(ScreenSpace)) {
          bodyEnt.addComponent(ScreenSpace, {
            top: "20px",
            left: "10%",
            width: "80%",
          });
        }
        if (scanEnt && !scanEnt.hasComponent(ScreenSpace)) {
          scanEnt.addComponent(ScreenSpace, {
            bottom: screenSpaceBottomStyle(),
            left: "10%",
            width: "80%",
          });
        }
      }
      this.syncHudDocumentsVisible();
    }

    if (!this.hudVisible) return;

    const state = ScanData.state;
    if (state === this.prevState) return;
    this.prevState = state;

    switch (state) {
      case "idle":
        this.scoreEl?.setProperties({ text: "--", color: "#00e5ff" });
        this.reasoningLabelEl?.setProperties({ text: "WHY", opacity: 0 });
        this.reasoningEl?.setProperties({
          text: "Scan something to get a score",
          color: "#fafafa",
        });
        this.elementsEl?.setProperties({ text: "" });
        this.scanBtn?.setProperties({ text: "Scan", opacity: 1 });
        this.statusEl?.setProperties({ text: "" });
        break;

      case "scanning":
        this.reasoningLabelEl?.setProperties({ text: "WHY", opacity: 0 });
        this.reasoningEl?.setProperties({ text: "Analysing…" });
        this.scanBtn?.setProperties({ text: "Scanning…", opacity: 0.5 });
        this.statusEl?.setProperties({ text: "" });
        break;

      case "result": {
        const score = ScanData.score;
        const color =
          score >= 70 ? "#00e5ff" : score >= 40 ? "#ffd700" : "#a1a1aa";
        this.scoreEl?.setProperties({ text: `${score} / 100`, color });
        this.reasoningLabelEl?.setProperties({
          text: "WHY",
          color: "#71717a",
          opacity: 1,
        });
        this.reasoningEl?.setProperties({ text: ScanData.reasoning, color: "#fafafa" });
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
        this.scoreEl?.setProperties({ text: "!", color: "#fafafa" });
        this.reasoningLabelEl?.setProperties({
          text: "WHY",
          color: "#71717a",
          opacity: 1,
        });
        this.reasoningEl?.setProperties({
          text: ScanData.errorMessage,
          color: "#fafafa",
        });
        this.scanBtn?.setProperties({ text: "Try Again", opacity: 1 });
        this.statusEl?.setProperties({ text: "" });
        break;
    }
  }
}
