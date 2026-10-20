// Battle logic: state machine (menu|battle|attack|dodge|over), turns, damage, items,
// mercy, bullet patterns, and the HUD wiring. Undertale-style attack timing bar.
import { $, pick, rand } from './util.js';
import { S } from './state.js';
import { NPCS as NPC_DATA, NEWS, END_LINES } from './data.js';
import { log, sfx, tone, audioStart, bgmPause, bgmMuted } from './audio.js';
import { zoomFx } from './fx.js';
import { burst, updateParticles, recycleParticles } from './particles.js';

export const hero = { x: 400, y: 365 };
export const boss = { x: 400, y: 105 };

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
  setTimeout(() => { if (S.mode === 'battle') enemyTurn(); }, 500);
}

export function hurtHero(d) {
  if (S.inv > 0 || S.mode !== 'dodge') return;
  S.hp = Math.max(0, S.hp - d); S.inv = 55; S.shake = 8;
  zoomFx(0); sfx('hurt');
  burst(hero.x, hero.y, 15, '#ff477e');
  updateUI();
  if (!S.hp) end(false);
}

function bullet(px, py, vx, vy, col, r = 7) {
  S.bullets.push({ x: px, y: py, vx, vy, col, r });
}

// 4 bullet patterns: rain, ring, waffle gaps, aimed shots.
function attackPattern() {
  S.bullets = []; S.mode = 'dodge';
  const pattern = Math.floor(Math.random() * 4);
  log('⚠️ DODGE THE DESSERT! Use WASD or the arrow keys!');
  if (pattern === 0) {
    for (let i = 0; i < 15; i++) setTimeout(() => {
      if (S.mode === 'dodge') bullet(rand(30, 770), -10, rand(-.4, .4), rand(2, 4), pick(['#ff53c5', '#fff16b', '#6bf4ff']));
    }, i * 90);
  } else if (pattern === 1) {
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16;
      bullet(boss.x, boss.y, Math.cos(a) * 2.2, Math.sin(a) * 2.2, i % 2 ? '#ff65d5' : '#6bf4ff', 6);
    }
  } else if (pattern === 2) {
    for (let i = 0; i < 12; i++) {
      if (i % 5 !== Math.floor(hero.x / 67)) bullet(i * 68 + 25, 0, 0, 3.3, '#e5b16d', 10);
      if (i % 5 !== Math.floor(hero.x / 67)) bullet(i * 68 + 25, 460, 0, -3.3, '#e5b16d', 10);
    }
  } else {
    for (let i = 0; i < 7; i++) setTimeout(() => {
      if (S.mode !== 'dodge') return;
      const a = Math.atan2(hero.y - boss.y, hero.x - boss.x);
      bullet(boss.x, boss.y, Math.cos(a) * 2.5, Math.sin(a) * 2.5, '#ff4545');
    }, i * 160);
  }
}

export function enemyTurn() {
  if (S.mode !== 'battle') return;
  attackPattern();
  S.dodgeTime = 0;
}

export function strike() {
  if (S.mode !== 'attack' || !S.atk || S.atk.d) return;
  S.atk.d = 1;
  const o = Math.abs(S.atk.p - 400), d = Math.max(6, Math.round(50 * (1 - o / 250)));
  S.mode = 'battle';
  hurtBoss(d);
  log(o < 25 ? '🌟 PERFECT! ' + d + ' damage!' : '💥 Hit for ' + d + '!');
}

export function act(a) {
  if (S.mode === 'attack' && a === 'fight') { strike(); return; }
  if (S.mode !== 'battle') return;
  if (a === 'fight') {
    S.mode = 'attack'; S.atk = { p: 150, d: 0 };
    log('⚔️ TIMING! Hit SPACE / click / tap / FIGHT when the line is in the green!');
    return;
  }
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
  setTimeout(() => { if (S.mode === 'battle') enemyTurn(); }, 500);
}

export function reset() {
  S.hp = 100; S.bhp = 180; S.coins = 4; S.turn = 1; S.mercy = 0; S.score = 0;
  hero.x = 400; hero.y = 365;
  S.bullets = []; recycleParticles(); S.inv = 0;
  updateUI(); S.mode = 'battle'; S.dodgeTime = 0;
  $('#overlay').style.display = 'none';
  log('🏡 The neighbours are counting on you. Probably.');
  audioStart(); sfx('win');
}

export function update(dt) {
  if (S.mode === 'attack') {
    S.atk.p += 7 * dt / 16.7;
    if (S.atk.p > 650) {
      S.mode = 'battle'; log('💨 MISS! Too slow!');
      setTimeout(() => { if (S.mode === 'battle') enemyTurn(); }, 600);
    }
  }
  S.time += dt;
  if (S.mode === 'dodge') {
    S.dodgeTime += dt;
    if (S.keys.arrowleft || S.keys.a) hero.x -= 4;
    if (S.keys.arrowright || S.keys.d) hero.x += 4;
    if (S.keys.arrowup || S.keys.w) hero.y -= 4;
    if (S.keys.arrowdown || S.keys.s) hero.y += 4;
    hero.x = Math.max(15, Math.min(785, hero.x));
    hero.y = Math.max(265, Math.min(405, hero.y));
    S.bullets.forEach(b => { b.x += b.vx; b.y += b.vy; });
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      if (b.x < -30 || b.x > 830 || b.y < -30 || b.y > 490) { S.bullets.splice(i, 1); continue; }
      if (Math.hypot(b.x - hero.x, b.y - hero.y) < b.r + 10) { S.bullets.splice(i, 1); hurtHero(8); }
    }
    if (S.dodgeTime > 4800) {
      S.mode = 'battle'; S.bullets = []; S.turn++; S.coins++; updateUI();
      log('✨ YOU SURVIVED! +1 scoop coin. YOUR TURN!');
      if (S.turn % 2 === 0) {
        const n = pick(NEWS);
        zoomFx(1);
        S.mercy = Math.min(90, S.mercy + 10);
        log('📺 BREAKING (mid-fight!): ' + n + ' 🏳️‍🌈 Pride Power: Mercy +10!');
        ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787'].forEach(k => burst(boss.x, boss.y, 8, k));
        import('./audio.js').then(m => m.sheepBeep());
      }
    }
  }
  updateParticles(dt);
  if (S.inv > 0) S.inv -= dt / 16;
}

// Wire DOM controls (called once from main.js). sheepBeep is passed in to keep
// this module free of an eager audio→game cycle.
export function bindControls(sheepBeep) {
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
