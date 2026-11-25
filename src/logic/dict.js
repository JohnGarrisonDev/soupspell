// The dictionary: a packed word list (data/words.txt) turned into a compact trie. No DOM, works in node.
//
// Pack format ("front coding"): the words are sorted; each entry is one digit, the number of leading letters it shares
// with the previous word, followed by the rest of the word in lower case. No separators: the next digit starts the next word.
//   aah aahed aahing aahs aal  ->  0aah3ed3ing3s2l
// Words are 3 to 9 letters, so one digit is always enough.
import { BLOCKED } from './blocklist.js'

export const MIN_WORD = 3
export const MAX_WORD = 9
export const WILD = '*'

/** Pack a sorted, de-duplicated array of lower-case words. */
export function packWords(words) {
  let out = '', prev = ''
  for (const w of words) {
    let k = 0
    const max = Math.min(w.length, prev.length, 9)
    while (k < max && w.charCodeAt(k) === prev.charCodeAt(k)) k++
    out += k + w.slice(k)
    prev = w
  }
  return out
}

/** Unpack to an array of words (used by tests and tools; the game builds the trie straight from the packed text). */
export function unpackWords(packed) {
  const out = []
  let prev = '', i = 0
  const n = packed.length
  while (i < n) {
    const k = packed.charCodeAt(i) - 48
    let j = i + 1
    while (j < n && packed.charCodeAt(j) >= 97) j++
    prev = prev.slice(0, k) + packed.slice(i + 1, j)
    out.push(prev)
    i = j
  }
  return out
}

/**
 * Build the dictionary from packed text. The trie is stored in flat typed arrays:
 * node 0 is the root; letter[n] is 0..25; child[n] is the first child; next[n] the next sibling (alphabetical); end[n] marks a word.
 */
export function createDict(packed) {
  let cap = Math.max(64, packed.length + 2)
  const letter = new Uint8Array(cap), end = new Uint8Array(cap)
  const child = new Int32Array(cap), next = new Int32Array(cap)
  let count = 1, words = 0
  const path = new Int32Array(MAX_WORD + 2)   // path[d] = node at depth d of the previous word
  const last = new Int32Array(cap)            // last child of each node while building
  let i = 0
  const n = packed.length
  while (i < n) {
    let depth = packed.charCodeAt(i) - 48
    i++
    while (i < n) {
      const c = packed.charCodeAt(i)
      if (c < 97) break
      const parent = path[depth], node = count++
      letter[node] = c - 97
      if (last[parent]) next[last[parent]] = node; else child[parent] = node
      last[parent] = node
      path[++depth] = node
      i++
    }
    end[path[depth]] = 1
    words++
  }

  /** Child of node for letter code 0..25, or 0 when there is none. */
  const step = (node, code) => {
    for (let c = child[node]; c; c = next[c]) { if (letter[c] === code) return c; if (letter[c] > code) return 0 }
    return 0
  }
  const walk = (str) => {
    let node = 0
    for (let k = 0; k < str.length; k++) { node = step(node, str.charCodeAt(k) - 97); if (!node) return -1 }
    return node
  }
  const has = (word) => {
    if (word.length < MIN_WORD || word.length > MAX_WORD || BLOCKED.has(word)) return false
    const node = walk(word)
    return node > 0 && end[node] === 1
  }
  const hasPrefix = (prefix) => prefix.length === 0 || walk(prefix) > 0

  /**
   * Resolve a pattern that may contain wildcards ('*') to a real word, or null. With several candidates the wildcard takes
   * the letter that comes first in `prefer` (a string of letters, best first), so the game can favour high-value letters.
   */
  const resolve = (pattern, prefer = 'abcdefghijklmnopqrstuvwxyz') => {
    if (pattern.length < MIN_WORD || pattern.length > MAX_WORD) return null
    if (!pattern.includes(WILD)) return has(pattern) ? pattern : null
    const rec = (node, k, acc) => {
      if (k === pattern.length) return end[node] && !BLOCKED.has(acc) ? acc : null
      const ch = pattern[k]
      if (ch !== WILD) { const c = step(node, ch.charCodeAt(0) - 97); return c ? rec(c, k + 1, acc + ch) : null }
      for (let p = 0; p < prefer.length; p++) {
        const c = step(node, prefer.charCodeAt(p) - 97)
        if (c) { const r = rec(c, k + 1, acc + prefer[p]); if (r) return r }
      }
      return null
    }
    return rec(0, 0, '')
  }

  return { has, hasPrefix, resolve, step, wordCount: words, nodeCount: count, letter, child, next, end }
}
