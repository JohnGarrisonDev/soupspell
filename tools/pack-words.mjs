// Dev tool: build data/words.txt from the ENABLE word list (public domain).
//   node tools/pack-words.mjs [path/to/enable1.txt]
// Keeps words of 3 to 9 letters, drops the blocklist, front-codes the rest (format: see src/logic/dict.js).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { packWords, unpackWords, MIN_WORD, MAX_WORD } from '../src/logic/dict.js'
import { BLOCKED } from '../src/logic/blocklist.js'
import { hashString } from '../kit/kit.js'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const src = process.argv[2] || here('./enable1.txt')
export function sourceWords(text) {
  return [...new Set(text.split(/\r?\n/).map((w) => w.trim().toLowerCase()))]
    .filter((w) => /^[a-z]+$/.test(w) && w.length >= MIN_WORD && w.length <= MAX_WORD && !BLOCKED.has(w))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const words = sourceWords(readFileSync(src, 'utf8'))
  const packed = packWords(words)
  const back = unpackWords(packed)
  if (back.length !== words.length || back.some((w, i) => w !== words[i])) throw new Error('round trip failed')
  writeFileSync(here('../data/words.txt'), packed)
  console.log(`${words.length} words, ${packed.length} bytes, hash ${hashString(packed)}`)
}
