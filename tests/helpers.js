// Shared test helpers: the real dictionary, and hand-built bowls.
import { readFileSync } from 'node:fs'
import { createDict } from '../src/logic/dict.js'
import { createSession } from '../src/logic/game.js'
import { TILE_R, MEAT_R } from '../src/logic/soup.js'

export const packed = readFileSync(new URL('../data/words.txt', import.meta.url), 'utf8')
export const dict = createDict(packed)

/** A session whose bowl is replaced by the given noodles: 'cat' or [{ ch, kind, x, y }]. Letters sit in a touching row unless x/y are given. */
export function bowlOf(spec, { mode = 'zen', seed = 7, gap = 2 * TILE_R + 0.01 } = {}) {
  const s = createSession({ mode, seed })
  s.tiles.length = 0
  const list = typeof spec === 'string' ? [...spec].map((ch) => ({ ch })) : spec
  const x0 = -((list.length - 1) * gap) / 2
  list.forEach((t, i) => {
    const kind = t.kind || (t.ch === '*' ? 'star' : t.ch === '#' ? 'meat' : 'plain'), meat = kind === 'meat'
    s.tiles.push({ id: 500 + i, ch: t.ch, kind, x: t.x ?? x0 + i * gap, y: t.y ?? 0, vx: 0, vy: 0, r: meat ? MEAT_R : TILE_R, m: meat ? 2.4 : 1, air: 0, wob: 0, tilt: 0, pulled: false })
  })
  return s
}
/** Ids of the tiles that spell `word`, in order ('*' picks a star). */
export const ids = (s, word) => { const used = new Set(); return [...word].map((ch) => { const t = s.tiles.find((x) => x.ch === ch && !used.has(x.id)); used.add(t.id); return t.id }) }
