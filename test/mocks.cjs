// Shared jsdom mocks: no-op 2D contexts, a recording WebGL context, stub Audio.
// glStats records per-frame GL activity so tests can assert the pipeline is alive.
const { JSDOM } = require('jsdom');

const glStats = { useProgram: 0, drawArrays: 0, texImage2DCanvas: 0, uniforms: [], reset() { this.useProgram = 0; this.drawArrays = 0; this.texImage2DCanvas = 0; this.uniforms.length = 0; } };
let glThrowing = false; // simulate a driver crash inside drawArrays

function mk2d() {
  const noop = () => {};
  return {
    canvas: null, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    lineCap: 'butt', textAlign: 'start', textBaseline: 'alphabetic', font: '',
    setTransform: noop, transform: noop, scale: noop, translate: noop, rotate: noop,
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, arcTo: noop, rect: noop, fill: noop, stroke: noop, fillRect: noop, clearRect: noop,
    strokeRect: noop, fillText: noop, measureText: () => ({ width: 10 }), drawImage: noop,
    ellipse: noop, quadraticCurveTo: noop, bezierCurveTo: noop, setLineDash: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: noop,
  };
}

function mkGL() {
  const noop = () => {};
  const ctx = {
    createShader: () => ({}), shaderSource: noop, compileShader: noop,
    getShaderParameter: () => true, getShaderInfoLog: () => '',
    createProgram: () => ({}), attachShader: noop, linkProgram: noop,
    getProgramParameter: () => true, getProgramInfoLog: () => '',
    useProgram: () => { glStats.useProgram++; },
    getUniformLocation: (p, n) => ({ name: n }), getAttribLocation: () => 0,
    enableVertexAttribArray: noop, bindBuffer: noop, bufferData: noop, viewport: noop,
    disable: noop, enable: noop, blendFunc: noop, activeTexture: noop, bindTexture: noop,
    bindFramebuffer: noop, createTexture: () => ({}), texParameteri: noop,
    texImage2D: (a, b, c, d, e, f, g, h, src) => { if (src && typeof src === 'object' && 'width' in src) glStats.texImage2DCanvas++; },
    framebufferTexture2D: noop, createFramebuffer: () => ({}), createBuffer: () => ({}),
    vertexAttribPointer: noop, pixelStorei: noop,
    uniform1f: (loc, v) => glStats.uniforms.push(v),
    uniform2f: (loc, a, b) => { glStats.uniforms.push(a, b); },
    uniform1i: noop,
    checkFramebufferStatus: () => 36053 /* FRAMEBUFFER_COMPLETE */,
    isContextLost: () => false,
    drawArrays: () => { glStats.drawArrays++; if (glThrowing) throw new Error('simulated driver crash'); },
    getError: () => 0,
  };
  // Unknown numeric GL enums resolve to 1 via Proxy (game reads e.g. gl.TEXTURE0+u).
  return new Proxy(ctx, { get(t, k) { if (k in t) return t[k]; if (k === 'FRAMEBUFFER_COMPLETE') return 36053; return 1; } });
}

