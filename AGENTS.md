# Notes for the next AI

Soupspell is an Oddvale Games title. Read the hub's `GAME_GUIDE.md` first (no build step, no dependencies, relative URLs, localStorage only, strict CSP: no inline scripts, no `eval`). This file is what you need on top of that.

## Architecture in one minute

- `src/logic/*` is pure: no DOM, no clock, no `window`. All rules live there and are covered by `tests/`. If a rule changes, change it there and add a test.
- `src/main.js` owns the app: one `app` object, the `actions` table (every button lands there by `data-act` name), pointer and keyboard input, the fixed-step frame loop, and all saving.
- `src/ui.js` builds the DOM overlays once and exposes dumb setters. It never touches game state.
- `src/render.js` draws the whole canvas every frame from a "scene" object that `main.js` builds in `render()`.
- The canvas fills the stage. Each screen's markup holds an empty `.slot`; `main.js` measures it and `R.layout()` fits the bowl (plus the chef's head) inside. So layout is CSS: move the slot, the bowl follows.
- `main.js` adds `.portrait` to the stage when it is taller than wide and sets the `.ui` font-size from the stage size. All sizes in `game.css` are in `em`. The stage is always cream, also in dark mode.
- Careful with class names in `game.css`: the page shell already uses `.word` (the logo), `.card`, `.chip`, `.wrap`, `.label`. Scope new rules under `.ui` or a game-only class.

### World units and physics (`soup.js`)

The bowl is a circle of radius 1 at (0, 0). A letter noodle has radius `TILE_R` 0.125, the meatball 0.165. A session's `tiles` array *is* the physics body list (`s.tiles === s.soup.tiles`): each tile is `{ id, ch, kind, x, y, vx, vy, r, m, air, wob, tilt }`.

- `stepSoup(soup, DT)`: fixed 1/60 step. Heavy drag toward the broth velocity (a rigid swirl `omega` that decays), soft position-based collisions with a little slop (no jitter), wall clamp, sleeping below a speed threshold.
- "Cheerios effect": letters whose gap is under 0.9 radii drift together until they touch. This is what makes adjacency unambiguous: after a second, two letters are either touching (linked) or clearly apart. A pulled letter that cannot get there (something is in the way) is marked `tired` and stops pulling until it is knocked.
- `stirSoup(soup, x0, y0, x1, y1, dt)`: the spoon drags letters within `SPOON_R` toward its own velocity (so a stroke through a letter carries it along) and adds a little swirl. There is no fluid grid; ripples are purely visual.
- `linked(a, b)`: centres within `LINK_K` (2.35) radii, both landed, neither a meatball.
- `air > 0` means the noodle is still falling from the ladle: no collisions, cannot be picked. Landing makes a splash that nudges neighbours.
- While a word is being traced (`app.chain` not empty) `main.js` calls `stepAir` instead of `stepSoup`: the soup is frozen, only landings happen.
- Physics is not bit-identical across devices and does not need to be. Daily fairness comes from the letter sequence.

### The recipe (read before touching `recipe.js`)

`makeLadle(seed).at(i)` is the i-th noodle of an endless seeded sequence. Tile ids are ladle indices (the meatball is id 9000). The Daily Bowl is `makeLadle(hashString('soupspell:' + 'YYYY-MM-DD'))`, first 16 in the bowl, 34 in the ladle.

**Any change to `recipe.js`, to the kit's `makeRng`/`hashString`, or to the order or number of `rng()` calls silently changes every Daily Bowl.** Two players on different versions would get different letters, and saved in-progress dailies would be refused. `tests/recipe.test.js` holds snapshot strings for four dates and a hash of a 300-noodle run. If that test fails, you changed the recipe. Do not paste in new values to make it pass. To change the generator, add a new code path chosen by date (for example `if (dateKey >= '2027-03-01')` use recipe v2) and leave the old one exactly as it is.

What the generator does (the vowel, Q and specials rules are tested over 400 seeds): every run of five letters has 1 to 3 vowels, the long-run vowel share is steered to 40%, it avoids repeating a letter within 7 draws and keeps rare letters (J Q X Z V) about 12 apart, Q is always followed by U, and every block of 10 holds exactly one special (per 50: 2 golden, 2 chili, 1 star; a star that lands on a Q becomes golden).

