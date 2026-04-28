import { createSystem } from "@iwsdk/core";
import { FlowState, FlowSystem } from "./flow.js";
import { collectModeActive } from "./hud.js";
import { pauseCamera, resumeCamera } from "./scanner.js";

// ─── Lucide icon SVG paths ────────────────────────────────────────────────────

const ICON_LOGOUT =
  '<circle cx="12" cy="12" r="10"/>' +
  '<g transform="translate(12,12) scale(0.55) translate(-12,-12)">' +
  '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
  '<polyline points="16 17 21 12 16 7"/>' +
  '<line x1="21" y1="12" x2="9" y2="12"/>' +
  '</g>';

const ICON_CIRCLE_PAUSE =
  '<circle cx="12" cy="12" r="10"/>' +
  '<line x1="10" y1="15" x2="10" y2="9"/>' +
  '<line x1="14" y1="15" x2="14" y2="9"/>';

const ICON_CIRCLE_HELP =
  '<circle cx="12" cy="12" r="10"/>' +
  '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>' +
  '<line x1="12" y1="17" x2="12.01" y2="17"/>';

// ─── ToolbarSystem ────────────────────────────────────────────────────────────

export class ToolbarSystem extends createSystem({}) {
  private toolbarEl: HTMLDivElement | null = null;
  private pauseOverlayEl: HTMLDivElement | null = null;
  private visible = false;
  private paused = false;

  init(): void {
    // ── Pause overlay ─────────────────────────────────────────────────────
    const fillGradient =
      "linear-gradient(180deg, rgba(72,249,255,0.7) 3.14%, rgba(188,74,255,0.7) 100%)";

    const pauseOverlay = document.createElement("div");
    pauseOverlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:rgba(0,0,0,0.65)",
      "backdrop-filter:blur(8px)",
      "-webkit-backdrop-filter:blur(8px)",
      "z-index:25",
      "display:none",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "gap:32px",
    ].join(";");

    const pausedText = document.createElement("div");
    pausedText.textContent = "PAUSED";
    pausedText.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:10vw",
      "font-weight:700",
      "color:#ffffff",
      "letter-spacing:0.08em",
      "text-align:center",
    ].join(";");

    const contOuter = document.createElement("div");
    contOuter.style.cssText = [
      "width:204px",
      "height:56px",
      "border-radius:20px",
      "background:#D9D9D933",
    ].join(";");
    contOuter.classList.add("voltron-btn-glow");

    const contWrapper = document.createElement("div");
    contWrapper.style.cssText = [
      "position:relative",
      "width:100%",
      "height:100%",
      `background:${fillGradient}`,
      "padding:2px",
      "border-radius:20px",
      "box-sizing:border-box",
      "box-shadow:0px 4px 4px 0px #48F9FF47",
    ].join(";");

    const contBtn = document.createElement("button");
    contBtn.textContent = "CONTINUE";
    contBtn.style.cssText = [
      "width:100%",
      "height:100%",
      `background:${fillGradient}`,
      "border:none",
      "border-radius:18px",
      "font-family:'Space Mono',monospace",
      "font-size:18px",
      "font-weight:700",
      "color:#ffffff",
      "cursor:pointer",
      "letter-spacing:0.05em",
      "-webkit-tap-highlight-color:transparent",
    ].join(";");
    const onContinue = (): void => this.togglePause();
    contBtn.addEventListener("click", onContinue);
    contBtn.addEventListener("touchend", (e) => { e.preventDefault(); onContinue(); });

    contWrapper.appendChild(contBtn);
    contOuter.appendChild(contWrapper);
    pauseOverlay.appendChild(pausedText);
    pauseOverlay.appendChild(contOuter);
    document.body.appendChild(pauseOverlay);
    this.pauseOverlayEl = pauseOverlay;

    // ── Toolbar ───────────────────────────────────────────────────────────
    const toolbar = document.createElement("div");
    toolbar.classList.add("voltron-grad-border");
    toolbar.style.cssText = [
      "position:fixed",
      "right:14px",
      "top:calc(67vh - 90px)",
      "display:none",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "gap:16px",
      "padding:16px 8px",
      "border-radius:22px",
      "z-index:20",
    ].join(";");

    // Logout — no-op
    toolbar.appendChild(this.makeIcon(ICON_LOGOUT, () => { /* no-op */ }));

    // Pause
    toolbar.appendChild(this.makeIcon(ICON_CIRCLE_PAUSE, () => this.togglePause()));

    // Help
    toolbar.appendChild(this.makeIcon(ICON_CIRCLE_HELP, () => {
      (this.world.getSystem(FlowSystem) as FlowSystem).showInstructionsFromHelp();
    }));

    document.body.appendChild(toolbar);
    this.toolbarEl = toolbar;
  }

  private togglePause(): void {
    this.paused = !this.paused;
    FlowState.paused = this.paused;
    if (this.pauseOverlayEl) {
      this.pauseOverlayEl.style.display = this.paused ? "flex" : "none";
    }
    if (this.paused) {
      pauseCamera();
    } else {
      resumeCamera();
    }
  }

  private makeIcon(paths: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.style.cssText = [
      "width:38px",
      "height:38px",
      "background:none",
      "border:none",
      "padding:0",
      "cursor:pointer",
      "color:#ffffff",
      "-webkit-tap-highlight-color:transparent",
    ].join(";");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    btn.addEventListener("click", onClick);
    btn.addEventListener("touchend", (e) => { e.preventDefault(); onClick(); });
    return btn;
  }

  update(): void {
    if (!this.visible && FlowState.screen === "game") {
      this.visible = true;
      if (this.toolbarEl) this.toolbarEl.style.display = "flex";
    }
    if (this.toolbarEl) {
      this.toolbarEl.style.pointerEvents = collectModeActive ? "none" : "";
      this.toolbarEl.style.opacity = collectModeActive ? "0.3" : "1";
    }
  }
}
