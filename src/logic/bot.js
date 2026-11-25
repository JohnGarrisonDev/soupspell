// Headless players, for tests, balance tools and the ?debug hook. No DOM.
//   linkedWords  every word that can be traced right now through touching noodles
//   playLinked   a patient bot that only spells what is linked, stirring toward the middle when stuck
//   playFree     a "perfect herder" that ignores positions and greedily takes the best word up to a length cap
import { makeRng } from '../../kit/kit.js'
import { linked, isLetter, stepSoup, stirSoup, settle, DT } from './soup.js'
import { submit, eachWord, plainScore, ladleLeft, finish, canFinish } from './game.js'
import { scoreWord } from './letters.js'
import { MIN_WORD, MAX_WORD, WILD } from './dict.js'

/** All linked words in the bowl: [{ ids, word, pts }], best first. maxLen caps the search. */
export function linkedWords(s, dict, maxLen = MAX_WORD, limit = 4000) {
  const tiles = s.tiles.filter((t) => isLetter(t) && !(t.air > 0)), n = tiles.length
  const adj = tiles.map((a) => tiles.map((b, j) => (linked(a, b) ? j : -1)).filter((j) => j >= 0))
  const { child, next, letter, end } = dict
  const out = [], used = new Uint8Array(n), path = [], buf = []
  const hot = s.chili > 0, combo = s.mode === 'rush' && s.comboLeft > 0 ? s.combo + 1 : 0
  const rec = (i, node) => {
    used[i] = 1; path.push(i)
    if (end[node] && path.length >= MIN_WORD && out.length < limit) {
      const word = buf.join('')
      if (dict.has(word)) out.push({ ids: path.map((k) => tiles[k].id), word, pts: scoreWord(path.map((k) => tiles[k]), { hot, combo }).total })
    }
    if (path.length < maxLen) {
      for (const j of adj[i]) {
        if (used[j]) continue
        const ch = tiles[j].ch
        for (let c = child[node]; c; c = next[c]) {
          if (ch !== WILD && letter[c] !== ch.charCodeAt(0) - 97) continue
          buf.push(String.fromCharCode(97 + letter[c])); rec(j, c); buf.pop()
        }
      }
    }
    used[i] = 0; path.pop()
  }
  for (let i = 0; i < n; i++) {
    const ch = tiles[i].ch
    for (let c = child[0]; c; c = next[c]) {
      if (ch !== WILD && letter[c] !== ch.charCodeAt(0) - 97) continue
      buf.push(String.fromCharCode(97 + letter[c])); rec(i, c); buf.pop()
    }
  }
  out.sort((a, b) => b.pts - a.pts || (a.word < b.word ? -1 : 1))
  return out
}

/** One spoon stroke from the rim toward the middle, at a seeded angle. Steps the physics as it goes. */
export function strokeIn(s, rng, steps = 26) {
  const a = rng() * Math.PI * 2, r0 = 0.82, r1 = 0.08 + rng() * 0.2
  let px = Math.cos(a) * r0, py = Math.sin(a) * r0
  for (let k = 1; k <= steps; k++) {
    const r = r0 + (r1 - r0) * (k / steps), x = Math.cos(a) * r, y = Math.sin(a) * r
    stirSoup(s.soup, px, py, x, y, DT); stepSoup(s.soup, DT)
    px = x; py = y
  }
}

/**
 * Play a bowl by tracing linked words only. Returns { score, words, stirs, stuck }.
 * maxLen caps word length (a casual player rarely goes past 5). maxWords stops endless modes.
 */
export function playLinked(s, dict, { seed = 1, maxLen = MAX_WORD, maxWords = 400, maxStirs = 150 } = {}) {
  const rng = makeRng(seed)
  let stirs = 0, stuck = false
  while (!s.over && s.wordCount < maxWords) {
    settle(s.soup)
    const found = linkedWords(s, dict, maxLen, 600)
    if (found.length) { const r = submit(s, dict, found[0].ids); if (!r.ok) throw new Error('bot picked a bad chain: ' + r.reason); stirs = 0; continue }
    if (canFinish(s) && stirs >= 25) { finish(s); break }
    if (stirs >= maxStirs) { stuck = true; break }
    strokeIn(s, rng); stirs++
  }
  return { score: s.score, words: s.wordCount, stuck }
}

/** Play a bowl ignoring positions: always take the highest plain-scoring word of at most maxLen letters. */
export function playFree(s, dict, { maxLen = MAX_WORD, maxWords = 400 } = {}) {
  while (!s.over && s.wordCount < maxWords) {
    let best = null, bestPts = -1
    eachWord(dict, s.tiles, (w) => { const p = plainScore(w); if (p > bestPts) { bestPts = p; best = w } return false }, maxLen)
    if (!best) { if (canFinish(s)) finish(s); break }
    const used = new Set(), ids = []
    for (const ch of best) {
      const want = ch >= 'a' ? ch : WILD
      const t = s.tiles.find((x) => isLetter(x) && x.ch === want && !used.has(x.id))
      used.add(t.id); ids.push(t.id)
    }
    const r = submit(s, dict, ids, { free: true })
    if (!r.ok) throw new Error('free bot failed: ' + r.reason + ' ' + best)
  }
  return { score: s.score, words: s.wordCount, left: ladleLeft(s) }
}
