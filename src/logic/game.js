// A bowl in play: the rules of Soupspell. No DOM, no clock: main.js feeds it time and input, tests and bots drive it headless.
import { makeRng, hashString } from '../../kit/kit.js'
import { makeLadle, dailySeed, DAILY_START, DAILY_TOTAL } from './recipe.js'
import { createSoup, linked, isLetter, dropSpot, TILE_R, MEAT_R, BOWL_R } from './soup.js'
import { scoreWord, isVowel, WILD_ORDER, VALUES, LENGTH_MULT } from './letters.js'
import { MIN_WORD, MAX_WORD, WILD } from './dict.js'
import { COMMON } from './common.js'

/** Everyday 3-5 letter words (for hints only; what counts as a word is the dictionary's call). */
const commonSet = new Set()
for (const n of [3, 4, 5]) for (let i = 0; i + n <= COMMON[n].length; i += n) commonSet.add(COMMON[n].slice(i, i + n))
export const isCommon = (w) => commonSet.has(w)

export const MODES = {
  daily: { bowl: DAILY_START, total: DAILY_TOTAL, meat: 1, time: 0 },
  rush: { bowl: 18, total: Infinity, meat: 0, time: 90 },
  zen: { bowl: 20, total: Infinity, meat: 1, time: 0 },
}
export const CHILI_SECS = 25
export const COMBO_SECS = 8
export const RELADLE_N = 4
export const MEAT_ID = 9000
const KINDS = ['plain', 'gold', 'chili', 'star']
const DROP_GAP = 0.11   // seconds between noodles leaving the ladle

/** Start a bowl. opts: { mode, seed } or { mode: 'daily', date }. */
export function createSession({ mode = 'daily', seed = 1, date = null } = {}) {
  const def = MODES[mode] || MODES.daily
  if (mode === 'daily') seed = dailySeed(date)
  const s = {
    mode, seed: seed >>> 0, date: mode === 'daily' ? date : null,
    ladle: makeLadle(seed), drawn: 0, total: def.total, bowl: def.bowl,
    soup: createSoup(), tiles: null,
    score: 0, wordCount: 0, words: [], best: null, longest: '',
    chili: 0, combo: 0, comboLeft: 0, timeLeft: def.time, clockOn: false,
    hints: 0, reladles: 0, over: false, endReason: '',
  }
  s.tiles = s.soup.tiles
  let delay = 0.15
  for (let m = 0; m < def.meat; m++) { addTile(s, { ch: '#', kind: 'meat' }, MEAT_ID + m, delay); delay += DROP_GAP }
  for (let i = 0; i < def.bowl; i++) { draw(s, delay); delay += DROP_GAP }
  return s
}

export const ladleLeft = (s) => s.total - s.drawn
/** The next few noodles waiting in the ladle (for the preview). */
export function peek(s, n = 3) {
  const out = []
  for (let i = 0; i < n && s.drawn + i < s.total; i++) out.push(s.ladle.at(s.drawn + i))
  return out
}

function addTile(s, spec, id, air) {
  const meat = spec.kind === 'meat', r = meat ? MEAT_R : TILE_R
  const rng = makeRng(hashString(`soupspell/drop/${s.seed}/${id}/${s.wordCount}`))
  const p = dropSpot(s.soup, rng, r)
  const t = { id, ch: spec.ch, kind: spec.kind, x: p.x, y: p.y, vx: 0, vy: 0, r, m: meat ? 2.4 : 1, air, wob: 0, tilt: (rng() - 0.5) * 0.5, pulled: false }
  s.tiles.push(t)
  return t
}
function draw(s, air) {
  if (s.drawn >= s.total) return null
  const id = s.drawn, spec = s.ladle.at(id)
  s.drawn++
  return addTile(s, spec, id, air)
}

export const tileById = (s, id) => { for (const t of s.tiles) if (t.id === id) return t; return null }
export const letterTiles = (s) => s.tiles.filter(isLetter)

/** Can tile `id` be added to the chain `ids`? (First pick: any landed letter. Later: linked to the last, not already used.) */
export function canExtend(s, ids, id) {
  const t = tileById(s, id)
  if (!t || !isLetter(t) || t.air > 0 || ids.includes(id) || ids.length >= MAX_WORD) return false
  if (!ids.length) return true
  const last = tileById(s, ids[ids.length - 1])
  return !!last && linked(last, t)
}
/** Ids of every tile that could be picked next. */
export function reachable(s, ids) {
  const out = []
  for (const t of s.tiles) if (canExtend(s, ids, t.id)) out.push(t.id)
  return out
}

/**
 * Look at a chain without changing anything: { tiles, linked, pattern, word, valid, score }.
 * word is the dictionary word (star pasta filled in), or null. free: skip the link check (bots and tests only).
 */
