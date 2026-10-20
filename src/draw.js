// Scene renderer: draws the baked sprites into the visible #c canvas (~20 drawImage
// calls per frame) and records character positions for the mask pass.
// NEVER add per-frame shadowBlur/gradients/text rasterisation here (30fps cause).
import { W, H } from './util.js';
import { S } from './state.js';
import { SPR, bspr } from './sprites.js';
import { CHARQ, composeMsk } from './mask.js';
import { particles } from './particles.js';
import { NPCS, updNpc, bindSpr } from './npc.js';
import { hero, boss } from './game.js';

export const c = document.querySelector('#c');
export const x = c.getContext('2d', { alpha: false });
// Fixed backing store; CSS upscales — never resize to clientWidth*DPR.
c.width = W; c.height = H;

export function spr(id, cx, cy) {
  const S2 = SPR[id];
  if (!S2) return;
  x.drawImage(S2, cx - S2.w / 2, cy - S2.h / 2, S2.w, S2.h);
  CHARQ.push(id, cx, cy, S2.w, S2.h);
}
bindSpr(spr);

// BR = blur focus uv + velocity of the fastest mover (feeds the GL shutter direction).
export const BR = { x: .5, y: .5 };
export const BRV = { vx: 0, vy: 0 }; // mutable box (live binding across modules)

function drawAtk() {
  const L = 150, Tp = 335, Wd = 500, Hh = 56;
  x.save();
  x.fillStyle = '#000'; x.fillRect(L, Tp, Wd, Hh);
  const g = x.createLinearGradient(L, 0, L + Wd, 0);
  g.addColorStop(0, '#ff3b3b'); g.addColorStop(.35, '#ffd23b'); g.addColorStop(.5, '#3bff7a');
  g.addColorStop(.65, '#ffd23b'); g.addColorStop(1, '#ff3b3b');
  x.globalAlpha = .9; x.fillStyle = g; x.fillRect(L + 4, Tp + 4, Wd - 8, Hh - 8); x.globalAlpha = 1;
  x.strokeStyle = '#fff'; x.lineWidth = 4; x.strokeRect(L, Tp, Wd, Hh);
  x.fillStyle = '#000'; x.fillRect(S.atk.p - 5, Tp - 8, 10, Hh + 16);
  x.fillStyle = Math.floor(S.time / 90) % 2 ? '#fff' : '#ff0'; x.fillRect(S.atk.p - 3, Tp - 6, 6, Hh + 12);
  x.restore();
}

export function draw() {
  x.drawImage(SPR['bg'], 0, 0, W, H);
  CHARQ.length = 0;
  for (const n of NPCS) { updNpc(n, S.time, 16.7); spr(n.id, n.x, n.y); }
  spr('boss', boss.x, boss.y + Math.sin(S.time * .004) * 5);
  spr('hero', hero.x, hero.y);
  for (const b of S.bullets) spr(bspr(b), b.x, b.y);
  // one batched path per colour bucket (no per-particle beginPath/stroke)
  if (particles.length) {
    x.lineCap = 'round';
    const buckets = {};
    for (const p of particles) (buckets[p.color] || (buckets[p.color] = [])).push(p);
    for (const col in buckets) {
      x.strokeStyle = col; x.beginPath();
      for (const q of buckets[col]) { x.moveTo(q.x, q.y); x.lineTo(q.x - q.vx * 3, q.y - q.vy * 3); }
      x.lineWidth = buckets[col][0].size; x.stroke();
    }
  }
  const hop = S.sheepSay > 0 ? Math.abs(Math.sin(S.time * .012)) * 14 : 0, sy2 = 428 - hop;
  spr('sheep', 752, sy2);
  if (S.sheepSay > 0) { spr('bub', 650, 368); S.sheepSay -= 16; }
  let mxB = 0, myB = 0;
  for (const b of S.bullets) { const s = Math.hypot(b.vx, b.vy); if (s > myB) { myB = s; mxB = 1; } }
  if (mxB) {
    let bi = 0, bs = 0;
    for (let i = 0; i < S.bullets.length; i++) { const s = Math.hypot(S.bullets[i].vx, S.bullets[i].vy); if (s > bs) { bs = s; bi = i; } }
    const b = S.bullets[bi];
    BR.x = b.x / 800; BR.y = 1 - b.y / 460; BRV.vx = b.vx; BRV.vy = b.vy;
  } else {
    let ex = null, es = 0;
    for (const n of NPCS) { const s = Math.hypot(n.vx, n.vy); if (s > es) { es = s; ex = n; } }
    if (ex && es > .8) { BR.x = ex.x / 800; BR.y = 1 - ex.y / 460; BRV.vx = ex.vx; BRV.vy = ex.vy; }
    else { BRV.vx = 0; BRV.vy = 0; }
  }
  spr(S.mode === 'dodge' ? 'txt0' : S.mode === 'attack' ? 'txt2' : 'txt1', 400, 415);
  if (S.mode === 'attack') drawAtk();
  composeMsk();
}
