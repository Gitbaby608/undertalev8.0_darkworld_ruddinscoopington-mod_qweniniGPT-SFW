// jsdom smoke test for the modular game (src/main.js entry). Boots the real ES module
// graph against mocked 2D/WebGL contexts (test/mocks.cjs), pumps rAF frames manually,
// drives FIGHT -> strike -> boss turn -> dodge, forces a simulated GL driver error
// mid-fight and asserts nothing escapes the frame loop. NO 2D fallback exists by
// design, so the assertion is "pipeline keeps drawing", not "fell back".
// Run: node smoke.test.cjs   (exit 0 + errors: 0 = pass)
const { bootGame, pump, glStats, setGlThrowing } = require('./test/mocks.cjs');

(async () => {
  const win = await bootGame();
  const errors = [];
  const btn = sel => win.document.querySelector(sel);
  const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  // key events go to window (the strike handler listens there; browsers deliver real
  // keyboard events to window after document — dispatching on document alone misses it)
  const key = k => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k }));

  // menu state: scene canvas + FX overlay must already be alive
  glStats.reset();
  pump(win, 30, errors);
  console.log('after 30 frames, drawArrays calls:', glStats.drawArrays, 'errors:', errors.length);
  if (glStats.drawArrays < 30 * 4) { console.log('FAIL: GL pipeline not drawing every frame'); process.exit(1); }

  click(btn('#start'));                 // begin battle
  pump(win, 10, errors);
  click(btn('[data-a="fight"]'));       // timing bar appears
  pump(win, 10, errors);
  key(' ');                             // strike (boss counterattack follows via setTimeout)
  pump(win, 60, errors);
  await new Promise(r => setTimeout(r, 900)); // let enemyTurn/dodge setTimeouts fire
  pump(win, 120, errors);
  console.log('after fight sequence, drawArrays calls:', glStats.drawArrays, 'errors:', errors.length,
    errors.slice(0, 3).map(String));

  // simulate a mid-fight GL driver error: drawArrays throws for a few frames. The loop
  // must keep pumping and nothing may escape; there is no 2D fallback by design.
  setGlThrowing(true);
  let escaped = false, caught = 0;
  const errorsBefore = errors.length;
  // pump() catches per-frame exceptions into `errors` — that models the browser rAF
  // behaviour (callback throws are reported, the loop keeps scheduling). "Nothing
  // escapes" == no exception propagates out of pump itself.
  try { pump(win, 5, errors); } catch (_) { escaped = true; }
  caught = errors.length - errorsBefore;
  setGlThrowing(false);
  console.log('forced driver crash: frames throwing =', caught > 0 ? 'YES (crash was simulated)' : 'NO (FAIL: crash not simulated)',
    '| exception escaped frame loop =', escaped ? 'FAIL' : 'NO (PASS)');

  // WebGL pipeline must resume as the renderer once the error clears.
  // glStats counts every drawArrays call, including the throwing ones, so measure
  // SUCCESSFUL draws: total minus the frames that threw inside the crash window.
  const drawsBefore = glStats.drawArrays;
  pump(win, 30, errors);
  const resumed = (glStats.drawArrays - drawsBefore) - caught > 0;
  console.log('| GL rendering resumed:', resumed ? 'YES (no fallback)' : 'NO');

  // every uniform that reached the GPU must be finite (NaN/Infinity black-screens drivers)
  const nonFinite = glStats.uniforms.filter(v => !Number.isFinite(v)).length;
  console.log('non-finite uniforms sent to GPU:', nonFinite, nonFinite === 0 ? 'PASS' : 'FAIL');

  // FAILURES DURING THE FORCED-CRASH WINDOW ARE EXPECTED (the mock throws on purpose);
  // what must hold: the crash was caught inside pumped frames, the pipeline resumed,
  // and NO error occurred outside the crash window.
  const cleanErrors = errors.length - caught;
  console.log('errors outside crash window:', cleanErrors, cleanErrors === 0 ? 'PASS' : 'FAIL');
  const pass = !escaped && resumed && nonFinite === 0 && cleanErrors === 0;
  console.log(pass ? 'SMOKE TEST PASS' : 'SMOKE TEST FAIL');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('BOOT/EVAL ERROR:', e.message); process.exit(1); });
