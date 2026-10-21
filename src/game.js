// Battle logic: state machine (menu|battle|attack|dodge|over), turns, damage, items,
// mercy, bullet patterns, and the HUD wiring. Undertale-style attack timing bar.
import { $, pick, rand, W, H, clamp } from './util.js';
import { S } from './state.js';
import { NPCS as NPC_DATA, NEWS, END_LINES } from './data.js';
import { log, sfx, tone, audioStart, bgmPause, bgmMuted, sheepBeep } from './audio.js';
import { zoomFx } from './fx.js';
import { burst, updateParticles, recycleParticles } from './particles.js';
import { PATTERNS } from './patterns.js';

export const hero = { x: 400, y: 365 };
export const boss = { x: 400, y: 105 };
// Boss lunge animation during its telegraphed attack windup (read by draw.js).
export const lunge = { t: -1, name: '' };
const DODGE_MS = 6800; // longer windows: the new named patterns need room to unfold
let patIdx = 0;        // sequential rotation so no pattern repeats back-to-back

export function updateUI() {
  $('#hpText').textContent = `HP ${S.hp}/100`;
  $('#hp').style.width = S.hp + '%';
  $('#bossText').textContent = `HP ${S.bhp}/180`;
  $('#bossHp').style.width = (S.bhp / 180 * 100) + '%';
  $('#coins').textContent = S.coins;
  $('#turn').textContent = S.turn;
}

export function end(win, spared = false) {
  S.mode = 'over';
  bgmPause();
  S.fx = 0; // no zoom punch may fire under the overlay
  $('#overlay').style.display = 'flex';
  $('#overlay').innerHTML = `<div class="panel"><h1>${win ? '🎉 NEIGHBOURHOOD SAVED!' : '💀 OH NOOO!'}</h1>
<p>${spared ? 'Sir Scoopington has joined the neighbourhood watch!' : win ? 'THE ICE CREAM IS SAFE!' : 'YOU HAVE BEEN FLATTENED BY DESSERT.'}</p>
<p>⭐ Score: ${S.score}<br>🍦 Coins: ${S.coins}<br>💖 HP: ${S.hp}</p>
<p>${pick(END_LINES)}</p>
<button id="again">🔄 PLAY AGAIN</button></div>`;
  $('#again').onclick = reset;
  if (win) sfx('win');
}

export function hurtBoss(d) {
  if (S.mode !== 'battle') return;
  S.bhp = Math.max(0, S.bhp - d); S.score += d; S.shake = 7;
  zoomFx(1); sfx('hit');
  burst(boss.x, boss.y, 20, pick(['#ff54bf', '#fff16b', '#63f6ff']));
  log(`💥 SPATULA STRIKE! ${d} damage!`);
  if (!S.bhp) { end(true); return; }
  updateUI();
  enemyTurn(); // locked turn: S.busy stays true until the dodge window ends
}

export function hurtHero(d) {
  if (S.inv > 0 || S.mode !== 'dodge') return;
  S.hp = Math.max(0, S.hp - d); S.inv = 55; S.shake = 8;
  zoomFx(0); sfx('hurt');
  burst(hero.x, hero.y, 15, '#ff477e');
  updateUI();
  if (!S.hp) end(false);
}

// Bullet factories consumed by patterns.js. `e` = per-turn effect scratch object
// (survives across phases of one pattern via S.pat.e).
function bullet(px, py, vx, vy, sprId, r = 7) {
  S.bullets.push({ x: px, y: py, vx, vy, s: sprId, r });
}
export const B = {
  bullet,
  spawn(x, y, vx, vy, s, r) { bullet(x, y, vx, vy, s, r); },
  // homing bullets steer toward the hero every frame (updateBullets) — never aim-lock
  homing(x, y, sp, s, r) { S.bullets.push({ x, y, vx: 0, vy: sp, sp, s, r, home: 1 }); },
  orbit(cx, cy, R, a0, w, s, r, life) { S.bullets.push({ x: cx, y: cy, R, a: a0, w, ox: cx, oy: cy, dr: 0, s, r, life }); },
  drift(x, y, vx, vy, s, r) { bullet(x, y, vx, vy, s, r); },
  // visible warning marker where something is about to land/appear
  tele(x, y, ms, warnSpr) { S.tele.push({ x, y, t: ms, dur: ms, warn: warnSpr }); },
};
export function updateBullets(dt) {
  const f = dt / 16.7;
  for (const b of S.bullets) {
    if (b.home) {
      const a = Math.atan2(hero.y - b.y, hero.x - b.x);
      b.vx += (Math.cos(a) * b.sp - b.vx) * .035 * f;
      b.vy += (Math.sin(a) * b.sp - b.vy) * .035 * f;
    }
    if (b.R !== undefined) {
      b.a += b.w * f; b.R += b.dr * f; b.life -= f;
      b.x = b.ox + Math.cos(b.a) * b.R; b.y = b.oy + Math.sin(b.a) * b.R;
      if (b.life <= 0) b.dead = 1;
    }
  }
}

