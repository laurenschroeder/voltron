import { createSystem, VisibilityState } from "@iwsdk/core";
import { startCamera, pauseCamera, resumeCamera, ScanData } from "./scanner.js";

// ─── App screen state (read by HUDSystem) ─────────────────────────────────────

export type AppScreen = "splash" | "instructions" | "game" | "results";

export const FlowState = {
  screen: "splash" as AppScreen,
  paused: false,
};

// ─── FlowSystem ───────────────────────────────────────────────────────────────

export class FlowSystem extends createSystem({}) {
  private splashOverlay: HTMLDivElement | null = null;
  private instructionsHeadline: HTMLDivElement | null = null;
  private instructionsSteps: HTMLDivElement | null = null;
  private instructionsKeyVis: HTMLDivElement | null = null;
  private playBtnEl: HTMLButtonElement | null = null;
  private helpBgEl: HTMLDivElement | null = null;
  private showingFromHelp = false;

  // Results screen
  private resultsEl: HTMLDivElement | null = null;
  private resultsTotalScoreEl: HTMLSpanElement | null = null;
  private resultsReasoningEl: HTMLParagraphElement | null = null;
  private cardInnerEl: HTMLDivElement | null = null;
  private cardFrontEl: HTMLDivElement | null = null;
  private cardBackEl: HTMLDivElement | null = null;
  private newGameBtnOuterEl: HTMLDivElement | null = null;
  private cardFlipped = false;
  private cardAnimating = false;

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
      "align-items:flex-start",
      "justify-content:center",
      "padding-top:33%",
      "z-index:99",
    ].join(";");
    const headline = document.createElement("div");
    headline.textContent = "WELCOME TO";
    headline.style.cssText = [
      "position:absolute",
      "top:10%",
      "left:0",
      "width:100%",
      "font-family:'Space Mono',monospace",
      "font-size:7vw",
      "font-weight:500",
      "color:#ffffff",
      "text-align:center",
      "letter-spacing:0.05em",
    ].join(";");
    overlay.appendChild(headline);

    const img = document.createElement("img");
    img.src = "/VoltronSplash.png";
    img.style.cssText = "width:100%;height:55%;object-fit:cover";
    overlay.appendChild(img);

    const caption = document.createElement("p");
    caption.textContent =
      "Play a game and win coupons while waiting for the ride!";
    caption.style.cssText = [
      "position:absolute",
      "bottom:30%",
      "left:100px",
      "right:100px",
      "font-family:'Space Mono',monospace",
      "font-weight:600",
      "font-size:16px",
      "color:#ffffff",
      "text-align:center",
      "line-height:1.5",
      "margin:0",
    ].join(";");
    overlay.appendChild(caption);

    const glowStyle = document.createElement("style");
    glowStyle.textContent = `
      @keyframes voltron-breathe {
        0%, 100% { box-shadow: 0 0 8px 3px rgba(72,249,255,0.12), 0 0 16px 6px rgba(188,74,255,0.06); }
        50%       { box-shadow: 0 0 20px 8px rgba(72,249,255,0.42), 0 0 38px 16px rgba(188,74,255,0.22); }
      }
      .voltron-btn-glow { animation: voltron-breathe 2.4s ease-in-out infinite; }
      @keyframes voltron-spin { to { transform: rotate(360deg); } }
      .voltron-circle-spin    { animation: voltron-spin 3s linear infinite; }
      .voltron-circle-counter { animation: voltron-spin 3s linear infinite reverse; }
      .voltron-card-rotating {
        width: 100%;
        height: 100%;
        position: relative;
        border-radius: 20px;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        overflow: hidden;
      }
      .voltron-card-face {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 24px;
        box-sizing: border-box;
        border-radius: 18px;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
    `;
    document.head.appendChild(glowStyle);

    const fillGradient =
      "linear-gradient(180deg, rgba(72,249,255,0.7) 3.14%, rgba(188,74,255,0.7) 100%)";

    const btnOuter = document.createElement("div");
    btnOuter.style.cssText = [
      "position:absolute",
      "bottom:calc(14% + env(safe-area-inset-bottom, 0px))",
      "left:50%",
      "transform:translateX(-50%)",
      "width:204px",
      "height:56px",
      "border-radius:20px",
      "background:#D9D9D933",
    ].join(";");
    btnOuter.classList.add("voltron-btn-glow");

    const btnWrapper = document.createElement("div");
    btnWrapper.style.cssText = [
      "position:absolute",
      "inset:0",
      `background:${fillGradient}`,
      "padding:2px",
      "border-radius:20px",
      "box-sizing:border-box",
      "box-shadow:0px 4px 4px 0px #48F9FF47",
    ].join(";");

    const btn = document.createElement("button");
    btn.textContent = "GET STARTED";
    btn.style.cssText = [
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
    btn.addEventListener("click", () => this.transitionToInstructions());
    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.transitionToInstructions();
    });

    btnWrapper.appendChild(btn);
    btnOuter.appendChild(btnWrapper);
    overlay.appendChild(btnOuter);

    document.body.appendChild(overlay);
    this.splashOverlay = overlay;

    // ── Instructions headline (DOM, matches splash style) ────────────────
    const instructionsHeadline = document.createElement("div");
    instructionsHeadline.textContent = "GAME INSTRUCTIONS";
    instructionsHeadline.style.cssText = [
      "position:fixed",
      "top:15%",
      "left:0",
      "width:100%",
      "font-family:'Space Mono',monospace",
      "font-size:7vw",
      "font-weight:500",
      "color:#ffffff",
      "text-align:center",
      "letter-spacing:0.05em",
      "z-index:18",
      "display:none",
    ].join(";");
    document.body.appendChild(instructionsHeadline);
    this.instructionsHeadline = instructionsHeadline;

    // ── Instructions steps ────────────────────────────────────────────────
    const conicBorder =
      "conic-gradient(from 180deg at 50% 50%, rgba(188,74,255,0.72) 0deg, rgba(72,249,255,0.49) 90deg, #BC4AFF 176.54deg, rgba(72,249,255,0.49) 275.19deg, #BC4AFF 342deg, rgba(188,74,255,0.72) 360deg)";

    const makeStep = (number: string, text: string): HTMLDivElement => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:16px";

      const circleOuter = document.createElement("div");
      circleOuter.style.cssText = [
        `background:${conicBorder}`,
        "padding:5px",
        "border-radius:50%",
        "flex-shrink:0",
      ].join(";");
      circleOuter.classList.add("voltron-circle-spin");

      const circleInner = document.createElement("div");
      circleInner.style.cssText = [
        "width:40px",
        "height:40px",
        "border-radius:50%",
        "backdrop-filter:blur(4px)",
        "-webkit-backdrop-filter:blur(4px)",
        "background:black",
        "display:flex",
        "align-items:center",
        "justify-content:center",
      ].join(";");
      circleInner.classList.add("voltron-circle-counter");

      const circleNumber = document.createElement("span");
      circleNumber.textContent = number;
      circleNumber.style.cssText = [
        "font-family:'Space Mono',monospace",
        "font-size:24px",
        "font-weight:700",
        "color:#ffffff",
        "line-height:1",
      ].join(";");

      circleInner.appendChild(circleNumber);
      circleOuter.appendChild(circleInner);

      const stepText = document.createElement("p");
      stepText.textContent = text;
      stepText.style.cssText = [
        "font-family:'Space Mono',monospace",
        "font-size:14px",
        "color:#ffffff",
        "line-height:1.5",
        "margin:0",
      ].join(";");

      row.appendChild(circleOuter);
      row.appendChild(stepText);
      return row;
    };

    const stepsContainer = document.createElement("div");
    stepsContainer.style.cssText = [
      "position:fixed",
      "top:calc(15% + 10vw + 16px)",
      "left:40px",
      "right:40px",
      "display:none",
      "flex-direction:column",
      "gap:20px",
      "z-index:18",
    ].join(";");

    stepsContainer.appendChild(makeStep("1",
      "Your camera will be activated. Scan your surroundings and find objects related to the theme of Voltron Nevera."));
    stepsContainer.appendChild(makeStep("2",
      "Collect energy balls from these objects to power the electricity meter."));
    stepsContainer.appendChild(makeStep("3",
      "Each game lasts 3 minutes. The more energy you can collect within the time frame, the more valued coupon you'll get."));

    // ── PLAY button ───────────────────────────────────────────────────────
    const playOuter = document.createElement("div");
    playOuter.style.cssText = [
      "align-self:center",
      "width:204px",
      "height:56px",
      "border-radius:20px",
      "background:#D9D9D933",
      "margin-top:8px",
    ].join(";");
    playOuter.classList.add("voltron-btn-glow");

    const playWrapper = document.createElement("div");
    playWrapper.style.cssText = [
      "position:relative",
      "width:100%",
      "height:100%",
      `background:${fillGradient}`,
      "padding:2px",
      "border-radius:20px",
      "box-sizing:border-box",
      "box-shadow:0px 4px 4px 0px #48F9FF47",
    ].join(";");

    const playBtn = document.createElement("button");
    playBtn.textContent = "PLAY";
    playBtn.style.cssText = [
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
    const onPlay = (): void => {
      if (this.showingFromHelp) { this.hideInstructionsFromHelp(); }
      else { this.startGame(); }
    };
    playBtn.addEventListener("click", onPlay);
    playBtn.addEventListener("touchend", (e) => { e.preventDefault(); onPlay(); });
    this.playBtnEl = playBtn;

    playWrapper.appendChild(playBtn);
    playOuter.appendChild(playWrapper);
    stepsContainer.appendChild(playOuter);

    document.body.appendChild(stepsContainer);
    this.instructionsSteps = stepsContainer;

    // ── Key visual (bottom 1/3 of viewport) ──────────────────────────────
    const keyVis = document.createElement("div");
    keyVis.style.cssText = [
      "position:fixed",
      "bottom:0",
      "left:0",
      "right:0",
      "height:33.333vh",
      "display:none",
      "z-index:18",
      "overflow:hidden",
    ].join(";");
    const keyVisImg = document.createElement("img");
    keyVisImg.src = "/keyVis.png";
    keyVisImg.style.cssText = [
      "width:100%",
      "height:100%",
      "object-fit:cover",
      "object-position:center",
      "display:block",
    ].join(";");
    keyVis.appendChild(keyVisImg);
    document.body.appendChild(keyVis);
    this.instructionsKeyVis = keyVis;

    // Dark backing used only when showing instructions during gameplay (from help button)
    const helpBg = document.createElement("div");
    helpBg.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:#000",
      "z-index:21",
      "display:none",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(helpBg);
    this.helpBgEl = helpBg;

    // ── Results screen ────────────────────────────────────────────────────
    this.buildResultsScreen(fillGradient);
  }

  // ── Results screen ──────────────────────────────────────────────────────────

  private buildResultsScreen(fillGradient: string): void {
    const results = document.createElement("div");
    results.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:#000",
      "display:none",
      "flex-direction:column",
      "align-items:center",
      "justify-content:flex-start",
      "padding:15% 32px 40px",
      "box-sizing:border-box",
      "gap:16px",
      "z-index:99",
      "overflow-y:auto",
    ].join(";");

    // "TIME'S UP!"
    const timesUp = document.createElement("div");
    timesUp.textContent = "TIME'S UP!";
    timesUp.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:10vw",
      "font-weight:700",
      "color:#ffffff",
      "text-align:center",
      "letter-spacing:0.05em",
      "line-height:1.1",
    ].join(";");
    results.appendChild(timesUp);

    // "Your total score"
    const scoreLabelEl = document.createElement("p");
    scoreLabelEl.textContent = "Your total score";
    scoreLabelEl.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:16px",
      "color:rgba(255,255,255,0.7)",
      "text-align:center",
      "margin:0",
    ].join(";");
    results.appendChild(scoreLabelEl);

    // Score number
    const scoreNum = document.createElement("span");
    scoreNum.textContent = "0";
    scoreNum.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:18vw",
      "font-weight:700",
      "color:#48F9FF",
      "text-align:center",
      "line-height:1",
      "letter-spacing:-0.02em",
    ].join(";");
    results.appendChild(scoreNum);
    this.resultsTotalScoreEl = scoreNum;

    // ── Last scan reasoning ───────────────────────────────────────────────
    const reasoningEl = document.createElement("p");
    reasoningEl.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:13px",
      "color:rgba(255,255,255,0.8)",
      "text-align:center",
      "margin:0",
      "line-height:1.6",
      "padding:0 8px",
    ].join(";");
    results.appendChild(reasoningEl);
    this.resultsReasoningEl = reasoningEl;

    // ── Coupon card ───────────────────────────────────────────────────────
    // Outer = perspective container only (no border here — it would not flip)
    const cardOuter = document.createElement("div");
    cardOuter.style.cssText = [
      "width:100%",
      "height:200px",
      "perspective:1000px",
      "flex-shrink:0",
      "margin-top:16px",
    ].join(";");

    // Inner rotating element carries the gradient border so it flips with the card
    const cardInner = document.createElement("div");
    cardInner.classList.add("voltron-grad-border", "voltron-card-rotating");
    cardOuter.appendChild(cardInner);
    this.cardInnerEl = cardInner;

    // Front face
    const cardFront = document.createElement("div");
    cardFront.classList.add("voltron-card-face");

    const congrats = document.createElement("div");
    congrats.textContent = "Congratulations! You won a coupon!";
    congrats.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:16px",
      "font-weight:700",
      "color:#ffffff",
      "text-align:center",
      "line-height:1.4",
    ].join(";");
    cardFront.appendChild(congrats);

    const flipHint = document.createElement("p");
    flipHint.textContent = "Swipe to view coupon";
    flipHint.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:13px",
      "color:rgba(255,255,255,0.6)",
      "text-align:center",
      "margin:0",
    ].join(";");
    cardFront.appendChild(flipHint);
    cardInner.appendChild(cardFront);
    this.cardFrontEl = cardFront;

    // Back face
    const cardBack = document.createElement("div");
    cardBack.classList.add("voltron-card-face", "voltron-card-back-face");
    cardBack.style.gap = "6px";

    const couponSubtitle = document.createElement("p");
    couponSubtitle.textContent = "€10 off for desserts*";
    couponSubtitle.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:13px",
      "color:rgba(255,255,255,0.75)",
      "text-align:center",
      "margin:0",
    ].join(";");
    cardBack.appendChild(couponSubtitle);

    const couponCode = document.createElement("div");
    couponCode.textContent = "DESSERT10";
    couponCode.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:24px",
      "font-weight:700",
      "color:#48F9FF",
      "text-align:center",
      "letter-spacing:0.08em",
    ].join(";");
    cardBack.appendChild(couponCode);

    const couponDesc = document.createElement("p");
    couponDesc.textContent = "Save €10 at any dessert shops in Europa-Park.";
    couponDesc.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:11px",
      "color:rgba(255,255,255,0.8)",
      "text-align:center",
      "margin:0",
      "line-height:1.5",
    ].join(";");
    cardBack.appendChild(couponDesc);

    const couponTcs = document.createElement("p");
    couponTcs.textContent = "*Terms & conditions applicable";
    couponTcs.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:10px",
      "color:rgba(255,255,255,0.45)",
      "text-align:center",
      "margin:0",
    ].join(";");
    cardBack.appendChild(couponTcs);

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy Code";
    copyBtn.style.cssText = [
      "font-family:'Space Mono',monospace",
      "font-size:12px",
      "font-weight:700",
      "color:#ffffff",
      "background:rgba(72,249,255,0.18)",
      "border:1px solid rgba(72,249,255,0.5)",
      "border-radius:10px",
      "padding:6px 18px",
      "cursor:pointer",
      "margin-top:4px",
      "-webkit-tap-highlight-color:transparent",
    ].join(";");
    const onCopy = (): void => {
      void navigator.clipboard.writeText("DESSERT10").then(() => {
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy Code"; }, 2000);
      });
    };
    copyBtn.addEventListener("click", (e) => { e.stopPropagation(); onCopy(); });
    copyBtn.addEventListener("touchend", (e) => { e.stopPropagation(); e.preventDefault(); onCopy(); });
    cardBack.appendChild(copyBtn);

    cardBack.style.display = "none";
    cardInner.appendChild(cardBack);
    this.cardBackEl = cardBack;

    results.appendChild(cardOuter);

    // ── Tap or swipe to flip ──────────────────────────────────────────────
    let touchStartX = 0;
    cardInner.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    cardInner.addEventListener("touchend", (e) => {
      // Flip on any touch end — tap (small movement) or swipe (large movement)
      e.preventDefault();
      this.flipCard();
    });
    // Mouse / non-touch pointer (desktop testing)
    cardInner.addEventListener("click", () => this.flipCard());

    // ── PLAY NEW GAME button (hidden until card flipped) ──────────────────
    const newGameOuter = document.createElement("div");
    newGameOuter.style.cssText = [
      "width:204px",
      "height:56px",
      "border-radius:20px",
      "background:#D9D9D933",
      "display:none",
      "flex-shrink:0",
      "margin-top:24px",
    ].join(";");
    newGameOuter.classList.add("voltron-btn-glow");

    const newGameWrapper = document.createElement("div");
    newGameWrapper.style.cssText = [
      "position:relative",
      "width:100%",
      "height:100%",
      `background:${fillGradient}`,
      "padding:2px",
      "border-radius:20px",
      "box-sizing:border-box",
      "box-shadow:0px 4px 4px 0px #48F9FF47",
    ].join(";");

    const newGameBtn = document.createElement("button");
    newGameBtn.textContent = "PLAY NEW GAME";
    newGameBtn.style.cssText = [
      "width:100%",
      "height:100%",
      `background:${fillGradient}`,
      "border:none",
      "border-radius:18px",
      "font-family:'Space Mono',monospace",
      "font-size:15px",
      "font-weight:700",
      "color:#ffffff",
      "cursor:pointer",
      "letter-spacing:0.05em",
      "-webkit-tap-highlight-color:transparent",
    ].join(";");
    const onNewGame = (): void => { window.location.reload(); };
    newGameBtn.addEventListener("click", onNewGame);
    newGameBtn.addEventListener("touchend", (e) => { e.preventDefault(); onNewGame(); });

    newGameWrapper.appendChild(newGameBtn);
    newGameOuter.appendChild(newGameWrapper);
    results.appendChild(newGameOuter);
    this.newGameBtnOuterEl = newGameOuter;

    document.body.appendChild(results);
    this.resultsEl = results;
  }

  private flipCard(): void {
    if (!this.cardInnerEl || this.cardAnimating) return;
    this.cardAnimating = true;

    const inner = this.cardInnerEl;

    // Phase 1: rotate to edge (90°)
    inner.style.transition = "transform 0.22s ease-in";
    inner.style.transform = "rotateY(90deg)";

    setTimeout(() => {
      // Swap faces at the halfway point
      this.cardFlipped = !this.cardFlipped;
      if (this.cardFrontEl) this.cardFrontEl.style.display = this.cardFlipped ? "none" : "flex";
      if (this.cardBackEl)  this.cardBackEl.style.display  = this.cardFlipped ? "flex" : "none";
      if (this.cardFlipped && this.newGameBtnOuterEl)
        this.newGameBtnOuterEl.style.display = "block";

      // Snap to -90° then animate to flat
      inner.style.transition = "none";
      inner.style.transform = "rotateY(-90deg)";

      requestAnimationFrame(() => requestAnimationFrame(() => {
        inner.style.transition = "transform 0.22s ease-out";
        inner.style.transform = "rotateY(0deg)";
        setTimeout(() => { this.cardAnimating = false; }, 230);
      }));
    }, 220);
  }

  showResults(score: number): void {
    if (FlowState.screen === "results") return;
    FlowState.screen = "results";
    FlowState.paused = true;
    pauseCamera();
    this.cardFlipped = false;
    this.cardAnimating = false;
    if (this.cardInnerEl) this.cardInnerEl.style.transform = "rotateY(0deg)";
    if (this.cardFrontEl) this.cardFrontEl.style.display = "flex";
    if (this.cardBackEl)  this.cardBackEl.style.display  = "none";
    if (this.newGameBtnOuterEl) this.newGameBtnOuterEl.style.display = "none";
    if (this.resultsTotalScoreEl) this.resultsTotalScoreEl.textContent = String(ScanData.score || score);
    if (this.resultsReasoningEl) this.resultsReasoningEl.textContent = ScanData.reasoning;
    if (this.resultsEl) this.resultsEl.style.display = "flex";
  }

  // ── Instructions from help ──────────────────────────────────────────────────

  showInstructionsFromHelp(): void {
    this.showingFromHelp = true;
    FlowState.paused = true;
    pauseCamera();
    if (this.playBtnEl) this.playBtnEl.textContent = "RETURN";
    if (this.helpBgEl) this.helpBgEl.style.display = "block";
    // Raise instruction elements above HUD (z-index:20) when shown during gameplay
    [this.instructionsHeadline, this.instructionsSteps, this.instructionsKeyVis].forEach(
      (el) => { if (el) { el.style.display = el === this.instructionsSteps ? "flex" : "block"; el.style.zIndex = "22"; } }
    );
  }

  hideInstructionsFromHelp(): void {
    this.showingFromHelp = false;
    FlowState.paused = false;
    resumeCamera();
    if (this.playBtnEl) this.playBtnEl.textContent = "PLAY";
    if (this.helpBgEl) this.helpBgEl.style.display = "none";
    [this.instructionsHeadline, this.instructionsSteps, this.instructionsKeyVis].forEach(
      (el) => { if (el) { el.style.display = "none"; el.style.zIndex = "18"; } }
    );
  }

  private transitionToInstructions(): void {
    if (FlowState.screen !== "splash") return;
    FlowState.screen = "instructions";
    if (this.instructionsHeadline)
      this.instructionsHeadline.style.display = "block";
    if (this.instructionsSteps) this.instructionsSteps.style.display = "flex";
    if (this.instructionsKeyVis) this.instructionsKeyVis.style.display = "block";

    const overlay = this.splashOverlay;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (overlay) overlay.style.display = "none";
      }),
    );
  }

  private startGame(): void {
    FlowState.screen = "game";
    if (this.instructionsHeadline)
      this.instructionsHeadline.style.display = "none";
    if (this.instructionsSteps) this.instructionsSteps.style.display = "none";
    if (this.instructionsKeyVis) this.instructionsKeyVis.style.display = "none";
    // Restore transparent canvas so camera feed shows through
    this.world.renderer.setClearColor(0x000000, 0);
    this.world.renderer.setClearAlpha(0);
    startCamera();
  }

  update(_delta: number): void {
    // no per-frame logic needed
  }
}
