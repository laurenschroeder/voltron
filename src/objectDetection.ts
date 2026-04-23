import { GoogleGenerativeAI } from "@google/generative-ai";
import { OBJECT_DETECTION_GEMINI_ENABLED } from "./config.js";
import { scanPlugins } from "./scanner.js";

// ─── Shared state (read by DOM overlay) ──────────────────────────────────────

export const ObjectDetectionData = {
  state: "idle" as "idle" | "detecting" | "result" | "error",
  matched: null as string | null,
  confidence: 0,
  engine: "" as "gemini" | "tfjs" | "",
  allMatches: [] as { name: string; score: number }[],
};

// ─── Reference photos ─────────────────────────────────────────────────────────

interface ClassPrediction {
  className: string;   // e.g. "coffee mug" or "remote control, remote"
  probability: number; // 0–1
}

interface ReferencePhoto {
  name: string;
  base64: string;
  mimeType: string;
  topLabels?: ClassPrediction[]; // pre-classified on first TF.js run
}

let references: ReferencePhoto[] = [];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function loadReferences(): Promise<void> {
  try {
    const resp = await fetch("/references/manifest.json");
    if (!resp.ok) return;
    const manifest: Record<string, string> = (await resp.json()) as Record<string, string>;
    const entries = Object.entries(manifest);
    if (entries.length === 0) return;

    references = await Promise.all(
      entries.map(async ([filename, name]) => {
        const imgResp = await fetch(`/references/${filename}`);
        const blob = await imgResp.blob();
        const dataUrl = await blobToDataUrl(blob);
        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const mimeType = blob.type || "image/jpeg";
        return { name, base64, mimeType } as ReferencePhoto;
      }),
    );
    console.log(`[ObjectDetection] Loaded ${references.length} reference(s):`, references.map((r) => r.name));
  } catch (err) {
    console.warn("[ObjectDetection] Could not load references:", err);
  }
}

// ─── Result type ──────────────────────────────────────────────────────────────

interface MatchResult {
  matched: string | null;
  confidence: number;
  allMatches: { name: string; score: number }[];
}

// ─── Gemini backend ───────────────────────────────────────────────────────────

let _geminiClient: GoogleGenerativeAI | null = null;
function geminiModel() {
  if (!_geminiClient) {
    _geminiClient = new GoogleGenerativeAI(
      (import.meta as unknown as Record<string, Record<string, string>>).env
        .VITE_GEMINI_API_KEY,
    );
  }
  return _geminiClient.getGenerativeModel(
    { model: "gemini-2.5-flash-lite" },
    { apiVersion: "v1" },
  );
}

async function tryGemini(base64: string): Promise<MatchResult> {
  const names = references.map((r) => r.name).join(", ");
  const parts: unknown[] = [
    ...references.map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.base64 } })),
    { inlineData: { mimeType: "image/jpeg", data: base64 } },
    `The first ${references.length} image(s) are reference photos of objects I want to detect: ${names}. ` +
      `Does the LAST image (camera capture) contain any of those objects? ` +
      `Return ONLY valid JSON — no markdown: ` +
      `{"matched":"exact object name or null","confidence":0-100,"allMatches":[{"name":"...","score":0-100}]}`,
  ];

  const result = await geminiModel().generateContent(
    parts as Parameters<ReturnType<typeof geminiModel>["generateContent"]>[0],
  );
  const text = result.response.text().trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(text) as MatchResult;
}

// ─── TF.js / MobileNet fallback (classification-based) ───────────────────────
// Uses model.classify() — much more reliable than embedding cosine similarity,
// which floors at ~0.7 for unrelated images due to post-ReLU bias.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _tfModel: any = null;

function imgFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function canvasToImg(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return imgFromDataUrl(canvas.toDataURL("image/jpeg", 0.8));
}

// Build a word → max-probability map from a list of class predictions.
// ImageNet labels can be multi-word and comma-separated, e.g. "coffee mug" or "tabby, tabby cat".
function labelWordMap(predictions: ClassPrediction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const { className, probability } of predictions) {
    for (const part of className.split(",")) {
      for (const word of part.trim().toLowerCase().split(/\s+/)) {
        if (word.length > 2) {
          map.set(word, Math.max(map.get(word) ?? 0, probability));
        }
      }
    }
  }
  return map;
}

function scoreMatch(
  refLabels: ClassPrediction[],
  refName: string,
  cameraWords: Map<string, number>,
): number {
  // 1. Label overlap: max of (refProb × camProb) across shared words
  let labelScore = 0;
  for (const { className, probability: refProb } of refLabels) {
    for (const part of className.split(",")) {
      for (const word of part.trim().toLowerCase().split(/\s+/)) {
        if (word.length > 2) {
          const camProb = cameraWords.get(word) ?? 0;
          labelScore = Math.max(labelScore, refProb * camProb);
        }
      }
    }
  }

  // 2. Name match: camera probability for words from the reference's display name
  let nameScore = 0;
  for (const word of refName.toLowerCase().split(/\s+/)) {
    if (word.length > 2) {
      nameScore = Math.max(nameScore, cameraWords.get(word) ?? 0);
    }
  }

  // labelScore is a product of two [0,1] probs; nameScore is a single [0,1] prob.
  // Both map cleanly to 0-100 — take the higher signal.
  return Math.min(100, Math.round(Math.max(labelScore * 100, nameScore * 100)));
}

