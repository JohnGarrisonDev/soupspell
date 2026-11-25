import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { packWords, unpackWords, createDict, MIN_WORD, MAX_WORD } from '../src/logic/dict.js'
import { BLOCKLIST, BLOCKED } from '../src/logic/blocklist.js'
import { hashString } from '../kit/kit.js'
import { packed, dict } from './helpers.js'

test('pack and unpack round-trip', () => {
  const words = ['aah', 'aahed', 'aahing', 'aahs', 'aal', 'zebra', 'zebras', 'zzz']
  assert.equal(packWords(words), '0aah3ed3ing3s2l0zebra5s1zz')
  assert.deepEqual(unpackWords(packWords(words)), words)
  assert.deepEqual(unpackWords(''), [])
})

test('the shipped word file is intact', () => {
  const words = unpackWords(packed)
  assert.equal(words.length, 105030)
  assert.equal(hashString(packed), 1692740516)
  assert.ok(packed.length < 400000, 'stays a small download')
  for (let i = 1; i < words.length; i++) assert.ok(words[i - 1] < words[i], 'sorted, no duplicates')
  assert.ok(words.every((w) => w.length >= MIN_WORD && w.length <= MAX_WORD && /^[a-z]+$/.test(w)))
  assert.equal(packWords(words), packed)
})

test('the shipped word file matches the ENABLE source list', { skip: !existsSync(new URL('../tools/enable1.txt', import.meta.url)) }, () => {
  const src = readFileSync(new URL('../tools/enable1.txt', import.meta.url), 'utf8').split(/\r?\n/).map((w) => w.trim()).filter(Boolean)
  assert.equal(src.length, 172823)
  const want = [...new Set(src)].filter((w) => w.length >= MIN_WORD && w.length <= MAX_WORD && !BLOCKED.has(w)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  assert.deepEqual(unpackWords(packed), want)
  // every one of them is found by the trie, and a sample of non-words is not
  for (const w of want) if (!dict.has(w)) assert.fail('missing ' + w)
  const all = new Set(src)
  for (const w of ['xqz', 'soupp', 'aaa', 'qwerty', 'zzzzzz']) assert.equal(dict.has(w), all.has(w))
})

test('lookups', () => {
  assert.equal(dict.wordCount, 105030)
  for (const w of ['soup', 'cat', 'noodle', 'quizzical', 'aah', 'zax']) assert.ok(dict.has(w), w)
  for (const w of ['', 'so', 'oup', 'soupy!', 'xyzzy', 'noodlez', 'uncopyrightable']) assert.ok(!dict.has(w), w)
  assert.ok(dict.hasPrefix('sou') && dict.hasPrefix('') && !dict.hasPrefix('qx'))
})

test('blocked words are never accepted', () => {
  assert.ok(BLOCKLIST.length > 50)
  for (const w of BLOCKLIST) assert.ok(!dict.has(w), w)
  // even when a blocked word is in the packed data, has() and resolve() refuse it
  const d = createDict(packWords(['cat', 'slit', 'slut']))
  assert.ok(d.has('cat') && d.has('slit') && !d.has('slut'))
  assert.equal(d.resolve('sl*t'), 'slit')
  assert.equal(d.resolve('sl*t', 'ui'), 'slit')
  for (const ok of ['spicy', 'jewel', 'homonym', 'raccoon']) assert.ok(dict.has(ok), ok)
})

test('wildcards resolve to a real word', () => {
  assert.equal(dict.resolve('cat'), 'cat')
  assert.equal(dict.resolve('c*t', 'uoa'), 'cut')
  assert.equal(dict.resolve('c*t', 'aou'), 'cat')
  assert.equal(dict.resolve('q*z'), null)
  assert.equal(dict.resolve('*'), null)
  const w = dict.resolve('s**p', 'etaoinsrhldcumfpgwybvkxjqz')
  assert.ok(w && dict.has(w) && w[0] === 's' && w[3] === 'p')
  assert.ok(dict.has(dict.resolve('za*')))
})
