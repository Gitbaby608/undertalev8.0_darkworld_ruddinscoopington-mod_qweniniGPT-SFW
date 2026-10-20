// Fixed-cap particle pool with swap-remove culling. Drawn as ONE batched line-path
// per colour bucket (see draw.js). Keep this allocation-free: no filter(), no spread
// in the hot path — GC spikes caused frame hitches before.
import { rand } from './util.js';

export const particles = [];
const pFree = [];

// Bursts stay tiny: n capped at 9, pool hard-capped at 130.
export function burst(px, py, n, col) {
  n = Math.min(n, 9);
  for (let i = 0; i < n; i++) {
    if (particles.length >= 130) continue;
    const a = rand(0, 6.283), v = rand(1, 5), p = pFree.pop() || {};
    p.x = px; p.y = py; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
    p.life = rand(20, 45); p.color = col; p.size = rand(2, 7);
    particles.push(p);
  }
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vx *= .98; p.vy *= .98; p.life -= dt / 16;
    if (p.life <= 0) { pFree.push(p); const l = particles.pop(); if (i < particles.length) particles[i] = l; }
  }
}

export function recycleParticles() {
  while (particles.length) pFree.push(particles.pop());
}
