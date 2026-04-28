import {
  createSystem,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Raycaster,
  Plane,
  Vector2,
  Vector3,
} from "@iwsdk/core";
import { FlowState, FlowSystem } from "./flow.js";
import { ScanData, triggerScan, pauseCamera, resumeCamera } from "./scanner.js";
import { ObjectDetectionData } from "./objectDetection.js";

/** Shared flag — ToolbarSystem reads this to lock itself during collect mode. */
export let collectModeActive = false;

const TIMER_DURATION = 3 * 60; // seconds
const TIMER_RADIUS = 32;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS; // ≈ 201.06

// ─── HUDSystem ────────────────────────────────────────────────────────────────

export class HUDSystem extends createSystem({}) {
  private hudVisible = false;
  private prevState: string = "";

  // Top row — shared container (flex row)
  private hudContainer: HTMLDivElement | null = null;

  // Scan panel (left side of container)
  private scoreEl: HTMLSpanElement | null = null;
  private detectionEl: HTMLSpanElement | null = null;
  private reasoningEl: HTMLSpanElement | null = null;
  private promptEl: HTMLSpanElement | null = null;

  // Scan panel SVG bubble (updated by ResizeObserver)
  private panelBubblePath: SVGPathElement | null = null;
  private panelBubbleGrad: SVGLinearGradientElement | null = null;
  private panelBlurDiv: HTMLDivElement | null = null;

  // 3D reward ball — shown when score > 30
  private ballMesh: Mesh | null = null;
  private ballShowing = false;
  private ballBaseY = 1.5;
  private isDraggingBall = false;
  private meterGlowing = false;
  // pre-allocated drag helpers (no per-frame allocation)
  private readonly _dragRaycaster = new Raycaster();
  private readonly _dragPlane = new Plane(new Vector3(0, 0, 1), 1.5); // world plane z = -1.5
  private readonly _dragHit = new Vector3();
  private readonly _ballScreenPos = new Vector3();

  // Collect mode
  private collectOverlay: HTMLDivElement | null = null;
  private collectInstructionEl: HTMLSpanElement | null = null;
  private energyMeterEl: HTMLDivElement | null = null;
  private energyMeterPillEl: HTMLDivElement | null = null;
  private energyMeterNubEl: HTMLDivElement | null = null;
  private energyMeterFillEl: HTMLDivElement | null = null;
  private accumulatedScore = 0;
  private ballConsumed = false; // true after a successful drop, prevents re-drag
  private shouldCollect = false; // score > 30 in result state
  private inCollectMode = false; // user tapped COLLECT

  // Timer circle (right side of container)
  private timerTextEl: HTMLSpanElement | null = null;
  private timerArc: SVGCircleElement | null = null;
  private timerElapsed = 0;
  private timerRunning = false;

  // Scan button (bottom)
  private domScanBtn: HTMLButtonElement | null = null;
  private scanBtnLabel: HTMLSpanElement | null = null;

  init(): void {
    this.injectStyles();
    this.buildHudContainer();
    this.buildScanButton();
    this.buildBall();
    this.buildCollectOverlay();
    this.buildEnergyMeter();
    this.setupBallDrag();
  }