// Enemy attacks run FRAME-DRIVEN from update() (never setTimeout): bullets are fully
// visible and deterministic while dodging. One named pattern per turn, rotating.
function startEnemyAttack() {
  S.mode = 'dodge'; S.bullets = []; S.tele = []; S.dodgeTime = 0;
  const p = PATTERNS[patIdx++ % PATTERNS.length];
  S.pat = { id: p.id, name: p.name, e: {}, phase: 0, pt: 0 };
  lunge.t = 0; lunge.name = p.warn || '';
  syncBtns(); // action buttons lock until this attack is survived
  log(`🍦 SIR SCOOPINGTON UNLEASHES ${p.name}! ⚠️ ${p.tip}`);
}

export function enemyTurn() {
  if (S.mode !== 'battle') return;
  startEnemyAttack();
}

export function strike() {
  if (S.mode !== 'attack' || !S.atk || S.atk.d) return;
  S.atk.d = 1;
  const o = Math.abs(S.atk.p - 400), d = Math.max(6, Math.round(50 * (1 - o / 250)));
  S.mode = 'battle';
  hurtBoss(d);
  log(o < 25 ? '🌟 PERFECT! ' + d + ' damage!' : '💥 Hit for ' + d + '!');
}

// Attack-window timeout: swing missed, turn still consumed — boss strikes back.
function attackMissed() {
  S.mode = 'battle'; log('💨 MISS! Too slow!');
  enemyTurn();
}

export function act(a) {
  if (S.mode === 'attack' && a === 'fight') { strike(); return; }
  // ONE action per turn: FIGHT locks the menu after its swing lands (mode stays
  // 'battle' while the boss counterattacks), and nothing fires during dodge/over.
  if (S.mode !== 'battle' || S.busy) return;
  if (a === 'fight') {
    S.busy = true; syncBtns();
    S.mode = 'attack'; S.atk = { p: 150, d: 0 };
    log('⚔️ TIMING! Hit SPACE / click / tap / FIGHT when the line is in the green!');
    return;
  }
  S.busy = true;
  if (a === 'act') {
    const n = pick(NPC_DATA);
    S.mercy += 25;
    log(`${n[0]} ${n[1]}: "${pick(n[2])}" 💚 Mercy +25!`);
    burst(boss.x, boss.y, 12, '#9affbd'); sfx('coin');
  } else if (a === 'item') {
    if (S.coins < 2) { log('🦝 Greg says: TWO COINS, PLEASE. Capitalism!'); return; }
    if (S.hp === 100) { log('💖 Full HP! The ice cream can wait.'); return; }
    S.coins -= 2; S.hp = Math.min(100, S.hp + 35); sfx('heal');
    log('🍨 LUXURY ICE CREAM! You restored up to 35 HP!');
    burst(hero.x, hero.y, 20, '#ff8bdb');
  } else {
    S.mercy += 40; sfx('heal');
    log('💚 You offer the boss a peaceful waffle.');
  }
  updateUI();
  if (S.mercy >= 100) { end(true, true); return; }
  enemyTurn(); // frame-driven attack: no setTimeout needed for the boss turn anymore
}

export function reset() {
  S.hp = 100; S.bhp = 180; S.coins = 4; S.turn = 1; S.mercy = 0; S.score = 0;
  hero.x = 400; hero.y = 365;
  S.bullets = []; recycleParticles(); S.inv = 0;
  S.tele = []; S.pat = null; S.busy = false; lunge.t = -1;
  updateUI(); S.mode = 'battle'; S.dodgeTime = 0;
  $('#overlay').style.display = 'none';
  log('🏡 The neighbours are counting on you. Probably.');
  audioStart(); sfx('win');
}

// Turn-locked action buttons: greyed out while an attack resolves / boss is up.
function syncBtns() {
  const dis = S.busy || S.mode === 'dodge' || S.mode === 'over';
  document.querySelectorAll('[data-a]').forEach(b => { b.disabled = dis; });
}

