// NPCs run ACTS "bits" (scooter, slots, parcel…). Each bit writes o.vx/o.vy, which
// feed the GL motion-blur shutter direction. updNpc lerps toward the bit's target.
import { pick, rand } from './util.js';
import { log } from './audio.js';

// House anchor positions — must match the backdrop baked in sprites.js.
const HOUS = (() => { const a = []; for (let i = 0; i < 8; i++) a.push({ x: i * 110, y: 290 - (i % 3) * 25 }); return a; })();
const NIDS = ['npc0', 'npc1', 'npc2', 'npc3', 'npc4', 'npc5'];

// spr is injected by draw.js to avoid a circular import.
let spr = () => {};
export function bindSpr(fn) { spr = fn; }

function cy_(e) { return 396 - Math.abs(Math.sin(e.t * .012)) * 16; }

export const ACTS = [
  { id: 'scoot', who: [0], label: '🛴 Grandma rocket-scooters down the street', dur: 6500, run(o, a, e) { const p = Math.min(1, e.t / a.dur), sx = 70 + 680 * p, sy = 414 - Math.abs(Math.sin(p * Math.PI)) * 14, d = p < .5 ? 1 : -1; o.vx = d * 7.2; o.vy = -Math.cos(p * Math.PI) * 1.2; spr('prop0', sx + d * 10, sy - 4); return { x: sx, y: sy }; } },
  { id: 'slots', who: [1], label: '🦝 Greg runs the corner slot machine', dur: 7000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, on = Math.floor(e.t / 160) % 2; spr('prop1', h.x + 44, h.y + 152); o.vx = on ? -2.6 : 2.6; o.vy = 0; return { x: h.x + (on ? -32 : 30), y: h.y + 142 }; } },
  { id: 'parcel', who: [4], label: '📫 Dave drags a parcel three times his size to a door', dur: 9000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, p = Math.min(1, e.t / a.dur), px = h.x + 150 - 150 * p, py = h.y + 166; spr('prop2', px + 18, py); o.vx = 3.4; o.vy = 0; return { x: px, y: py - 4 }; } },
  { id: 'knit', who: [0], label: '🧶 Grandma knits on the porch (aggressively)', dur: 11000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, b = Math.sin(e.t * .012) * 3; spr('prop3', h.x + 62, h.y + 158 + b); o.vx = b * .4; return { x: h.x + 34, y: h.y + 160 }; } },
  { id: 'sign', who: [2], label: '🐦 Kevin hijacks an estate sign', dur: 8000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h; o.vx = Math.sin(e.t * .01) * 2; o.vy = 0; return { x: h.x + 44, y: h.y + 148 + Math.sin(e.t * .008) * 3 }; } },
  { id: 'crumb', who: [2], label: '🐦 Kevin drops crumbs everywhere', dur: 7000, setup() { this.x0 = rand(60, 740); this.y0 = rand(250, 400); this.x1 = rand(60, 740); this.y1 = rand(250, 400); }, run(o, a, e) { const p = Math.min(1, e.t / a.dur), cx = this.x0 + (this.x1 - this.x0) * p, cyy = this.y0 + (this.y1 - this.y0) * p - Math.sin(p * Math.PI) * 40; spr('crumb', cx, cyy + 18); o.vx = (this.x1 - this.x0) / a.dur * 16; o.vy = (this.y1 - this.y0) / a.dur * 16; return { x: cx, y: cyy }; } },
  { id: 'love', who: [3], label: '🐈 Luna blesses a random neighbour with love', dur: 6000, setup() { this.n = NPCS[(Math.random() * NPCS.length) | 0]; }, run(o, a, e) { const n = this.n, p = Math.min(1, e.t / a.dur); spr('heart', n.x, n.y - 34 - p * 30); o.vx = .4; return { x: n.x + 30, y: n.y }; } },
  { id: 'polish', who: [5], label: '⭐ Scoop Jr. polishes the rainbow', dur: 7500, setup() { this.i = rand(.2, .6); }, run(o, a, e) { const ang = Math.PI + Math.PI * (e.t / a.dur) * this.i + .2, rx = 400 + Math.cos(ang) * 186, ry = 310 + Math.sin(ang) * 186; spr('star', rx, ry); o.vx = Math.cos(ang + 1.57) * 2.2; o.vy = Math.sin(ang + 1.57) * 2.2; return { x: rx, y: ry }; } },
  { id: 'bat', who: [3], label: '💨 Luna bats a dust cloud at the boss', dur: 5000, run(o, a, e) { const p = Math.min(1, e.t / a.dur); spr('puff', 120 + p * 250, 206 - Math.sin(p * Math.PI) * 26); o.vx = 1.2; return { x: 104, y: 214 }; } },
  { id: 'nap', who: [1], label: '💤 Greg naps face-down in the gutter', dur: 8000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h; spr('z', h.x + 50, h.y + 146 - Math.sin(e.t * .004) * 5); o.vx = 0; o.vy = 0; return { x: h.x + 26, y: h.y + 164 }; } },
  { id: 'window', who: [4], label: '📫 Dave posts a letter through a letterbox', dur: 6000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, p = Math.min(1, e.t / a.dur); if (p < .5) spr('note', h.x + 44, h.y + 96 + p * 60); o.vx = p < .5 ? 1.6 : .4; return { x: h.x + 30, y: h.y + 168 }; } },
  { id: 'yarn', who: [3], label: "🧶 Luna steals Grandma's yarn", dur: 7000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, p = Math.min(1, e.t / a.dur), yx = h.x + 70 - p * 180; spr('prop3', yx, h.y + 170); o.vx = -3.2; return { x: yx + 16, y: h.y + 166 }; } },
  { id: 'paint', who: [1], label: '🎨 Greg "renovates" a house wall with spray paint', dur: 8000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, p = Math.min(1, e.t / a.dur); spr('note', h.x + 16 + p * 54, h.y + 60 + Math.sin(e.t * .02) * 7); o.vx = Math.cos(e.t * .015) * 2.4; o.vy = Math.sin(e.t * .019) * 1.6; return { x: h.x + 44, y: h.y + 150 }; } },
  { id: 'flash', who: [5], label: '📸 Scoop Jr. flashes a photo of every window', dur: 6500, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, i = Math.floor(e.t / 500); if (i % 2 === 0 && e.t < 5000) spr('star', h.x + 44, h.y + 60 + (i % 4) * 36); o.vx = .6; return { x: h.x + 44, y: h.y + 158 }; } },
  { id: 'chase', who: [2, 3], label: '🐈 Luna chases Kevin across the whole street', dur: 6000, setup() { this.off = rand(34, 64); }, run(o, a, e) { const p = Math.min(1, e.t / a.dur), cx = 52 + 700 * p; o.vx = 11.6; o.vy = 0; if (o.id === 'npc2') spr('puff', cx - this.off, cy_(e)); return { x: cx, y: cy_(e) }; } },
  { id: 'magnet', who: [4], label: '🧲 Dave gets stuck to a mailbox after posting a letter', dur: 6000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, w = Math.sin(e.t * .02) * 3; spr('note', h.x + 44 + w, h.y + 150); o.vx = w * .6; return { x: h.x + 62, y: h.y + 160 }; } },
  { id: 'dance', who: [0, 5], label: '💃 Grandma & Scoop Jr. do the sprinkles shuffle', dur: 7000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, j = Math.abs(Math.sin(e.t * .011)) * 9, w = Math.sin(e.t * .006) * 12; o.vx = w * 1.1; o.vy = -j * .8; return { x: h.x + 44 + w, y: h.y + 150 - j }; } },
  { id: 'peek', who: [1, 2], label: '👀 Someone is peeking through a curtain. Suspicious.', dur: 5000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, w = Math.sin(e.t * .01) * 5; o.vx = w; o.vy = 0; return { x: h.x + 44 + w, y: h.y + 52 }; } },
  { id: 'garden', who: [0], label: '🌻 Grandma waters her rainbow flowerbox', dur: 8000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, p = Math.min(1, e.t / a.dur); if (Math.floor(e.t / 300) % 2 === 0) spr('heart', h.x + 20 + ((e.t / 300) % 3) * 22, h.y + 120 - Math.sin(e.t * .005) * 4); o.vx = .5; return { x: h.x + 66, y: h.y + 158 }; } },
  { id: 'roof', who: [2], label: '🐦 Kevin sunbathes on a rooftop like a tiny menace', dur: 9000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h; o.vx = Math.sin(e.t * .004) * .6; o.vy = 0; return { x: h.x + 52, y: h.y - 16 }; } },
  { id: 'bin', who: [1], label: '🗑️ Greg ransacks a rubbish bin outside a house', dur: 6000, setup() { this.h = pick(HOUS); }, run(o, a, e) { const h = this.h, r = Math.floor(e.t / 220) % 2; spr('crumb', h.x + 96, h.y + 168 - r * 8); o.vx = r ? 2.2 : -1.4; o.vy = 0; return { x: h.x + 76, y: h.y + 160 }; } },
];

