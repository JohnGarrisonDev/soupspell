// Letter values, the length multiplier and word scoring. Pure.
export const VOWELS = 'aeiou'
export const isVowel = (ch) => VOWELS.includes(ch)

/** Points per letter, by how rare the letter is in the bowl. Star pasta (wildcard) is worth nothing itself. */
export const VALUES = {
  e: 1, a: 1, i: 1, o: 1, s: 1, r: 1, t: 1, n: 1,
  l: 2, d: 2, u: 2, c: 2,
  m: 3, p: 3, g: 3, h: 3, b: 3, y: 3,
  f: 4, w: 4, k: 4,
  v: 5, x: 7, z: 8, j: 8, q: 9,
}
/** Word length -> multiplier. Steep on purpose: herding a long word together is the heroic move. */
export const LENGTH_MULT = [0, 0, 0, 1, 2, 3, 5, 8, 12, 17]
export const CHILI_BONUS = 1.5
export const COMBO_STEP = 0.25
export const COMBO_MAX = 8
export const comboMult = (combo) => 1 + COMBO_STEP * Math.min(COMBO_MAX, Math.max(0, combo))

/** Order in which star pasta tries letters: common ones first, so it resolves to an everyday word when it can. */
export const WILD_ORDER = 'etaoinsrhldcumfpgwybvkxjqz'

/**
 * Score a word. tiles: [{ ch, kind }] in spelling order. hot: a chili bonus is live. combo: Rush combo count (0 = none).
 * Returns { base, mult, gold, hot, combo, total }.
 */
export function scoreWord(tiles, { hot = false, combo = 0 } = {}) {
  let base = 0, gold = 1
  for (const t of tiles) {
    if (t.kind !== 'star') base += VALUES[t.ch] || 0
    if (t.kind === 'gold') gold *= 2
  }
  const mult = LENGTH_MULT[Math.min(tiles.length, LENGTH_MULT.length - 1)] || 0
  const cm = comboMult(combo)
  const total = Math.round(base * mult * gold * (hot ? CHILI_BONUS : 1) * cm)
  return { base, mult, gold, hot: !!hot, combo: cm, total }
}
