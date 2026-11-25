// The ladle: a seeded, endless sequence of noodles ("the recipe"). Same seed, same sequence, on every device.
// RULE: never change the order or number of rng() calls here in place. Every Daily Bowl is generated from this; see AGENTS.md.
import { makeRng, hashString } from '../../kit/kit.js'
import { isVowel } from './letters.js'

const VOWEL_W = [['e', 12], ['a', 9], ['i', 8], ['o', 8], ['u', 4]]
const CONS_W = [['t', 7], ['n', 6], ['r', 7], ['s', 6], ['l', 5], ['d', 4], ['c', 3], ['m', 3], ['p', 3], ['g', 3], ['h', 3], ['b', 2], ['y', 2], ['f', 2], ['w', 2], ['k', 2], ['v', 1], ['x', 1], ['z', 1], ['j', 1], ['q', 1]]
const RARE = 'jqxzv'
const total = (w) => w.reduce((a, e) => a + e[1], 0)
const VOWEL_T = total(VOWEL_W), CONS_T = total(CONS_W)
const pickW = (rng, table, sum) => { let k = rng.int(sum); for (const [ch, w] of table) { if (k < w) return ch; k -= w } return table[0][0] }

export const DAILY_START = 16
export const DAILY_TOTAL = 50
/** One special noodle in every block of this many. A cycle of five blocks holds 2 golden, 2 chili and 1 star. */
export const SPECIAL_BLOCK = 10
const KIND_CYCLE = ['gold', 'chili', 'gold', 'star', 'chili']

/** makeLadle(seed).at(i) -> { ch, kind } for the i-th noodle. kind: plain | gold | chili | star (star has ch '*'). */
export function makeLadle(seed) {
  const rng = makeRng(seed >>> 0)
  const krng = makeRng(hashString('soupspell/specials/' + (seed >>> 0)))
  const list = [], letters = []
  let vowels = 0, wantU = false, kinds = [], slot = -1

  const gen = () => {
    const i = letters.length
    // vowel or consonant: keep every run of five between 1 and 3 vowels, and steer the long-run share toward 40%
    let v4 = 0
    for (let k = Math.max(0, i - 4); k < i; k++) if (isVowel(letters[k])) v4++
    const roll = rng()
    let vowel
    if (wantU) vowel = true
    else if (i >= 2 && v4 === 0) vowel = i >= 3 || roll < 0.7
    else if (v4 >= 3) vowel = false
    else { const debt = 0.4 * (i + 1) - vowels; vowel = roll < Math.min(0.85, Math.max(0.12, 0.4 + 0.16 * debt)) }
    let ch = ''
    for (let tries = 0; tries < 10; tries++) {
      ch = vowel ? pickW(rng, VOWEL_W, VOWEL_T) : pickW(rng, CONS_W, CONS_T)
      let same = 0, rare = false
      for (let k = Math.max(0, i - 7); k < i; k++) { if (letters[k] === ch) same++ }
      if (RARE.includes(ch)) for (let k = Math.max(0, i - 11); k < i; k++) if (RARE.includes(letters[k])) rare = true
      if (same < (ch === 'e' ? 2 : 1) + (tries > 6 ? 1 : 0) && !rare) break
    }
    if (wantU) { ch = 'u'; wantU = false } else if (ch === 'q') wantU = true
    letters.push(ch)
    if (isVowel(ch)) vowels++
    // specials: one per block, at a seeded offset
    if (i % SPECIAL_BLOCK === 0) {
      if (!kinds.length) { kinds = KIND_CYCLE.slice(); for (let k = kinds.length - 1; k > 0; k--) { const j = krng.int(k + 1); const t = kinds[k]; kinds[k] = kinds[j]; kinds[j] = t } }
      slot = i + 1 + krng.int(SPECIAL_BLOCK - 1)
    }
    let kind = 'plain'
    if (i === slot) { kind = kinds.pop(); if (ch === 'q' || wantU) kind = kind === 'star' ? 'gold' : kind }
    list.push(kind === 'star' ? { ch: '*', kind } : { ch, kind })
  }
  return {
    seed: seed >>> 0,
    at(i) { while (list.length <= i) gen(); return list[i] },
  }
}

export const dailySeed = (dateKey) => hashString('soupspell:' + dateKey)

/** The Daily Bowl for a date: 50 noodles (16 start in the bowl, 34 wait in the ladle) plus one meatball. */
export function dailyRecipe(dateKey) {
  const seed = dailySeed(dateKey), ladle = makeLadle(seed), tiles = []
  for (let i = 0; i < DAILY_TOTAL; i++) tiles.push(ladle.at(i))
  return { date: dateKey, seed, start: DAILY_START, total: DAILY_TOTAL, tiles }
}

/** Short fingerprint of a recipe, for snapshot tests. */
export function recipeString(seed, n = DAILY_TOTAL) {
  const ladle = makeLadle(seed)
  let s = ''
  for (let i = 0; i < n; i++) { const t = ladle.at(i); s += t.kind === 'gold' ? t.ch.toUpperCase() + '!' : t.kind === 'chili' ? t.ch.toUpperCase() + '^' : t.ch }
  return s
}
