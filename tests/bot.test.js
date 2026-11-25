import test from 'node:test'
import assert from 'node:assert/strict'
import { createSession, ladleLeft, evaluate } from '../src/logic/game.js'
import { linkedWords, playLinked, playFree } from '../src/logic/bot.js'
import { settle } from '../src/logic/soup.js'
import { shiftDay, rating, RATINGS } from '../src/logic/daily.js'
import { dict, bowlOf } from './helpers.js'

test('linkedWords finds exactly the words that can be traced', () => {
  // c-a-t in a row, s off on its own: "cat" and "act" need c next to t, so only cat/tac style paths along the row exist
  const s = bowlOf([{ ch: 'c', x: -0.26 }, { ch: 'a', x: 0 }, { ch: 't', x: 0.26 }, { ch: 's', x: 0.8 }])
  assert.deepEqual(linkedWords(s, dict).map((w) => w.word).sort(), ['cat'])
  // a clump: everything touches everything nearby
  const t = bowlOf([{ ch: 'c', x: -0.13, y: 0 }, { ch: 'a', x: 0.13, y: 0 }, { ch: 't', x: 0, y: 0.225 }])
  assert.deepEqual(linkedWords(t, dict).map((w) => w.word).sort(), ['act', 'cat'])
  for (const w of linkedWords(t, dict)) assert.ok(evaluate(t, dict, w.ids).valid)
  // star pasta joins in
  const u = bowlOf([{ ch: 'q', x: -0.39 }, { ch: '*', x: -0.13 }, { ch: 'i', x: 0.13 }, { ch: 'z', x: 0.39 }])
  assert.equal(linkedWords(u, dict)[0].word, 'quiz')
})

test('a bot can always finish the Daily Bowl by tracing linked words (30 days)', () => {
  const scores = []
  for (let i = 0; i < 30; i++) {
    const date = shiftDay('2026-11-24', i * 7)
    const s = createSession({ mode: 'daily', date })
    const r = playLinked(s, dict, { seed: i + 1, maxLen: 5 })
    assert.ok(!r.stuck, `${date}: stuck with ${ladleLeft(s)} in the ladle`)
    assert.ok(s.over, `${date}: finished`)
    assert.equal(ladleLeft(s), 0, `${date}: ladle emptied`)
    assert.ok(s.wordCount >= 8, `${date}: only ${s.wordCount} words`)
    scores.push(s.score)
  }
  scores.sort((a, b) => a - b)
  const median = scores[15]
  // a casual tracer lands around the second band; the top band needs real herding
  assert.ok(median >= RATINGS[1].min * 0.8 && median < RATINGS[3].min, `median ${median}`)
  assert.ok(scores[0] >= 60, `worst day ${scores[0]}`)
  assert.ok(rating(scores[scores.length - 1]).stars <= 4, 'tracing short linked words never reaches the top band')
})

test('a perfect herder shows the bands are reachable', () => {
  const five = [], six = []
  for (let i = 0; i < 12; i++) {
    const date = shiftDay('2026-11-24', i * 11)
    const a = createSession({ mode: 'daily', date }); playFree(a, dict, { maxLen: 5 }); five.push(a.score)
    const b = createSession({ mode: 'daily', date }); playFree(b, dict, { maxLen: 6 }); six.push(b.score)
    assert.ok(a.over && b.over)
  }
  const avg = (v) => v.reduce((x, y) => x + y, 0) / v.length
  assert.ok(avg(five) >= RATINGS[2].min, 'herding 5-letter words reaches Noodle Wrangler: ' + avg(five))
  assert.ok(avg(six) >= RATINGS[3].min, 'herding 6-letter words reaches Soup Sorcerer: ' + avg(six))
  assert.ok(Math.max(...six) >= RATINGS[4].min * 0.9, 'and the top band is in sight: ' + Math.max(...six))
})

test('endless modes never run dry', () => {
  for (const mode of ['zen', 'rush']) {
    const s = createSession({ mode, seed: 4242 })
    settle(s.soup)
    const r = playLinked(s, dict, { seed: 5, maxWords: 40, maxLen: 5 })
    assert.ok(!r.stuck && s.wordCount === 40, `${mode}: ${s.wordCount} words`)
    assert.equal(s.tiles.filter((t) => t.kind !== 'meat').length, mode === 'zen' ? 20 : 18, 'the bowl stays full')
  }
})
