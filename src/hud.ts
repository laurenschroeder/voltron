import { createSystem } from "@iwsdk/core";
import { FlowState } from "./flow.js";
import { ScanData, triggerScan } from "./scanner.js";

// ─── HUDSystem ────────────────────────────────────────────────────────────────

export class HUDSystem extends createSystem({}) {
  private hudVisible = false;
  private prevState: string = "";

  private bodyPanel: HTMLDivElement | null = null;
  private scoreEl: HTMLSpanElement | null = null;
  private promptEl: HTMLSpanElement | null = null;
  private toggleEl: HTMLDivElement | null = null;
  private chevronEl: HTMLSpanElement | null = null;
  private collapsibleEl: HTMLDivElement | null = null;
  private reasoningEl: HTMLSpanElement | null = null;
  private elementsEl: HTMLSpanElement | null = null;
  private highscoreEl: HTMLSpanElement | null = null;
  private domScanBtn: HTMLButtonElement | null = null;

  init(): void {
    this.buildBodyPanel();
    this.buildScanButton();
  }

  private setCollapsed(collapsed: boolean): void {
    if (this.collapsibleEl) this.collapsibleEl.style.display = collapsed ? "none" : "block";
    if (this.chevronEl) this.chevronEl.textContent = collapsed ? "▾" : "▴";
  }

  private buildBodyPanel(): void {
    const panel = document.createElement("div");
    panel.style.cssText = [
      "position:fixed",
      "top:20px",
      "left:16px",
      "right:16px",
      "padding:3vw",
      "background:#09090b",
      "border:1px solid #27272a",
      "border-radius:3vw",
      "opacity:0.95",
      "z-index:20",
      "display:none",
      "box-sizing:border-box",
    ].join(";");

    // Score — always visible
    const score = document.createElement("span");
    score.textContent = "--";
    score.style.cssText = [
      "display:block",
      "font-size:5.5vw",
      "font-weight:500",
      "color:#00e5ff",
      "text-align:center",
      "margin-bottom:1vw",
    ].join(";");

    // Prompt — visible in idle/scanning, hidden in result/error
    const prompt = document.createElement("span");
    prompt.textContent = "Scan something to get a score";
    prompt.style.cssText = "display:block;font-size:3.5vw;color:#a1a1aa;margin-top:0.5vw";

    // RESULTS toggle row — hidden until first scan result
    const toggle = document.createElement("div");
    toggle.style.cssText = [
      "display:none",
      "align-items:center",
      "justify-content:space-between",
      "margin-top:0.5vw",
      "padding:1vw 0",
      "cursor:pointer",
      "-webkit-tap-highlight-color:transparent",
    ].join(";");

    const resultsLabel = document.createElement("span");
    resultsLabel.textContent = "RESULTS";
    resultsLabel.style.cssText = "font-size:3vw;font-weight:bold;color:#71717a";

    const chevron = document.createElement("span");
    chevron.textContent = "▾";
    chevron.style.cssText = "font-size:5vw;color:#71717a;line-height:1";

    toggle.appendChild(resultsLabel);
    toggle.appendChild(chevron);

    let collapsed = true;
    const onToggle = () => {
      collapsed = !collapsed;
      this.setCollapsed(collapsed);
    };
    toggle.addEventListener("click", onToggle);
    toggle.addEventListener("touchend", (e) => { e.preventDefault(); onToggle(); });

    // Collapsible content — hidden by default
    const collapsible = document.createElement("div");
    collapsible.style.display = "none";

    const reasoningBox = document.createElement("div");
    reasoningBox.style.cssText = [
      "padding:1.5vw",
      "background:#18181b",
      "border:1px solid #3f3f46",
      "border-radius:2vw",
    ].join(";");

    const reasoning = document.createElement("span");
    reasoning.style.cssText = "display:block;font-size:3.5vw;color:#fafafa";
    reasoningBox.appendChild(reasoning);

    const elements = document.createElement("span");
    elements.style.cssText = "display:block;font-size:2.5vw;color:#00e5ff;margin-top:0.8vw";

    const highscore = document.createElement("span");
    highscore.style.cssText = "display:block;font-size:2.5vw;color:#ffd700;margin-top:0.3vw";

    collapsible.appendChild(reasoningBox);
    collapsible.appendChild(elements);
    collapsible.appendChild(highscore);

    // DOM order: score → prompt → toggle → collapsible
    panel.appendChild(score);
    panel.appendChild(prompt);
    panel.appendChild(toggle);
    panel.appendChild(collapsible);
    document.body.appendChild(panel);

    this.bodyPanel = panel;
    this.scoreEl = score;
    this.promptEl = prompt;
    this.toggleEl = toggle;
    this.chevronEl = chevron;
    this.collapsibleEl = collapsible;
    this.reasoningEl = reasoning;
    this.elementsEl = elements;
    this.highscoreEl = highscore;
  }

