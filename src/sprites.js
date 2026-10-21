// All visuals are baked ONCE into offscreen sprite canvases (supersampled).
// A frame is ~20 drawImage() calls — NEVER reintroduce per-frame shadowBlur,
// gradients or text rasterisation in draw(); that was the original 30fps cause.
import { W, H, rand } from './util.js';

// Sprite supersample factor: bake once at 2-3x, draw downscaled (crisp + cheap).
const DPR = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
import { NPCS } from './data.js';

export const SPR = {};

// mkSpr(id, drawFn)  OR  mkSpr(id, width, height, drawFn).
// A draw fn may carry its own .w/.h (used by emojiSprite) as the default size.
export function mkSpr(id, w, h, drawFn) {
  if (typeof w === 'function') { drawFn = w; w = Math.round(drawFn.w || 64); h = Math.round(drawFn.h || 64); }
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * DPR); cv.height = Math.ceil(h * DPR);
  const s = cv.getContext('2d');
  s.setTransform(DPR, 0, 0, DPR, 0, 0);
  s.textAlign = 'center';
  if (drawFn) drawFn(s);
  SPR[id] = Object.assign(cv, { w, h });
}

function bl(s, cx, cy, r, a) { s.globalAlpha = a; s.beginPath(); s.arc(cx, cy, r, 0, 6.2832); s.fill(); }

// Characters: opaque sprites with a baked drop shadow (no translucent ghosts in-scene).
// emojiSprite returns a draw fn carrying its own .w/.h, consumed by mkSpr's 3-arg form.
function emojiSprite(e, size, name, scale) {
  const w = Math.round(size * scale) + 26, h = Math.round(size * scale) + 48;
  const fn = c => {
    const fs = size * scale;
    c.font = fs + 'px serif'; c.textBaseline = 'middle';
    c.globalAlpha = .55; c.fillStyle = '#000'; c.fillText(e, w / 2 + 3, h / 2 - 2); c.globalAlpha = 1;
    c.fillStyle = '#fff'; c.fillText(e, w / 2, h / 2 - 6);
    if (name) {
      c.font = '8px "Press Start 2P",monospace'; c.globalAlpha = .7; c.fillStyle = '#000'; c.fillText(name, w / 2 + 1, h - 9);
      c.globalAlpha = 1; c.fillStyle = '#fff'; c.fillText(name, w / 2, h - 10);
    }
  };
  fn.w = w; fn.h = h;
  return fn;
}

