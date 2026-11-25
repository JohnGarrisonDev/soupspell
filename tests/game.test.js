import test from 'node:test'
import assert from 'node:assert/strict'
import { createSession, evaluate, submit, canExtend, reachable, tick, finish, canFinish, hint, peek, ladleLeft, anyWord, eachWord, snapshot, restore, MODES, CHILI_SECS, COMBO_SECS, MEAT_ID } from '../src/logic/game.js'
import { scoreWord, VALUES, LENGTH_MULT, comboMult } from '../src/logic/letters.js'
import { settle, TILE_R, BOWL_R } from '../src/logic/soup.js'
import { dict, bowlOf, ids } from './helpers.js'

test('letter values and the length multiplier', () => {
  assert.equal(Object.keys(VALUES).length, 26)
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') assert.ok(VALUES[ch] >= 1 && VALUES[ch] <= 10)
  assert.ok(VALUES.q > VALUES.k && VALUES.k > VALUES.d && VALUES.d > VALUES.e)
  for (let n = 4; n <= 9; n++) assert.ok(LENGTH_MULT[n] > LENGTH_MULT[n - 1], 'grows')
  assert.ok(LENGTH_MULT[7] >= 2.5 * LENGTH_MULT[5], 'steeply')
  const t = (w, kinds = {}) => [...w].map((ch, i) => ({ ch, kind: kinds[i] || 'plain' }))
  assert.deepEqual(scoreWord(t('cat')), { base: 4, mult: 1, gold: 1, hot: false, combo: 1, total: 4 })
  assert.equal(scoreWord(t('soup')).total, (1 + 1 + 2 + 3) * 2)
  assert.equal(scoreWord(t('soup', { 1: 'gold' })).total, 28)
  assert.equal(scoreWord(t('soup', { 1: 'gold', 2: 'gold' })).total, 56)
  assert.equal(scoreWord(t('soup'), { hot: true }).total, 21)
  assert.equal(scoreWord(t('soup'), { combo: 2 }).total, 21)
  assert.equal(scoreWord([{ ch: 's', kind: 'plain' }, { ch: '*', kind: 'star' }, { ch: 'u', kind: 'plain' }, { ch: 'p', kind: 'plain' }]).total, (1 + 0 + 2 + 3) * 2, 'star pasta is worth nothing itself but counts for length')
  assert.equal(comboMult(0), 1); assert.equal(comboMult(4), 2); assert.equal(comboMult(99), 3)
})

test('a new bowl', () => {
  const s = createSession({ mode: 'daily', date: '2026-11-24' })
  assert.equal(s.tiles.length, 17)
  assert.equal(s.tiles.filter((t) => t.kind === 'meat').length, 1)
  assert.equal(ladleLeft(s), 34)
  assert.equal(peek(s, 3).length, 3)
  assert.ok(s.tiles.every((t) => t.air > 0 && Math.hypot(t.x, t.y) <= BOWL_R - t.r))
  assert.ok(!canExtend(s, [], s.tiles[1].id), 'cannot pick a noodle that is still falling')
  settle(s.soup)
  assert.ok(canExtend(s, [], s.tiles[1].id))
  assert.ok(!canExtend(s, [], MEAT_ID), 'the meatball is not a letter')
  assert.equal(createSession({ mode: 'rush', seed: 5 }).tiles.length, MODES.rush.bowl)
  assert.equal(ladleLeft(createSession({ mode: 'zen', seed: 5 })), Infinity)
})

