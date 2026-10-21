// Entry point: boots the render layers, wires controls, runs the frame loop.
// Loop order per frame: rAF re-register -> update -> shake transform -> draw scene to #c -> GL FX.
// (rAF first so a mid-frame throw cannot kill the loop.)
import { $ } from './util.js';
import { S } from './state.js';
import { NEWS } from './data.js';
import { loadRemoteAudio } from './audio.js';
import { draw, x } from './draw.js';
import { renderFX } from './glfx.js';
import { update, updateUI, bindControls } from './game.js';

$('#tk').textContent = '📺 NEWS SNAPSHOT (Oct 20, 2026, not live): ' + NEWS.join('  🏳️‍🌈  ') + '  🏳️‍🌈  ';

function loop(now) {
  const dt = Math.min(40, now - (S.last || now));
  S.last = now;
  // rAF must be re-registered FIRST: if any stage below throws (e.g. a simulated GL
  // driver error), the loop keeps pumping instead of dying silently.
  requestAnimationFrame(loop);
  update(dt);
  x.save();
  if (S.shake > 0) { x.translate((Math.random() * 2 - 1) * S.shake, (Math.random() * 2 - 1) * S.shake); S.shake *= .86; }
  draw();
  x.restore();
  renderFX();
}

bindControls();
loadRemoteAudio();
updateUI();
requestAnimationFrame(loop);