  private injectStyles(): void {
    const s = document.createElement("style");
    s.textContent = `
      html, body {
        overscroll-behavior: none;
      }
      .voltron-hud-container {
        position: fixed;
        top: 20px;
        left: 16px;
        right: 16px;
        display: none;
        flex-direction: row;
        align-items: flex-start;
        gap: 28px;
        padding: 12px;
        z-index: 20;
      }
      /* Shared gradient-border mixin via ::before mask trick */
      .voltron-grad-border {
        position: relative;
        background: #BC4AFF24;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
      .voltron-grad-border::before {
        content: '';
        position: absolute;
        inset: 0;
        padding: 2px;
        background: linear-gradient(180deg, #48F9FF 0%, #BC4AFF 37.02%, #48F9FF 70.19%, #BC4AFF 100%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
        border-radius: inherit;
      }
      .voltron-scan-panel {
        flex: 1;
        min-width: 0;
        padding: 3vw;
        padding-bottom: calc(3vw + 18px);
        box-sizing: border-box;
        text-align: center;
        position: relative;
      }
      .voltron-scan-btn {
        position: fixed;
        bottom: calc(20px + env(safe-area-inset-bottom, 0px));
        left: 50%;
        transform: translateX(-50%);
        width: 90px;
        height: 90px;
        display: none;
        grid-template-areas: 'stack';
        place-items: center;
        font-family: 'Space Mono', monospace;
        font-size: 14px;
        font-weight: 700;
        color: #ffffff;
        text-transform: uppercase;
        background: transparent;
        border: none;
        border-radius: 3vw;
        cursor: pointer;
        z-index: 20;
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
      }
      .voltron-scan-btn-inner {
        grid-area: stack;
        width: 80px;
        height: 80px;
        border-radius: 9.5px;
        background: #BC4AFF24;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
      .voltron-scan-btn svg {
        grid-area: stack;
        width: 90px;
        height: 90px;
        pointer-events: none;
      }
      .voltron-scan-btn span {
        grid-area: stack;
        position: relative;
        z-index: 1;
        white-space: pre-line;
        text-align: center;
        line-height: 1.25;
        padding: 6px 8px;
      }
      .voltron-timer-circle {
        position: relative;
        width: 100px;
        height: 100px;
        flex-shrink: 0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `;
    document.head.appendChild(s);
  }

  private buildHudContainer(): void {
    const container = document.createElement("div");
    container.classList.add("voltron-hud-container");

    container.appendChild(this.buildScanPanel());
    container.appendChild(this.buildTimerCircle());

    document.body.appendChild(container);
    this.hudContainer = container;
  }

