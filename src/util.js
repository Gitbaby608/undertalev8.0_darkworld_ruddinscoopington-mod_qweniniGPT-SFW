// Canvas/DOM constants and tiny shared helpers.
export const W = 800, H = 460;

// Scene canvas backing store is FIXED 800x460 regardless of DPR; CSS upscales.
// Never size it to clientWidth*DPR (texture upload bandwidth kills fps).
export const DPR = Math.min(3, Math.max(2, window.devicePixelRatio || 1));

export const $ = s => document.querySelector(s);
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
