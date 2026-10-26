// Мелкие утилиты: ГПСЧ с сидом, одномерный value-noise, математика сглаживания.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Гладкий 1D-шум: случайные значения на решётке через period метров,
// между узлами — косинусная интерполяция. Даёт непрерывную производную,
// поэтому кривизна трассы получается плавной, без изломов.
export function makeNoise1D(seed, period) {
  const rand = mulberry32(seed);
  const cache = new Map();
  const value = (i) => {
    if (!cache.has(i)) cache.set(i, rand() * 2 - 1);
    return cache.get(i);
  };
  return (s) => {
    const x = s / period;
    const i = Math.floor(x);
    const t = x - i;
    const u = (1 - Math.cos(t * Math.PI)) / 2;
    return value(i) * (1 - u) + value(i + 1) * u;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// Экспоненциальное сглаживание, независимое от FPS.
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
