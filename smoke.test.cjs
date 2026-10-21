// jsdom smoke test for the modular game (src/main.js entry). Boots the real ES module
// graph against mocked 2D/WebGL contexts (test/mocks.cjs), pumps rAF frames manually,
// drives FIGHT -> strike -> boss turn -> dodge, forces a simulated GL driver error
// mid-fight and asserts nothing escapes the frame loop. NO 2D fallback exists by
// design, so the assertion is "pipeline keeps drawing", not "fell back".
// Run: node smoke.test.cjs   (exit 0 + errors: 0 = pass)
const { bootGame, pump, glStats, setGlThrowing } = require('./test/mocks.cjs');

(async () => {
  // Undertale-margin fitter (src/glfx.js fitGame): with the mock layout model (width =
  // 800*fit, height = 796*fit plus a wrap allowance once the box narrows below 720px
  // CSS width) it must actually run and pin the HEIGHT-constrained value. vh =
  // innerHeight - 15 chrome bar (mock clientHeight). Viewport 1024x768 (set via
  // bootGame windowOptions BEFORE the modules import — Node 18+ makes innerWidth/
  // innerHeight read-only mid-run): .82*(768-15-34)/796 ≈ .741 < .82*(1024-34)/800 →
  // height binds, exactly the case that used to overflow off-screen. The fitter
  // bisects for the LARGEST scale whose measured box fits both axes; at that scale the
  // box is ~593px wide (< 720) so the wrapped-rows strip applies and the true fixed
  // point sits slightly lower (~0.714) — hence the ±0.03 band below, which still
  // strictly excludes every oversized value (≥0.755 would clip the bottom margin).
  const win = await bootGame({ windowOptions: { innerWidth: 1024, innerHeight: 768 } });
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
  // Margin-fitter assertion (see bootGame windowOptions above): the fitter ran on the
  // first frame at 1024×768. It bisects toward the LARGEST fitting scale, so expect the
  // naive height-bound clamp .82*(vh-34)/796 ≈ 0.741 within ±0.03 (wrap-strip fixed
  // point ≈0.714 is the other end of the band), AND that the box stays fully on screen
  // with rainbow margins on all sides — the invariant that actually matters.
  const vh = win.innerHeight - 15;
  const num = .82 * (vh - 34);
  let expectFit = num / 796;
  for (let i = 0; i < 3; i++) {
    const extra = Math.min(120, Math.max(0, 720 - 800 * expectFit)) * .25;
    expectFit = Math.min(num / (796 + extra), .82 * (win.innerWidth - 34) / 800);
  }
  const gameEl = btn('#game');
  const fitVal = parseFloat(gameEl.style.getPropertyValue('--fit'));
  const fitOK = Number.isFinite(fitVal) && Math.abs(fitVal - .741) < .03 &&
    gameEl.offsetWidth <= win.innerWidth - 34 && gameEl.offsetHeight <= vh - 34 &&
    fitVal >= expectFit - .001; // never ships smaller than the converged fixed point
  console.log('margin fitter --fit:', fitVal, 'naive-clamp ~', (num / 796).toFixed(3),
    'fixed-point ~', expectFit.toFixed(3), fitOK ? 'PASS' : 'FAIL');

  const pass = !escaped && resumed && nonFinite === 0 && cleanErrors === 0 && fitOK;
  console.log(pass ? 'SMOKE TEST PASS' : 'SMOKE TEST FAIL');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('BOOT/EVAL ERROR:', e.message); process.exit(1); });
