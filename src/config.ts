const _isMock = (import.meta as unknown as Record<string, Record<string, string>>).env.VITE_MOCK_SCAN === "true";
export const DESCRIPTIVE_ENABLED = _isMock || false;
export const OBJECT_DETECTION_ENABLED = true;
export const OBJECT_DETECTION_GEMINI_ENABLED = true; // set false to force TF.js only