export function evaluate(s, dict, ids, { free = false } = {}) {
  const tiles = []
  let ok = new Set(ids).size === ids.length
  for (const id of ids) { const t = tileById(s, id); if (!t || !isLetter(t) || (t.air > 0 && !free)) { ok = false; break } tiles.push(t) }
  if (ok && !free) for (let i = 1; i < tiles.length; i++) if (!linked(tiles[i - 1], tiles[i])) { ok = false; break }
  const pattern = tiles.map((t) => t.ch).join('')
  const word = ok && dict ? dict.resolve(pattern, WILD_ORDER) : null
  const hot = s.chili > 0
  const combo = s.mode === 'rush' && s.comboLeft > 0 ? s.combo + 1 : 0
  return { tiles, linked: ok, pattern, word, valid: !!word, score: scoreWord(tiles, { hot, combo }), shown: word || pattern.replace(/\*/g, '?') }
}

/**
 * Spell the chain. Returns { ok: false, reason } or
 * { ok: true, word, score (breakdown), removed: [tiles], added: [tiles], swapped: [tiles], over }.
 */
export function submit(s, dict, ids, opts = {}) {
  if (s.over) return { ok: false, reason: 'over' }
  if (ids.length < MIN_WORD) return { ok: false, reason: 'short' }
  const ev = evaluate(s, dict, ids, opts)
  if (!ev.linked) return { ok: false, reason: 'links' }
  if (!ev.valid) return { ok: false, reason: 'word' }
  const score = ev.score, word = ev.word
  s.score += score.total
  s.wordCount++
  if (s.words.length < 120) s.words.push({ w: word, pts: score.total })
  if (!s.best || score.total > s.best.pts) s.best = { w: word, pts: score.total }
  if (word.length > s.longest.length) s.longest = word
  const hadChili = ev.tiles.some((t) => t.kind === 'chili')
  s.chili = hadChili ? CHILI_SECS : 0
  if (s.mode === 'rush') { s.combo = s.comboLeft > 0 ? s.combo + 1 : 0; s.comboLeft = COMBO_SECS }
  const gone = new Set(ids), removed = ev.tiles
  for (let i = s.tiles.length - 1; i >= 0; i--) if (gone.has(s.tiles[i].id)) s.tiles.splice(i, 1)
  const added = []
  let delay = 0.45
  for (let i = 0; i < removed.length; i++) { const t = draw(s, delay); if (!t) break; added.push(t); delay += DROP_GAP }
  const swapped = dict ? ensurePlayable(s, dict, added, delay) : []
  checkOver(s, dict)
  return { ok: true, word, pattern: ev.pattern, score, removed, added, swapped, over: s.over, usedChili: score.hot, usedStar: ev.pattern.includes(WILD) }
}

/** Letter counts of the bowl: { counts: Int8Array(26), wild }. */
export function bowlCounts(tiles) {
  const counts = new Int8Array(26)
  let wild = 0
  for (const t of tiles) { if (!isLetter(t)) continue; if (t.ch === WILD) wild++; else counts[t.ch.charCodeAt(0) - 97]++ }
  return { counts, wild }
}

/**
 * Search the dictionary for words that can be made from a pile of letters (ignoring where they float).
 * visit(word) is called for each; return true from it to stop. maxLen caps the word length.
 */
export function eachWord(dict, tiles, visit, maxLen = MAX_WORD) {
  const { counts, wild: w0 } = bowlCounts(tiles)
  const { letter, child, next, end } = dict
  const buf = []
  let wild = w0, stop = false
  const rec = (node, depth) => {
    if (end[node] && depth >= MIN_WORD) { const w = buf.join(''); if (dict.has(w.toLowerCase()) && visit(w)) { stop = true; return } }
    if (depth >= maxLen) return
    for (let c = child[node]; c && !stop; c = next[c]) {
      const L = letter[c]
      if (counts[L] > 0) { counts[L]--; buf.push(String.fromCharCode(97 + L)); rec(c, depth + 1); buf.pop(); counts[L]++ }
      else if (wild > 0) { wild--; buf.push(String.fromCharCode(65 + L)); rec(c, depth + 1); buf.pop(); wild++ }   // upper case = played by a star
    }
  }
  rec(0, 0)
}
/** Is there any word at all in this pile of letters? Returns one (shortest search first) or null. */
export function anyWord(dict, tiles) {
  let found = null
  for (const cap of [4, MAX_WORD]) { eachWord(dict, tiles, (w) => { found = w.toLowerCase(); return true }, cap); if (found) break }
  return found
}
/** An everyday word: on the common 3-5 letter list, or one of those plus a plain ending (HOUSES, PLAYING, BAKER). */
export function isEveryday(w) {
  if (isCommon(w)) return true
  for (const end of ['s', 'es', 'd', 'ed', 'er', 'ing']) {
    if (w.length > end.length + 2 && w.endsWith(end)) {
      const stem = w.slice(0, -end.length)
      if (isCommon(stem) || (end[0] !== 's' && isCommon(stem + 'e'))) return true
    }
  }
  return false
}
/** The word to show as "hiding in the leftovers" when a bowl ends (1.3), ignoring where the letters float.
 *  Words of 3-5 letters must be everyday ones (no HOLK). Prefers the longest everyday word when it is within two
 *  letters of the longest word at all; otherwise shows that longest word (BIJECTION) and says so plainly.
 *  -> { word (lower case), everyday: bool } or null. */
