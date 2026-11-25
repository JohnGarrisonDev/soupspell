// Save schema, sanitiser, records and achievements. Pure. One blob at localStorage "oddvale:soupspell".
//
// {
//   v: 1,
//   daily:    { results: { 'YYYY-MM-DD': { score, words, bestLen, bestWord, bestPts, hints } }, bestStreak },
//   bests:    { daily, rush, rushWords, longest, bestWord, bestPts, totalWords },
//   seen:     { gold, chili, star, meat, stir }     first-time callouts already shown
//   awards:   { id: 'YYYY-MM-DD' }                  achievements and the day they were earned
//   progress: { daily, rush, zen }                  in-progress bowls (game.js snapshot) or null
//   last:     'daily' | 'rush' | 'zen' | null       the bowl that was on screen, so a reload drops back into it
// }
import { isDateKey, streakInfo } from './daily.js'

export const ACHIEVEMENTS = [
  { id: 'seven', name: 'Heroic Helping', text: 'Spell a word of 7 letters or more' },
  { id: 'soup', name: 'On the Nose', text: 'Spell SOUP' },
  { id: 'gulp', name: 'Big Gulp', text: 'Score 100 or more with one word' },
  { id: 'wish', name: 'Wish Granted', text: 'Use star pasta in a word' },
  { id: 'spicy', name: 'Hot Streak', text: 'Cash in a chili bonus' },
  { id: 'clean', name: 'Clean Bowl', text: 'Finish a Daily Bowl with no letters left' },
  { id: 'regular', name: 'Regular', text: 'Play the Daily Bowl 3 days running' },
  { id: 'rush', name: 'Rush Hour', text: 'Score 250 in Rush' },
  { id: 'hundred', name: 'Hundred Spoonfuls', text: 'Spell 100 words in total' },
]
const SEEN = ['gold', 'chili', 'star', 'meat', 'stir']
const MODES = ['daily', 'rush', 'zen']
const MAX_DAYS = 400

export const defaults = () => ({
  v: 1,
  daily: { results: {}, bestStreak: 0 },
  bests: { daily: 0, rush: 0, rushWords: 0, longest: '', bestWord: '', bestPts: 0, totalWords: 0 },
  seen: { gold: false, chili: false, star: false, meat: false, stir: false },
  awards: {},
  progress: { daily: null, rush: null, zen: null },
  last: null,
})

const int = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d)
const word = (v) => (typeof v === 'string' && /^[a-z]{3,9}$/.test(v) ? v : '')
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/** Build a clean save from whatever was in storage. Never throws. Progress snapshots are checked later by game.js restore(). */
export function sanitize(raw) {
  const out = defaults()
  try {
    const r = obj(raw), d = obj(r.daily), res = obj(d.results)
    const keys = Object.keys(res).filter(isDateKey).sort().slice(-MAX_DAYS)
    for (const k of keys) {
      const e = res[k]
      if (!e || typeof e !== 'object') continue
      out.daily.results[k] = { score: int(e.score, 0, 1e7), words: int(e.words, 0, 1e4), bestLen: int(e.bestLen, 0, 9), bestWord: word(e.bestWord), bestPts: int(e.bestPts, 0, 1e6), hints: int(e.hints, 0, 1e4) }
    }
    out.daily.bestStreak = int(d.bestStreak, 0, 1e5)
    const b = obj(r.bests)
    out.bests = { daily: int(b.daily, 0, 1e7), rush: int(b.rush, 0, 1e7), rushWords: int(b.rushWords, 0, 1e4), longest: word(b.longest), bestWord: word(b.bestWord), bestPts: int(b.bestPts, 0, 1e6), totalWords: int(b.totalWords, 0, 1e9) }
    const s = obj(r.seen)
    for (const k of SEEN) out.seen[k] = s[k] === true
    const a = obj(r.awards)
    for (const { id } of ACHIEVEMENTS) if (isDateKey(a[id])) out.awards[id] = a[id]
    const p = obj(r.progress)
    for (const m of MODES) out.progress[m] = p[m] && typeof p[m] === 'object' && !Array.isArray(p[m]) ? p[m] : null
    out.last = MODES.includes(r.last) ? r.last : null
  } catch { return defaults() }
  return out
}

/** Record one spelled word. Returns the ids of achievements just earned. */
export function recordWord(save, { word: w, pts, usedStar, usedChili }, today) {
  const b = save.bests, earned = []
  b.totalWords++
  if (w.length > b.longest.length) b.longest = w
  if (pts > b.bestPts) { b.bestPts = pts; b.bestWord = w }
  const give = (id) => { if (!save.awards[id]) { save.awards[id] = today; earned.push(id) } }
  if (w.length >= 7) give('seven')
  if (w === 'soup') give('soup')
  if (pts >= 100) give('gulp')
  if (usedStar) give('wish')
  if (usedChili) give('spicy')
  if (b.totalWords >= 100) give('hundred')
  return earned
}

/** Record a finished bowl. Returns { earned, newBest, previousBest }. */
export function recordBowl(save, s, today) {
  const b = save.bests, earned = []
  const give = (id) => { if (!save.awards[id]) { save.awards[id] = today; earned.push(id) } }
  let newBest = false, previousBest = 0
  if (s.mode === 'daily') {
    previousBest = b.daily
    if (!save.daily.results[s.date]) {
      save.daily.results[s.date] = { score: s.score, words: s.wordCount, bestLen: s.longest.length, bestWord: s.best ? s.best.w : '', bestPts: s.best ? s.best.pts : 0, hints: s.hints }
      const keys = Object.keys(save.daily.results).sort()
      while (keys.length > MAX_DAYS) delete save.daily.results[keys.shift()]
    }
    if (s.score > b.daily) { b.daily = s.score; newBest = true }
    const streak = streakInfo(save.daily.results, today).current
    if (streak > save.daily.bestStreak) save.daily.bestStreak = streak
    if (streak >= 3) give('regular')
    if (s.endReason === 'clean') give('clean')
  } else if (s.mode === 'rush') {
    previousBest = b.rush
    if (s.score > b.rush) { b.rush = s.score; newBest = true }
    if (s.wordCount > b.rushWords) b.rushWords = s.wordCount
    if (s.score >= 250) give('rush')
  }
  return { earned, newBest, previousBest }
}
