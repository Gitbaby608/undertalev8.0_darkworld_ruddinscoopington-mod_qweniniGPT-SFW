// WebGL character-FX layer, composited OVER the visible #c scene canvas.
// No 2D fallback by design: reliability = correct-by-construction math + startup
// capability checks + pause-and-rebuild on context loss. Do not add a second renderer.
//
// Hard rules (violating these caused real crashes):
//  - One texture sample per fragment, constant loop bounds. Dynamic-loop-sample
//    programs link fine but INVALID_OPERATION at draw on strict drivers — hence four
//    static programs. Never merge them or add loops.
//  - Every uniform passes through fin(); fx clamped [0,1] => zm in [1,1.6], rt in [0,PI].
//    The vertex shader divides the quad by zm, so zm>=1 is load-bearing.
//  - Pointer tilt clamped ±0.5; an incomplete FBO disables only the smear passes.
//  - webglcontextlost -> preventDefault + pause; restored -> buildFX(). GL handles are
//    never cached across loss; persistent input/effect state lives OUTSIDE buildFX.
//  - Scene transport: texImage2D(canvas) uploads of #c and MC EVERY frame. The old
//    copyTexSubImage2D-backbuffer trick returned frame 0 forever (frozen game).
import { W, H, clamp, $ } from './util.js';
import { S } from './state.js';
import { c, BR, BRV } from './draw.js';
import { MC } from './mask.js';
import { hero } from './game.js';

