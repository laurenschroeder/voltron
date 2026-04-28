import { createSystem } from "@iwsdk/core";
import { DESCRIPTIVE_ENABLED } from "./config.js";
import { analyzeForElectricityDescriptive } from "./descriptiveElectricityScore.js";

// ─── Shared scan state (read by HUDSystem) ────────────────────────────────────

export type ScanState = "idle" | "scanning" | "result" | "error";

export const ScanData = {
  state: "idle" as ScanState,
  score: 0,
  reasoning: "",
  elements: [] as string[],
  highScore: 0,
  errorMessage: "",
  /** data-URL of the last captured frame, shown as a thumbnail */
  lastSnapshot: "",
};

// ─── DOM elements (module-level so triggerScan can access them) ───────────────

let _video: HTMLVideoElement | null = null;
let _offscreen: HTMLCanvasElement | null = null;
let _snapshot: HTMLImageElement | null = null;

// ─── Module-level functions called by FlowSystem / HUDSystem ─────────────────

export function pauseCamera(): void {
  if (_video && !_video.paused) _video.pause();
}

export function resumeCamera(): void {
  if (_video && _video.paused) void _video.play();
}

export function startCamera(): void {
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: "environment" } } })
    .catch(() => navigator.mediaDevices.getUserMedia({ video: true }))
    .then((stream) => { _video!.srcObject = stream; })
    .catch((err: unknown) => {
      ScanData.state = "error";
      ScanData.errorMessage =
        err instanceof Error ? err.message : "Camera access denied";
    });
}

/** Other modules push async fns here to run on every scan. */
export const scanPlugins: Array<(base64: string, canvas: HTMLCanvasElement) => Promise<void>> = [];

export function triggerScan(): void {
  console.log("[scan] triggerScan called, state:", ScanData.state);
  if (ScanData.state === "scanning") {
    console.log("[scan] already scanning, ignoring");
    return;
  }

  const video = _video;
  const canvas = _offscreen;
  if (!video || !canvas) {
    console.error("[scan] missing video or canvas", { video, canvas });
    return;
  }

  console.log("[scan] video dimensions:", video.videoWidth, "x", video.videoHeight, "readyState:", video.readyState);

  if (!video.videoWidth) {
    ScanData.state = "error";
    ScanData.errorMessage = "Camera not ready — allow camera access and try again";
    console.error("[scan] camera not ready");
    return;
  }

  ScanData.state = "scanning";
  console.log("[scan] capturing frame...");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  console.log("[scan] frame captured, base64 length:", base64.length);

  // Store snapshot data — also shown as fixed thumbnail bottom-left
  if (_snapshot) {
    _snapshot.src = dataUrl;
    _snapshot.style.display = "block";
  }
  ScanData.lastSnapshot = dataUrl;

  console.log("[scan] calling analyzeForElectricityDescriptive...");
  const tasks: Promise<unknown>[] = [];

  if (DESCRIPTIVE_ENABLED) {
    tasks.push(
      analyzeForElectricityDescriptive(base64).then((result) => {
        console.log("[scan] result:", result);
        ScanData.score = result.score;
        ScanData.reasoning = result.reasoning;
        ScanData.elements = result.elements;
        if (result.score > ScanData.highScore) ScanData.highScore = result.score;
      }),
    );
  }

  scanPlugins.forEach((fn) => tasks.push(fn(base64, canvas).catch(console.error)));

  void Promise.allSettled(tasks).then((results) => {
    const descriptiveFailed =
      DESCRIPTIVE_ENABLED && results[0]?.status === "rejected";
    if (descriptiveFailed && scanPlugins.length === 0) {
      const reason = (results[0] as PromiseRejectedResult).reason as unknown;
      ScanData.errorMessage =
        reason instanceof Error ? reason.message : "Analysis failed";
      ScanData.state = "error";
      console.error("[scan] analyzeForElectricityDescriptive error:", reason);
    } else {
      ScanData.state = "result";
      console.log("[scan] state set to result");
    }
  });
}

// ─── ScannerSystem ────────────────────────────────────────────────────────────

export class ScannerSystem extends createSystem({}) {
  init(): void {
    const container = document.getElementById("scene-container");

    // ── Live camera feed (background) ────────────────────────────────────
    _video = document.createElement("video");
    _video.setAttribute("autoplay", "");
    _video.setAttribute("playsinline", "");
    _video.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0";
    document.body.insertBefore(_video, container);

    // ── Snapshot thumbnail (bottom-left, shown after scan) ───────────────
    _snapshot = document.createElement("img");
    _snapshot.style.cssText = [
      "position:fixed",
      "bottom:calc(20px + env(safe-area-inset-bottom, 0px))",
      "left:calc(16px + env(safe-area-inset-left, 0px))",
      "width:120px",
      "height:90px",
      "object-fit:cover",
      "border-radius:8px",
      "border:2px solid #00e5ff",
      "z-index:10",
      "display:none",
      "box-shadow:0 0 12px rgba(0,229,255,0.5)",
    ].join(";");
    document.body.appendChild(_snapshot);

    _offscreen = document.createElement("canvas");

    // ── Make the Three.js canvas transparent ────────────────────────────
    // IWSDK sets up the renderer before systems init, so we patch it here.
    this.world.renderer.setClearColor(0x000000, 0);
    this.world.renderer.setClearAlpha(0);
    this.world.renderer.domElement.style.background = "transparent";
    // Force alpha blending on the canvas element itself
    this.world.renderer.domElement.style.cssText +=
      ";position:fixed;inset:0;width:100%;height:100%;z-index:15;touch-action:none";
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  update(): void {}
}