Where a new noodle lands is not part of the recipe: `dropSpot` picks a seeded spot right next to existing noodles, so new letters arrive already linked to something.

### A bowl in play (`game.js`)

`createSession({ mode, seed | date })`, `evaluate` (look at a chain), `submit` (spell it), `tick` (chili, combo, Rush clock), `hint`, `finish`, `snapshot`/`restore`.

- `submit` removes the letters, draws the same number from the ladle, then `ensurePlayable`: if no dictionary word can be made from the bowl (ignoring positions), the chef swaps up to 4 plain noodles for fresh ones, free. In the Daily this has not triggered once in bot runs, but it is there.
- Daily ends when the ladle is empty and either no word can be made (`nowords`), the bowl is empty (`clean`), or the player taps "I'm full" (`full`). Zen ends on "I'm full". Rush ends on time.
- `restore` rebuilds each tile from the recipe by id and refuses the save if letters do not match, so junk or tampered saves cannot crash or invent letters.

### Dictionary (`dict.js`, `data/words.txt`)

ENABLE (public domain), 3 to 9 letters, minus `blocklist.js`, front-coded: each entry is one digit (letters shared with the previous word) plus the rest of the word. `createDict` builds a first-child/next-sibling trie in typed arrays straight from the packed text (about 208k nodes, a few ms). `resolve('c*t', order)` fills star pasta. To rebuild the file: `node tools/pack-words.mjs`, then update the count and hash in `tests/dict.test.js`. Adding a word to the blocklist does not need a rebuild (`has()` refuses blocked words anyway), but rebuild so the file and the tests agree.

Changing the dictionary does not change recipes, but it can change which star-pasta word is shown and what the bots score. It can also change when `ensurePlayable` re-ladles, which changes which letters a Daily player sees after that point, so treat it as part of the Daily too.

**Everyday words (1.3).** `src/logic/common.js` is Rungs' hand-picked 3-5 letter puzzle list, copied unchanged (`COMMON`, `isCommon` in `game.js`). It only steers output, never what counts: `hint` prefers the shortest everyday word (an everyday 4 beats an obscure 3), and `bestLeft` (the leftovers line on the result card, ignoring position) only considers 3-5 letter words that are everyday ones. It returns `{ word, everyday }`: the longest `isEveryday` word (common, or common + s/es/d/ed/er/ing) when it is within two letters of the longest word at all, else that longest word with `everyday: false`, which the card labels "Longest word left in the bowl". The Daily result card wraps its halves in `.r-col` (display: contents upright, two columns sideways).

## Save data

One blob at `oddvale:soupspell`; schema at the top of `save.js`. `sanitize()` rebuilds a clean save from whatever it finds, so add new fields there with a default. `progress.daily / rush / zen` hold one snapshot each, written after every word, when a stir ends, every 5 seconds while things move, and when the tab hides. `last` remembers which bowl was on screen so a reload drops back into it (Rush resumes paused). A daily snapshot from another date is ignored.

## Player input (`kit/talk.js`)

The hub's anonymous player-input widgets (copy of the kit, do not edit). `openResult` calls `dailyTalk` for the Daily Bowl only, into an empty `[data-talk]` under the buttons, with `key` = the bowl's date and `score` = points (higher is better; API board `bowl`, the default). Boot calls `tellUs` into `#tell-us` in the info section. Both stay hidden when the API (`/api/v1/`) is unreachable, so a plain static server shows nothing extra.

## Testing by hand

Serve the folder and open `/?debug`. `window.__game` has: `state()`, `advance(seconds)` (runs the fixed-step update, then draws; use it because background tabs throttle animation frames), `tilePoint(id)` and `worldPoint(x, y)` (client coordinates for synthetic pointer events), `words(maxLen)` (linked words right now), `spellBest(maxLen)` (spells one through the real code path), `stroke(seed)` (a spoon stroke toward the middle), `devour(maxLen)` (finishes the bowl with the position-blind bot), plus `app`, `save`, `actions`, `ui`.

`node --test tests/` works because of `tests/index.js`. If you add a test file, import it there.

## Balance notes

