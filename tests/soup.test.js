import test from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../kit/kit.js'
import { createSoup, stepSoup, stepAir, stirSoup, settle, atRest, linked, dropSpot, DT, TILE_R, MEAT_R, LINK_K, BOWL_R } from '../src/logic/soup.js'

const body = (id, x, y, extra = {}) => ({ id, ch: 'a', kind: 'plain', x, y, vx: 0, vy: 0, r: TILE_R, m: 1, air: 0, wob: 0, tilt: 0, pulled: false, ...extra })
function fill(n, seed, meat = 1) {
  const soup = createSoup(), rng = makeRng(seed)
  for (let i = 0; i < n; i++) { const isMeat = i < meat, r = isMeat ? MEAT_R : TILE_R, p = dropSpot(soup, rng, r); soup.tiles.push(body(i, p.x, p.y, isMeat ? { kind: 'meat', r, m: 2.4 } : {})) }
  return soup
}
const check = (soup) => {
  for (const t of soup.tiles) {
    assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.vx) && Number.isFinite(t.vy), 'finite')
    assert.ok(Math.hypot(t.x, t.y) <= BOWL_R - t.r + 1e-6, 'inside the bowl')
  }
}
const worstOverlap = (soup) => { let w = 0; for (const a of soup.tiles) for (const b of soup.tiles) if (a.id < b.id) w = Math.max(w, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y)); return w }

test('link distance', () => {
  const a = body(1, 0, 0), reach = LINK_K * TILE_R
  assert.ok(linked(a, body(2, 2 * TILE_R, 0)), 'touching')
  assert.ok(linked(a, body(2, reach - 1e-6, 0)), 'nearly touching')
  assert.ok(!linked(a, body(2, reach + 1e-3, 0)), 'too far')
  assert.ok(!linked(a, a), 'not itself')
  assert.ok(!linked(a, body(2, 0.25, 0, { kind: 'meat' })), 'meatballs never link')
  assert.ok(!linked(a, body(2, 0.25, 0, { air: 0.2 })), 'not while in the air')
})

test('30 noodles: stirred hard, nothing escapes, no NaN, and it settles', () => {
  for (const seed of [1, 2, 3]) {
    const soup = fill(30, seed), rng = makeRng(seed * 99)
    let px = 0, py = 0
    for (let i = 0; i < 60 * 12; i++) {
      const x = (rng() * 2 - 1) * 1.3, y = (rng() * 2 - 1) * 1.3     // wild strokes, some outside the bowl
      if (i % 3 === 0) { stirSoup(soup, px, py, x, y, DT); px = x; py = y }
      stepSoup(soup, DT)
      check(soup)
    }
    const steps = settle(soup, 60 * 15)
    assert.ok(atRest(soup), `at rest after ${steps} steps`)
    assert.ok(steps < 60 * 15, "settles: " + steps)
    assert.ok(worstOverlap(soup) < 0.012, 'no overlap left: ' + worstOverlap(soup))
    const before = soup.tiles.map((t) => [t.x, t.y])
    for (let i = 0; i < 300; i++) stepSoup(soup, DT)
    soup.tiles.forEach((t, i) => assert.ok(Math.hypot(t.x - before[i][0], t.y - before[i][1]) < 1e-4, 'a resting noodle stays where it was herded: ' + Math.hypot(t.x - before[i][0], t.y - before[i][1])))
  }
})

test('overlapping circles separate, even dead centre on each other', () => {
  const soup = createSoup()
  soup.tiles.push(body(1, 0.2, 0.2), body(2, 0.2, 0.2), body(3, 0.21, 0.2), body(4, 0.2, 0.2, { kind: 'meat', r: MEAT_R, m: 2.4 }))
  for (let i = 0; i < 240; i++) { stepSoup(soup, DT); check(soup) }
  assert.ok(worstOverlap(soup) < 0.012, String(worstOverlap(soup)))
})

test('the spoon drags nearby noodles along and leaves far ones alone', () => {
  const soup = createSoup()
  soup.tiles.push(body(1, 0, 0.05), body(2, 0, -0.8))
  for (let i = 0; i < 20; i++) { const x0 = -0.3 + i * 0.03; stirSoup(soup, x0, 0, x0 + 0.03, 0, DT); stepSoup(soup, DT) }
  assert.ok(soup.tiles[0].x > 0.15, 'carried: ' + soup.tiles[0].x)
  settle(soup)
  assert.ok(Math.abs(soup.tiles[1].x) < 0.08 && soup.tiles[1].y < -0.7, 'the far one barely moves')
  // junk input does nothing
  stirSoup(soup, 0, 0, 0, 0, DT); stirSoup(soup, 0, 0, 1, 1, 0); stirSoup(soup, NaN, 0, 1, 1, DT)
  stepSoup(soup, DT); check(soup)
})

test('nearly touching letters drift together and become linked', () => {
  const soup = createSoup(), gap = 0.07
  soup.tiles.push(body(1, -TILE_R - gap / 2, 0), body(2, TILE_R + gap / 2, 0))
  assert.ok(!linked(soup.tiles[0], soup.tiles[1]))
  settle(soup, 600)
  assert.ok(atRest(soup) && linked(soup.tiles[0], soup.tiles[1]))
  // but letters well apart stay put
  const far = createSoup()
  far.tiles.push(body(1, -0.3, 0), body(2, 0.3, 0))
  for (let i = 0; i < 300; i++) stepSoup(far, DT)
  assert.equal(far.tiles[0].x, -0.3)
})

test('a noodle lands with a splash that nudges its neighbours; a frozen soup only lands', () => {
  const soup = createSoup()
  soup.tiles.push(body(1, 0, 0), body(2, 0.3, 0, { air: 0.1 }))
  for (let i = 0; i < 4; i++) stepAir(soup, DT)
  assert.ok(soup.tiles[1].air > 0)
  for (let i = 0; i < 5; i++) stepAir(soup, DT)
  assert.equal(soup.tiles[1].air, 0)
  assert.ok(soup.events.some((e) => e.type === 'splash'))
  assert.ok(soup.tiles[0].vx < 0, 'pushed away from the splash')
  assert.equal(soup.tiles[0].x, 0, 'but frozen in place until the trace ends')
  stepSoup(soup, DT)
  assert.ok(soup.tiles[0].x < 0)
})