function mkNpc(id, x, y) {
  return { id, sid: id.replace('npc', ''), x, y, tx: x, ty: y, vx: 0, vy: 0, act: null, end: 0, start: 0, rest: 0, home: { x, y } };
}

export const NPCS = NIDS.map((id, i) => mkNpc(id, i === 4 ? 60 : (i === 5 ? 700 : 95 + i * 160), i === 4 ? 404 : (i === 5 ? 300 : 214)));

function assign(n, now) {
  const pool = ACTS.filter(a => (!a.who || a.who.indexOf(+n.sid) >= 0) && a.id !== n.cur);
  const a = pick(pool.length ? pool : ACTS);
  try { a.setup && a.setup(); } catch (e) {}
  n.act = a; n.cur = a.id; n.start = now; n.end = now + a.dur;
  if (a.label && Math.random() < .5) log('🏡 ' + a.label);
}

export function updNpc(n, now, dt) {
  if (!n.act || now > n.end) {
    n.act = null; n.cur = null;
    if (now >= (n.rest || 0)) { assign(n, now); n.rest = now + n.act.dur + rand(2500, 9000); }
    else { n.tx = n.home.x; n.ty = n.home.y; }
  }
  if (n.act) { const r = n.act.run(n, { dur: n.act.dur }, { t: now - n.start }); if (r) { n.tx = r.x; n.ty = r.y; } }
  const k = Math.min(1, dt * .012), ox = n.x, oy = n.y;
  n.x += (n.tx - n.x) * k; n.y += (n.ty - n.y) * k;
  const f = dt / 16.7 || 1;
  n.vx = n.vx * .55 + ((n.x - ox) / f) * .45;
  n.vy = n.vy * .55 + ((n.y - oy) / f) * .45;
}
