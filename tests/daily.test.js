import test from 'node:test'
import assert from 'node:assert/strict'
import { dateKey, shiftDay, isDateKey, streakInfo, recentDays, rating, nextRating, RATINGS, shareText, compare } from '../src/logic/daily.js'

test('date keys', () => {
  assert.equal(dateKey(new Date(2026, 10, 24, 23, 59)), '2026-11-24')
  assert.equal(dateKey(new Date(2027, 0, 5, 0, 0)), '2027-01-05')
  assert.equal(shiftDay('2026-11-30', 1), '2026-12-01')
  assert.equal(shiftDay('2027-01-01', -1), '2026-12-31')
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29')
  assert.equal(shiftDay('2026-03-29', 1), '2026-03-30', 'daylight saving does not skip a day')
  assert.ok(isDateKey('2026-11-24') && !isDateKey('24/11/2026') && !isDateKey(null))
})

test('streaks', () => {
  const r = { '2026-11-20': {}, '2026-11-22': {}, '2026-11-23': {}, '2026-11-24': {} }
  assert.deepEqual(streakInfo(r, '2026-11-24'), { current: 3, playedToday: true })
  assert.deepEqual(streakInfo(r, '2026-11-25'), { current: 3, playedToday: false }, 'still alive until the day ends')
  assert.deepEqual(streakInfo(r, '2026-11-26'), { current: 0, playedToday: false })
  assert.deepEqual(streakInfo({}, '2026-11-24'), { current: 0, playedToday: false })
  const days = recentDays(r, '2026-11-24', 7)
  assert.equal(days.length, 7)
  assert.equal(days[6].key, '2026-11-24')
  assert.deepEqual(days.map((d) => !!d.result), [false, false, true, false, true, true, true])
})

test('ratings', () => {
  assert.equal(RATINGS.length, 5)
  assert.equal(rating(0).stars, 1)
  assert.equal(rating(RATINGS[2].min).stars, 3)
  assert.equal(rating(RATINGS[2].min - 1).stars, 2)
  assert.equal(rating(99999).stars, 5)
  assert.equal(nextRating(0), RATINGS[1])
  assert.equal(nextRating(99999), null)
  for (let i = 1; i < RATINGS.length; i++) assert.ok(RATINGS[i].min > RATINGS[i - 1].min)
})

test('share text is spoiler-free and ends with the link', () => {
  const t = shareText({ date: '2026-11-24', score: 412, words: 14, bestLen: 7 })
  assert.equal(t.split('\n')[0], 'Soupspell 2026-11-24 · 412 pts · 14 words · best: 7 letters ★')
  assert.equal(t.split('\n')[1], 'Soup Sorcerer')
  assert.ok(t.endsWith('\nhttps://games.oddvale.com/soupspell/'))
  assert.equal(shareText({ date: '2026-11-24', score: 9, words: 1, bestLen: 4 }).split('\n')[0], 'Soupspell 2026-11-24 · 9 pts · 1 word · best: 4 letters')
  assert.equal(shareText({ date: '2026-11-24', score: 0, words: 0, bestLen: 0 }).split('\n')[0], 'Soupspell 2026-11-24 · 0 pts · 0 words')
})

test('comparison with earlier days', () => {
  const r = { '2026-11-21': { score: 100 }, '2026-11-22': { score: 300 }, '2026-11-24': { score: 250 } }
  assert.deepEqual(compare(r, '2026-11-24', 250), { days: 2, average: 200, best: 300, beaten: 1 })
  assert.equal(compare({ '2026-11-24': { score: 5 } }, '2026-11-24', 5).days, 0)
})
