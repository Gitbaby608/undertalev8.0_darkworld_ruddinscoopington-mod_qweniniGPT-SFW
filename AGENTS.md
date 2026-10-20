# AGENTS.md — Rainbow Rumble (index.html)

Dense working notes for any agent touching this repo. Read fully before editing. Verify against the actual files; do not trust memory or prior summaries.

## Repo layout
- `index.html` — the ENTIRE game (~665 lines, one IIFE `<script>`). This is the product; GitHub Pages deploys the repo root verbatim (`.github/workflows` = checkout → upload-pages-artifact path `.` → deploy-pages on push to main). No build step.
- `p2.html`, `pen.html` — legacy/prototype pages, unrelated to the crash history. Don't "fix" them unless asked.
- `smoke.test.js` — permanent jsdom harness: boots the page script with mocked 2D/WebGL contexts, pumps rAF frames, drives FIGHT→strike→boss-turn→dodge, forces a simulated GL driver error mid-fight and asserts nothing escapes and WebGL keeps rendering (NO fallback exists any more, so the assertion is "pipeline resumes", not "fell back"). Run: `node smoke.test.js`. Exit 0 + `errors: 0` = pass. Honours `GAME_HTML=<path>` env to test other revisions.
- `zoomtest.tmp.js` — temporary-but-current verification of the crazy-zoom rewrite (kept until user says drop it): asserts crazy zoom fires with particles and zero uncaught errors, every uniform reaching the GPU is finite, `zm∈[1,1.6]`, `rt∈[0,π]`, beep-button punch survives, context-loss pauses and context-restored rebuilds (`builds` counter increases). Also honours `GAME_HTML=`. NOTE: `.gitignore` has `*.tmp` but NOT `*.tmp.js` — this file is tracked/staged; rename or gitignore it if that becomes a problem.
- `package.json` — only dependency is `jsdom` (dev-only, used by the tests). `node_modules/` present locally.

## Architecture of index.html (top → bottom, single script)
1. CSS/HTML shell: retro-PU font, HUD bars, `#c` (scene canvas, `display:none`, fixed 800×460 backing store), `#gl` (visible FX canvas), log/ticker/buttons/overlay.
2. Game state machine: `state ∈ menu|battle|attack|dodge|over`. Undertale-style: FIGHT → timing bar (`drawAtk`/`strike`) → `hurtBoss` → `enemyTurn` → `attackPattern` (4 bullet patterns) → dodge with WASD. Mercy≥100 or boss HP 0 ends game.
3. Sprites: everything baked ONCE into offscreen canvases via `mkSpr` at `DPR`/`TXR`/`BGR` supersample scales (`SPR{}`, `emojiSprite`, `txtSpr`). Frame = ~20 `drawImage`s. NEVER reintroduce per-frame `shadowBlur`/gradients/text rasterisation in `draw()` — that was the original 30fps cause.
4. NPCs: `NPCS[]` run `ACTS[]` "bits" (scooter, slots, parcel…) each writing `o.vx/o.vy` velocity used by the motion-blur pass. `updNpc` lerps toward target.
5. Particles: fixed pool, hard cap 130, swap-remove cull, drawn as ONE batched line-path per colour bucket in `draw()`. `burst(px,py,n,col)` capped at n≤9. Loop vars here are `i/p/q/col` — see Failure Log #1 before touching this block.
6. Zoom trigger: `zoomFx(s)` sets `fx=1, fxS=s` (s=1 "crazy" big punch+rotation, s=0 gentle). Fired by: `hurtBoss(1)`, `hurtHero(0)`, turn%2 news event (crazy), `sheepBeep`(gentle). `end()` zeroes `fx` so no zoom can fire under the game-over overlay.
7. WebGL post-FX pipeline (lines ~487–660, inside `buildFX()` so a lost context can be rebuilt): 4 tiny programs sharing one vertex shader — PM (temporal shutter ping-pong), PB (5-tap shadow), PD (SDF drop-shadow quad), PG (glass card). Scene canvas S unit 0, ping-pong T[0]/T[1] units 1/2, phase `ph`.

