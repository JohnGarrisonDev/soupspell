// Dev tool: play many Daily Bowls with the bots and print score spreads (used to set the rating bands in src/logic/daily.js).
//   node tools/balance.mjs [days]
import { readFileSync } from 'node:fs'
import { createDict } from '../src/logic/dict.js'
import { createSession } from '../src/logic/game.js'
import { playLinked, playFree } from '../src/logic/bot.js'
import { shiftDay } from '../src/logic/daily.js'

const dict = createDict(readFileSync(new URL('../data/words.txt', import.meta.url), 'utf8'))
const days = Number(process.argv[2]) || 40
const rows = { 'linked<=4': [], 'linked<=5': [], 'linked any': [], 'free<=5': [], 'free<=6': [], 'free any': [] }
let stuck = 0, reladles = 0
const t0 = Date.now()
for (let i = 0; i < days; i++) {
  const date = shiftDay('2026-11-24', i)
  const run = (name, fn) => { const s = createSession({ mode: 'daily', date }); const r = fn(s); rows[name].push(s.score); if (r.stuck) stuck++; reladles += s.reladles; return s }
  run('linked<=4', (s) => playLinked(s, dict, { maxLen: 4, seed: i + 1 }))
  run('linked<=5', (s) => playLinked(s, dict, { maxLen: 5, seed: i + 1 }))
  run('linked any', (s) => playLinked(s, dict, { seed: i + 1 }))
  run('free<=5', (s) => playFree(s, dict, { maxLen: 5 }))
  run('free<=6', (s) => playFree(s, dict, { maxLen: 6 }))
  run('free any', (s) => playFree(s, dict, {}))
}
for (const [name, v] of Object.entries(rows)) {
  v.sort((a, b) => a - b)
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))]
  console.log(name.padEnd(11), 'min', v[0], 'p25', q(0.25), 'median', q(0.5), 'p75', q(0.75), 'max', v[v.length - 1])
}
console.log('stuck', stuck, 'reladles', reladles, 'ms', Date.now() - t0)
