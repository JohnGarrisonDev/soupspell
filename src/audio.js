// Every sound in Soupspell, synthesised with the kit's sfx. Rate-limited so stirring never turns into a wall of noise.
import { sfx } from '../kit/kit.js'

const SCALE = [392, 440, 494, 587, 659, 784, 880, 988, 1175, 1319]   // G major pentatonic, rising
const last = {}
const limit = (name, ms) => { const now = performance.now(); if (now - (last[name] || 0) < ms) return false; last[name] = now; return true }

export const snd = {
  click() { sfx.tone({ freq: 520, dur: 0.06, type: 'triangle', vol: 0.12 }) },
  back() { sfx.tone({ freq: 380, dur: 0.07, type: 'triangle', vol: 0.11, slide: 300 }) },
  /** Rising chime for the n-th letter traced (1-based). */
  pick(n) { sfx.tone({ freq: SCALE[Math.min(SCALE.length - 1, n - 1)], dur: 0.14, type: 'triangle', vol: 0.16 }); sfx.tone({ freq: SCALE[Math.min(SCALE.length - 1, n - 1)] * 2, dur: 0.08, type: 'sine', vol: 0.05 }) },
  unpick(n) { sfx.tone({ freq: SCALE[Math.max(0, Math.min(SCALE.length - 1, n - 1))], dur: 0.09, type: 'sine', vol: 0.1, slide: 300 }) },
  valid() { if (limit('valid', 120)) sfx.tone({ freq: 1568, dur: 0.07, type: 'sine', vol: 0.06 }) },
  nope() { sfx.tone({ freq: 170, dur: 0.16, type: 'square', vol: 0.08, slide: 120 }); sfx.tone({ freq: 150, dur: 0.14, type: 'square', vol: 0.06, slide: 100, delay: 0.09 }) },
  /** Slurp then gulp; longer words get a bigger flourish. */
  gulp(len) {
    sfx.noise({ dur: 0.22, vol: 0.1, freq: 500, slide: 2600 })
    sfx.tone({ freq: 220, dur: 0.2, type: 'sine', vol: 0.2, slide: 520 })
    sfx.tone({ freq: 300, dur: 0.12, type: 'sine', vol: 0.2, slide: 110, delay: 0.24 })
    const n = Math.min(6, Math.max(2, len - 2)), notes = []
    for (let i = 0; i < n; i++) notes.push([SCALE[i + (len >= 6 ? 3 : 1)], 0.07])
    notes.push([SCALE[Math.min(9, n + (len >= 6 ? 4 : 2))], 0.2])
    setTimeout(() => sfx.tune(notes, { vol: 0.13 }), 330)
  },
  kiss() { sfx.tone({ freq: 1400, dur: 0.09, type: 'sine', vol: 0.12, slide: 2400, delay: 0.75 }); sfx.noise({ dur: 0.05, vol: 0.08, freq: 3000, delay: 0.74 }) },
  plop() { if (!limit('plop', 55)) return; const f = 260 + Math.random() * 120; sfx.tone({ freq: f, dur: 0.11, type: 'sine', vol: 0.16, slide: f * 2.2 }); sfx.noise({ dur: 0.09, vol: 0.05, freq: 1800, slide: 500 }) },
  swish(speed) { if (limit('swish', 150)) sfx.noise({ dur: 0.2, vol: Math.min(0.09, 0.02 + speed * 0.025), freq: 500 + speed * 300, slide: 250 }) },
  callout() { sfx.tune([[784, 0.08], [988, 0.08], [1175, 0.14]], { vol: 0.12 }) },
  chili() { sfx.tune([[659, 0.06], [784, 0.06], [988, 0.06], [1319, 0.12]], { type: 'square', vol: 0.07 }) },
  hint() { sfx.tune([[660, 0.09], [550, 0.12]], { vol: 0.11 }) },
  tickClock() { if (limit('tick', 400)) sfx.tone({ freq: 900, dur: 0.04, type: 'square', vol: 0.06 }) },
  award() { sfx.tune([[784, 0.09], [988, 0.09], [1175, 0.09], [1568, 0.22]], { vol: 0.13 }) },
  done(good) { sfx.tune(good ? [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.12], [1319, 0.3]] : [[523, 0.14], [659, 0.14], [784, 0.26]], { vol: 0.15 }) },
  copy() { sfx.tune([[880, 0.06], [1175, 0.1]], { vol: 0.1 }) },
}
