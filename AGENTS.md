# AGENTS.md — Rainbow Rumble

Working notes for agents editing this repo. Verify against the actual files; do not trust memory or prior summaries.

## What this is
A browser game served as a **static site** (GitHub Pages deploys the repo root verbatim via `.github/workflows/pages.yml`; no build step). Audio comes only from remote URLs in `src/data.js`. There are no local-file features (no file pickers, no IndexedDB) — don't add any.

## Layout
```
index.html        thin DOM shell (HUD, canvases #c/#gl, log, buttons, overlay)
css/style.css     all styles
src/main.js       entry: frame loop + wiring (~30 lines)
src/state.js      S — central mutable state object shared by all modules (mutate in place)
src/util.js       W/H canvas size consts, $, pick, rand, clamp
src/data.js       static data: NPCS dialogue, NEWS ticker, END_LINES, BGM_SRC/SHEEP_SRC URLs
src/fx.js         zoomFx(s) — sets S.fx/S.fxS (decays inside glfx)
src/audio.js      WebAudio SFX/tone(), remote bgm/sheep HTMLAudio, sheepBeep(), log()
src/sprites.js    mkSpr() bakes every visual ONCE into offscreen canvases → SPR{}
src/particles.js  fixed-cap pool (130), swap-remove cull, burst(px,py,n,col) n≤9
src/npc.js        NPC runtime instances + ACTS "bits"; updNpc(); exports NPCS (instances)
src/game.js       battle logic: mode machine, hero/boss, update/updateUI/bindControls/strike/act/end
src/draw.js       scene renderer: draws baked sprites to visible #c; owns c/x, spr(), BR/BRV
src/mask.js       character-only alpha mask canvas MC + CHARQ; composeMsk() called by draw()
src/glfx.js       WebGL post-FX overlay on #gl; renderFX() called once per frame by main
test/mocks.cjs    jsdom boot harness: mock 2D/GL/Audio, manual rAF pump, glStats recorder
smoke.test.cjs    the test (see Verification)
```
`data.NPCS` = dialogue strings; `npc.NPCS` = live sprite instances. Same name, different things.

## Module rules
- ES modules, `<script type="module" src="src/main.js">`. No bundler.
- Shared state lives in `state.js`'s `S`; import and mutate it — never copy fields.
- Circular-import avoidance pattern: `npc.js` needs `draw.js`'s `spr()` but draw imports npc; solved with `bindSpr(fn)` called from `draw.js` at module init. Use the same injection trick if you hit a new cycle.
- Cross-module frame data: `draw.js` writes `BR`/`BRV` (fastest-mover position/velocity) each frame; `glfx.js` reads them for the motion-shutter vector. `draw()` calls `composeMsk()` so GL masks match the frame.

## Frame loop (main.js)
Per frame: **rAF re-register first**, then `update(dt)` → shake transform → `draw()` to `#c` → `renderFX()`. `dt` clamped ≤40ms. The early `requestAnimationFrame(loop)` is load-bearing: if any stage throws (e.g. GL driver error), the loop keeps pumping instead of dying silently. Do not move it back to the bottom.

## Rendering architecture (two canvases)
1. `#c` — 2D scene, FIXED 800×460 regardless of DPR (CSS upscales; never size it to `clientWidth*DPR`, upload bandwidth killed fps). Visible always — GL composites additively over it; hiding it = frozen first frame.
2. `#gl` — WebGL FX overlay. Per frame uploads `#c`→texture S (unit 0) and `MC`→mask M (unit 3); ping-pong shutter pair T[0]/T[1] (units 1/2). Four static programs sharing one vertex shader: PM temporal shutter, PB soft-light bloom, PD warm glow, PG frost. All passes alpha-weighted by M → effects touch characters ONLY.

## WebGL rules (violating these caused past crashes)
- **One texture sample per fragment, constant loop bounds.** A single program with a dynamic-loop sample linked fine but drew INVALID_OPERATION ("invalid operation") on many drivers. Four static programs is deliberate — do not merge them or add sampling loops.
- Every uniform passes through `fin()` (NaN/Infinity→0); effect inputs hard-clamped before math: `fx∈[0,1]` ⇒ `zmv∈[1,1.6]`, `rtv∈[0,π]`, tilt ±0.5. The vertex shader divides the quad by `zm`, so `zm≥1` is load-bearing.
- Zoom params capped at 1.6×/π after real GPU timeouts on weak hardware (peak 2.5× was the cause). Don't raise without re-testing.
- **No 2D fallback. Deliberately.** User vetoed fallback paths. Recovery model: startup capability checks (failed program build disables FX only; FBO-incomplete skips smear passes), context-loss pause (`webglcontextlost` → `glF=()=>{}`), rebuild on restore (`buildFX()` recreates all GL objects; persistent JS state lives outside it). Never cache GL handles across a loss, never add a try/catch→2D retreat.
- Scene transport is per-frame `texImage2D` uploads. The old `copyTexSubImage2D`-from-backbuffer trick returned frame 0 forever (frozen game) — don't resurrect it. No `preserveDrawingBuffer`.

## Performance rules
- Sprites baked once via `mkSpr` (supersampled); a frame is ~20 `drawImage`s. NEVER reintroduce per-frame `shadowBlur`/gradients/text rasterisation in `draw()`, and keep `draw()` allocation-free (no `filter()` arrays, no fresh gradient objects — GC spikes were a real fps killer).
- Particles: pool + swap-remove, drawn as ONE batched line-path per colour bucket. Loop vars in that block are `i/p/q/col` — short names collide easily in this codebase; grep the enclosing scope before renaming anything (`spr()` uses `S2` because bare `s`/`S` were taken; a shadowing bug there caused "crashes whenever crazy 3D happens").

## Known-good behaviour to preserve
- Beep button works even when muted (visual hop + gentle punch); speech-synth fallback wrapped in try/catch.
- Sound starts only after a user gesture (autoplay policy) — `audioStart()`.
- `end()` zeroes `S.fx` so no zoom fires under the game-over overlay.
- Undertale-style flow: FIGHT timing bar → `strike` → `hurtBoss` → `enemyTurn` → 4 bullet patterns → WASD dodge. Mercy≥100 or boss HP 0 ends the game.

## Verification (run after ANY edit)
```
npm test          # == node smoke.test.cjs; expect "SMOKE TEST PASS", exit 0
```
Boots the real ESM graph in jsdom with mocked contexts, pumps rAF manually, drives FIGHT→strike→boss-turn→dodge, forces a simulated GL driver crash mid-fight, asserts: loop survives + resumes drawing, zero non-finite uniforms, zero errors outside the crash window. Honours `GAME_HTML=<path>` to test other page revisions.
- Tests pump frames synchronously — anything depending on rAF recursion must tolerate that.
- A failing assertion here ≠ game bug; check `test/mocks.cjs` first (mocks must return `{}` from `createTexture`, since the game tags handles).
- Quick syntax gate: `node --check src/*.js`.

## Style conventions
Dense, terse JS. Comments state WHY (perf/crash history) in one line max, never play-by-play WHAT. Emoji UI strings. Keep edits surgical; each module has one job.
