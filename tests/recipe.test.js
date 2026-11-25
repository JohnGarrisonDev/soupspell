import test from 'node:test'
import assert from 'node:assert/strict'
import { makeLadle, dailyRecipe, dailySeed, recipeString, DAILY_START, DAILY_TOTAL, SPECIAL_BLOCK } from '../src/logic/recipe.js'
import { isVowel } from '../src/logic/letters.js'
import { anyWord } from '../src/logic/game.js'
import { hashString } from '../kit/kit.js'
import { dict } from './helpers.js'

// If this test fails you changed the recipe generator, and with it every player's Daily Bowl.
// Do not paste in new values to make it pass: see "The recipe" in AGENTS.md.
const SNAPSHOT = {
  '2026-11-24': 'ai*wlcruehedtnZ!uriomltepeusoN!legkutoiS^nzfeecotaipB^',
  '2026-12-25': 'oeseH!rilbpteE^diwfubpehE!olsdjinuepsrmaoeD^hezia*oduh',
  '2027-02-28': 'ntK!elajuritncasdoL^uehremotlp*kfaighE^eujwcK!ieambuoe',
  '2028-02-29': 'leumhT^iarjeeobkmtA!rhlnoeet*maxuerntwI!eulpR^seoytank',
}

test('daily recipes never change (snapshot)', () => {
  for (const [date, want] of Object.entries(SNAPSHOT)) assert.equal(recipeString(dailySeed(date)), want, date)
  assert.equal(hashString(recipeString(12345, 300)), 2332236301)
  assert.equal(dailySeed('2026-11-24'), hashString('soupspell:2026-11-24'))
})

test('same date, same recipe; different date, different recipe', () => {
  const a = dailyRecipe('2026-11-24'), b = dailyRecipe('2026-11-24'), c = dailyRecipe('2026-11-25')
  assert.deepEqual(a, b)
  assert.notDeepEqual(a.tiles, c.tiles)
  assert.equal(a.tiles.length, DAILY_TOTAL)
  assert.equal(a.start, DAILY_START)
  // asking out of order gives the same noodles
  const l1 = makeLadle(99), l2 = makeLadle(99)
  const late = l1.at(70)
  for (let i = 0; i < 70; i++) l2.at(i)
  assert.deepEqual(l2.at(70), late)
})

test('fair bags: vowel balance, variety and specials over many seeds', () => {
  let rare = 0, total = 0
  for (let seed = 1; seed <= 400; seed++) {
    const ladle = makeLadle(hashString('fair' + seed)), tiles = []
    for (let i = 0; i < 100; i++) tiles.push(ladle.at(i))
    const letters = tiles.map((t) => t.ch)
    const ratio = (from, to) => { let v = 0, n = 0; for (let i = from; i < to; i++) { if (letters[i] === '*') continue; n++; if (isVowel(letters[i])) v++ } return v / n }
    const start = ratio(0, DAILY_START), day = ratio(0, DAILY_TOTAL)
    assert.ok(start >= 0.25 && start <= 0.6, `seed ${seed}: starting bowl vowel share ${start}`)
    assert.ok(day >= 0.34 && day <= 0.48, `seed ${seed}: daily vowel share ${day}`)
    // any 6 in a row hold at least one vowel and at least two consonants (stars aside)
    for (let i = 0; i + 6 <= 100; i++) {
      const win = letters.slice(i, i + 6).filter((ch) => ch !== '*'), v = win.filter(isVowel).length
      if (win.length === 6) assert.ok(v >= 1 && v <= 4, `seed ${seed} at ${i}: ${win.join('')}`)
    }
    // q always brings a u (or a star) right behind it
    letters.forEach((ch, i) => { if (ch === 'q' && i < 99) assert.ok(letters[i + 1] === 'u' || letters[i + 1] === '*', `seed ${seed}: q without u`) })
    // specials: exactly one in every block; 2 golden, 2 chili and 1 star (or a third golden when the star fell on a q) per 50
    for (let b = 0; b < 100; b += SPECIAL_BLOCK) assert.equal(tiles.slice(b, b + SPECIAL_BLOCK).filter((t) => t.kind !== 'plain').length, 1)
    const kinds = (k) => tiles.slice(0, 50).filter((t) => t.kind === k).length
    assert.equal(kinds('chili'), 2)
    assert.equal(kinds('gold') + kinds('star'), 3)
    assert.ok(kinds('star') <= 1)
    assert.ok(tiles.every((t) => (t.kind === 'star') === (t.ch === '*') && /^[a-z*]$/.test(t.ch)))
    rare += letters.filter((ch) => 'jqxz'.includes(ch)).length; total += 100
    // the starting bowl always has a word in it
    assert.ok(anyWord(dict, tiles.slice(0, DAILY_START)), `seed ${seed}: unplayable start`)
  }
  assert.ok(rare / total > 0.01 && rare / total < 0.06, 'rare letters are rare but present: ' + rare / total)
})