async function tryTFJS(canvas: HTMLCanvasElement): Promise<MatchResult> {
  if (!_tfModel) {
    await import("@tensorflow/tfjs");
    const mobileNet = await import("@tensorflow-models/mobilenet");
    _tfModel = await mobileNet.load();

    // Pre-classify each reference image once
    for (const ref of references) {
      const img = await imgFromDataUrl(`data:${ref.mimeType};base64,${ref.base64}`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      ref.topLabels = (await _tfModel.classify(img, 10)) as ClassPrediction[];
      console.log(`[TF.js] Reference "${ref.name}" top labels:`, ref.topLabels.slice(0, 3));
    }
  }

  const cameraImg = await canvasToImg(canvas);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const cameraLabels = (await _tfModel.classify(cameraImg, 20)) as ClassPrediction[];
  console.log("[TF.js] Camera top labels:", cameraLabels.slice(0, 5));

  const cameraWords = labelWordMap(cameraLabels);

  const scored = references.map((ref) => ({
    name: ref.name,
    score: scoreMatch(ref.topLabels ?? [], ref.name, cameraWords),
  }));
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  return {
    matched: top && top.score >= 15 ? top.name : null,
    confidence: top?.score ?? 0,
    allMatches: scored,
  };
}

// ─── Main exported analysis function ─────────────────────────────────────────

export async function analyzeForObjectMatch(
  base64: string,
  canvas: HTMLCanvasElement,
): Promise<void> {
  if (references.length === 0) return;

  ObjectDetectionData.state = "detecting";

  try {
    let result: MatchResult;
    try {
      if (!OBJECT_DETECTION_GEMINI_ENABLED) throw new Error("Gemini disabled");
      result = await tryGemini(base64);
      ObjectDetectionData.engine = "gemini";
    } catch (geminiErr) {
      if (OBJECT_DETECTION_GEMINI_ENABLED) {
        console.warn("[ObjectDetection] Gemini failed, falling back to TF.js:", geminiErr);
      }
      result = await tryTFJS(canvas);
      ObjectDetectionData.engine = "tfjs";
    }

    ObjectDetectionData.matched = result.matched;
    ObjectDetectionData.confidence = result.confidence;
    ObjectDetectionData.allMatches = result.allMatches;
    ObjectDetectionData.state = "result";
  } catch (err) {
    ObjectDetectionData.state = "error";
    console.error("[ObjectDetection] Both backends failed:", err);
  }
}

// Self-register as a scan plugin
scanPlugins.push(analyzeForObjectMatch);

// ─── DOM Overlay (self-contained, no hud.ts changes needed) ──────────────────

let _overlay: HTMLDivElement | null = null;
let _overlayText: HTMLSpanElement | null = null;
let _overlayEngine: HTMLSpanElement | null = null;
let _prevStateKey = "";

export function initObjectDetectionOverlay(): void {
  _overlay = document.createElement("div");
  _overlay.style.cssText = [
    "position:fixed",
    "bottom:calc(20px + env(safe-area-inset-bottom, 0px) + 18vw + 8px)",
    "left:16px",
    "right:16px",
    "padding:8px 12px",
    "background:rgba(9,9,11,0.88)",
    "border:2px solid #00e5ff",
    "border-radius:8px",
    "z-index:11",
    "display:none",
    "box-shadow:0 0 12px rgba(0,229,255,0.4)",
    "box-sizing:border-box",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "OBJECT";
  label.style.cssText =
    "display:block;font-size:9px;font-weight:bold;color:#71717a;margin-bottom:4px;letter-spacing:0.05em";

  _overlayText = document.createElement("span");
  _overlayText.style.cssText = "display:block;font-size:13px;font-weight:bold;color:#ffd700";

  _overlayEngine = document.createElement("span");
  _overlayEngine.style.cssText = "display:block;font-size:9px;color:#71717a;margin-top:2px";

  _overlay.appendChild(label);
  _overlay.appendChild(_overlayText);
  _overlay.appendChild(_overlayEngine);
  document.body.appendChild(_overlay);

  function tick() {
    const key = `${ObjectDetectionData.state}|${ObjectDetectionData.matched}|${ObjectDetectionData.confidence}`;
    if (key !== _prevStateKey) {
      _prevStateKey = key;
      renderOverlay();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderOverlay(): void {
  if (!_overlay || !_overlayText || !_overlayEngine) return;
  const { state, matched, confidence, engine } = ObjectDetectionData;

  if (state === "result") {
    _overlay.style.display = "block";
    _overlay.style.borderColor = matched ? "#00e5ff" : "#3f3f46";
    _overlayText.textContent = matched ? `${matched} · ${confidence}%` : "no match";
    _overlayEngine.textContent = `via ${engine}`;
  } else if (state === "detecting") {
    _overlay.style.display = "block";
    _overlay.style.borderColor = "#3f3f46";
    _overlayText.textContent = "detecting…";
    _overlayEngine.textContent = "";
  } else {
    _overlay.style.display = "none";
  }
}