test('chains must follow links', () => {
  const s = bowlOf([{ ch: 'c', x: -0.3 }, { ch: 'a', x: -0.04 }, { ch: 't', x: 0.22 }, { ch: 's', x: 0.7 }, { ch: '#', x: 0, y: 0.5 }])
  const [c, a, t, x] = s.tiles.map((q) => q.id)
  assert.deepEqual(reachable(s, []).sort(), [c, a, t, x].sort())
  assert.deepEqual(reachable(s, [c]), [a])
  assert.ok(canExtend(s, [c], a) && !canExtend(s, [c], t) && !canExtend(s, [c, a], c) && !canExtend(s, [c, a, t], x))
  assert.ok(evaluate(s, dict, [c, a, t]).valid)
  assert.equal(evaluate(s, dict, [c, a, t]).score.total, 4)
  assert.ok(!evaluate(s, dict, [c, t, a]).linked)
  assert.equal(submit(s, dict, [c, a]).reason, 'short')
  assert.equal(submit(s, dict, [c, a, t, x]).reason, 'links')
  assert.equal(submit(s, dict, [a, c, a]).reason, 'links', 'no letter twice')
  assert.equal(submit(s, dict, [t, a, c]).reason, 'word')
  assert.equal(s.score, 0)
})

test('spelling a word scores, slurps the letters and refills from the ladle', () => {
  const s = bowlOf('soupxyz')
  const drawn = s.drawn, r = submit(s, dict, ids(s, 'soup'))
  assert.ok(r.ok)
  assert.equal(r.word, 'soup')
  assert.equal(r.score.total, 14)
  assert.equal(s.score, 14)
  assert.equal(s.wordCount, 1)
  assert.deepEqual(s.best, { w: 'soup', pts: 14 })
  assert.equal(r.removed.length, 4)
  assert.equal(r.added.length, 4)
  assert.equal(s.drawn, drawn + 4)
  assert.ok(r.added.every((t) => t.air > 0 && s.tiles.includes(t)))
  assert.ok(!s.tiles.some((t) => r.removed.includes(t)))
})

test('golden noodles, chili timing and star pasta', () => {
  let s = bowlOf([{ ch: 'c' }, { ch: 'a', kind: 'gold' }, { ch: 't' }, { ch: 'd' }, { ch: 'o', kind: 'chili' }, { ch: 'g' }, { ch: 'p' }, { ch: 'e' }, { ch: 'n' }], { gap: 0.26 })
  assert.equal(submit(s, dict, ids(s, 'cat')).score.total, 8, 'gold doubles')
  let r = submit(s, dict, ids(s, 'dog'))
  assert.equal(r.score.total, 6)
  assert.ok(!r.usedChili)
  assert.equal(s.chili, CHILI_SECS)
  tick(s, CHILI_SECS - 1)
  assert.ok(s.chili > 0)
  assert.equal(evaluate(s, dict, ids(s, 'pen'), { free: true }).score.total, 8, 'preview shows the chili bonus: 5 × 1.5 rounded')
  r = submit(s, dict, ids(s, 'pen'), { free: true })
  assert.ok(r.usedChili)
  assert.equal(r.score.total, 8)
  assert.equal(s.chili, 0, 'the bonus is used up')
  // too slow: no bonus
  s = bowlOf([{ ch: 'd' }, { ch: 'o', kind: 'chili' }, { ch: 'g' }, { ch: 'p' }, { ch: 'e' }, { ch: 'n' }])
  submit(s, dict, ids(s, 'dog'))
  tick(s, CHILI_SECS + 0.1)
  assert.equal(submit(s, dict, ids(s, 'pen')).score.total, 5)
  // star pasta: becomes whatever makes a word, shown in the result
  s = bowlOf('q*iz')
  const ev = evaluate(s, dict, ids(s, 'q*iz'))
  assert.equal(ev.word, 'quiz')
  assert.equal(ev.score.total, (9 + 0 + 1 + 8) * 2)
  r = submit(s, dict, ids(s, 'q*iz'))
  assert.ok(r.ok && r.usedStar && r.word === 'quiz')
  s = bowlOf('x*q')
  assert.equal(submit(s, dict, ids(s, 'x*q')).reason, 'word')
})