## WebGL rules (hard-won; violating these caused the crashes)
- **One texture sample per fragment, constant loop bounds.** WebGL1 compilers accept dynamic-loop-sample programs at LINK time then fail at DRAW time ("invalid operation") on many drivers. The old single program with an `m` mode switch + sampled loop was the original crash. Four static programs instead. Do not merge them or add loops.
- **Every uniform passes through `fin()`** (NaN/Infinity→0) and every effect input is hard-clamped BEFORE math: `fx∈[0,1]` ⇒ `zmv∈[1,1.6]`, `rtv∈[0,π]`, pointer tilt clamped ±0.5 and smoothed. The vertex shader divides the quad by `zm`, so `zm≥1` is load-bearing — never allow `zm<1` or unclamped `fx`.
- **No 2D fallback. Deliberately.** User explicitly rejected fallback paths ("make the main feature good"). Reliability model: correct-by-construction math + startup capability checks + pause-and-rebuild on context loss. If you feel the urge to add a try/catch→2D-canvas retreat, DON'T. A startup check that disables only FX programs, or an FBO-incomplete check that skips only the smear passes (same pipeline, same shaders), is acceptable; a second renderer is not.
- Context loss: `webglcontextlost` → `preventDefault()` + `glF=()=>{}` (pause); `webglcontextrestored` → `buildFX()` recreates everything. Persistent JS-side state (mx/my/tilt/fx) lives OUTSIDE `buildFX` so it survives rebuilds. All GL objects are invalid after loss — never cache handles across it.
- Scene transport (current): allocate S once (800×460), seed frame 0 from `#c` via `texImage2D`, then update per frame with `gl.copyTexSubImage2D` from the default framebuffer (requires `preserveDrawingBuffer:true` — that's why the context is requested with it first, then without, then `experimental-webgl`). Per-frame `texImage2D(canvas)` CPU readback was driver-churn #1.
- Canvas sizing: scene canvas is FIXED 800×460 regardless of DPR; CSS upscales. Never size it to `clientWidth*DPR` again (that upload bandwidth killed fps).

## Known-good behaviour to preserve
- Beep button works even when muted (visual hop + gentle punch); speech-synth fallback wrapped in try/catch.
- `loop()` order: update → shake transform → draw scene to `#c` → `glF()` → rAF. `dt` clamped ≤40ms.
- Tests pump frames manually (jsdom has no real rAF); anything depending on `requestAnimationFrame` recursion must tolerate synchronous pumping.

## Verification workflow (always both, after ANY edit)
```
node smoke.test.js        # expect: errors: 0 … GL rendering resumed: YES (no fallback)
node zoomtest.tmp.js      # expect: TEST1..TEST8 all PASS
```
Regression-check old revisions cheaply: `git show HEAD:index.html > /tmp/old.html && GAME_HTML=/tmp/old.html node zoomtest.tmp.js` (the current harness FAILS loudly on the old file — non-finite uniforms — which is exactly what proves the fix is real).

## Failure & dead-end log (failed attempts — learn from these)
1. **Particle ReferenceError crash (original "crazy blur" crash).** In the batched particle draw, a later edit renamed the inner loop var to `s`, colliding with outer `const s`/shadowing pattern → `ReferenceError` thrown ONLY when a burst existed during a zoom frame = "crashes whenever crazy 3D happens". Fixed by renaming (`q`,`col`). Lesson: this file uses 1-char names everywhere (`x,c,t,s,S,T,F,f,k,o,r,v,w,q,e`); before renaming/editing loops, grep the enclosing scope for the identifier. `spr()` specifically had `const S2=SPR[id]` because bare `s`/`S` were taken.
2. **Single-program dynamic-sample-loop shader** — links fine, INVALID_OPERATION at draw on strict drivers, black screen. Replaced by 4 static programs. Never regress.
3. **"Add try/catch → fall back to 2D canvas"** (commit 4b34ab2) — masked bugs, doubled code, the fallback itself broke. User vetoed fallbacks; removed. Recovery = pause+rebuild only.
4. **Over-strong zoom params** (peak 2.5×, fast spin) — triggered real GPU/compositor timeouts on weak hardware. Capped analytically at 1.6× / π rad. Don't raise without re-running zoomtest.
5. **Per-frame `texImage2D(#c)` upload** — massive driver churn precisely during heavy frames (zoom+particles) = correlated crashes. Now: alloc-once + `copyTexSubImage2D` + `preserveDrawingBuffer:true` context.
6. **Test-harness false alarms (this session):** `zoomtest.tmp.js` threw `ReferenceError: draws is not defined` (mock used `draws++` without declaring it) and reported zm/rt ranges as `Infinity..-Infinity` when `uLog` was cleared AFTER the peak frame (fx decays .06/frame; clear before the strike keydown, not after). Also mocks must return `{}` from `createTexture` (game tags `S.__alloc` on the handle object) and provide `copyTexSubImage2D` + numeric GL enums via the Proxy. A failing TEST line here ≠ game bug; check the harness first, then the game.
7. **Previous agent turn claimed "created AGENTS.md" without creating it** — always `ls`/verify artifacts exist before reporting them done.
8. **Backdrop-filter/perspective CSS on `#game`** forced whole-page GPU re-composite per frame; removed, tilt lives in the shader. Don't re-add glass CSS over animating content.
9. **GC spikes from per-frame allocations** (particle arrays via `filter()`, fresh gradient objects) — pool + swap-remove + baked sprites. Keep `draw()` allocation-free.

## Style conventions
Minified-ish dense JS, no semicolon-less lines mixing, comments explain WHY (perf/crash history) not WHAT. Emoji UI strings. Keep edits surgical; the file has one giant IIFE — a stray brace kills everything silently (jsdom eval error is your canary: `node smoke.test.js` prints `SCRIPT EVAL ERROR`).