// Boot the game against the mocks above. jsdom does not execute <script type=module>,
// so instead: build a DOM from index.html's body markup, keep jsdom's window/document
// as LIVE globals for the whole session (rAF callbacks fire later and still need them),
// and boot the engine either as a REAL Node ESM graph (src/main.js; relative imports
// resolve exactly like in a browser) or by evaluating src/boot-classic.js — the exact
// classic bundle file:// users get — when GAME_CLASSIC=1 is set. One boot per process:
// the module graph shares state via S. Honours GAME_HTML=<path> for other page revisions.
let bootedWin = null;
async function bootGame(opts = {}) {
  if (bootedWin) return bootedWin; // singleton: ES modules can't be re-instantiated
  const fs = require('fs');
  const html = fs.readFileSync(process.env.GAME_HTML || 'index.html', 'utf8');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
    .replace(/<link[^>]*>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body>' + body + '</body></html>', {
    url: 'file://' + process.cwd() + '/index.html',
    pretendToBeVisual: false,
    ...(opts.windowOptions ? { windowOptions: opts.windowOptions } : {}),
  });
  const win = dom.window;
  win.HTMLCanvasElement.prototype.getContext = function (kind) {
    if (kind === '2d') { const c = mk2d(); c.canvas = this; return c; }
    if (kind === 'webgl' || kind === 'experimental-webgl') { this.__gl = mkGL(); return this.__gl; }
    return null;
  };
  win.Audio = function () {
    const a = { play: () => Promise.resolve(), pause: () => {}, volume: 1, muted: false, currentTime: 0 };
    Object.defineProperty(a, 'src', { set() { setTimeout(() => a.oncanplaythrough && a.oncanplaythrough(), 0); } });
    return a;
  };
  win.SpeechSynthesisUtterance = function () {};
  win.speechSynthesis = { cancel: () => {}, speak: () => {} };
  win.requestAnimationFrame = cb => { win.__rafCbs.push(cb); return win.__rafCbs.length; };
  win.__rafCbs = [];
  // jsdom lacks ResizeObserver: the margin fitter's content-change watcher would be
  // a no-op. Provide a minimal stub that records callbacks so tests can trigger them.
  win.ResizeObserver = function (cb) { this.__cb = cb; this.observe = () => {}; this.disconnect = () => {}; };
  // jsdom has no layout: offsetWidth/offsetHeight are always 0, so the margin fitter's
  // measurement guard would never see a real value. Emulate a simple layout model so
  // tests can verify the fitter actually writes --fit and clamps it to the viewport:
  // width = 800*fit; height = content height at that scale (base 796), GROWN by an
  // extra strip when the box gets narrow enough for the HUD/button rows to wrap —
  // mirroring the real flex-wrap behaviour the fitter's refinement passes handle.
  // The strip scales with font-size (∝fit) but not directly with fit, so repeated
  // refinement measurably converges instead of oscillating.
  Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', { get() {
    if (this.id === 'game') return 800 * fitOf(this); return 0; } });
  Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { get() {
    if (this.id !== 'game') return 0;
    const f = fitOf(this), w = 800 * f;
    let h = 796 * f;
    if (w < 720) h += Math.min(120, 720 - w) * .25 * f; // wrapped-rows allowance
    return h; } });
  function fitOf(el) {
    const v = parseFloat(el.style.getPropertyValue('--fit'));
    if (Number.isFinite(v) && v > 0) return v;
    // No --fit written yet: mirror index.html's pure-CSS clamp guess so the emulated
    // layout reflects what the browser would lay out BEFORE the JS fitter refines it:
    //   min(1, min(100vw - 34px, 100vh - 34px) / 800px) * .82
    // (viewport via innerWidth/innerHeight minus the same chrome bar as clientHeight).
    const vw = win.innerWidth, vh = win.innerHeight - 15;
    return Math.min(1, Math.min(Math.min(vw, vh) - 34, vw - 34) / 800) * .82;
  }
  // jsdom's documentElement.clientHeight is always 0; emulate the SMALL viewport
  // height (innerHeight minus a browser chrome bar) so the fitter's vh clamp binds:
  // fitGame() takes min(innerHeight, visualViewport.height, clientHeight). In a real
  // mobile browser visualViewport ≤ innerHeight, but it does NOT subtract the desktop
  // chrome bar — keeping it at innerHeight here mirrors that and leaves clientHeight
  // (753 at 1024×768) as the deciding axis. width/height are LIVE getters so a test
  // that resizes the window mid-run sees the clamp react too.
  Object.defineProperty(win.Element.prototype, 'clientHeight', { get() { return win.innerHeight - 15; } });
  Object.defineProperty(win, 'visualViewport', { configurable: true, value: {
    get height() { return win.innerHeight; }, get width() { return win.innerWidth; } } });
  // deterministic frame clock: pump() drives it manually via the rAF queue above
  win.performance.now = () => win.__now || (win.__now = 1000);

  const g = globalThis;
  // Only browser globals the modules actually reference. Never shadow Node's
  // setTimeout etc. — jsdom's window timers recurse infinitely when rebound to globals.
  // innerWidth/innerHeight are bound as LIVE GETTERS (not frozen values): fitGame()
  // reads them as bare globals, and tests that resize win.innerWidth after boot must
  // see the fitter react on the next pumped frame.
  for (const k of ['window', 'document', 'navigator', 'location', 'Audio',
    'SpeechSynthesisUtterance', 'speechSynthesis', 'requestAnimationFrame', 'devicePixelRatio',
    'addEventListener', 'removeEventListener']) {
    if (k in win) Object.defineProperty(g, k, { value: win[k], writable: true, configurable: true });
  }
  for (const k of ['innerWidth', 'innerHeight']) {
    Object.defineProperty(g, k, { get: () => win[k], configurable: true });
  }
  if (process.env.GAME_CLASSIC) {
    // Evaluate the exact classic bundle a file:// browser would run. It's an IIFE that
    // only touches window/document globals — no exports needed by the test harness.
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'boot-classic.js'), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
  } else {
    await import('../src/main.js');
  }
  bootedWin = win;
  return win;
}

// Read live game state. ESM boot: import src/state.js. Classic boot: the bundle is an
// IIFE with no exports, so re-read the source to find its module block and evaluate just
// that block (it only references already-live globals + S itself), which returns S.
async function getState() {
  if (!process.env.GAME_CLASSIC) return (await import('../src/state.js')).S;
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'boot-classic.js'), 'utf8');
  const marker = '// ==================== src/state.js ====================';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('state block not found in boot-classic.js');
  const open = src.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  const block = src.slice(open, i + 1) + '\nreturn S$state;';
  return (0, eval)(block);
}

// Read another exported binding from a classic-boot block (same trick as getState).
async function getExport(file, name) {
  if (!process.env.GAME_CLASSIC) {
    const mod = await import('../src/' + file);
    return mod[name];
  }
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'boot-classic.js'), 'utf8');
  const marker = `// ==================== src/${file} ====================`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('block not found: ' + file);
  const open = src.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  const renamed = /[A-Za-z_$][\w$]*\$/.test(name) ? name : name + '$' + file.replace(/\.js$/, '');
  const block = src.slice(open, i + 1) + `\nreturn (typeof ${renamed} !== 'undefined') ? ${renamed} : (typeof ${name} !== 'undefined' ? ${name} : undefined);`;
  return (0, eval)(block);
}

// Synchronously pump n animation frames; collects exceptions thrown by callbacks.
// Advances the mock frame clock 16.7ms per pumped frame so game logic sees real dt.
function pump(win, n, errors) {
  for (let i = 0; i < n; i++) {
    win.__now = (win.__now || 1000) + 16.7;
    const cbs = win.__rafCbs; win.__rafCbs = [];
    for (const cb of cbs) { try { cb(win.__now); } catch (e) { errors.push(e); } }
  }
}

module.exports = { bootGame, pump, glStats, setGlThrowing: v => { glThrowing = v; }, getState, getExport };