test('rush: the clock, and combos for quick words', () => {
  const s = bowlOf('catdogpensun', { mode: 'rush' })
  assert.equal(s.timeLeft, 90)
  tick(s, 0)   // the bowl is ready: the clock starts
  assert.equal(submit(s, dict, ids(s, 'cat'), { free: true }).score.total, 4)
  assert.equal(s.combo, 0)
  tick(s, 2)
  assert.equal(evaluate(s, dict, ids(s, 'dog'), { free: true }).score.combo, 1.25)
  assert.equal(submit(s, dict, ids(s, 'dog'), { free: true }).score.total, Math.round(6 * 1.25))
  assert.equal(s.combo, 1)
  tick(s, COMBO_SECS + 0.5)
  assert.equal(s.combo, 0, 'too slow: the combo is gone')
  assert.equal(submit(s, dict, ids(s, 'pen'), { free: true }).score.total, 5)
  assert.ok(Math.abs(s.timeLeft - (90 - 2 - COMBO_SECS - 0.5)) < 1e-9)
  assert.equal(tick(s, 200), true)
  assert.ok(s.over && s.endReason === 'time' && s.timeLeft === 0)
  assert.equal(submit(s, dict, ids(s, 'sun'), { free: true }).reason, 'over')
  // the clock waits until the first noodles have landed
  const fresh = createSession({ mode: 'rush', seed: 3 })
  tick(fresh, 1)
  assert.equal(fresh.timeLeft, 90)
  settle(fresh.soup); tick(fresh, 1)
  assert.equal(fresh.timeLeft, 89)
})

test('words-possible check and the free re-ladle', () => {
  assert.equal(anyWord(dict, bowlOf('xqzvj').tiles), null)
  assert.equal(anyWord(dict, bowlOf('iiuu').tiles), null)
  assert.ok(anyWord(dict, bowlOf('xqz*a').tiles), 'a star helps')
  assert.ok(dict.has(anyWord(dict, bowlOf('tca#').tiles)))
  const found = []
  eachWord(dict, bowlOf('tca').tiles, (w) => { found.push(w); return false })
  assert.deepEqual(found.sort(), ['act', 'cat'])
  // spelling the only word leaves junk: the chef swaps some noodles so there is always something to spell
  const s = bowlOf('catxqzvjkw', { gap: 0.2 })
  const r = submit(s, dict, ids(s, 'cat'), { free: true })
  assert.ok(r.ok)
  assert.ok(anyWord(dict, s.tiles), 'playable again')
  if (r.swapped.length) assert.ok(s.reladles > 0)
  // forced case: nothing useful can come... but an endless ladle always gets there
  const t = bowlOf('catxqzvjkwbf', { gap: 0.17 })
  submit(t, dict, ids(t, 'cat'), { free: true })
  assert.ok(anyWord(dict, t.tiles))
})

test('the daily ends when the ladle is empty and nothing is left to spell, or when the player is full', () => {
  let s = bowlOf('catxq', { mode: 'daily' })
  s.mode = 'daily'; s.total = s.drawn    // empty ladle
  assert.ok(canFinish(s))
  const r = submit(s, dict, ids(s, 'cat'))
  assert.ok(r.ok && r.over && r.added.length === 0)
  assert.equal(s.endReason, 'nowords')
  s = bowlOf('cat', { mode: 'daily' }); s.mode = 'daily'; s.total = s.drawn
  submit(s, dict, ids(s, 'cat'))
  assert.equal(s.endReason, 'clean')
  s = createSession({ mode: 'daily', date: '2026-11-24' })
  assert.ok(!canFinish(s), 'not while the ladle still holds letters')
  s = bowlOf('catdog', { mode: 'daily' }); s.mode = 'daily'; s.total = s.drawn
  finish(s)
  assert.ok(s.over && s.endReason === 'full')
  assert.equal(tick(s, 1), false)
})

