import { createSystem } from "@iwsdk/core";
import { analyzeForElectricity } from "./electricityScore.js";

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

// ─── Module-level trigger so HUDSystem can call it without getSystem() ────────

export function triggerScan(): void {
  if (ScanData.state === "scanning") return;

  const video = _video;
  const canvas = _offscreen;
  if (!video || !canvas) return;

  if (!video.videoWidth) {
    ScanData.state = "error";
    ScanData.errorMessage = "Camera not ready — allow camera access and try again";
    return;
  }

  ScanData.state = "scanning";

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);

  // Show the snapshot thumbnail immediately
  if (_snapshot) {
    _snapshot.src = dataUrl;
    _snapshot.style.display = "block";
  }
  ScanData.lastSnapshot = dataUrl;

  analyzeForElectricity(base64)
    .then((result) => {
      ScanData.score = result.score;
      ScanData.reasoning = result.reasoning;
      ScanData.elements = result.elements;
      if (result.score > ScanData.highScore) ScanData.highScore = result.score;
      ScanData.state = "result";
    })
    .catch((err: unknown) => {
      ScanData.state = "error";
      ScanData.errorMessage = err instanceof Error ? err.message : "Analysis failed";
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
      "bottom:16px",
      "left:16px",
      "width:160px",
      "height:120px",
      "object-fit:cover",
      "border-radius:8px",
      "border:2px solid #00e5ff",
      "z-index:10",
      "display:none",
      "box-shadow:0 0 12px rgba(0,229,255,0.5)",
    ].join(";");
    document.body.appendChild(_snapshot);

    _offscreen = document.createElement("canvas");

    // ── Camera stream ────────────────────────────────────────────────────
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: true }))
      .then((stream) => { _video!.srcObject = stream; })
      .catch((err: unknown) => {
        ScanData.state = "error";
        ScanData.errorMessage =
          err instanceof Error ? err.message : "Camera access denied";
      });

    // ── Make the Three.js canvas transparent ────────────────────────────
    // IWSDK sets up the renderer before systems init, so we patch it here.
    this.world.renderer.setClearColor(0x000000, 0);
    this.world.renderer.setClearAlpha(0);
    this.world.renderer.domElement.style.background = "transparent";
    // Force alpha blending on the canvas element itself
    this.world.renderer.domElement.style.cssText +=
      ";position:fixed;inset:0;width:100%;height:100%;z-index:1";
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  update(): void {}
}