export function bestLeft(dict, tiles) {
  let best = null, pts = -1, easy = null, easyPts = -1
  const better = (w, p, cur, curPts) => !cur || w.length > cur.length || (w.length === cur.length && p > curPts)
  eachWord(dict, tiles, (w) => {
    const lw = w.toLowerCase()
    if (w.length <= 5 && !isCommon(lw)) return false
    const p = plainScore(w)
    if (better(w, p, best, pts)) { best = w; pts = p }
    if (isEveryday(lw) && better(w, p, easy, easyPts)) { easy = w; easyPts = p }
    return false
  }, MAX_WORD)
  if (easy && easy.length >= best.length - 2) return { word: easy.toLowerCase(), everyday: true }
  return best ? { word: best.toLowerCase(), everyday: isEveryday(best.toLowerCase()) } : null
}
/** Plain value of a word spelled from a pile (no specials): for bots and hints. Upper-case letters are stars, worth 0. */
export const plainScore = (w) => { let b = 0; for (const ch of w) b += VALUES[ch] || 0; return b * LENGTH_MULT[w.length] }

/** Last resort: when no word can be made from the bowl, swap a few noodles for fresh ones from the ladle. Free, automatic. */
function ensurePlayable(s, dict, added, delay) {
  const swapped = []
  for (let round = 0; round < 8 && ladleLeft(s) > 0 && !anyWord(dict, s.tiles); round++) {
    const letters = s.tiles.filter((t) => isLetter(t) && t.kind === 'plain')
    const vowels = letters.filter((t) => isVowel(t.ch)).length
    let pool = letters
    if (vowels === 0) pool = letters.filter((t) => !isVowel(t.ch))
    else if (vowels === letters.length) pool = letters
    else if (vowels * 2 > letters.length) pool = letters.filter((t) => isVowel(t.ch))
    else pool = letters.filter((t) => !isVowel(t.ch))
    pool.sort((a, b) => a.id - b.id)
    const out = pool.slice(0, Math.min(RELADLE_N, ladleLeft(s)))
    if (!out.length) break
    for (const t of out) { s.tiles.splice(s.tiles.indexOf(t), 1); swapped.push(t) }
    for (let i = 0; i < out.length; i++) { const t = draw(s, delay); if (t) added.push(t); delay += DROP_GAP }
    s.reladles++
  }
  return swapped
}

function checkOver(s, dict) {
  if (s.over || s.mode !== 'daily' || ladleLeft(s) > 0) return
  const left = letterTiles(s)
  if (left.length < MIN_WORD || (dict && !anyWord(dict, s.tiles))) { s.over = true; s.endReason = left.length ? 'nowords' : 'clean' }
}

/** Can the player end the bowl now? Daily: once the ladle is empty. Zen: any time. */
export const canFinish = (s) => !s.over && (s.mode === 'zen' || (s.mode === 'daily' && ladleLeft(s) <= 0))
export function finish(s) { if (!s.over) { s.over = true; s.endReason = 'full' } }

/** Timers. Returns true when Rush just ran out of time. */
export function tick(s, dt) {
  if (s.over) return false
  if (s.chili > 0) s.chili = Math.max(0, s.chili - dt)
  if (s.mode !== 'rush') return false
  if (!s.clockOn) { if (s.tiles.every((t) => !(t.air > 0))) s.clockOn = true; else return false }
  if (s.comboLeft > 0) { s.comboLeft = Math.max(0, s.comboLeft - dt); if (s.comboLeft === 0) s.combo = 0 }
  s.timeLeft = Math.max(0, s.timeLeft - dt)
  if (s.timeLeft === 0) { s.over = true; s.endReason = 'time'; return true }
  return false
}

/** A hint: the tiles of one short word that can be made from the bowl, or null. Since 1.3 it prefers an everyday
 *  word (isCommon) over an obscure ENABLE one, and a common word of 4 letters over a rare 3-letter one. */
