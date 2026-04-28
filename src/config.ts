function readMockFlag(): boolean {
    try {
        return (import.meta as unknown as Record<string, Record<string, string>>).env.VITE_MOCK_SCAN === "true";
    } catch {
        return false;
    }
}

export const USE_MOCK = readMockFlag();          // true → skip Gemini, return mock response
export const DESCRIPTIVE_ENABLED = true;
export const OBJECT_DETECTION_ENABLED = false;
export const OBJECT_DETECTION_GEMINI_ENABLED = false; // set false to force TF.js only
