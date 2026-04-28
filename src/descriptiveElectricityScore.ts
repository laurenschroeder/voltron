import { GoogleGenerativeAI } from "@google/generative-ai";
import { USE_MOCK } from "./config.js";

export interface ElectricityScore {
  score: number;
  reasoning: string;
  elements: string[];
}

const PROMPT = `You are an unhinged electrical engineer who rates everything on an "electricity scale" of 0 to 100. You are dramatic, punny, and deeply passionate about volts.

0 = a sad, spark-free wasteland with zero electrical energy. 100 = pure lightning incarnate, Benjamin Franklin weeping with joy.

Roast or celebrate what you see. If it's boring, lament it. If it's electric, lose your mind. Be specific — call out exactly what you see and why it earns its score. Puns are mandatory.

Respond ONLY with valid JSON — no markdown, no explanation outside it:
{"score": <number>, "reasoning": "<2-3 funny, punny sentences>", "elements": ["<thing1>", "<thing2>", ...]}`;

let _client: GoogleGenerativeAI | null = null;
function model() {
  if (!_client) {
    _client = new GoogleGenerativeAI(
      (import.meta as unknown as Record<string, Record<string, string>>).env
        .VITE_GEMINI_API_KEY,
    );
  }
  return _client.getGenerativeModel(
    { model: "gemini-2.5-flash-lite" },
    { apiVersion: "v1" },
  );
}

const MOCK_RESPONSE: ElectricityScore = {
  score: 42,
  reasoning: "The oracle has lost power — deeply ironic. Based on cosmic vibes alone, this scene radiates a mysterious 42 volts of pure ambiguity. Could be a live wire. Could be a potato. The universe declines to clarify.",
  elements: ["mystery", "vibes", "potential energy"],
};

export async function analyzeForElectricityDescriptive(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
): Promise<ElectricityScore> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 1200));
    return MOCK_RESPONSE;
  }

  const delays = [2000, 5000, 10000];
  let lastErr: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const result = await model().generateContent([
        { inlineData: { mimeType, data: imageBase64 } },
        PROMPT,
      ]);
      const text = result.response.text().trim();
      const json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      return JSON.parse(json) as ElectricityScore;
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      const retryable = msg.includes("429") || msg.includes("503") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("UNAVAILABLE");
      if (!retryable) return MOCK_RESPONSE;
      if (attempt < delays.length) await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  console.warn("[ElectricityScore] All retries exhausted, returning mock:", lastErr);
  return MOCK_RESPONSE;
}