- Letter values and `LENGTH_MULT` are in `letters.js`. Chili is ×1.5 for 25 s; Rush combo is +0.25 per quick word (within 8 s), capped at ×3.
- Rating bands (`daily.js`): 0 / 150 / 250 / 400 / 650. They come from `node tools/balance.mjs` (30 days): a bot that only traces what is already linked, stirring toward the middle when stuck, has a median of about 160 (range 120 to 230); a perfect herder limited to 5-letter words about 370, to 6-letter words about 625. So: no real herding = 1 or 2 stars, steady 5-letter play = 3, regular 6-letter words = 4, sevens = 5.
- Bowl sizes: Daily 16, Rush 18, Zen 20 (plus a meatball in Daily and Zen). Physics is tested with 30.
- Noodle size (measured 1.3, `worldPoint`): 360x640 in the page 29px (was 28), in full screen 37px (was 35.5); 390x844 page 36px, full 41px; 844x390 page 24px, full 32px. In portrait the bowl is height-limited (the chef's head needs 1.62 radii above the centre), so 1.3 trimmed the gaps, the word box and the button rows around it. The portrait word box has a fixed height (4em): it used to grow 6-10px when a trace began, which re-laid out the bowl under the finger. The pick radius is 18% larger than the noodle. Do not shrink `TILE_R` or add more letters to the bowl without checking that.
- Sounds are all in `audio.js`, rate-limited. The trace chime climbs a pentatonic scale per letter.

## Known weak spots

- Drag-tracing on a small phone hides the letter under the finger. Since 1.2.0 a touch trace draws the last picked letter magnified in a bubble ~76px above the finger (`scene.finger`, drawn at the end of `render.js`), and the big word display above the bowl is the main feedback. Tap play is the precise alternative.
- A crowded 30-letter soup can take several seconds to go fully to rest (the main motion stops in about a second; the rest is tiny settling).
- The dictionary is ENABLE as-is: odd words (ICTUS, NOH) are still accepted, on purpose (generous is kinder in a physics word game, and the dictionary can change Daily re-ladles). Since 1.3 hints and the leftovers line prefer everyday words; the bots' "best word" can still be odd. Some everyday proper nouns and newer words are not accepted.
- Copy result: 1.3 adds a visible fallback (a selected read-only text box in the card, `showShareText`) when both `navigator.clipboard` and `execCommand('copy')` fail. Checked by stubbing both to fail; a real successful copy on a phone is still unconfirmed.
- The leftovers line is shown only on the card that appears when a bowl ends (not when a finished Daily's card is reopened later: it is not saved).
- The swirl is a rigid rotation of the whole bowl, so circular stirring is mostly for show; real mixing comes from the spoon dragging letters.
- Phone landscape: the kit sizes the stage from the viewport height, so it is small unless the player goes full screen.

## Phones and full screen (1.2.0)

- The kit's `wireChrome` gives full screen on every phone (native, or the iPhone "focus" fallback; both add `.stage.is-full`). In full screen `game.css` insets `.ui` by the safe areas, exactly like the kit insets the canvas, so the slot rect and the canvas stay in the same coordinates. Keep those two in step if you touch either.
- The kit's 44px exit button sits top-right inside the stage: the portrait HUD gets `padding-right: 50px` and the landscape ladle `padding-top: 48px` in full screen.
- Touch word entry: tap letters, the backspace button (`data-act="undo"`) un-picks the last one, Clear empties, Spell it submits. No text input anywhere, so the phone keyboard never opens.
- `haptic()` from the kit on pick, slurp, miss and the end of a bowl. `lostpointercapture` is treated like `pointercancel`; a second finger is ignored while one is down (`app.ptr`).
- `game.css` sizes the injected "Play full screen" button's icon (kit workaround: the kit's `.stage-cta svg` has no size yet).
- The canvas redraws every frame even when nothing moves.

## Ideas backlog

- Daily archive: play past days from the history strip (no streak credit).
- Save the leftovers word with the Daily result so a reopened card shows it too (add it to `save.js` sanitize).
- More specials, one at a time: an ice cube that freezes its neighbours in place, a twin noodle that counts as two letters, a bubble that pops and scatters letters.
- Bowl shapes for Zen (a square pan, a figure-eight casserole).
- A share image (canvas to PNG: the empty bowl, the score, the chef) next to the text result.
- A colour-blind check of gold/chili/star: they already have badges, but test it.
- Idle-throttle the render loop when the soup is at rest and nothing animates.
- Themed daily recipes on special dates (extra golden noodles on Fridays), behind a dated code path so old days never change.
