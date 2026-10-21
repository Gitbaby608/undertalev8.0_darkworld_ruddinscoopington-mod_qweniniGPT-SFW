// Character-only alpha masks for the WebGL layer: GL passes must affect characters,
// never the backdrop. Each character sprite gets a sibling solid-blob mask baked once
// (mkMask). draw() records every character position into CHARQ; composeMsk() stamps
// them into the shared MC canvas, which is uploaded to GL texture unit 3 each frame.
import { W, H } from './util.js';

// Sprite supersample factor: bake once at 2-3x, draw downscaled (crisp + cheap).
const DPR = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
import { SPR, BSPR } from './sprites.js';

export const MSK = {};
// Flat [id,cx,cy,w,h] records collected by spr() during draw(); reused array.
export const CHARQ = [];
export const MC = document.createElement('canvas');
MC.width = W; MC.height = H;
const mx2 = MC.getContext('2d');

function mkMask(id) {
  const S2 = SPR[id];
  if (!S2) return;
  const w = S2.w, h = S2.h;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * DPR); cv.height = Math.ceil(h * DPR);
  const m = cv.getContext('2d');
  m.setTransform(DPR, 0, 0, DPR, 0, 0);
  m.fillStyle = '#fff';
  // rounded rect via arcTo corners (arcTo/roundRect aren't in the test mock 2D ctx)
  const bw = w * .78, bh = h * .62, bx = (w - bw) / 2, by = h * .06, r = Math.min(bw, bh) / 2;
  try {
    m.beginPath(); m.moveTo(bx + r, by);
    m.arcTo(bx + bw, by, bx + bw, by + bh, r); m.arcTo(bx + bw, by + bh, bx, by + bh, r);
    m.arcTo(bx, by + bh, bx, by, r); m.arcTo(bx, by, bx + bw, by, r); m.fill();
  } catch (e) { m.fillRect(bx, by, bw, bh); }
  MSK[id] = Object.assign(cv, { w, h });
}

['boss', 'hero', 'sheep', 'bub', 'npc0', 'npc1', 'npc2', 'npc3', 'npc4', 'npc5'].forEach(mkMask);
BSPR.forEach(mkMask);

export function composeMsk() {
  mx2.clearRect(0, 0, W, H);
  for (let i = 0; i < CHARQ.length; i += 5) {
    const M = MSK[CHARQ[i]];
    if (M) mx2.drawImage(M, CHARQ[i + 1] - M.w / 2, CHARQ[i + 2] - M.h / 2, M.w, M.h);
  }
}