export function update(dt) {
  if (S.mode === 'attack') {
    S.atk.p += 7 * dt / 16.7;
    if (S.atk.p > 650) attackMissed();
  }
  S.time += dt;
  if (lunge.t >= 0) { lunge.t += dt; if (lunge.t > 900) lunge.t = -1; }
  if (S.mode === 'dodge') {
    S.dodgeTime += dt;
    if (S.keys.arrowleft || S.keys.a) hero.x -= 4;
    if (S.keys.arrowright || S.keys.d) hero.x += 4;
    if (S.keys.arrowup || S.keys.w) hero.y -= 4;
    if (S.keys.arrowdown || S.keys.s) hero.y += 4;
    hero.x = Math.max(15, Math.min(785, hero.x));
    hero.y = Math.max(265, Math.min(405, hero.y));
    // run the current named pattern one frame (it spawns/moves bullets visibly)
    if (S.pat) {
      const p = PATTERNS.find(q => q.id === S.pat.id);
      S.pat.pt += dt;
      if (p && S.pat.phase < p.phases.length && S.pat.pt >= p.phases[S.pat.phase]) {
        S.pat.pt -= p.phases[S.pat.phase];
        p.run(S.pat, B, hero, boss, W, H, clamp, rand);
        S.pat.phase++;
      }
    }
    updateBullets(dt);
    const f = dt / 16.7;
    for (let i = S.tele.length - 1; i >= 0; i--) {
      const t = S.tele[i];
      t.t -= dt;
      if (t.t <= 0) {
        // expired markers erupt into their attack-specific payload (all visible!)
        if (t.boom) burst(t.x, t.y, 9, '#ffb14d');
        else if (t.warn === 'warnFork') {
          const a0 = Math.atan2(hero.y - t.y, hero.x - t.x);
          for (let k = -1; k <= 1; k++) B.spawn(t.x, t.y, Math.cos(a0 + k * .5) * 2.6, Math.sin(a0 + k * .5) * 2.6, 'b7', 7);
        } else if (t.warn === 'warnStar') {
          for (let k = 0; k < 6; k++) {
            const a = k * Math.PI / 3 + t.x * .01;
            B.spawn(t.x, t.y, Math.cos(a) * 2.1, Math.sin(a) * 2.1, 'b8', 6);
          }
        } else {
          // generic telegraphed crater: quick outward pop of sprinkles
          for (let k = 0; k < 5; k++) {
            const a = k * Math.PI * 2 / 5;
            B.spawn(t.x, t.y, Math.cos(a) * 1.9, Math.sin(a) * 1.9, 'b6', 6);
          }
          burst(t.x, t.y, 9, '#ffb14d');
        }
        S.tele.splice(i, 1);
      }
    }
    S.bullets.forEach(b => { b.x += b.vx * f; b.y += b.vy * f; });
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      if (b.dead) { S.bullets.splice(i, 1); continue; }
      if (b.x < -30 || b.x > 830 || b.y < -30 || b.y > 490) { S.bullets.splice(i, 1); continue; }
      if (Math.hypot(b.x - hero.x, b.y - hero.y) < b.r + 10) { S.bullets.splice(i, 1); hurtHero(8); }
    }
    if (S.dodgeTime > DODGE_MS) {
      S.mode = 'battle'; S.bullets = []; S.tele = []; S.pat = null;
      S.turn++; S.coins++; S.busy = false; syncBtns(); updateUI();
      log('✨ YOU SURVIVED! +1 scoop coin. YOUR TURN!');
      if (S.turn % 2 === 0) {
        const n = pick(NEWS);
        zoomFx(1);
        S.mercy = Math.min(90, S.mercy + 10);
        log('📺 BREAKING (mid-fight!): ' + n + ' 🏳️‍🌈 Pride Power: Mercy +10!');
        ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787'].forEach(k => burst(boss.x, boss.y, 8, k));
        sheepBeep();
      }
    }
  }
  updateParticles(dt);
  if (S.inv > 0) S.inv -= dt / 16;
}

// Wire DOM controls (called once from main.js).
export function bindControls() {
  $('#start').onclick = () => { audioStart(); reset(); };
  document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
  $('#sound').onclick = () => {
    S.muted = !S.muted;
    bgmMuted(S.muted);
    $('#sound').textContent = S.muted ? '🔇 SOUND OFF' : '🔊 SOUND ON';
    if (!S.muted) { audioStart(); tone(660, .1); }
  };
  $('#sheepBtn').onclick = sheepBeep;
  setInterval(() => { if (S.mode === 'dodge' || S.mode === 'battle') sheepBeep(); }, 24000);
  document.addEventListener('keydown', e => {
    S.keys[e.key.toLowerCase()] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  });
  document.addEventListener('keyup', e => S.keys[e.key.toLowerCase()] = false);
  addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); strike(); } });
  $('#game').addEventListener('pointerdown', strike);
}