export function hint(s, dict) {
  let best = null, everyday = null
  eachWord(dict, s.tiles, (w) => {
    if (!best || w.length < best.length) best = w
    if (isCommon(w.toLowerCase()) && (!everyday || w.length < everyday.length)) everyday = w
    return everyday !== null && everyday.length <= 4
  }, 5)
  if (everyday) best = everyday
  if (!best) { const w = anyWord(dict, s.tiles); if (!w) return null; best = w }
  const used = new Set(), ids = []
  for (const ch of best) {
    const want = ch >= 'a' ? ch : WILD
    const t = s.tiles.find((x) => isLetter(x) && x.ch === want && !used.has(x.id)) || s.tiles.find((x) => x.ch === WILD && !used.has(x.id))
    if (t) { used.add(t.id); ids.push(t.id) }
  }
  s.hints++
  return { length: best.length, ids }
}

// ---------------------------------------------------------------- save / resume

const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d))

/** Everything needed to resume: plain JSON. */
export function snapshot(s) {
  return {
    v: 1, mode: s.mode, seed: s.seed, date: s.date, drawn: s.drawn,
    score: s.score, wordCount: s.wordCount, words: s.words.slice(-120), best: s.best, longest: s.longest,
    chili: Math.round(s.chili * 10) / 10, combo: s.combo, comboLeft: Math.round(s.comboLeft * 10) / 10, timeLeft: Math.round(s.timeLeft * 10) / 10,
    hints: s.hints, reladles: s.reladles,
    tiles: s.tiles.map((t) => ({ id: t.id, ch: t.ch, kind: t.kind, x: Math.round(t.x * 1e4) / 1e4, y: Math.round(t.y * 1e4) / 1e4 })),
  }
}

/** Rebuild a session from saved data. Returns null when the data is junk or does not match the recipe. */
export function restore(data) {
  try {
    if (!data || typeof data !== 'object' || data.v !== 1 || !MODES[data.mode] || !Array.isArray(data.tiles)) return null
    const mode = data.mode, def = MODES[mode]
    if (mode === 'daily' && (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date))) return null
    const seed = mode === 'daily' ? dailySeed(data.date) : int(data.seed, 0, 4294967295, -1)
    if (seed < 0 || (mode === 'daily' && data.seed !== seed)) return null
    const drawn = int(data.drawn, -1, def.total === Infinity ? 100000 : def.total, -1)
    if (drawn < Math.min(def.bowl, def.total)) return null
    const s = createSession({ mode, seed, date: data.date })
    s.tiles.length = 0
    s.drawn = drawn
    const seen = new Set()
    if (data.tiles.length > def.bowl + def.meat) return null
    for (const raw of data.tiles) {
      if (!raw || typeof raw !== 'object') return null
      const id = int(raw.id, -1, MEAT_ID + 8, -1)
      if (id < 0 || seen.has(id)) return null
      seen.add(id)
      let spec
      if (id >= MEAT_ID) { if (id - MEAT_ID >= def.meat) return null; spec = { ch: '#', kind: 'meat' } }
      else { if (id >= drawn) return null; spec = s.ladle.at(id); if (raw.ch !== spec.ch || raw.kind !== spec.kind || !KINDS.includes(spec.kind)) return null }
      const meat = spec.kind === 'meat', r = meat ? MEAT_R : TILE_R
      let x = num(raw.x, -1, 1, 0), y = num(raw.y, -1, 1, 0)
      const d = Math.hypot(x, y), max = BOWL_R - r
      if (d > max) { x *= max / d; y *= max / d }
      s.tiles.push({ id, ch: spec.ch, kind: spec.kind, x, y, vx: 0, vy: 0, r, m: meat ? 2.4 : 1, air: 0, wob: 0, tilt: (((id * 2654435761) >>> 0) / 4294967296 - 0.5) * 0.5, pulled: false })
    }
    s.score = int(data.score, 0, 1e7, 0)
    s.wordCount = int(data.wordCount, 0, 1e5, 0)
    s.words = Array.isArray(data.words) ? data.words.filter((w) => w && typeof w.w === 'string' && /^[a-z]{3,9}$/.test(w.w)).slice(-120).map((w) => ({ w: w.w, pts: int(w.pts, 0, 1e6, 0) })) : []
    s.best = data.best && typeof data.best.w === 'string' && /^[a-z]{3,9}$/.test(data.best.w) ? { w: data.best.w, pts: int(data.best.pts, 0, 1e6, 0) } : null
    s.longest = typeof data.longest === 'string' && /^[a-z]{3,9}$/.test(data.longest) ? data.longest : ''
    s.chili = num(data.chili, 0, CHILI_SECS, 0)
    s.combo = int(data.combo, 0, 999, 0)
    s.comboLeft = num(data.comboLeft, 0, COMBO_SECS, 0)
    s.timeLeft = def.time ? num(data.timeLeft, 0, def.time, def.time) : 0
    s.hints = int(data.hints, 0, 1e4, 0)
    s.reladles = int(data.reladles, 0, 1e4, 0)
    s.clockOn = true
    if (mode === 'rush' && s.timeLeft <= 0) return null
    return s
  } catch { return null }
}
