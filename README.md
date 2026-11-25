# Soupspell

A word game where the letters are physical. A big bowl of alphabet soup, seen from above: the letter noodles float, and you can only spell through letters that touch. Need two letters next to each other? Stir. Your finger is the spoon.

Part of [Oddvale Games](https://games.oddvale.com), a site of browser games designed, built and updated by AI models. Play it at **games.oddvale.com/soupspell**.

## How it plays

- Drag through touching letters, in order, and let go to spell (3 letters or more). Or tap letters one at a time and tap **Spell it**.
- Drag through open broth to stir. The spoon carries nearby letters along; letters that end up nearly touching drift together and link.
- Spelled letters are slurped by the robot chef, who ladles in new ones.
- Score = letter values × a length multiplier that grows steeply (3 letters ×1, 5 ×3, 7 ×8, 9 ×17).
- Golden noodles double the word, a chili gives the next word ×1.5 if you spell it within 25 seconds, star pasta is any letter, and the meatball is just in the way.

Modes:

- **Daily Bowl**: the same 50 letters for everyone each day (16 in the bowl, 34 in the ladle). No clock. Rating, streak, history, and a spoiler-free result to copy.
- **Rush**: 90 seconds, endless ladle, a combo multiplier for quick words.
- **Zen**: endless soup, no pressure.

Everything saves in the browser (`localStorage`), including bowls in progress.

## Run it

No build step and no dependencies. Serve the folder with any static server and open it:

```
npx serve .
```

Tests (Node 20+):

```
node --test tests/
```

Add `?debug` to the URL for a `window.__game` hook (see AGENTS.md).

## Layout

```
index.html          the page (Oddvale shell + the stage)
game.json           metadata for the hub
data/words.txt      the dictionary, packed (about 313 KB, about 130 KB gzipped)
src/main.js         app state, input, frame loop, saving, screens
src/render.js       canvas drawing: tablecloth, bowl, noodles, chef
src/ui.js           DOM overlays: title, HUD, modals, toasts
src/audio.js        synthesised sound effects
src/game.css        styles for everything inside the stage
src/logic/          pure rules, shared by the game and the tests
  dict.js           packed word list -> trie, lookups, wildcard resolution
  blocklist.js      words the game never accepts
  letters.js        letter values, length multiplier, scoring
  recipe.js         the seeded ladle (letter sequence) and the daily recipe
  soup.js           physics: floating circles in a round bowl, the spoon, links
  game.js           a bowl in play: chains, submit, refills, timers, hints, save/resume
  daily.js          date keys, streaks, ratings, share text
  save.js           save schema, sanitiser, records, achievements
  bot.js            headless players (tests, balance, debug hook)
kit/                copy of the Oddvale kit (do not edit)
tools/              dev-only: pack-words.mjs, balance.mjs, enable1.txt (the source word list)
tests/              node --test
```

See [AGENTS.md](AGENTS.md) for architecture notes, balance numbers and the ideas backlog.

## Word list

The dictionary is built from **ENABLE** (Enhanced North American Benchmark Lexicon, `enable1.txt`), which its authors placed in the **public domain**. Soupspell ships the 3 to 9 letter words from it (105,030 of them), minus a small blocklist of slurs, front-coded into `data/words.txt` by `tools/pack-words.mjs`. The untouched source list is kept in `tools/` so the pack can be rebuilt and checked.

## License
Code is MIT licensed, see [LICENSE](LICENSE). The word list is derived from ENABLE, which is public domain. The fonts in `kit/fonts/` (Fraunces, Figtree, DM Mono) are under the SIL Open Font License 1.1. The Oddvale name and mark are not covered by the MIT license.
