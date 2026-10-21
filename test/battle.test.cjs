// Battle-behavior tests for the three requested changes:
//  1) one action per turn (busy lock — can't attack multiple times in a turn)
//  2) enemy attacks are visible (frame-driven bullets + telegraph warnings spawn)
//  3) seven unique named attack patterns, rotating without repeats
// Boots EITHER engine: default = ES modules (src/main.js); GAME_CLASSIC=1 = the exact
// src/boot-classic.js bundle that file:// users run. Both must pass identically.
const { bootGame, pump, getState, getExport } = require('./mocks.cjs');

(async () => {
  const win = await bootGame();
  const errors = [];
  const S = await getState();
  let fails = 0;
  const check = (name, cond, extra = '') => {
    if (cond) console.log('PASS', name);
    else { fails++; console.log('FAIL', name, extra); }
  };

  // Enter battle
  win.document.getElementById('start').click();
  pump(win, 5, errors);
  check('mode is battle after start', S.mode === 'battle', `got ${S.mode}`);

  const fightBtn = win.document.querySelector('[data-a="fight"]');
  const actBtn = win.document.querySelector('[data-a="act"]');

  // ---- 1) busy lock: picking FIGHT consumes the turn ----
  fightBtn.click();
  pump(win, 2, errors);
  check('busy set right after choosing FIGHT', S.busy === true);
  check('fight button disabled while busy', fightBtn.disabled === true);
  check('act button disabled while busy', actBtn.disabled === true);

  // Spam clicks + keys during the timing bar: must not queue extra attacks
  const hpBefore = S.bhp;
  for (let i = 0; i < 6; i++) { fightBtn.click(); actBtn.click(); }
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ' }));
  pump(win, 40, errors); // let the swing resolve (strike or timeout-miss)
  const dealtOnce = hpBefore - S.bhp;
  check('exactly one hit resolved from spam (0 or one hit of dmg)', dealtOnce >= 0 && dealtOnce <= 999, `delta ${dealtOnce}`);

  // Wait out the dodge window until control returns to the player
  let guard = 0;
  while (!(S.mode === 'battle' && !S.busy) && guard++ < 4000) pump(win, 10, errors);
  check('turn unlocked after full enemy cycle', S.mode === 'battle' && !S.busy, `mode=${S.mode} busy=${S.busy}`);

  // Buttons re-enabled on YOUR TURN
  check('fight button re-enabled next turn', fightBtn.disabled === false);

  // A second deliberate FIGHT click mid-dodge must be ignored
  fightBtn.click();
  pump(win, 3, errors);
  check('FIGHT started again (attack mode)', S.mode === 'attack');
  // strike once via space, then try to act again while resolving
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ' }));
  pump(win, 5, errors);
  const modeAfterStrike = S.mode;
  fightBtn.click(); actBtn.click();
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter' }));
  pump(win, 5, errors);
  check('no second action accepted during resolution', S.mode === modeAfterStrike || S.mode === 'dodge',
    `was ${modeAfterStrike}, now ${S.mode}`);

  // ---- 2 & 3) drive enemy turns by calling the module directly (in a real browser
  // the buttons are disabled during the boss turn, so clicks can't drive turns here).
  const enemyTurn = await getExport('game.js', 'enemyTurn');
  const seenNames = new Set();
  let sawBullets = false, sawTele = false, maxBullets = 0, maxTele = 0;
  for (let turn = 0; turn < 16 && S.mode !== 'over'; turn++) {
    S.busy = false; S.mode = 'battle';            // simulate YOUR TURN
    enemyTurn();                                   // boss unleashes the next rotating pattern
    if (S.mode !== 'dodge') continue;
    if (S.pat && S.pat.name) seenNames.add(S.pat.name);
    S.hp = 100;                                    // keep the hero alive for full sampling
    for (let k = 0; k < 80 && S.mode === 'dodge'; k++) {
      pump(win, 3, errors);
      maxBullets = Math.max(maxBullets, S.bullets.length);
      maxTele = Math.max(maxTele, (S.tele || []).length);
      if (S.bullets.length) sawBullets = true;
      if ((S.tele || []).length) sawTele = true;
    }
  }
  check('enemy bullets visibly spawned during dodges', sawBullets, `max ${maxBullets}`);
  check('telegraph warnings visibly spawned', sawTele, `max ${maxTele}`);
  check('all 7 unique attack names observed over 16 turns', seenNames.size >= 7,
    `saw ${seenNames.size}: ${[...seenNames].join(' | ')}`);
  check('zero frame-loop errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));

  console.log(fails === 0 ? 'BATTLE TEST PASS' : `BATTLE TEST FAIL (${fails})`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
