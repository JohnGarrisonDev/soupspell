// Daily Bowl helpers: date keys, streaks, ratings, share text. Pure.

const pad = (n) => String(n).padStart(2, '0')
/** Local calendar date as YYYY-MM-DD. */
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** The date key `days` after (or before, when negative) the given key. */
export function shiftDay(key, days) {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(y, m - 1, d + days, 12)
  return dateKey(t)
}
export const isDateKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)

/**
 * Streak from the per-day results: { current, playedToday }.
 * The streak counts back from today, or from yesterday when today has not been played yet.
 */
export function streakInfo(results, today) {
  const playedToday = !!results[today]
  let day = playedToday ? today : shiftDay(today, -1), current = 0
  while (results[day]) { current++; day = shiftDay(day, -1) }
  return { current, playedToday }
}

/** The last `n` days ending today: [{ key, result|null }], oldest first. */
export function recentDays(results, today, n = 7) {
  const out = []
  for (let i = n - 1; i >= 0; i--) { const key = shiftDay(today, -i); out.push({ key, result: results[key] || null }) }
  return out
}

/** Rating bands for a Daily Bowl score. Thresholds come from the bots in tools/balance.mjs (see AGENTS.md). */
export const RATINGS = [
  { min: 0, name: 'Lukewarm Dabbler', stars: 1 },
  { min: 150, name: 'Broth Botherer', stars: 2 },
  { min: 250, name: 'Noodle Wrangler', stars: 3 },
  { min: 400, name: 'Soup Sorcerer', stars: 4 },
  { min: 650, name: 'Grand Slurpmaster', stars: 5 },
]
export function rating(score) {
  let r = RATINGS[0]
  for (const band of RATINGS) if (score >= band.min) r = band
  return r
}
export const nextRating = (score) => RATINGS.find((b) => b.min > score) || null

/** Spoiler-free result text. Never contains the words themselves. */
export function shareText({ date, score, words, bestLen }) {
  const best = bestLen > 0 ? ` · best: ${bestLen} letters${bestLen >= 7 ? ' ★' : ''}` : ''
  return `Soupspell ${date} · ${score} pts · ${words} ${words === 1 ? 'word' : 'words'}${best}\n${rating(score).name}\nhttps://games.oddvale.com/soupspell/`
}

/** How today compares with earlier days: { days, average, best, rank } over previous results (today excluded). */
export function compare(results, today, score) {
  const prev = Object.keys(results).filter((k) => k !== today && isDateKey(k)).map((k) => results[k].score || 0)
  if (!prev.length) return { days: 0, average: 0, best: 0, beaten: 0 }
  const sum = prev.reduce((a, b) => a + b, 0)
  return { days: prev.length, average: Math.round(sum / prev.length), best: Math.max(...prev), beaten: prev.filter((p) => score > p).length }
}
