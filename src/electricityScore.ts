import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ElectricityScore {
  score: number;
  reasoning: string;
  elements: string[];
}

const PROMPT = `You are an expert at identifying electricity-related concepts in images.
Score this image 0–100 for how closely it relates to electricity.
0 = completely unrelated, 100 = directly shows electrical equipment, lightning, circuits, wiring, power lines, static, etc.

Be specific and fun in your reasoning — explain exactly what you see, why it earns that score, and what would make it score higher or lower.
Respond ONLY with valid JSON — no markdown, no explanation outside it:
{"score": <number>, "reasoning": "<2-3 sentences explaining the score>", "elements": ["<thing1>", ...]}`;

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

export async function analyzeForElectricity(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
): Promise<ElectricityScore> {
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
      // Only retry on rate-limit errors
      const retryable = msg.includes("429") || msg.includes("503") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("UNAVAILABLE");
      if (!retryable) throw err;
      if (attempt < delays.length) await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}