  private buildScanPanel(): HTMLDivElement {
    const TAIL = 18,
      R = 14,
      TAIL_X = 28;
    const NS = "http://www.w3.org/2000/svg";

    const panel = document.createElement("div");
    panel.classList.add("voltron-scan-panel");
    // No voltron-grad-border — SVG draws the bubble border directly

    // ── Blur layer ────────────────────────────────────────────────────────
    const blurDiv = document.createElement("div");
    blurDiv.style.cssText = [
      "position:absolute",
      "inset:0",
      "backdrop-filter:blur(10px)",
      "-webkit-backdrop-filter:blur(10px)",
      "pointer-events:none",
      "z-index:0",
    ].join(";");

    // ── SVG bubble: gradient stroke + purple-tint fill ────────────────────
    const svg = document.createElementNS(NS, "svg");
    svg.style.cssText = [
      "position:absolute",
      "inset:0",
      "width:100%",
      "height:100%",
      "pointer-events:none",
      "z-index:1",
      "overflow:visible",
    ].join(";");

    const defs = document.createElementNS(NS, "defs");
    const grad = document.createElementNS(NS, "linearGradient");
    grad.setAttribute("id", "panelGrad");
    grad.setAttribute("gradientUnits", "userSpaceOnUse");
    grad.setAttribute("x1", "0");
    grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0");
    grad.setAttribute("y2", "200");
    for (const [off, clr] of [
      ["0%", "#48F9FF"],
      ["37.02%", "#BC4AFF"],
      ["70.19%", "#48F9FF"],
      ["100%", "#BC4AFF"],
    ] as [string, string][]) {
      const stop = document.createElementNS(NS, "stop");
      stop.setAttribute("offset", off);
      stop.setAttribute("stop-color", clr);
      grad.appendChild(stop);
    }
    defs.appendChild(grad);
    svg.appendChild(defs);

    const pathEl = document.createElementNS(NS, "path");
    pathEl.setAttribute("fill", "#BC4AFF24");
    pathEl.setAttribute("stroke", "url(#panelGrad)");
    pathEl.setAttribute("stroke-width", "2");
    svg.appendChild(pathEl);

    this.panelBubblePath = pathEl;
    this.panelBubbleGrad = grad;
    this.panelBlurDiv = blurDiv;

    // ── ResizeObserver — redraws bubble whenever panel size changes ────────
    const updateBubble = (): void => {
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      if (!w || !h) return;
      const bodyH = h - TAIL; // where the bubble "closes" before the tail

      // Speech bubble path with proper arc corners (Q = quadratic bezier)
      const d = [
        `M ${R},0`,
        `L ${w - R},0 Q ${w},0 ${w},${R}`,
        `L ${w},${bodyH - R} Q ${w},${bodyH} ${w - R},${bodyH}`,
        `L ${TAIL_X},${bodyH}`,
        `L 0,${h}`,
        `L 0,${R} Q 0,0 ${R},0 Z`,
      ].join(" ");
      pathEl.setAttribute("d", d);

      // Update gradient span to match bubble height
      grad.setAttribute("y2", String(h));

      // Clip blur layer using the exact same SVG path so rounded corners match
      blurDiv.style.clipPath = `path('${d}')`;
    };

    const ro = new ResizeObserver(updateBubble);
    ro.observe(panel);
    this.cleanupFuncs.push(() => ro.disconnect());

    // ── Content wrapper (sits above blur + SVG) ───────────────────────────
    const content = document.createElement("div");
    content.style.cssText = "position:relative;z-index:2";

    // Score — always visible
    const score = document.createElement("span");
    score.textContent = "--";
    score.style.cssText = [
      "display:block",
      "font-family:'Space Mono',monospace",
      "font-size:5.5vw",
      "font-weight:700",
      "color:#ffffff",
      "text-transform:uppercase",
      "margin-bottom:1vw",
    ].join(";");

    // Object detection result — shown when result arrives
    const detection = document.createElement("span");
    detection.style.cssText = [
      "display:none",
      "font-family:'Space Mono',monospace",
      "font-size:3vw",
      "font-weight:700",
      "color:#48F9FF",
      "text-transform:uppercase",
      "margin-bottom:1vw",
    ].join(";");

    // Reasoning — shown between detection and snapshot when Gemini provides it
    const reasoning = document.createElement("span");
    reasoning.style.cssText = [
      "display:none",
      "font-family:'Space Mono',monospace",
      "font-size:3vw",
      "font-weight:400",
      "color:#ffffff",
      "text-transform:uppercase",
      "margin-top:1.5vw",
    ].join(";");

    // Prompt — shown in idle / scanning
    const prompt = document.createElement("span");
    prompt.textContent = "Scan something to get a score";
    prompt.style.cssText = [
      "display:block",
      "font-family:'Space Mono',monospace",
      "font-size:3.5vw",
      "font-weight:400",
      "color:#ffffff",
      "text-transform:uppercase",
      "margin-top:0.5vw",
    ].join(";");

    // Collect instruction — replaces all content during collect mode
    const collectInstruction = document.createElement("span");
    collectInstruction.textContent =
      "DRAG THE ENERGY BALL TO THE ELECTRICITY METER TO COLLECT IT";
    collectInstruction.style.cssText = [
      "display:none",
      "font-family:'Space Mono',monospace",
      "font-size:3.5vw",
      "font-weight:700",
      "color:#ffffff",
      "text-transform:uppercase",
      "line-height:1.5",
    ].join(";");

    content.appendChild(score);
    content.appendChild(detection);
    content.appendChild(reasoning);
    content.appendChild(prompt);
    content.appendChild(collectInstruction);

    panel.appendChild(blurDiv);
    panel.appendChild(svg);
    panel.appendChild(content);

    this.scoreEl = score;
    this.detectionEl = detection;
    this.reasoningEl = reasoning;
    this.promptEl = prompt;
    this.collectInstructionEl = collectInstruction;

    return panel;
  }

  private buildTimerCircle(): HTMLDivElement {
    const circle = document.createElement("div");
    circle.classList.add("voltron-timer-circle");

    // SVG — progress arc IS the border; it animates as the timer runs
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "72");
    svg.setAttribute("height", "72");
    svg.setAttribute("viewBox", "0 0 72 72");
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%";

