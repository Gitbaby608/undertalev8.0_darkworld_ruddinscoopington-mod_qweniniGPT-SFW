// Zoom-punch effect trigger. fx decays in the GL pass (glfx.js); end() zeroes it so
// no punch may fire under the game-over overlay.
import { S } from './state.js';

export function zoomFx(s) { S.fx = 1; S.fxS = s; }
