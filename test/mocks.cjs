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
// and import src/main.js as a REAL Node ESM graph — relative imports resolve exactly
// like in a browser. One boot per process: the module graph shares state via S.
// Honours GAME_HTML=<path> to test other revisions of the page.
let bootedWin = null;
async function bootGame() {
  if (bootedWin) return bootedWin; // singleton: ES modules can't be re-instantiated
  const fs = require('fs');
  const html = fs.readFileSync(process.env.GAME_HTML || 'index.html', 'utf8');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
    .replace(/<link[^>]*>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body>' + body + '</body></html>', {
    url: 'file://' + process.cwd() + '/index.html',
    pretendToBeVisual: false,
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
  // width = 800*fit, height = max(796, 660)*fit (matches #game's CSS).
  Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', { get() {
    if (this.id === 'game') return 800 * fitOf(this); return 0; } });
  Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { get() {
    if (this.id === 'game') return 796 * fitOf(this); return 0; } });
  function fitOf(el) {
    const v = parseFloat(el.style.getPropertyValue('--fit'));
    return Number.isFinite(v) && v > 0 ? v : .54; // ~CSS guess at 1280×753 default window
  }
  // jsdom's documentElement.clientHeight is always 0; emulate the SMALL viewport
  // height (innerHeight minus a browser chrome bar) so the fitter's vh clamp is tested.
  Object.defineProperty(win.Element.prototype, 'clientHeight', { get() { return win.innerHeight - 15; } });
  // deterministic frame clock: pump() drives it manually via the rAF queue above
  win.performance.now = () => win.__now || (win.__now = 1000);

  const g = globalThis;
  // Only browser globals the modules actually reference. Never shadow Node's
  // setTimeout etc. — jsdom's window timers recurse infinitely when rebound to globals.
  for (const k of ['window', 'document', 'navigator', 'location', 'Audio',
    'SpeechSynthesisUtterance', 'speechSynthesis', 'requestAnimationFrame', 'devicePixelRatio',
    'innerWidth', 'innerHeight', 'addEventListener', 'removeEventListener']) {
    if (k in win) Object.defineProperty(g, k, { value: win[k], writable: true, configurable: true });
  }
  await import('../src/main.js');
  bootedWin = win;
  return win;
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

module.exports = { bootGame, pump, glStats, setGlThrowing: v => { glThrowing = v; } };