    // Gradient definition
    const defs = document.createElementNS(NS, "defs");
    const grad = document.createElementNS(NS, "linearGradient");
    grad.setAttribute("id", "timerGrad");
    grad.setAttribute("x1", "0");
    grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0");
    grad.setAttribute("y2", "72");
    grad.setAttribute("gradientUnits", "userSpaceOnUse");
    const stops: [string, string][] = [
      ["0%", "#48F9FF"],
      ["37.02%", "#BC4AFF"],
      ["70.19%", "#48F9FF"],
      ["100%", "#BC4AFF"],
    ];
    for (const [offset, color] of stops) {
      const stop = document.createElementNS(NS, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      grad.appendChild(stop);
    }
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Inner fill — covers only the area inside the track stroke
    const fill = document.createElementNS(NS, "circle");
    fill.setAttribute("cx", "36");
    fill.setAttribute("cy", "36");
    fill.setAttribute("r", String(TIMER_RADIUS - 3)); // 3 = half stroke-width
    fill.setAttribute("fill", "#BC4AFF24");
    svg.appendChild(fill);

    // Track circle (faint)
    const track = document.createElementNS(NS, "circle");
    track.setAttribute("cx", "36");
    track.setAttribute("cy", "36");
    track.setAttribute("r", String(TIMER_RADIUS));
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "rgba(255,255,255,0.12)");
    track.setAttribute("stroke-width", "6");
    svg.appendChild(track);

    // Progress arc — starts full, drains as time passes
    const arc = document.createElementNS(NS, "circle");
    arc.setAttribute("cx", "36");
    arc.setAttribute("cy", "36");
    arc.setAttribute("r", String(TIMER_RADIUS));
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", "url(#timerGrad)");
    arc.setAttribute("stroke-width", "6");
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("stroke-dasharray", String(TIMER_CIRCUMFERENCE));
    arc.setAttribute("stroke-dashoffset", "0");
    arc.setAttribute("transform", "rotate(-90 36 36)");
    svg.appendChild(arc);

    // Timer text — centered inside the circle
    const text = document.createElement("span");
    text.textContent = "3:00";
    text.style.cssText = [
      "position:relative", // above the SVG
      "font-family:'Space Mono',monospace",
      "font-size:22px",
      "font-weight:700",
      "color:#ffffff",
      "letter-spacing:0.02em",
      "line-height:1",
      "z-index:1",
    ].join(";");

    circle.appendChild(svg);
    circle.appendChild(text);

    this.timerTextEl = text;
    this.timerArc = arc;

    return circle;
  }

  private buildScanButton(): void {
    const btn = document.createElement("button");
    btn.classList.add("voltron-scan-btn");

    // SVG dashed gradient border — shares grid cell with label via CSS grid-area
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 90 90");

    const defs = document.createElementNS(NS, "defs");
    const grad = document.createElementNS(NS, "linearGradient");
    grad.setAttribute("id", "scanBtnGrad");
    grad.setAttribute("x1", "0%");
    grad.setAttribute("y1", "0%");
    grad.setAttribute("x2", "100%");
    grad.setAttribute("y2", "100%");
    for (const [offset, color] of [
      ["0%", "#BC4AFF"],
      ["50%", "rgba(72,249,255,0.82)"],
      ["100%", "#BC4AFF"],
    ] as [string, string][]) {
      const stop = document.createElementNS(NS, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      grad.appendChild(stop);
    }
    defs.appendChild(grad);
    svg.appendChild(defs);

    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", "2.5");
    rect.setAttribute("y", "2.5");
    rect.setAttribute("width", "85");
    rect.setAttribute("height", "85");
    rect.setAttribute("rx", "12");
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", "url(#scanBtnGrad)");
    rect.setAttribute("stroke-width", "5");
    rect.setAttribute("stroke-dasharray", "22 9");
    rect.setAttribute("stroke-linecap", "round");
    svg.appendChild(rect);

    // Inner fill + blur — confined to the inner rect, underneath the SVG stroke
    const inner = document.createElement("div");
    inner.classList.add("voltron-scan-btn-inner");

    // Label sits on top of the SVG in the same grid cell
    const label = document.createElement("span");
    label.textContent = "SCAN";

    btn.appendChild(inner);
    btn.appendChild(svg);
    btn.appendChild(label);

    const onPress = (): void => {
      if (this.inCollectMode) return;
      if (this.shouldCollect) {
        this.enterCollectMode();
      } else {
        triggerScan();
      }
    };
    btn.addEventListener("click", onPress);
    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      onPress();
    });
    document.body.appendChild(btn);
    this.domScanBtn = btn;
    this.scanBtnLabel = label;
  }