test('hints point at letters that really make a word', () => {
  const s = bowlOf([{ ch: 'x', x: -0.8 }, { ch: 't', x: -0.4 }, { ch: 'q', x: 0 }, { ch: 'a', x: 0.4 }, { ch: 'c', x: 0.8 }])
  const h = hint(s, dict)
  assert.equal(h.length, 3)
  const letters = h.ids.map((id) => s.tiles.find((t) => t.id === id).ch).sort().join('')
  assert.equal(letters, 'act')
  assert.equal(s.hints, 1)
  assert.equal(hint(bowlOf('xqz'), dict), null)
})

test('save and resume', () => {
  const s = createSession({ mode: 'daily', date: '2026-11-24' })
  settle(s.soup)
  const picks = []
  eachWord(dict, s.tiles, (w) => { if (!/[A-Z]/.test(w)) { picks.push(w); return true } return false }, 4)
  submit(s, dict, ids(s, picks[0]), { free: true })
  s.hints = 2
  const json = JSON.parse(JSON.stringify(snapshot(s)))
  const b = restore(json)
  assert.ok(b)
  assert.equal(b.score, s.score); assert.equal(b.drawn, s.drawn); assert.equal(b.wordCount, 1); assert.equal(b.hints, 2)
  assert.deepEqual(b.best, s.best)
  assert.deepEqual(b.tiles.map((t) => [t.id, t.ch, t.kind]), s.tiles.map((t) => [t.id, t.ch, t.kind]))
  b.tiles.forEach((t, i) => { assert.ok(Math.abs(t.x - s.tiles[i].x) < 1e-3 && Math.abs(t.y - s.tiles[i].y) < 1e-3); assert.equal(t.air, 0) })
  assert.deepEqual(peek(b, 3), peek(s, 3), 'the ladle carries on from the same place')
  // rush and zen too
  const z = createSession({ mode: 'rush', seed: 1234 }); z.timeLeft = 41.5; z.score = 77
  const z2 = restore(JSON.parse(JSON.stringify(snapshot(z))))
  assert.equal(z2.timeLeft, 41.5); assert.equal(z2.score, 77); assert.equal(z2.seed, 1234)
})

test('junk saves are refused, not crashed on', () => {
  const good = () => JSON.parse(JSON.stringify(snapshot(createSession({ mode: 'daily', date: '2026-11-24' }))))
  assert.ok(restore(good()))
  for (const junk of [null, undefined, 7, 'soup', [], {}, { v: 1 }, { v: 2, mode: 'daily', tiles: [] }, { v: 1, mode: 'nope', tiles: [] }, { v: 1, mode: 'daily', date: 'yesterday', tiles: [] }]) assert.equal(restore(junk), null)
  let g = good(); g.tiles[3].ch = 'q'; g.tiles[3].kind = 'gold'
  assert.equal(restore(g), null, 'letters that do not match the recipe')
  g = good(); g.tiles.push({ ...g.tiles[2] })
  assert.equal(restore(g), null, 'duplicate noodles')
  g = good(); g.drawn = 3
  assert.equal(restore(g), null)
  g = good(); g.seed = 1
  assert.equal(restore(g), null, 'wrong seed for the date')
  g = good(); g.tiles[2].id = 49
  assert.equal(restore(g), null, 'a noodle that has not left the ladle yet')
  g = good(); g.tiles[1].x = 1e9; g.tiles[2].y = NaN; g.score = -5; g.words = 'x'; g.best = { w: 'DROP TABLE', pts: 1 }; g.chili = 1e9
  const r = restore(g)
  assert.ok(r, 'bad numbers are clamped')
  assert.ok(r.tiles.every((t) => Number.isFinite(t.x) && Number.isFinite(t.y) && Math.hypot(t.x, t.y) <= BOWL_R - TILE_R + 1e-9))
  assert.equal(r.score, 0); assert.deepEqual(r.words, []); assert.equal(r.best, null); assert.equal(r.chili, CHILI_SECS)
  const rush = JSON.parse(JSON.stringify(snapshot(createSession({ mode: 'rush', seed: 9 })))); rush.timeLeft = 0
  assert.equal(restore(rush), null, 'a rush with no time left is over')
})
