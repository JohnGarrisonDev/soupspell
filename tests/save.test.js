import test from 'node:test'
import assert from 'node:assert/strict'
import { defaults, sanitize, recordWord, recordBowl, ACHIEVEMENTS } from '../src/logic/save.js'
import { createSession, snapshot, restore, finish } from '../src/logic/game.js'

test('junk in, clean save out', () => {
  for (const junk of [undefined, null, 5, 'x', [], { daily: 'no' }, { daily: { results: [1, 2] }, bests: null, seen: 7, awards: [], progress: 'x', last: {} }]) assert.deepEqual(sanitize(junk), defaults())
  const s = sanitize({
    daily: { results: { '2026-11-24': { score: 412.4, words: 14, bestLen: 7, bestWord: 'noodles', bestPts: 96, hints: 1 }, 'bad-key': { score: 1 }, '2026-11-23': 'junk', '2026-11-22': { score: -5, words: 'many', bestWord: '<b>x</b>' } }, bestStreak: 'lots' },
    bests: { daily: 412, rush: NaN, longest: 'NOODLES', bestWord: 'noodles', bestPts: 1e99, totalWords: 3.6 },
    seen: { gold: true, chili: 'yes', bogus: true }, awards: { seven: '2026-11-24', soup: true, bogus: '2026-11-24' },
    progress: { daily: { v: 1 }, rush: [1], zen: 'x', bogus: {} }, last: 'zen', extra: 1,
  })
  assert.deepEqual(s.daily.results['2026-11-24'], { score: 412, words: 14, bestLen: 7, bestWord: 'noodles', bestPts: 96, hints: 1 })
  assert.deepEqual(s.daily.results['2026-11-22'], { score: 0, words: 0, bestLen: 0, bestWord: '', bestPts: 0, hints: 0 })
  assert.deepEqual(Object.keys(s.daily.results).sort(), ['2026-11-22', '2026-11-24'])
  assert.equal(s.daily.bestStreak, 0)
  assert.deepEqual(s.bests, { daily: 412, rush: 0, rushWords: 0, longest: '', bestWord: 'noodles', bestPts: 1000000, totalWords: 4 })
  assert.deepEqual(s.seen, { gold: true, chili: false, star: false, meat: false, stir: false })
  assert.deepEqual(s.awards, { seven: '2026-11-24' })
  assert.deepEqual(s.progress, { daily: { v: 1 }, rush: null, zen: null })
  assert.equal(s.last, 'zen')
  assert.ok(!('extra' in s))
  assert.equal(restore(s.progress.daily), null, 'a hollow progress blob is then refused by restore()')
})

test('a real save survives a round trip', () => {
  const save = defaults(), s = createSession({ mode: 'daily', date: '2026-11-24' })
  save.progress.daily = snapshot(s); save.last = 'daily'
  const back = sanitize(JSON.parse(JSON.stringify(save)))
  assert.deepEqual(back, JSON.parse(JSON.stringify(save)))
  assert.ok(restore(back.progress.daily))
})

test('words feed the records and achievements', () => {
  const save = defaults(), day = '2026-11-24'
  assert.deepEqual(recordWord(save, { word: 'cat', pts: 4 }, day), [])
  assert.deepEqual(recordWord(save, { word: 'soup', pts: 14 }, day), ['soup'])
  assert.deepEqual(recordWord(save, { word: 'soup', pts: 14 }, day), [], 'only once')
  assert.deepEqual(recordWord(save, { word: 'noodles', pts: 104, usedStar: true, usedChili: true }, day).sort(), ['gulp', 'seven', 'spicy', 'wish'])
  assert.deepEqual(save.bests, { daily: 0, rush: 0, rushWords: 0, longest: 'noodles', bestWord: 'noodles', bestPts: 104, totalWords: 4 })
  save.bests.totalWords = 99
  assert.deepEqual(recordWord(save, { word: 'cat', pts: 4 }, day), ['hundred'])
  assert.equal(save.awards.soup, day)
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length)
})

test('finished bowls: daily result, streak, bests', () => {
  const save = defaults()
  save.daily.results['2026-11-22'] = { score: 50 }; save.daily.results['2026-11-23'] = { score: 60 }
  const s = createSession({ mode: 'daily', date: '2026-11-24' })
  s.score = 300; s.wordCount = 11; s.longest = 'noodle'; s.best = { w: 'noodle', pts: 50 }; s.hints = 1; finish(s)
  const r = recordBowl(save, s, '2026-11-24')
  assert.deepEqual(save.daily.results['2026-11-24'], { score: 300, words: 11, bestLen: 6, bestWord: 'noodle', bestPts: 50, hints: 1 })
  assert.ok(r.newBest)
  assert.deepEqual(r.earned, ['regular'])
  assert.equal(save.daily.bestStreak, 3)
  assert.equal(save.bests.daily, 300)
  // a day is only recorded once
  s.score = 999
  recordBowl(save, s, '2026-11-24')
  assert.equal(save.daily.results['2026-11-24'].score, 300)
  // rush
  const rush = createSession({ mode: 'rush', seed: 1 }); rush.score = 260; rush.wordCount = 9
  assert.deepEqual(recordBowl(save, rush, '2026-11-24'), { earned: ['rush'], newBest: true, previousBest: 0 })
  rush.score = 100
  assert.deepEqual(recordBowl(save, rush, '2026-11-24'), { earned: [], newBest: false, previousBest: 260 })
  assert.equal(save.bests.rush, 260); assert.equal(save.bests.rushWords, 9)
  // zen changes nothing
  const before = JSON.stringify(save)
  recordBowl(save, createSession({ mode: 'zen', seed: 1 }), '2026-11-24')
  assert.equal(JSON.stringify(save), before)
})