  private buildCollectOverlay(): void {
    const overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:rgba(0,0,0,0.65)",
      "backdrop-filter:blur(8px)",
      "-webkit-backdrop-filter:blur(8px)",
      // z-index 12: above snapshot thumbnail (z-index:10) so it's washed out,
      // but BELOW the Three.js canvas (z-index:15) so the ball stays visible
      "z-index:12",
      "display:none",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(overlay);
    this.collectOverlay = overlay;
  }

  private buildEnergyMeter(): void {
    // Wrapper — flex row: pill + nub, centered at bottom above overlay
    const wrapper = document.createElement("div");
    wrapper.style.cssText = [
      "position:fixed",
      "bottom:calc(36px + env(safe-area-inset-bottom, 0px))",
      "left:50%",
      "transform:translateX(-50%)",
      "display:none", // shown only in collect mode
      "align-items:center",
      "gap:0px",
      // z-index 14: above collect overlay (12), below Three.js canvas (15)
      "z-index:14",
    ].join(";");

    // Main pill body
    const pill = document.createElement("div");
    pill.classList.add("voltron-grad-border");
    pill.style.cssText = [
      "width:75vw",
      "height:52px",
      "border-radius:9999px",
      "display:flex",
      "align-items:center",
      "padding-left:16px",
      "box-sizing:border-box",
    ].join(";");

    const zapIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    zapIcon.setAttribute("viewBox", "0 0 24 24");
    zapIcon.setAttribute("width", "22");
    zapIcon.setAttribute("height", "22");
    zapIcon.setAttribute("fill", "none");
    zapIcon.setAttribute("stroke", "#48F9FF");
    zapIcon.setAttribute("stroke-width", "2");
    zapIcon.setAttribute("stroke-linecap", "round");
    zapIcon.setAttribute("stroke-linejoin", "round");
    zapIcon.style.cssText = "flex-shrink:0";
    zapIcon.innerHTML =
      '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>';
    pill.appendChild(zapIcon);

    // Fill track — takes remaining width inside the pill
    const fillTrack = document.createElement("div");
    fillTrack.style.cssText = [
      "flex:1",
      "height:32px",
      "margin:0 10px 0 12px",
      "border-radius:9999px",
      "overflow:hidden",
      "background:rgba(255,255,255,0.06)",
    ].join(";");

    const fillBar = document.createElement("div");
    fillBar.style.cssText = [
      "height:100%",
      "width:0%",
      "border-radius:9999px",
      "background:linear-gradient(90deg, rgba(72,249,255,0.55) 0%, #48F9FF 100%)",
      "transition:width 1s ease-out",
    ].join(";");

    fillTrack.appendChild(fillBar);
    pill.appendChild(fillTrack);
    this.energyMeterFillEl = fillBar;

    // Terminal nub (right side)
    const nub = document.createElement("div");
    nub.classList.add("voltron-grad-border");
    nub.style.cssText = [
      "width:10px",
      "height:26px",
      "border-radius:3px",
      "flex-shrink:0",
      "margin-left:-2px", // overlap slightly so borders kiss
    ].join(";");

    wrapper.appendChild(pill);
    wrapper.appendChild(nub);
    document.body.appendChild(wrapper);
    this.energyMeterEl = wrapper;
    this.energyMeterPillEl = pill;
    this.energyMeterNubEl = nub;
  }

