// Seven UNIQUE boss attacks. Each is a phase script run FRAME-DRIVEN from game.js
// update() (never setTimeout) so every bullet is visible while dodging, with baked
// custom sprites and telegraphed warnings. Contract:
//   phases = ms before each phase index runs; run(pat, B, hero, boss, W, H, clamp, rand)
//   pat.e  = per-turn scratch object; B.tele(x, y, ms, warnId) queues a warning marker
//   that the game's tele pipeline converts into a bullet when it expires.
import { txtWarn } from './sprites.js';

export const PATTERNS = [
  // 1 — SPRINKLE STORM: rainbow sprinkle rain with safe-gap columns + drifting gusts.
  {
    id: 'rain', name: '🌧️ SPRINKLE STORM!', warn: 'ATK0', dur: 6800,
    tip: 'Watch the gaps between the sprinkle columns!',
    phases: [500, 1000, 1000, 1000, 1300],
    run(pat, B, hero, boss, W, H, clamp, rand) {
      const ph = pat.phase;
      if (ph === 0) {
        for (let i = 0; i < 4; i++) B.tele(rand(40, 760), rand(270, 395), rand(500, 900), 'warn');
      } else if (ph <= 3) {
        const gap = rand(80, 700);
        for (let x = 30; x < 780; x += 60) {
          if (Math.abs(x - gap) < 55) continue;
          B.spawn(x + rand(-8, 8), -14, rand(-.3, .3), rand(2.1, 3.2), 'b6', 7);
        }
        if (ph === 2) for (let i = 0; i < 5; i++) B.drift(rand(60, 740), rand(270, 400), rand(-1.8, 1.8), rand(-.6, .6), 'b2', 6);
      } else {
        const gap = rand(100, 700);
        for (let x = 30; x < 780; x += 60) {
          if (Math.abs(x - gap) < 70) continue;
          B.spawn(x, -14, 0, 2.6, 'b6', 7);
        }
      }
    },
  },
  // 2 — JELLY RINGSHOT: expanding rings offset from the hero — dodge the ripple!
  {
    id: 'ring', name: '💫 JELLY RINGSHOT!', warn: 'ATK1', dur: 6800,
    tip: 'Rings burst from where you ARE NOT. Slip through the slow ones!',
    phases: [600, 1100, 1100, 1100, 1400],
    run(pat, B, hero, boss, W, H, clamp, rand) {
      const ph = pat.phase;
      if (ph === 0) { B.tele(clamp(hero.x, 60, 740), clamp(hero.y, 280, 390), 550, 'warn'); return; }
      const n = 18 + ph * 2, sp = 1.5 + ph * .25;
      const cx = clamp(hero.x + rand(-130, 130), 70, 730), cy = clamp(hero.y + rand(-60, 60), 275, 395);
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n + ph * .35;
        B.spawn(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, i % 2 ? 'b3' : 'b2', 6);
      }
    },
  },
  // 3 — WAFFLE WALLS: alternating up/down waffle brick walls with ONE moving gap each.
  {
    id: 'wall', name: '🧇 WAFFLE WALLS!', warn: 'ATK2', dur: 6800,
    tip: 'Each wall has one glowing gap — line yourself up before it arrives!',
    phases: [900, 1000, 1000, 1000, 1400],
    run(pat, B, hero, boss, W, H, clamp, rand) {
      const ph = pat.phase;
      if (ph === 0) { pat.e.gap = rand(80, 700); return; }
      const gap = pat.e.gap = clamp(pat.e.gap + rand(-110, 110), 80, 700);
      const down = ph % 2 === 1;
      for (let i = 0; i < 12; i++) {
        const x = i * 68 + 25;
        if (Math.abs(x - gap) < 60) continue;
        B.spawn(x, down ? -14 : 474, 0, down ? 3 : -3, 'b11', 12);
      }
    },
  },
  // 4 — CHERRY BOMBARDMENT: telegraphed craters erupt into radial cherry blasts.
  {
    id: 'bomb', name: '🍒 CHERRY BOMBARDMENT!', warn: 'ATK3', dur: 6800,
    tip: 'Get OFF the red markers before they blow — shockwaves go EVERYWHERE!',
    phases: [800, 900, 900, 800, 700, 700],
    run(pat, B, hero, boss, W, H, clamp, rand) {
      const ph = pat.phase;
      if (ph <= 2) {
        for (let i = 0; i < 3; i++) B.tele(rand(60, 740), rand(272, 398), 900, 'warn');
      } else {
        for (let i = 0; i < 3; i++) {
          const cx = rand(60, 740), cy = rand(272, 398);
          for (let k = 0; k < 8; k++) {
            const a = k * Math.PI / 4 + ph * .3;
            B.spawn(cx, cy, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 'b10', 7);
          }
        }
      }
    },
  },
  // 5 — SCOOP SPIRAL: two arms of orbiting scoops spiral outward from the boss.
  {
    id: 'spiral', name: '🌀 SCOOP SPIRAL!', warn: 'ATK4', dur: 6800,
    tip: 'The arms spin like a galaxy — circle-strafe AGAINST the rotation!',
    phases: [400, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300],
    run(pat, B, hero, boss, W, H, clamp, rand) {
      const ph = pat.phase;
      if (ph === 0) return;
      const t = ph * .55;
      pat.e.a = (pat.e.a || 0) + .42;
      for (const off of [0, Math.PI]) {
        const a = pat.e.a + off;
        // spawn point sweeps around the boss so the galaxy winds outward
        const sx = boss.x + Math.cos(a * .6) * 40, sy = boss.y + Math.sin(a * .6) * 20;
        B.orbit(sx, sy, 14 + t * 6, a, .05, 'b12', 6, 320 - t * 22);
      }
      if (ph === 6) for (let i = 0; i < 10; i++) {
        const a = i * Math.PI * 2 / 10;
        B.spawn(boss.x, boss.y, Math.cos(a) * 1.8, Math.sin(a) * 1.8, 'b3', 6);
      }
    },
  },
  // 6 — FORKED SUNDAE: aimed shots that TELEGRAPH then split into three jelly forks.
  {
    id: 'fork', name: '🍴 FORKED SUNDAE!', warn: 'ATK5', dur: 6800,
    tip: 'You are LOCKED ON — see the crosshair? Keep MOVING so the splits miss!',
    phases: [600, 900, 900, 900, 800, 700],
    run(pat, B, hero, boss, W, H, clamp, rand) {
      const ph = pat.phase;
      if (ph === 0) return;
      // marker trails the hero while the shot "locks on", then fires at that spot
      B.tele(clamp(hero.x, 40, 760), clamp(hero.y, 268, 400), 750, 'warnFork');
      if (ph >= 4) {
        const a = rand(0, 6.28);
        B.homing(boss.x, boss.y, 1.5, 'b5', 6);
        B.spawn(boss.x, boss.y, Math.cos(a) * 2, Math.sin(a) * 2, 'b9', 6);
      }
    },
  },
  // 7 — SUNDAY STARFALL: stars pop out of telegraphed points in a shrinking ring.
  {
    id: 'star', name: '🌟 SUNDAY STARFALL!', warn: 'ATK6', dur: 6800,
    tip: 'Stars burst from the marked ring spots — weave through the pinwheel!',
    phases: [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500],
    run(pat, B, hero, boss, W, H, clamp, rand) {
      const ph = pat.phase;
      const cx = 400, cy = 335, R = 150 - ph * 10;
      pat.e.rot = (pat.e.rot || 0) + .5;
      for (let k = 0; k < 3; k++) {
        const a = pat.e.rot + k * Math.PI * 2 / 3;
        const x = clamp(cx + Math.cos(a) * R, 40, 760), y = clamp(cy + Math.sin(a) * R * .5, 270, 400);
        B.tele(x, y, 420, 'warnStar');
      }
      if (ph === 10) { // final cross-sweep of fast sprinkles
        for (let i = 0; i < 8; i++) {
          B.spawn(i % 2 ? -14 : 814, 275 + i * 18, i % 2 ? 3.4 : -3.4, 0, 'b6', 6);
        }
      }
    },
  },
];

// Bake one red danger banner per attack name (drawn over the boss during its windup).
PATTERNS.forEach(p => txtWarn(p.warn, p.name));
