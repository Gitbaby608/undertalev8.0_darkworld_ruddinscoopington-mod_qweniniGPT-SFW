// Central mutable game state, shared by every module (mutate fields in place).
export const S = {
  // state machine: menu | battle | attack | dodge | over
  mode: 'menu',
  time: 0,      // ms accumulated by update(), drives animations
  last: 0,      // timestamp of previous rAF frame
  hp: 100, bhp: 180, coins: 4, turn: 1, mercy: 0, score: 0,
  inv: 0,       // i-frames countdown after a hit
  shake: 0,     // screen-shake intensity, decays each frame

  bullets: [],  // {x,y,vx,vy,col,r,s?}
  keys: {},     // lowercase keyname -> bool
  atk: null,    // timing-bar state while mode==='attack': {p, d}
  dodgeTime: 0,

  actx: null,   // lazy AudioContext (created on first user gesture)
  bgmOn: false,
  muted: false,

  fx: 0,        // zoom punch strength, decays 0.06/frame
  fxS: 0,       // 1 = crazy punch+rotation, 0 = gentle

  sheepSay: 0,  // speech-bubble countdown (ms)
};