// Background baked once at 2x, drawn downscaled each frame (crisp + cheap).
const BGR = 2;
mkSpr('bg', W * BGR, H * BGR, s => {
  s.scale(BGR, BGR);
  const g = s.createLinearGradient(0, 0, W, H);
  ['#ff52b8', '#ffbb4f', '#fff46c', '#5af5bd', '#56dfff', '#a67cff', '#ff52b8'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  s.fillStyle = g; s.fillRect(0, 0, W, H);
  s.fillStyle = 'rgba(24,8,58,.25)'; s.fillRect(0, 0, W, H);
  for (let i = 0; i < 110; i++) { s.globalAlpha = rand(.25, .95); s.fillStyle = 'white'; s.fillRect(rand(0, W), rand(0, 300), rand(1, 3), rand(1, 3)); }
  s.globalAlpha = 1;
  for (let i = 0; i < 8; i++) {
    const bx = i * 110, by = 290 - (i % 3) * 25;
    s.fillStyle = ['#ff88ce', '#80ddff', '#ffda78', '#c6a3ff'][i % 4]; s.fillRect(bx, by, 85, 180);
    s.fillStyle = 'rgba(0,0,0,.3)'; s.beginPath(); s.moveTo(bx + 85, by); s.lineTo(bx + 100, by - 12); s.lineTo(bx + 100, 440); s.lineTo(bx + 85, 440); s.fill();
    s.fillStyle = 'rgba(255,255,255,.35)'; s.beginPath(); s.moveTo(bx, by); s.lineTo(bx + 15, by - 12); s.lineTo(bx + 100, by - 12); s.lineTo(bx + 85, by); s.fill();
    s.fillStyle = '#fff0a2';
    for (let wx = bx + 12; wx < bx + 78; wx += 28) for (let wy = by + 20; wy < 420; wy += 36) s.fillRect(wx, wy, 12, 15);
    s.fillStyle = '#efb0f0'; s.fillRect(bx + 31, by + 75, 24, 35);
  }
  s.fillStyle = '#40cb91'; s.fillRect(0, 425, W, 35);
  s.fillStyle = '#5e449c'; s.fillRect(0, 444, W, 7);
  s.lineWidth = 9;
  ['#ff477e', '#ffb84f', '#fff36b', '#56f5ad', '#54dfff', '#ae7cff'].forEach((c, i) => { s.globalAlpha = .8; s.beginPath(); s.strokeStyle = c; s.arc(400, 310, 200 - i * 14, Math.PI, Math.PI * 2); s.stroke(); });
  s.globalAlpha = 1;
});

mkSpr('boss', emojiSprite('🍦', 48, 'SIR SCOOPINGTON', 1.25), 1);
mkSpr('hero', emojiSprite('💖', 48, 'YOU', .85), 1);
mkSpr('sheep', emojiSprite('🐑', 48, 'SHEEP', .9), 1);
['👵', '🦝', '🐦', '🐈', '📫', '🍦'].forEach((e, i) => mkSpr('npc' + i, emojiSprite(e, 48, NPCS[i][1], .7), 1));
mkSpr('bub', 190, 36, s => {
  s.fillStyle = '#fff'; s.fillRect(0, 0, 190, 26);
  s.beginPath(); s.moveTo(178, 26); s.lineTo(190, 26); s.lineTo(182, 36); s.closePath(); s.fill();
  s.fillStyle = '#000'; s.font = '9px "Press Start 2P",monospace'; s.textBaseline = 'middle';
  s.fillText('beep beep ima sheep', 95, 13);
});

// Props baked at 3x -> smooth ~11px sprites.
const PR = 3;
const prop = (id, e, size) => mkSpr(id, 34 * PR, 34 * PR, s => { s.scale(PR, PR); s.font = size + 'px serif'; s.textAlign = 'center'; s.textBaseline = 'middle'; s.fillText(e, 17, 19); });
prop('prop0', '🛴', 26); prop('prop1', '🎰', 26); prop('prop2', '📦', 26); prop('prop3', '🧶', 26);
prop('crumb', '🍞', 15); prop('heart', '💌', 19); prop('note', '🎵', 19); prop('star', '✨', 19); prop('puff', '💨', 19); prop('z', '💤', 19);

// Bullet sprites (ids referenced directly by game.js/patterns.js bullet factories).
const bulletSpr = (id, fill, stroke, dot) => mkSpr(id, 26, s => {
  s.fillStyle = fill; bl(s, 13, 13, 11, 1);
  s.strokeStyle = stroke; s.lineWidth = 2; s.beginPath(); s.arc(13, 13, 11, 0, 6.2832); s.stroke();
  s.fillStyle = dot; bl(s, 9, 10, 1.6, 1); bl(s, 15, 14, 1.6, 1); bl(s, 13, 8, 1.6, 1);
});
bulletSpr('b1', '#ffcf5a', '#a86b12', '#7b4a10');
bulletSpr('b2', '#8fe3ff', '#2b8ba8', '#2b6c86');
bulletSpr('b3', '#ff8fd0', '#a82b78', '#862b64');
bulletSpr('b4', '#e5b16d', '#8a5a1e', '#6b4315');
bulletSpr('b5', '#ff4545', '#8f1414', '#6f0f0f');

// Unique per-pattern projectiles, baked with a white rim so they pop on any backdrop.
const BS = 34; // bake size in logical px (mask blobs derive from w/h automatically)
mkSpr('b6', BS, s => { // rainbow sprinkles (rain pattern)
  s.save(); s.translate(BS / 2, BS / 2); s.rotate(-.5);
  ['#ff477e', '#ffb84f', '#fff36b', '#56f5ad', '#54dfff', '#ae7cff'].forEach((c, i) => {
    const a = i * 1.05 - 1.6;
    s.save(); s.rotate(a); s.translate(0, -6);
    s.lineWidth = 5; s.lineCap = 'round';
    s.strokeStyle = '#fff'; s.beginPath(); s.moveTo(0, -4); s.lineTo(0, 4); s.stroke();
    s.strokeStyle = c; s.beginPath(); s.moveTo(0, -4); s.lineTo(0, 4); s.stroke();
    s.restore();
  });
  s.restore();
});
mkSpr('b7', BS, s => { // jelly-swirl fork (forked shots)
  s.save(); s.translate(BS / 2, BS / 2);
  for (let k = 0; k < 3; k++) {
    s.rotate(2.094);
    s.strokeStyle = '#fff'; s.lineWidth = 7; s.lineCap = 'round';
    s.beginPath(); s.moveTo(0, 0); s.quadraticCurveTo(5, -7, 11, -9); s.stroke();
    s.strokeStyle = k === 0 ? '#ff5ec8' : k === 1 ? '#8f5bff' : '#ff2fa0'; s.lineWidth = 4;
    s.beginPath(); s.moveTo(0, 0); s.quadraticCurveTo(5, -7, 11, -9); s.stroke();
  }
  s.fillStyle = '#fff'; bl(s, 0, 0, 4, 1); s.fillStyle = '#ff8fd0'; bl(s, 0, 0, 2.6, 1);
  s.restore();
});
mkSpr('b8', BS, s => { // glitter star (star burst)
  s.save(); s.translate(BS / 2, BS / 2);
  s.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 6 : 14, a = i * Math.PI / 5 - Math.PI / 2;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  s.fillStyle = '#fff'; s.fill();
  s.fillStyle = '#ffe98a'; s.fill();
  s.fillStyle = '#fff'; bl(s, -3, -4, 2.2, .95);
  s.restore();
});
mkSpr('b9', BS, s => { // hot fudge fireball (cone spray)
  s.save(); s.translate(BS / 2, BS / 2);
  s.fillStyle = '#fff'; bl(s, 0, 0, 12, 1);
  s.fillStyle = '#6b3a12'; bl(s, 0, 0, 10, 1);
  s.fillStyle = '#ff8b3d'; bl(s, 0, 1, 7, 1);
  s.fillStyle = '#ffd23b'; bl(s, -1, 0, 4, 1);
  s.fillStyle = '#fff'; bl(s, -3, -4, 2, .9);
  s.restore();
});
mkSpr('b10', BS, s => { // cherry bomb with stem + leaf (landmine drops)
  s.save(); s.translate(BS / 2, BS / 2 + 2);
  s.strokeStyle = '#fff'; s.lineWidth = 4; s.lineCap = 'round';
  s.beginPath(); s.moveTo(0, -8); s.quadraticCurveTo(2, -13, 7, -13); s.stroke();
  s.fillStyle = '#56f5ad'; s.beginPath(); s.ellipse(8, -13, 4, 2.2, -.5, 0, 6.2832); s.fill();
  s.fillStyle = '#fff'; bl(s, 0, 1, 11, 1);
  s.fillStyle = '#ff2f4d'; bl(s, 0, 1, 9, 1);
  s.fillStyle = '#ff8b9d'; bl(s, -3, -3, 3, .95);
  s.restore();
});
mkSpr('b11', BS, s => { // waffle brick grid (wall sweep)
  s.save(); s.translate(BS / 2, BS / 2);
  s.fillStyle = '#fff'; s.fillRect(-13, -13, 26, 26);
  s.fillStyle = '#e5b16d'; s.fillRect(-11.5, -11.5, 23, 23);
  s.strokeStyle = '#8a5a1e'; s.lineWidth = 2;
  for (let g = -7; g <= 7; g += 7) {
    s.beginPath(); s.moveTo(g, -11.5); s.lineTo(g, 11.5); s.stroke();
    s.beginPath(); s.moveTo(-11.5, g); s.lineTo(11.5, g); s.stroke();
  }
  s.restore();
});
mkSpr('b12', BS, s => { // spinning mint pinwheel (orbiting spiral)
  s.save(); s.translate(BS / 2, BS / 2);
  s.fillStyle = '#fff';
  for (let k = 0; k < 4; k++) {
    s.save(); s.rotate(k * Math.PI / 2);
    s.beginPath(); s.moveTo(0, 0); s.quadraticCurveTo(11, -2, 13, -9); s.quadraticCurveTo(4, -6, 0, 0); s.fill();
    s.restore();
  }
  s.fillStyle = '#56f5ad';
  for (let k = 0; k < 4; k++) {
    s.save(); s.rotate(k * Math.PI / 2);
    s.beginPath(); s.moveTo(0, 0); s.quadraticCurveTo(9, -2, 11, -7); s.quadraticCurveTo(3, -5, 0, 0); s.fill();
    s.restore();
  }
  s.fillStyle = '#fff'; bl(s, 0, 0, 3, 1); s.fillStyle = '#2b8ba8'; bl(s, 0, 0, 1.8, 1);
  s.restore();
});
export const BSPR = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10', 'b11', 'b12'];
export const bspr = b => b.s;

// Pulsing warning markers drawn under incoming attacks (the enemy's moves are visible!).
mkSpr('warn', 44, s => {
  s.strokeStyle = '#fff'; s.lineWidth = 3;
  s.beginPath(); s.arc(22, 22, 17, 0, 6.2832); s.stroke();
  s.fillStyle = '#fff';
  s.beginPath(); s.moveTo(22, 9); s.lineTo(36, 22); s.lineTo(22, 35); s.lineTo(8, 22); s.closePath(); s.fill();
  s.fillStyle = '#ff2f4d';
  s.beginPath(); s.moveTo(22, 13); s.lineTo(32, 22); s.lineTo(22, 31); s.lineTo(12, 22); s.closePath(); s.fill();
  s.fillStyle = '#fff'; s.font = 'bold 15px monospace'; s.textBaseline = 'middle'; s.fillText('!', 22, 23);
});

// Text banners baked once (TXR supersample) — no per-frame font rasterisation.
const TXR = 3;
const txtSpr = (id, str, col) => mkSpr(id, 420 * TXR, 30 * TXR, s => {
  s.scale(TXR, TXR); s.fillStyle = col; s.font = '12px "Press Start 2P",monospace'; s.textBaseline = 'middle';
  s.fillText(str, 210, 15);
});
txtSpr('txt0', 'DODGE THE DESSERT!', '#fff');
txtSpr('txt1', 'CHOOSE YOUR ACTION BELOW!', '#fff');
txtSpr('txt2', 'HIT THE GREEN! (SPACE / TAP)', '#ffe98a');
// Attack-name banner over the boss during its windup (red panel = danger).
export const txtWarn = (id, str) => mkSpr(id, 460 * TXR, 34 * TXR, s => {
  s.scale(TXR, TXR);
  s.fillStyle = '#5e0016'; s.fillRect(0, 0, 460, 34);
  s.strokeStyle = '#fff'; s.lineWidth = 3; s.strokeRect(2, 2, 456, 30);
  s.fillStyle = '#ffe98a'; s.font = '12px "Press Start 2P",monospace'; s.textBaseline = 'middle';
  s.fillText(str, 230, 18);
});