  private buildScanButton(): void {
    const btn = document.createElement("button");
    btn.textContent = "Scan";
    btn.style.cssText = [
      "position:fixed",
      "bottom:calc(20px + env(safe-area-inset-bottom, 0px))",
      "left:16px",
      "right:16px",
      "padding:6vw 3vw",
      "font-size:6vw",
      "font-weight:bold",
      "color:#ffffff",
      "background:#09090b",
      "border:1px solid #27272a",
      "border-radius:3vw",
      "opacity:0.95",
      "cursor:pointer",
      "z-index:20",
      "display:none",
      "text-align:center",
      "box-sizing:border-box",
      "line-height:1",
      "-webkit-tap-highlight-color:transparent",
    ].join(";");
    btn.addEventListener("click", () => {
      console.log("[hud] scan button clicked");
      triggerScan();
    });
    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      console.log("[hud] scan button touchend");
      triggerScan();
    });
    document.body.appendChild(btn);
    this.domScanBtn = btn;
  }

  private setVisible(visible: boolean): void {
    const d = visible ? "block" : "none";
    if (this.bodyPanel) this.bodyPanel.style.display = d;
    if (this.domScanBtn) this.domScanBtn.style.display = d;
  }

  update(): void {
    if (!this.hudVisible && FlowState.screen === "game") {
      this.hudVisible = true;
      this.setVisible(true);
    }

    if (!this.hudVisible) return;

    const state = ScanData.state;
    if (state === this.prevState) return;
    this.prevState = state;

    switch (state) {
      case "idle":
        if (this.scoreEl) { this.scoreEl.textContent = "--"; this.scoreEl.style.color = "#00e5ff"; }
        if (this.promptEl) { this.promptEl.textContent = "Scan something to get a score"; this.promptEl.style.display = "block"; }
        if (this.toggleEl) this.toggleEl.style.display = "none";
        this.setCollapsed(true);
        if (this.domScanBtn) { this.domScanBtn.textContent = "Scan"; this.domScanBtn.disabled = false; this.domScanBtn.style.opacity = "0.95"; }
        break;

      case "scanning":
        if (this.promptEl) { this.promptEl.textContent = "Analysing…"; this.promptEl.style.display = "block"; }
        if (this.toggleEl) this.toggleEl.style.display = "none";
        this.setCollapsed(true);
        if (this.domScanBtn) { this.domScanBtn.textContent = "Scanning…"; this.domScanBtn.disabled = true; this.domScanBtn.style.opacity = "0.5"; }
        break;

      case "result": {
        const score = ScanData.score;
        const color = score >= 70 ? "#00e5ff" : score >= 40 ? "#ffd700" : "#a1a1aa";
        if (this.scoreEl) { this.scoreEl.textContent = `${score} / 100`; this.scoreEl.style.color = color; }
        if (this.promptEl) this.promptEl.style.display = "none";
        if (this.reasoningEl) this.reasoningEl.textContent = ScanData.reasoning;
        if (this.elementsEl) this.elementsEl.textContent = ScanData.elements.join(" · ");
        if (this.highscoreEl) this.highscoreEl.textContent = ScanData.highScore > 0 ? `Best: ${ScanData.highScore}` : "";
        if (this.toggleEl) this.toggleEl.style.display = "flex";
        this.setCollapsed(true);
        if (this.domScanBtn) { this.domScanBtn.textContent = "Scan Again"; this.domScanBtn.disabled = false; this.domScanBtn.style.opacity = "0.95"; }
        break;
      }

      case "error":
        if (this.scoreEl) { this.scoreEl.textContent = "!"; this.scoreEl.style.color = "#fafafa"; }
        if (this.promptEl) this.promptEl.style.display = "none";
        if (this.reasoningEl) this.reasoningEl.textContent = ScanData.errorMessage;
        if (this.toggleEl) this.toggleEl.style.display = "flex";
        this.setCollapsed(true);
        if (this.domScanBtn) { this.domScanBtn.textContent = "Try Again"; this.domScanBtn.disabled = false; this.domScanBtn.style.opacity = "0.95"; }
        break;
    }
  }
}