let glF = () => {};
const glOpts = { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' };
const gl = $('#gl').getContext('webgl', glOpts) || $('#gl').getContext('experimental-webgl', glOpts);

if (!gl) {
  $('#log').textContent = '⚠️ WebGL unavailable — enable hardware acceleration (the game still renders on the 2D scene canvas).';
} else {
  const sh = (t, s) => {
    const h = gl.createShader(t);
    gl.shaderSource(h, s); gl.compileShader(h);
    if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) { console.error('shader compile failed:', gl.getShaderInfoLog(h)); return null; }
    return h;
  };

  // Shared vertex: rotation/zoom about center, then perspective tilt. z stays in [.8,.95]:
  // the quad shrinks toward the horizon (never crosses it) and stays inside the viewport
  // so full-frame effects can't spill past the #c scene underneath.
  const vs = `precision mediump float;attribute vec2 p;uniform vec2 r;uniform float k,o,zm,rt;varying vec2 v;
void main(){vec2 q=p;float z=cos(rt),s2=sin(rt);q=vec2(z*q.x-s2*q.y,s2*q.x+z*q.y);q/=zm;
v=q*.5+.5;vec3 w=vec3(q*vec2(1.,.575)*k,0.);w.y-=o;
float a=cos(r.x),b=sin(r.x),cc=cos(r.y),d=sin(r.y);
w=vec3(w.x*cc+w.z*d,w.y,-w.x*d+w.z*cc);w=vec3(w.x,w.y*a-w.z*b,w.y*b+w.z*a);
gl_Position=vec4(w.xy/vec2(1.,.575),0.,.8+w.z*.15);}`;

  // PM: current frame blended with previous accumulated frame along velocity = shutter
  // smear. Output alpha = scene alpha x mask -> trails exist only where a character is.
  const PMs = `precision mediump float;uniform sampler2D s,pv,ms;uniform vec2 vd;uniform float sp;varying vec2 v;
void main(){vec4 n=texture2D(s,v);vec4 o=texture2D(pv,v-vd*sp);
gl_FragColor=mix(n,o,clamp(sp,0.,.92)*(n.a>.03&&o.a>.03?.62:.3))*texture2D(ms,v).a;}`;

  // PB: soft-light dark bloom over the masked accumulation (5-tap cross, constant taps).
  const PBs = `precision mediump float;uniform sampler2D pv,ms;varying vec2 v;
void main(){vec4 b=texture2D(pv,v);vec3 n=b.rgb;
vec3 c=n*.36+(texture2D(pv,v+vec2(.05,.03)).rgb+texture2D(pv,v-vec2(.05,.03)).rgb
+texture2D(pv,v+vec2(.03,-.05)).rgb+texture2D(pv,v-vec2(.03,.05)).rgb)*.16;
gl_FragColor=vec4(n*(1.-2.*n*c),b.a)*texture2D(ms,v).a;}`;

  // PD: warm radial glow around masked pixels (fixed 5 taps, no loops).
  const PDs = `precision mediump float;uniform sampler2D s,ms;varying vec2 v;
void main(){float a=texture2D(ms,v).a;
float g=(texture2D(ms,v+vec2(.03,.02)).a+texture2D(ms,v-vec2(.03,.02)).a
+texture2D(ms,v+vec2(.02,-.03)).a+texture2D(ms,v-vec2(.02,.03)).a)*.25;
vec3 c=texture2D(s,v).rgb*(1.+g*1.2*vec3(1.,.85,1.));
gl_FragColor=vec4(c,min(1.,a+g*.5)*.5);}`;

  // PG: cheap 2-tap frost on masked pixels only.
  const PGs = `precision mediump float;uniform sampler2D s,ms;varying vec2 v;
void main(){float a=texture2D(ms,v).a;
vec3 c=texture2D(s,v).rgb+(texture2D(s,v+vec2(.008,.006)).rgb+texture2D(s,v-vec2(.008,.006)).rgb)*.04;
gl_FragColor=vec4(c,a*.45);}`;

  // Persistent across rebuilds: input + effect math.
  let mx = 0, my = 0, sxS = 0, sySy = 0, hpx = 400, hpy = 365, ph = 0, VX = .7, VY = -.714, shutter = 0;
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });
  const fin = v => Number.isFinite(v) ? v : 0; // NaN/Infinity uniforms black-screen drivers

  function buildFX() {
    const mkP = src => {
      const p = gl.createProgram();
      const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, src);
      if (!v || !f) return null;
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error('shader link failed:', gl.getProgramInfoLog(p)); return null; }
      const U2 = n => gl.getUniformLocation(p, n);
      return { p, u: { s: U2('s'), pv: U2('pv'), ms: U2('ms'), o: U2('o'), r: U2('r'), k: U2('k'), sp: U2('sp'), vd: U2('vd'), zm: U2('zm'), rt: U2('rt') } };
    };
    const PM = mkP(PMs), PB = mkP(PBs), PD = mkP(PDs), PG = mkP(PGs);
    // Startup capability check (not a per-frame fallback): if these trivial programs
    // won't build, post-FX stays off entirely — the plain scene canvas still renders.
    if (!PM || !PB || !PD || !PG) { console.error('WebGL program build failed — FX disabled by capability check'); glF = () => {}; return; }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pl = gl.getAttribLocation(PM.p, 'p');
    gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const tx = u => {
      gl.activeTexture(gl.TEXTURE0 + u);
      const T = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, T);
      [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(a => gl.texParameteri(gl.TEXTURE_2D, a[0], a[1]));
      if (u) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return T;
    };
    const S2 = tx(0), T = [tx(1), tx(2)], M = tx(3); // S2 scene, T ping-pong shutter pair, M char mask
    const F = T.map(tt => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tt, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (!ok) console.warn('FBO incomplete — motion accumulation disabled');
      return { f, ok };
    });
    const fboOK = F.every(o => o.ok);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const dr = (prog, k, o, rx, ry, zm, rt, pvU, sp) => {
      gl.useProgram(prog.p);
      if (prog.u.k) gl.uniform1f(prog.u.k, fin(k));
      if (prog.u.o) gl.uniform1f(prog.u.o, fin(o));
      if (prog.u.r) gl.uniform2f(prog.u.r, fin(rx), fin(ry));
      if (prog.u.zm) gl.uniform1f(prog.u.zm, fin(zm));
      if (prog.u.rt) gl.uniform1f(prog.u.rt, fin(rt));
      if (prog.u.sp !== null && prog.u.sp !== undefined) gl.uniform1f(prog.u.sp, fin(sp));
      if (prog.u.vd !== null && prog.u.vd !== undefined) gl.uniform2f(prog.u.vd, fin(VX), fin(VY));
      if (prog.u.s !== null && prog.u.s !== undefined) gl.uniform1i(prog.u.s, 0);
      if (prog.u.pv !== null && prog.u.pv !== undefined) gl.uniform1i(prog.u.pv, pvU);
      if (prog.u.ms !== null && prog.u.ms !== undefined) gl.uniform1i(prog.u.ms, 3);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    glF = () => {
      if (gl.isContextLost()) return;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S2);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); // fresh scene
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, M);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, MC); // fresh mask
      // hit-zoom: analytic curves over decay counter hard-clamped [0,1]
      S.fx = clamp(S.fx - .06, 0, 1);
      const q = 1 - S.fx, pr = S.fx > 0 ? Math.sin(q * Math.PI) : 0;
      const zmv = 1 + pr * (S.fxS ? .5 : .2);
      const rtv = S.fxS && S.fx > 0 ? 3.1416 * (1 - Math.pow(1 - q, 3)) : 0;
      // shutter vector = fastest mover's real velocity (aspect-corrected uv); camera sweep during punch
      const spd = Math.hypot(BRV.vx, BRV.vy);
      if (spd > .05) { VX = BRV.vx / W; VY = -BRV.vy / H; }
      else if (S.fx > .15) { VX = .7; VY = -.714; }
      const want = Math.min(1, (Math.min(.115, spd * 1.4) * W) / W) + (S.fx > .15 ? .55 : 0);
      shutter += (Math.min(1, want) - shutter) * .35;
      if (shutter < .02) shutter = 0;
      sxS += ((hero.x - hpx) * .065 - sxS) * .12;
      sySy += ((hero.y - hpy) * .05 - sySy) * .12;
      hpx = hero.x; hpy = hero.y;
      const rx = clamp(-.08 - sySy * .55 + Math.sin(S.time * .0007) * .03, -.5, .5);
      const ry = clamp(sxS, -.5, .5);
      gl.viewport(0, 0, W, H);
      if (fboOK) {
        // PASS 1: accumulate shutter into F[next], reading scene + feedback prev (masked output)
        gl.disable(gl.BLEND); gl.bindFramebuffer(gl.FRAMEBUFFER, F[1 - ph].f);
        gl.activeTexture(gl.TEXTURE1 + ph); gl.bindTexture(gl.TEXTURE_2D, T[ph]);
        dr(PM, 1, 0, 0, 0, zmv, rtv, 1 + ph, shutter); ph = 1 - ph;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        // PASS 2: bloom / glow / frost additive over the accumulated masked frame
        gl.activeTexture(gl.TEXTURE1 + ph); gl.bindTexture(gl.TEXTURE_2D, T[ph]);
        gl.enable(gl.BLEND);
        dr(PB, 1, 0, rx, ry, 1, 0, 1 + ph);
        dr(PD, 1, 0, rx, ry, 1, 0, 1 + ph);
        dr(PG, .9, .06, rx, ry, 1, 0, 1 + ph);
      } else {
        gl.enable(gl.BLEND);
        dr(PD, 1, 0, rx, ry, 1, 0);
        dr(PG, .9, .06, rx, ry, 1, 0);
      }
    };
    const glEl = $('#gl');
    glEl.addEventListener('webglcontextlost', e => { e.preventDefault(); glF = () => {}; });
    glEl.addEventListener('webglcontextrestored', () => { console.info('WebGL context restored — rebuilding FX'); buildFX(); });
  }
  buildFX();
}

export function renderFX() { glF(); }