  private enterCollectMode(): void {
    this.inCollectMode = true;
    this.ballConsumed = false;
    collectModeActive = true;

    // Dark wash
    if (this.collectOverlay) this.collectOverlay.style.display = "block";

    // Panel: hide result content, show instruction
    if (this.scoreEl) this.scoreEl.style.display = "none";
    if (this.detectionEl) this.detectionEl.style.display = "none";
    if (this.reasoningEl) this.reasoningEl.style.display = "none";
    if (this.promptEl) this.promptEl.style.display = "none";
    if (this.collectInstructionEl)
      this.collectInstructionEl.style.display = "block";

    // Hide scan button — user is dragging, not scanning
    if (this.domScanBtn) this.domScanBtn.style.display = "none";

    // Show energy meter — restore accumulated fill without transition,
    // then re-enable transition so the next drop animates correctly
    if (this.energyMeterEl) this.energyMeterEl.style.display = "flex";
    if (this.energyMeterFillEl) {
      this.energyMeterFillEl.style.transition = "none";
      this.energyMeterFillEl.style.width = `${(this.accumulatedScore / 800) * 100}%`;
      // Double rAF: first lets browser paint the element, second re-arms transition
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (this.energyMeterFillEl)
            this.energyMeterFillEl.style.transition = "width 1s ease-out";
        }),
      );
    }

    // Pause timer and camera feed
    this.timerRunning = false;
    pauseCamera();
  }

  private exitCollectMode(): void {
    this.inCollectMode = false;
    this.shouldCollect = false;
    collectModeActive = false;

    if (this.collectOverlay) this.collectOverlay.style.display = "none";
    if (this.collectInstructionEl)
      this.collectInstructionEl.style.display = "none";
    if (this.energyMeterEl) this.energyMeterEl.style.display = "none";

    // Restore panel elements hidden during collect mode
    if (this.scoreEl) this.scoreEl.style.display = "block";
    if (this.promptEl) this.promptEl.style.display = "block";

    // Resume timer and camera feed
    this.timerRunning = true;
    resumeCamera();

    // Restore scan button
    if (this.domScanBtn) this.domScanBtn.style.display = "grid";
  }

  private setupBallDrag(): void {
    const canvas = this.world.renderer.domElement;
    let capturedPointerId = -1;
    const ndc = new Vector2();

    const onPointerDown = (e: PointerEvent): void => {
      if (
        !this.inCollectMode ||
        !this.ballShowing ||
        !this.ballMesh ||
        this.ballConsumed
      )
        return;
      ndc.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      this._dragRaycaster.setFromCamera(ndc, this.world.camera);
      if (this._dragRaycaster.intersectObject(this.ballMesh).length > 0) {
        this.isDraggingBall = true;
        capturedPointerId = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
      }
    };

    const onPointerMove = (e: PointerEvent): void => {
      if (
        !this.isDraggingBall ||
        e.pointerId !== capturedPointerId ||
        !this.ballMesh
      )
        return;
      ndc.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      this._dragRaycaster.setFromCamera(ndc, this.world.camera);
      if (
        this._dragRaycaster.ray.intersectPlane(this._dragPlane, this._dragHit)
      ) {
        // Y-axis only — X stays locked at centre
        this.ballMesh.position.y = this._dragHit.y;
      }
      this.checkMeterGlow();
    };

    const onPointerUp = (e: PointerEvent): void => {
      if (e.pointerId !== capturedPointerId) return;
      this.isDraggingBall = false;
      capturedPointerId = -1;

      if (this.meterGlowing) {
        // Ball consumed — fill meter and return to scan after animation
        const score = ObjectDetectionData.matched
          ? ObjectDetectionData.confidence
          : ScanData.score;
        this.ballConsumed = true;
        this.setBallVisible(false); // ball disappears into the meter
        this.fillMeter(score);
        this.setMeterGlow(false);
        // Wait for fill animation (1 s) then return to idle scan screen
        setTimeout(() => {
          ScanData.state = "idle";
        }, 1200);
        return;
      }

      // Missed the meter — snap ball back so user can try again
      if (this.ballMesh) this.ballMesh.position.set(0, this.ballBaseY, -1.5);
      this.setMeterGlow(false);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    this.cleanupFuncs.push(() => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    });
  }

  /** Project ball centre to screen and test against the meter's bounding rect. */
  private checkMeterGlow(): void {
    if (!this.ballMesh || !this.energyMeterEl) return;
    this._ballScreenPos.copy(this.ballMesh.position).project(this.world.camera);
    const sx = ((this._ballScreenPos.x + 1) / 2) * window.innerWidth;
    const sy = (-(this._ballScreenPos.y - 1) / 2) * window.innerHeight;
    const r = this.energyMeterEl.getBoundingClientRect();
    this.setMeterGlow(
      sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom,
    );
  }

  private fillMeter(score: number): void {
    if (!this.energyMeterFillEl) return;
    this.accumulatedScore = Math.min(this.accumulatedScore + score, 800);
    const pct = (this.accumulatedScore / 800) * 100;
    requestAnimationFrame(() => {
      if (this.energyMeterFillEl)
        this.energyMeterFillEl.style.width = `${pct}%`;
    });
    if (this.accumulatedScore >= 800) {
      // Wait for the 1 s fill animation to finish, then show results
      setTimeout(() => {
        (this.world.getSystem(FlowSystem) as FlowSystem).showResults(
          this.accumulatedScore,
        );
      }, 1200);
    }
  }

  private setMeterGlow(glow: boolean): void {
    if (glow === this.meterGlowing) return;
    this.meterGlowing = glow;
    const shadow = glow
      ? "0 0 6px 2px #48F9FF, 0 0 18px 4px rgba(72,249,255,0.5)"
      : "";
    if (this.energyMeterPillEl) this.energyMeterPillEl.style.boxShadow = shadow;
    if (this.energyMeterNubEl) this.energyMeterNubEl.style.boxShadow = shadow;
  }

  private setBallVisible(show: boolean, score = 0): void {
    this.ballShowing = show;
    if (!this.ballMesh) return;
    this.ballMesh.visible = show;
    if (show) {
      const color = score > 60 ? 0xbc4aff : 0x48f9ff;
      (this.ballMesh.material as MeshBasicMaterial).color.setHex(color);
    }
  }

  private buildBall(): void {
    const geo = new SphereGeometry(0.12, 32, 32);
    const mat = new MeshBasicMaterial({
      color: 0x48f9ff,
      transparent: true,
      opacity: 0.55,
    });
    const mesh = new Mesh(geo, mat);
    // Float 1.5 m in front of the initial camera, eye-height centred
    mesh.position.set(0, this.ballBaseY, -1.5);
    mesh.visible = false;
    this.ballMesh = mesh;
    this.world.createTransformEntity(mesh, this.world.sceneEntity);
  }

  private setVisible(visible: boolean): void {
    if (this.hudContainer)
      this.hudContainer.style.display = visible ? "flex" : "none";
    if (this.domScanBtn)
      this.domScanBtn.style.display = visible ? "grid" : "none";
  }

  private updateTimer(timeLeft: number): void {
    // Text: M:SS
    const mins = Math.floor(timeLeft / 60);
    const secs = Math.floor(timeLeft % 60);
    if (this.timerTextEl)
      this.timerTextEl.textContent = `${mins}:${String(secs).padStart(2, "0")}`;

    // Arc: full at 3:00, empty at 0:00
    const elapsed = TIMER_DURATION - timeLeft; // 0→180
    const progress = elapsed / TIMER_DURATION; // 0→1
    if (this.timerArc)
      this.timerArc.setAttribute(
        "stroke-dashoffset",
        String(TIMER_CIRCUMFERENCE * progress),
      );
  }

  update(delta: number, time: number): void {
    if (!this.hudVisible && FlowState.screen === "game") {
      this.hudVisible = true;
      this.timerRunning = true;
      this.timerElapsed = 0;
      this.setVisible(true);
    }

    if (!this.hudVisible) return;

    // Timer — also paused when game is paused
    if (this.timerRunning && !FlowState.paused) {
      this.timerElapsed += delta;
      const timeLeft = Math.max(0, TIMER_DURATION - this.timerElapsed);
      this.updateTimer(timeLeft);
      if (timeLeft === 0) {
        this.timerRunning = false;
        (this.world.getSystem(FlowSystem) as FlowSystem).showResults(
          this.accumulatedScore,
        );
      }
    }

    // Ball float animation — only in result state, not during collect/drag
    if (
      this.ballShowing &&
      this.ballMesh &&
      !this.isDraggingBall &&
      !this.inCollectMode
    ) {
      this.ballMesh.position.y = this.ballBaseY + Math.sin(time * 1.4) * 0.06;
      this.ballMesh.rotation.y = time * 0.4;
    }

    // Scan state — also re-render when detection result changes
    const state = ScanData.state;
    const stateKey = `${state}|${ObjectDetectionData.state}|${ObjectDetectionData.matched}|${ObjectDetectionData.confidence}`;
    if (stateKey === this.prevState) return;
    this.prevState = stateKey;

    switch (state) {
      case "idle":
        this.exitCollectMode();
        this.setBallVisible(false);
        if (this.scoreEl) this.scoreEl.textContent = "--";
        if (this.detectionEl) this.detectionEl.style.display = "none";
        if (this.reasoningEl) this.reasoningEl.style.display = "none";
        if (this.promptEl) {
          this.promptEl.textContent = "Scan something to get a score";
          this.promptEl.style.display = "block";
        }
        if (this.domScanBtn) {
          if (this.scanBtnLabel) this.scanBtnLabel.textContent = "SCAN";
          this.domScanBtn.disabled = false;
          this.domScanBtn.style.opacity = "1";
        }
        break;

      case "scanning":
        this.exitCollectMode();
        this.setBallVisible(false);
        if (this.promptEl) {
          this.promptEl.textContent = "Analysing…";
          this.promptEl.style.display = "block";
        }
        if (this.detectionEl) this.detectionEl.style.display = "none";
        if (this.reasoningEl) this.reasoningEl.style.display = "none";
        if (this.domScanBtn) {
          if (this.scanBtnLabel) this.scanBtnLabel.textContent = "SCANNING";
          this.domScanBtn.disabled = true;
          this.domScanBtn.style.opacity = "0.5";
        }
        break;

      case "result": {
        if (this.promptEl) this.promptEl.style.display = "none";

        // TF.js / Gemini object detection result
        const { matched, confidence } = ObjectDetectionData;
        // Ball threshold uses the displayed score — no match always shows 0/100
        const effectiveScore = matched ? confidence : 0;
        if (matched) {
          if (this.scoreEl) this.scoreEl.textContent = `${confidence} / 100`;
          if (this.detectionEl) {
            this.detectionEl.textContent = matched;
            this.detectionEl.style.color = "#48F9FF";
            this.detectionEl.style.display = "block";
          }
          if (this.reasoningEl) {
            this.reasoningEl.textContent = ScanData.reasoning;
            this.reasoningEl.style.display = ScanData.reasoning
              ? "block"
              : "none";
          }
        } else {
          if (this.scoreEl) this.scoreEl.textContent = "0 / 100";
          if (this.detectionEl) {
            this.detectionEl.textContent = "No match";
            this.detectionEl.style.color = "rgba(255,255,255,0.5)";
            this.detectionEl.style.display = "block";
          }
          if (this.reasoningEl) this.reasoningEl.style.display = "none";
        }
        // Button label: COLLECT when score qualifies, SCAN AGAIN otherwise
        this.shouldCollect = effectiveScore > 30;
        if (this.domScanBtn) {
          if (this.scanBtnLabel)
            this.scanBtnLabel.textContent = this.shouldCollect
              ? "COLLECT"
              : "SCAN\nAGAIN";
          this.domScanBtn.disabled = false;
          this.domScanBtn.style.opacity = "1";
          this.domScanBtn.style.display = "grid";
        }

        // Show ball when score > 30 (purple if > 60)
        this.setBallVisible(effectiveScore > 30, effectiveScore);
        break;
      }

      case "error":
        this.setBallVisible(false);
        if (this.scoreEl) this.scoreEl.textContent = "!";
        if (this.detectionEl) this.detectionEl.style.display = "none";
        if (this.promptEl) {
          this.promptEl.textContent = ScanData.errorMessage;
          this.promptEl.style.display = "block";
        }
        if (this.domScanBtn) {
          if (this.scanBtnLabel) this.scanBtnLabel.textContent = "TRY AGAIN";
          this.domScanBtn.disabled = false;
          this.domScanBtn.style.opacity = "1";
        }
        break;
    }
  }
}
