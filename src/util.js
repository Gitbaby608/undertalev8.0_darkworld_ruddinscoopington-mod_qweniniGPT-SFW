// Canvas/DOM constants and tiny shared helpers.
export const W = 800, H = 460;

export const $ = s => document.querySelector(s);
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
