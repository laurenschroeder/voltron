/**
 * ScreenSpace `bottom` must be plain px — IWSDK’s layout probe often mis-resolves
 * `calc(env(safe-area-inset-bottom))`, and safe-area alone ignores browser toolbars.
 */
export function screenSpaceBottomStyle(): string {
  if (typeof window === "undefined") return "20px";
  const phone =
    window.matchMedia?.("(max-width: 760px) and (pointer: coarse)").matches ===
    true;
  let px = 20 + (phone ? 56 : 0);
  const vv = window.visualViewport;
  if (vv) {
    px += Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  }
  return `${px}px`;
}
