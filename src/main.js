// Soupspell entry point: app state, screen flow, input, frame loop, saving. Rules live in src/logic (pure, tested).
import { makeStore, wireChrome, haptic, C } from '../kit/kit.js'
import { createDict, MIN_WORD } from './logic/dict.js'
import { createSoup, stepSoup, stepAir, stirSoup, dropSpot, DT, TILE_R, MEAT_R, BOWL_R } from './logic/soup.js'
import { createSession, restore, snapshot, submit, evaluate, reachable, canExtend, tick, finish, canFinish, hint, peek, ladleLeft, tileById, CHILI_SECS, bestLeft } from './logic/game.js'
import { comboMult } from './logic/letters.js'
import { dateKey, streakInfo, recentDays, rating, nextRating, shareText, compare, RATINGS } from './logic/daily.js'
import { defaults, sanitize, recordWord, recordBowl, ACHIEVEMENTS } from './logic/save.js'
import { linkedWords, playFree, strokeIn } from './logic/bot.js'
import { makeRng } from '../kit/kit.js'
import { dailyTalk, tellUs } from '../kit/talk.js'
import { createRenderer } from './render.js'
import { createUI } from './ui.js'
import { snd } from './audio.js'

const stage = document.getElementById('stage'), canvas = document.getElementById('game'), uiRoot = document.getElementById('ui')
const store = makeStore('soupspell', defaults())
{ const clean = sanitize(store.data); for (const k of Object.keys(store.data)) delete store.data[k]; Object.assign(store.data, clean) }
const save = store.data
const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
const R = createRenderer(canvas)
const DEBUG = new URLSearchParams(location.search).has('debug')

const app = {
  dict: null, dictError: false, s: null, chain: [], ev: null, reach: new Set(), starLetters: new Map(),
  ptr: null, spoon: null, auto: null, spaceHeld: false, kbd: null,
  hint: new Set(), hintT: 0, flashUntil: 0, flash: null, shownScore: 0,
  time: 0, spin: 0, dirty: false, saveT: 0, ending: false, lastClock: -1, wasValid: false,
}
const demo = createSoup()
const fx = { ripples: [], drops: [], flying: [], confetti: [] }
const chef = { mood: 'idle', moodT: 0, moodLen: 1, bounce: 0, power: 1, pour: 0, blink: 0, blinkAt: 2, lookX: 0.5, lookY: 0.4, tx: 0.5, ty: 0.4, say: '', sayT: 0 }
const EMPTY = new Map(), NONE = new Set()

// ------------------------------------------------------------------ dictionary

const dictReady = fetch(new URL('../data/words.txt', import.meta.url))
  .then((r) => { if (!r.ok) throw new Error('words ' + r.status); return r.text() })
  .then((txt) => { app.dict = createDict(txt); return app.dict })
  .catch(() => { app.dictError = true; return null })

// ------------------------------------------------------------------ title

function buildDemo() {
  demo.tiles.length = 0
  const rng = makeRng(20261124), specs = [...'soupspell'].map((ch) => ({ ch, kind: 'plain' }))
  specs[3].kind = 'gold'; specs.push({ ch: '*', kind: 'star' }, { ch: 'a', kind: 'chili' }, { ch: 't', kind: 'plain' }, { ch: 'e', kind: 'plain' }, { ch: '#', kind: 'meat' })
  specs.forEach((sp, i) => {
    const r = sp.kind === 'meat' ? MEAT_R : TILE_R, p = dropSpot(demo, rng, r)
    demo.tiles.push({ id: i, ch: sp.ch, kind: sp.kind, x: p.x, y: p.y, vx: 0, vy: 0, r, m: sp.kind === 'meat' ? 2.4 : 1, air: 0, wob: 0, tilt: (rng() - 0.5) * 0.5, pulled: false })
  })
}

const DAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const prettyDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) }
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n)

function showTitle() {
  app.s = null; setChain([]); app.ptr = null; app.spoon = null; app.auto = null; app.ending = false
  save.last = null; store.save()
  ui.closeModal(); ui.hideCallout(); ui.show('title'); refreshTitle(); relayout()
}
function refreshTitle() {
  const today = dateKey(), res = save.daily.results, st = streakInfo(res, today), done = res[today], prog = save.progress.daily
  let dailySub = 'Same recipe for everyone · no clock'
  if (done) dailySub = `Eaten · ${done.score} pts · ${rating(done.score).name}`
  else if (prog && prog.date === today) dailySub = `Keep slurping · ${prog.score | 0} pts so far`
  if (st.current > 0) dailySub += ` · streak ${st.current}`
  ui.setTitle({
    dailySub,
    rushSub: save.progress.rush ? 'Bowl on hold · tap to resume' : save.bests.rush ? `90 seconds · best ${save.bests.rush}` : '90 seconds · combos',
    zenSub: save.progress.zen ? 'Your bowl is still warm' : 'Endless · no pressure',
    days: recentDays(res, today, 7).map((d) => {
      const [y, m, dd] = d.key.split('-').map(Number), wd = DAY[new Date(y, m - 1, dd).getDay()]
      return { label: wd, done: !!d.result, today: d.key === today, mark: d.result ? String(rating(d.result.score).stars) + '★' : '', title: d.result ? `${d.key}: ${d.result.score} pts` : `${d.key}: not played` }
    }),
  })
}

// ------------------------------------------------------------------ starting and saving bowls

const MODE_NAME = { daily: 'Daily Bowl', rush: 'Rush', zen: 'Zen' }

async function startMode(mode, { fresh = false } = {}) {
  if (!app.dict) {
    if (app.dictError) { ui.toast('The dictionary did not load. Check your connection and reload.', 4000); return }
    ui.toast('Simmering the dictionary…', 1500)
    await dictReady
    if (!app.dict) { ui.toast('The dictionary did not load. Check your connection and reload.', 4000); return }
  }
  const today = dateKey()
  let s = null, resumed = false
  if (mode === 'daily' && save.daily.results[today]) { openResult({ mode: 'daily', saved: save.daily.results[today], date: today }); return }
  const prog = save.progress[mode]
  if (prog && !fresh && (mode !== 'daily' || prog.date === today)) { s = restore(prog); resumed = !!s }
  if (!s) s = createSession(mode === 'daily' ? { mode, date: today } : { mode, seed: (Math.random() * 4294967296) >>> 0 })
  app.s = s; app.ending = false; app.shownScore = s.score; app.flash = null; app.hint.clear(); app.lastClock = -1
  fx.flying.length = 0; fx.ripples.length = 0; fx.drops.length = 0
  setChain([])
  save.last = mode; persist()
  ui.closeModal(); ui.show('play'); relayout(); syncHud()
  introduce(s.tiles)
  if (!save.seen.stir) setTimeout(() => { if (app.s === s && !save.seen.stir) { ui.callout('stir', 'Stir it up', 'Drag through the broth to push letters together. Touching letters can be spelled.', 7000) } }, 1400)
  if (resumed && mode === 'rush') openPause()
  if (resumed && s.over) endBowl()
}

function persist() {
  const s = app.s
  if (s) save.progress[s.mode] = s.over ? null : snapshot(s)
  app.dirty = false; app.saveT = 0
  store.save()
}

const CALLOUTS = {
  gold: ['Golden noodle', 'Use it in a word and the whole word scores double.'],
  chili: ['Chili noodle', `Spell it, then spell another word within ${CHILI_SECS} seconds for half as much again.`],
  star: ['Star pasta', 'Any letter you like. It becomes whatever makes a word.'],
  meat: ['Meatball', 'Just in the way. Stir it somewhere else.'],
}
function introduce(tiles) {
  for (const t of tiles) {
    if (CALLOUTS[t.kind] && !save.seen[t.kind]) {
      save.seen[t.kind] = true; store.save()
      const [title, body] = CALLOUTS[t.kind]
      setTimeout(() => { if (app.s) { ui.callout(t.kind, title, body); snd.callout() } }, 900)
      return
    }
  }
}

// ------------------------------------------------------------------ the chain (letters being spelled)

function setChain(ids) {
  app.chain = ids
  const s = app.s
  app.starLetters = EMPTY
  if (!s || !ids.length) { app.ev = null; app.reach = NONE; app.kbd = null; app.wasValid = false; syncWord(); return }
  const ev = app.ev = evaluate(s, app.dict, ids)
  app.reach = new Set(reachable(s, ids))
  if (ev.valid && ev.pattern.includes('*')) { const m = new Map(); ev.tiles.forEach((t, i) => { if (t.kind === 'star') m.set(t.id, ev.word[i]) }); app.starLetters = m }
  if (ev.valid && !app.wasValid) snd.valid()
  app.wasValid = ev.valid
  app.flash = null; app.hint.clear()
  syncWord()
}
function pick(id) { app.kbd = null; setChain([...app.chain, id]); snd.pick(app.chain.length); haptic(6); const t = tileById(app.s, id); if (t) t.wob = 0.6 }
function unpick() { if (!app.chain.length) return; snd.unpick(app.chain.length); setChain(app.chain.slice(0, -1)) }
function clearChain(quiet) { if (!app.chain.length) return; if (!quiet) snd.back(); setChain([]) }

function syncWord() {
  const s = app.s
  if (!s) return
  const ev = app.ev
  if (ev && app.chain.length) {
    const letters = ev.tiles.map((t, i) => ({ ch: ev.word ? ev.word[i] : t.ch === '*' ? '?' : t.ch, star: t.kind === 'star' }))
    let sub = ''
    if (ev.valid) {
      const sc = ev.score, parts = [`${sc.base} × ${sc.mult}`]
      if (sc.gold > 1) parts.push(`gold ×${sc.gold}`)
      if (sc.hot) parts.push('chili ×1.5')
      if (sc.combo > 1) parts.push(`combo ×${sc.combo}`)
      sub = `+${sc.total}  ·  ${parts.join(' · ')}`
    } else sub = app.chain.length < MIN_WORD ? `${MIN_WORD} letters or more` : 'Not a word yet'
    ui.setWord({ letters, state: ev.valid ? 'valid' : '', sub })
  } else if (app.flash) {
    ui.setWord({ letters: [...app.flash.word].map((ch) => ({ ch })), state: 'done', sub: app.flash.sub })
  } else {
    ui.setWord({ letters: [], state: 'idle', sub: s.wordCount ? 'Drag through touching letters, or stir the broth' : 'Drag through touching letters to spell. Drag the broth to stir.' })
  }
  syncHud()
}

function syncHud() {
  const s = app.s
  if (!s) return
  const left = ladleLeft(s)
  ui.setHud({
    mode: MODE_NAME[s.mode], modeSub: s.mode === 'daily' ? prettyDate(s.date) : s.mode === 'rush' ? `${s.wordCount} ${s.wordCount === 1 ? 'word' : 'words'}` : `${s.wordCount} ${s.wordCount === 1 ? 'word' : 'words'} so far`,
    score: Math.round(app.shownScore),
    clock: s.mode === 'rush' ? `${Math.floor(Math.ceil(s.timeLeft) / 60)}:${String(Math.ceil(s.timeLeft) % 60).padStart(2, '0')}` : null, clockLow: s.timeLeft <= 10,
    combo: s.mode === 'rush' && s.comboLeft > 0 ? `Combo ×${comboMult(s.combo + 1)} · ${Math.ceil(s.comboLeft)}s` : '',
    hot: s.chili > 0 ? `Chili ×1.5 · ${Math.ceil(s.chili)}s` : '',
    ladle: left === Infinity ? '∞' : String(left), next: peek(s, 3),
    canClear: app.chain.length > 0, canSpell: app.chain.length >= MIN_WORD && !s.over,
    canFull: canFinish(s) && !app.ending, canHint: !s.over,
  })
}

const PRAISE = { 5: ['Tasty!', 'Yum!', 'Nice one!'], 6: ['Mwah!', 'Delicious!'], 7: ['Magnifique!', 'Chef\'s kiss!'], 8: ['Legendary!'], 9: ['Impossible!'] }

/** Try to spell the current chain. keep: leave the chain in place when it is not a word (tap and keyboard play). */
function trySpell(keep) {
  const s = app.s
  if (!s || s.over || !app.chain.length) return
  const ids = app.chain, r = submit(s, app.dict, ids)
  if (!r.ok) {
    snd.nope(); ui.shakeWord(); react('sad'); haptic([10, 50, 10])
    if (r.reason === 'short') ui.toast(`Words need ${MIN_WORD} letters or more`, 1400)
    if (!keep || r.reason === 'links') setChain([])
    return
  }
  const len = r.word.length, today = dateKey()
  // slurp: the letters fly to the chef one after another
  r.removed.forEach((t, i) => fx.flying.push({ tile: { ...t, wob: 0 }, t: -i * 0.05, life: 0.42 }))
  snd.gulp(len); haptic(len >= 6 ? [18, 40, 28] : 18)
  const praise = PRAISE[Math.min(9, len)]
  react(len >= 6 ? 'kiss' : 'happy', Math.min(2.2, 0.6 + (len - 3) * 0.4), praise ? praise[s.wordCount % praise.length] : '')
  if (len >= 6) { snd.kiss(); burst(r.removed, len >= 7 ? 46 : 24) }
  ui.pop(`+${r.score.total}`, motion.matches); ui.bumpScore()
  const sc = r.score, bits = []
  if (sc.gold > 1) bits.push('golden double')
  if (sc.hot) bits.push('chili bonus')
  if (sc.combo > 1) bits.push(`combo ×${sc.combo}`)
  app.flash = { word: r.word, sub: `+${sc.total}${bits.length ? ' · ' + bits.join(' · ') : ''}` }; app.flashUntil = app.time + 1.6
  if (r.removed.some((t) => t.kind === 'chili')) { snd.chili(); ui.toast(`Chili! Next word within ${CHILI_SECS} seconds scores ×1.5`, 2600) }
  const earned = recordWord(save, { word: r.word, pts: sc.total, usedStar: r.usedStar, usedChili: r.usedChili }, today)
  if (r.swapped.length) ui.toast('No words left in there, so the chef swapped a few noodles.', 3200)
  setChain([])
  introduce(r.added)
  award(earned)
  persist()
  if (r.over) endBowl()
}

function award(ids) {
  if (!ids.length) return
  const a = ACHIEVEMENTS.find((x) => x.id === ids[0])
  setTimeout(() => { snd.award(); ui.toast(`Achievement: ${a.name}`, 3000) }, 1200)
}

function react(mood, power = 1, say = '') {
  chef.mood = mood; chef.moodLen = chef.moodT = mood === 'kiss' ? 1.6 : 0.9; chef.power = power
  chef.bounce = motion.matches || mood === 'sad' ? 0 : 1
  if (say) { chef.say = say; chef.sayT = 1.5 }
}
function burst(tiles, n) {
  if (motion.matches) return
  const cols = [C.orange, C.yellow, C.mint, C.blue, C.pink]
  let x = 0, y = 0
  for (const t of tiles) { x += t.x; y += t.y }
  const p = R.toScreen(x / tiles.length, y / tiles.length)
  for (let i = 0; i < n && fx.confetti.length < 90; i++) {
    const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260
    fx.confetti.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 180, rot: a, vr: (Math.random() - 0.5) * 12, s: 3 + Math.random() * 3, col: cols[i % cols.length], age: 0, life: 1 + Math.random() * 0.6 })
  }
}

function useHint() {
  const s = app.s
  if (!s || s.over) return
  clearChain(true)
  const h = hint(s, app.dict)
  if (!h) { ui.toast('The chef cannot see a word either.', 2200); return }
  app.hint = new Set(h.ids); app.hintT = 6
  snd.hint(); ui.toast(`There is a ${h.length}-letter word in the ringed noodles. Herd them together.`, 3600)
  app.dirty = true
}

function endBowl() {
  const s = app.s
  if (!s || app.ending) return
  app.ending = true
  setChain([]); app.ptr = null; app.spoon = null; app.auto = null
  const today = dateKey(), rec = recordBowl(save, s, today)
  save.progress[s.mode] = null; save.last = null; store.save()
  syncHud()
  const good = s.mode === 'daily' ? rating(s.score).stars >= 3 : rec.newBest
  setTimeout(() => {
    if (app.s !== s) return
    snd.done(good); haptic(good ? [20, 60, 20, 60, 40] : 30); react('happy', 1.6, s.mode === 'rush' ? 'Time!' : 'All done!')
    openResult({ mode: s.mode, session: s, rec, date: s.date })
    award(rec.earned)
  }, s.endReason === 'full' ? 250 : 1100)
}

// ------------------------------------------------------------------ modals

function openPause() {
  const s = app.s
  if (!s || s.over) return
  ui.openModal('pause', `
    <span class="eyebrow">${MODE_NAME[s.mode]} · paused</span>
    <h3>Soup's on hold</h3>
    <p>${s.mode === 'daily' ? 'No clock here. Your bowl is saved as you go, so you can come back any time today.' : s.mode === 'rush' ? 'The clock is stopped. Take a breath.' : 'Your bowl is saved as you go.'}</p>
    <div class="stack">
      <button class="btn primary" data-act="resume" data-focus>Back to the bowl</button>
      <button class="btn" data-act="howto">How to play</button>
      ${s.mode !== 'daily' ? `<button class="btn" data-act="end">${s.mode === 'rush' ? 'End this run' : 'Finish this bowl'}</button>` : ''}
      <button class="btn" data-act="title">Save and leave</button>
    </div>`)
  persist()
}

function openHowto() {
  ui.openModal('howto', `
    <span class="eyebrow">How to play</span>
    <h3>Stir, herd, spell</h3>
    <ul class="rules">
      <li><b>Spell</b> by dragging through letters that touch, in order. Or tap them one by one, then tap <b>Spell it</b>.</li>
      <li><b>Stir</b> by dragging through the broth. Push the letters you need up against each other.</li>
      <li>Long words score much more: a 7-letter word is worth 8 times its letters.</li>
      <li>${ui.noodle({ kind: 'gold', ch: 'a' })} doubles the word. ${ui.noodle({ kind: 'chili', ch: 'a' })} gives your next word ×1.5 if you are quick. ${ui.noodle({ kind: 'star', ch: '*' })} is any letter.</li>
      <li>Keyboard: type letters, <kbd>Tab</kbd> swaps to another copy, <kbd>Enter</kbd> spells, arrows or <kbd>Space</kbd> stir.</li>
    </ul>
    <div class="stack"><button class="btn primary" data-act="${app.s ? 'pause' : 'resume'}" data-focus>Got it</button></div>`)
}

function openResult({ mode, session, saved, rec, date }) {
  const today = dateKey()
  let body = ''
  // 1.3: the best word still hiding in the bowl when it ended (where the letters float does not matter here)
  const left = session && app.dict && session.endReason !== 'clean' ? bestLeft(app.dict, session.tiles) : null
  const leftover = left && left.word.length >= 4 ? `<p class="bestword leftover">${left.everyday ? 'Hiding in the leftovers' : 'Longest word left in the bowl'}: <b>${ui.esc(left.word.toUpperCase())}</b></p>` : ''
  if (mode === 'daily') {
    const d = saved || { score: session.score, words: session.wordCount, bestLen: session.longest.length, bestWord: session.best ? session.best.w : '', bestPts: session.best ? session.best.pts : 0, hints: session.hints }
    const rt = rating(d.score), nx = nextRating(d.score), cmp = compare(save.daily.results, date, d.score), st = streakInfo(save.daily.results, today)
    let line = 'Your first Daily Bowl. Come back tomorrow for a new recipe.'
    if (cmp.days) line = d.score > cmp.best ? `Your best bowl yet! The old record was ${cmp.best}.` : `Your average is ${cmp.average} and your best is ${cmp.best}.${cmp.beaten ? ` This one beats ${cmp.beaten} of your ${cmp.days} earlier ${cmp.days === 1 ? 'bowl' : 'bowls'}.` : ''}`
    const why = session ? (session.endReason === 'clean' ? 'You licked the bowl clean!' : session.endReason === 'nowords' ? 'No words left in the bowl.' : 'You are full.') : 'Today\'s bowl is eaten. A new recipe is served at midnight.'
    app.share = shareText({ date, score: d.score, words: d.words, bestLen: d.bestLen })
    // two .r-col wrappers: side by side on a sideways screen, display: contents (one column) otherwise
    body = `<div class="r-col">
      <span class="eyebrow">Daily Bowl · ${ui.esc(prettyDate(date))}</span>
      <h3>${ui.esc(rt.name)}</h3>
      <div class="rating" aria-label="${rt.stars} of 5 stars">${stars(rt.stars)}</div>
      <p class="why">${why}${nx && session ? ` ${nx.min - d.score} more points for ${ui.esc(nx.name)}.` : ''}</p>
      <div class="stats">
        <div><b>${d.score}</b><span>points</span></div>
        <div><b>${d.words}</b><span>${d.words === 1 ? 'word' : 'words'}</span></div>
        <div><b>${st.current}</b><span>day streak</span></div>
      </div></div><div class="r-col">
      ${d.bestWord ? `<p class="bestword">Best word: <b>${ui.esc(d.bestWord.toUpperCase())}</b> for ${d.bestPts}${d.hints ? ` · ${d.hints} ${d.hints === 1 ? 'hint' : 'hints'} used` : ''}</p>` : ''}
      ${leftover}
      <p class="cmp">${line}</p>
      <div class="stack">
        <button class="btn primary" data-act="share" data-focus>Copy result</button>
        <div class="row2"><button class="btn" data-act="rush">Play Rush</button><button class="btn" data-act="title">Menu</button></div>
      </div>
      <div data-talk></div></div>`
  } else {
    const s = session
    body = `
      <span class="eyebrow">${MODE_NAME[mode]}</span>
      <h3>${mode === 'rush' ? (rec.newBest && rec.previousBest ? 'New best!' : 'Time!') : 'Bowl finished'}</h3>
      <div class="stats">
        <div><b>${s.score}</b><span>points</span></div>
        <div><b>${s.wordCount}</b><span>${s.wordCount === 1 ? 'word' : 'words'}</span></div>
        <div><b>${mode === 'rush' ? Math.max(save.bests.rush, s.score) : s.longest.length || 0}</b><span>${mode === 'rush' ? 'best ever' : 'longest'}</span></div>
      </div>
      ${s.best ? `<p class="bestword">Best word: <b>${ui.esc(s.best.w.toUpperCase())}</b> for ${s.best.pts}</p>` : '<p class="bestword">Not a single word. The soup wins this round.</p>'}
      ${leftover}
      ${mode === 'rush' && rec.previousBest && !rec.newBest ? `<p class="cmp">${rec.previousBest - s.score} short of your best.</p>` : ''}
      <div class="stack">
        <button class="btn primary" data-act="${mode}-again" data-focus>${mode === 'rush' ? 'Go again' : 'New bowl'}</button>
        <button class="btn" data-act="title">Menu</button>
      </div>`
  }
  ui.openModal('result', body)
  // Anonymous difficulty vote and "you beat N%": fills in after the card shows, stays hidden if the API is unreachable.
  if (mode === 'daily') dailyTalk(ui.modalEl.querySelector('[data-talk]'), { game: 'soupspell', key: date, score: saved ? saved.score : session.score, compact: true })
}

function openRecords() {
  const b = save.bests, today = dateKey(), st = streakInfo(save.daily.results, today), played = Object.keys(save.daily.results).length
  ui.openModal('records', `
    <span class="eyebrow">Records</span>
    <h3>Your soup so far</h3>
    <div class="stats four">
      <div><b>${b.daily}</b><span>best daily</span></div>
      <div><b>${b.rush}</b><span>best rush</span></div>
      <div><b>${st.current}</b><span>streak now</span></div>
      <div><b>${Math.max(save.daily.bestStreak, st.current)}</b><span>best streak</span></div>
    </div>
    <p class="bestword">${b.longest ? `Longest word: <b>${ui.esc(b.longest.toUpperCase())}</b>` : 'No words yet'}${b.bestWord ? ` · Top scorer: <b>${ui.esc(b.bestWord.toUpperCase())}</b> (${b.bestPts})` : ''}</p>
    <p class="cmp">${b.totalWords} ${b.totalWords === 1 ? 'word' : 'words'} spelled · ${played} Daily ${played === 1 ? 'Bowl' : 'Bowls'} eaten</p>
    <ul class="awards">${ACHIEVEMENTS.map((a) => `<li class="${save.awards[a.id] ? 'got' : ''}"><i>${save.awards[a.id] ? '★' : '☆'}</i><b>${ui.esc(a.name)}</b><span>${ui.esc(a.text)}</span></li>`).join('')}</ul>
    <div class="stack"><button class="btn primary" data-act="resume" data-focus>Close</button></div>`)
}

async function copyShare(btn) {
  const text = app.share || ''
  let ok = false
  try { await navigator.clipboard.writeText(text); ok = true } catch {
    try { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove() } catch { ok = false }
  }
  if (ok) { snd.copy(); btn.textContent = 'Copied!' } else { btn.textContent = 'Copy it below'; showShareText(btn, text) }
  setTimeout(() => { if (btn.isConnected) btn.textContent = 'Copy result' }, 1800)
}
/** 1.3: when the clipboard is refused, show the result text in the card, selected, so it can be copied by hand. */
function showShareText(btn, text) {
  const card = btn.closest('.modal')
  if (!card) return
  let box = card.querySelector('.sharebox')
  if (!box) {
    const note = document.createElement('p')
    note.className = 'sharenote'
    note.textContent = 'Your browser would not let us copy. Select the text below and copy it yourself:'
    box = document.createElement('textarea')
    box.className = 'sharebox'
    box.readOnly = true
    box.rows = 3
    box.setAttribute('aria-label', 'Your result, to copy')
    btn.closest('.stack').after(note, box)
  }
  box.value = text
  box.focus({ preventScroll: true })
  box.select()
  box.scrollIntoView({ block: 'nearest' })
}

const actions = {
  daily() { snd.click(); startMode('daily') },
  rush() { snd.click(); startMode('rush') },
  zen() { snd.click(); startMode('zen') },
  'rush-again'() { snd.click(); startMode('rush', { fresh: true }) },
  'zen-again'() { snd.click(); startMode('zen', { fresh: true }) },
  records() { snd.click(); openRecords() },
  menu() { snd.click(); openPause() },
  pause() { openPause() },
  howto() { snd.click(); openHowto() },
  resume() { snd.click(); ui.closeModal() },
  title() { snd.back(); if (app.s && !app.s.over) persist(); showTitle() },
  end() { snd.click(); ui.closeModal(); if (app.s) { finish(app.s); endBowl() } },
  clear() { clearChain() },
  undo() { unpick(); app.kbd = null },
  spell() { trySpell(true) },
  hint() { useHint() },
  full() {
    if (!app.s || !canFinish(app.s)) return
    snd.click()
    ui.openModal('confirm', `<span class="eyebrow">${MODE_NAME[app.s.mode]}</span><h3>Full already?</h3><p>This ends the bowl with ${app.s.score} points. Any letters left stay in the soup.</p>
      <div class="stack"><button class="btn primary" data-act="end" data-focus>Yes, I'm full</button><button class="btn" data-act="resume">Keep slurping</button></div>`)
  },
  share(_, btn) { copyShare(btn) },
}
const ui = createUI(uiRoot, actions)

// ------------------------------------------------------------------ input

const paused = () => ui.modalOpen || document.hidden
const soupNow = () => (ui.screen === 'title' ? demo : app.s ? app.s.soup : null)
const playable = () => ui.screen === 'play' && app.s && !app.s.over && !app.ending && !ui.modalOpen

function worldOf(e) { const b = canvas.getBoundingClientRect(); return R.toWorld(e.clientX - b.left, e.clientY - b.top) }
function tileAt(soup, x, y, k) {
  let best = null, bd = Infinity
  for (const t of soup.tiles) {
    if (t.air > 0) continue
    const d = Math.hypot(t.x - x, t.y - y)
    if (d <= t.r * k && d < bd) { bd = d; best = t }
  }
  return best
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button > 0 || ui.modalOpen || app.ptr) return
  const soup = soupNow()
  if (!soup) return
  const w = worldOf(e), inBowl = Math.hypot(w.x, w.y) <= BOWL_R + 0.06
  const t = playable() ? tileAt(soup, w.x, w.y, 1.18) : null
  if (t && t.kind !== 'meat') {
    const ch = app.chain, at = ch.indexOf(t.id)
    const ptr = app.ptr = { id: e.pointerId, mode: 'trace', sx: e.clientX, sy: e.clientY, moved: false, onLast: false, fresh: false, touch: e.pointerType !== 'mouse', fx: 0, fy: 0 }
    fingerAt(ptr, e)
    if (at >= 0 && at === ch.length - 1) ptr.onLast = true
    else if (at >= 0) { setChain(ch.slice(0, at + 1)); snd.unpick(at + 1) }
    else if (ch.length && canExtend(app.s, ch, t.id)) pick(t.id)
    else { setChain([]); pick(t.id); ptr.fresh = true }
    ui.hideCallout()
  } else if (inBowl) {
    if (app.chain.length) clearChain()
    app.ptr = { id: e.pointerId, mode: 'stir', x: w.x, y: w.y, t: performance.now(), dist: 0 }
    app.spoon = { x: w.x, y: w.y, lean: 0 }
    ripple(w.x, w.y, 0.05, 0.22, 0.6)
  } else return
  try { canvas.setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
  e.preventDefault()
})

canvas.addEventListener('pointermove', (e) => {
  const ptr = app.ptr
  const w = worldOf(e)
  chef.tx = Math.max(-1, Math.min(1, (w.x + 0.3) * 1.2)); chef.ty = Math.max(-0.4, Math.min(1, (w.y + 1.2) * 0.8))
  if (!ptr || ptr.id !== e.pointerId) return
  if (ptr.mode === 'trace') {
    if (!playable()) return
    fingerAt(ptr, e)
    if (!ptr.moved && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 9) ptr.moved = true
    if (!ptr.moved) return
    const t = tileAt(app.s.soup, w.x, w.y, 0.86), ch = app.chain
    if (!t || t.kind === 'meat') return
    if (ch.length >= 2 && t.id === ch[ch.length - 2]) unpick()
    else if (!ch.includes(t.id) && canExtend(app.s, ch, t.id)) pick(t.id)
  } else {
    const soup = soupNow()
    if (!soup) return
    const now = performance.now(), dt = Math.max(1 / 120, Math.min(0.05, (now - ptr.t) / 1000))
    const d = Math.hypot(w.x - ptr.x, w.y - ptr.y)
    if (d < 0.004) return
    if (!paused()) stirSoup(soup, ptr.x, ptr.y, w.x, w.y, dt)
    ptr.dist += d
    if (ptr.dist > 0.09) { ptr.dist = 0; ripple(w.x, w.y, 0.04, 0.2, 0.55) }
    snd.swish(d / dt)
    if (app.spoon) { app.spoon.lean = Math.max(-1, Math.min(1, (w.x - ptr.x) * 14)); app.spoon.x = w.x; app.spoon.y = w.y }
    ptr.x = w.x; ptr.y = w.y; ptr.t = now
    if (app.s && !save.seen.stir) { ptr.total = (ptr.total || 0) + d; if (ptr.total > 0.8) { save.seen.stir = true; ui.hideCallout() } }
    app.dirty = true
  }
})

function endPointer(e, cancel) {
  const ptr = app.ptr
  if (!ptr || ptr.id !== e.pointerId) return
  app.ptr = null
  if (ptr.mode === 'stir') { app.spoon = null; if (app.s && app.dirty) persist(); return }
  if (cancel || !playable()) return
  const n = app.chain.length
  if (ptr.moved) { if (n >= 2) trySpell(false) }
  else if (ptr.onLast) { if (n >= MIN_WORD) trySpell(true); else if (n === 1) unpick() }
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false))
canvas.addEventListener('pointercancel', (e) => endPointer(e, true))
// Capture lost without a pointerup (the browser took the gesture, an alert, a second window): drop the stroke quietly.
canvas.addEventListener('lostpointercapture', (e) => endPointer(e, true))
/** Where the finger is, in canvas pixels: render.js shows the letter under it in a bubble above, so the finger never hides it. */
function fingerAt(ptr, e) { const b = canvas.getBoundingClientRect(); ptr.fx = e.clientX - b.left; ptr.fy = e.clientY - b.top }
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

function ripple(x, y, r0, r1, life) { if (fx.ripples.length < 40) fx.ripples.push({ x, y, r0, r1, age: 0, life }) }

/** Keyboard: type a letter to pick the nearest copy that links; Tab swaps to the next copy. */
function typeLetter(ch) {
  const s = app.s, chain = app.chain
  const last = chain.length ? tileById(s, chain[chain.length - 1]) : null
  const dist = (t) => (last ? Math.hypot(t.x - last.x, t.y - last.y) : Math.hypot(t.x, t.y + 0.3))
  const ok = s.tiles.filter((t) => canExtend(s, chain, t.id))
  const cands = [...ok.filter((t) => t.ch === ch).sort((a, b) => dist(a) - dist(b)), ...ok.filter((t) => t.ch === '*').sort((a, b) => dist(a) - dist(b))]
  if (!cands.length) { snd.nope(); ui.shakeWord(); ui.toast(chain.length ? `No ${ch.toUpperCase()} is touching that letter` : `No ${ch.toUpperCase()} in the bowl`, 1300); return }
  const base = chain.slice()
  pick(cands[0].id)
  app.kbd = { base, cands: cands.map((t) => t.id), i: 0 }
}
function cycleCandidate() {
  const k = app.kbd
  if (!k || k.cands.length < 2 || app.chain.length !== k.base.length + 1) return false
  k.i = (k.i + 1) % k.cands.length
  setChain([...k.base, k.cands[k.i]]); snd.pick(app.chain.length)
  app.kbd = k
  return true
}
const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === 'Escape') {
    if (ui.modalOpen) { const k = ui.modalKind; if (k === 'result') return; if (k === 'howto' && app.s) openPause(); else ui.closeModal(); snd.back() }
    else if (app.chain.length) clearChain()
    else if (ui.screen === 'play') openPause()
    return
  }
  if (!playable()) return
  const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON'
  if (/^[a-zA-Z]$/.test(e.key)) { typeLetter(e.key.toLowerCase()); e.preventDefault() }
  else if (e.key === 'Backspace') { unpick(); app.kbd = null; e.preventDefault() }
  else if (e.key === 'Enter' && !onButton) { if (app.chain.length) trySpell(true); e.preventDefault() }
  else if (e.key === 'Tab' && app.chain.length) { if (cycleCandidate()) e.preventDefault() }
  else if (DIRS[e.key]) {
    e.preventDefault()
    if (app.chain.length || app.auto) return
    const [dx, dy] = DIRS[e.key]
    app.auto = { kind: 'line', dx, dy, t: 0, dur: 0.5, off: (Math.random() - 0.5) * 0.7, px: null, py: null }
  } else if (e.key === ' ' && !onButton) { e.preventDefault(); if (!app.chain.length) app.spaceHeld = true }
})
window.addEventListener('keyup', (e) => { if (e.key === ' ') app.spaceHeld = false })
window.addEventListener('blur', () => { app.spaceHeld = false })

// ------------------------------------------------------------------ frame loop

function autoStir(soup, dt) {
  let a = app.auto
  if (!a && app.spaceHeld) a = app.auto = { kind: 'circle', ang: -Math.PI / 2, px: null, py: null }
  if (!a) return
  let x, y
  if (a.kind === 'line') {
    a.t += dt
    const u = -0.8 + 1.6 * Math.min(1, a.t / a.dur)
    x = a.dx * u - a.dy * a.off; y = a.dy * u + a.dx * a.off
  } else { a.ang += dt * 4.2; x = Math.cos(a.ang) * 0.55; y = Math.sin(a.ang) * 0.55 }
  if (a.px !== null) { stirSoup(soup, a.px, a.py, x, y, dt); a.acc = (a.acc || 0) + Math.hypot(x - a.px, y - a.py); if (a.acc > 0.12) { a.acc = 0; ripple(x, y, 0.04, 0.2, 0.55) } snd.swish(1.5) }
  a.px = x; a.py = y
  app.spoon = { x, y, lean: 0 }
  app.dirty = true
  if ((a.kind === 'line' && a.t >= a.dur) || (a.kind === 'circle' && !app.spaceHeld)) { app.auto = null; app.spoon = null }
}

function update(dt) {
  app.time += dt
  const soup = soupNow(), s = app.s
  if (soup && !paused()) {
    if (ui.screen === 'play' && s) {
      const wasOver = s.over
      if (!app.ending && tick(s, dt) && !wasOver) { endBowl() }
      if (app.chain.length) stepAir(soup, dt)
      else { if (!app.ptr) autoStir(soup, dt); stepSoup(soup, dt) }
      if (s.mode === 'rush' && !s.over) { const c = Math.ceil(s.timeLeft); if (c !== app.lastClock) { app.lastClock = c; if (c <= 10 && c > 0) snd.tickClock() } }
      if (app.dirty) { app.saveT += dt; if (app.saveT > 5) persist() }
    } else stepSoup(soup, dt)
    app.spin += soup.omega * dt
    for (const ev of soup.events) {
      if (ev.type !== 'splash') continue
      ripple(ev.x, ev.y, 0.1, 0.34, 0.7); snd.plop()
      if (!motion.matches) for (let i = 0; i < 5 && fx.drops.length < 40; i++) { const a = Math.random() * 6.283, d = 0.1 + Math.random() * 0.12; fx.drops.push({ x: ev.x + Math.cos(a) * d, y: ev.y + Math.sin(a) * d, h: 0.1 + Math.random() * 0.12, r: 0.018 + Math.random() * 0.014, age: 0, life: 0.4 + Math.random() * 0.2 }) }
    }
    soup.events.length = 0
  }
  // effects keep moving even while paused, so nothing freezes mid-air
  const age = (list) => { for (let i = list.length - 1; i >= 0; i--) { list[i].age += dt; if (list[i].age >= list[i].life) list.splice(i, 1) } }
  age(fx.ripples); age(fx.drops); age(fx.confetti)
  for (const c of fx.confetti) { c.vy += 620 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt }
  for (let i = fx.flying.length - 1; i >= 0; i--) { const f = fx.flying[i]; f.t += dt; if (f.t >= f.life) fx.flying.splice(i, 1) }
  // chef
  if (chef.moodT > 0) { chef.moodT -= dt; if (chef.moodT <= 0) chef.mood = 'idle' }
  if (chef.bounce > 0) chef.bounce = Math.max(0, chef.bounce - dt * 2.4)
  if (chef.sayT > 0) chef.sayT -= dt
  chef.blinkAt -= dt
  if (chef.blinkAt <= 0) { chef.blink = 0.13; chef.blinkAt = 2 + Math.random() * 3.5 }
  if (chef.blink > 0) chef.blink -= dt
  chef.lookX += (chef.tx - chef.lookX) * Math.min(1, dt * 8); chef.lookY += (chef.ty - chef.lookY) * Math.min(1, dt * 8)
  const pouring = soup ? soup.tiles.some((t) => t.air > 0.25) : false
  chef.pour += ((pouring ? 1 : 0) - chef.pour) * Math.min(1, dt * 9)
  if (app.hintT > 0) { app.hintT -= dt; if (app.hintT <= 0) app.hint.clear() }
  if (app.flash && app.time > app.flashUntil && !app.chain.length) { app.flash = null; syncWord() }
  // score counts up
  if (s && app.shownScore !== s.score) { const d = s.score - app.shownScore; app.shownScore = Math.abs(d) < 0.6 ? s.score : app.shownScore + d * Math.min(1, dt * 7) }
}

let hudT = 0
function render() {
  const soup = soupNow(), s = app.s
  const chain = []
  const chainIndex = new Map()
  if (s) app.chain.forEach((id, i) => { const t = tileById(s, id); if (t) { chain.push(t); chainIndex.set(id, i) } })
  const p = app.ptr, finger = p && p.mode === 'trace' && p.touch && p.moved && chain.length ? { x: p.fx, y: p.fy, tile: chain[chain.length - 1] } : null
  R.draw({
    finger, time: app.time, spin: app.spin, tiles: soup ? soup.tiles : [], chain, chainIndex, reach: app.reach, starLetters: app.starLetters,
    hint: app.hint, cursor: -1, ripples: fx.ripples, drops: fx.drops, flying: fx.flying, confetti: fx.confetti, chef, spoon: app.spoon,
    ladleText: s && s.mode === 'daily' ? String(ladleLeft(s)) : '',
  })
  if (s && ui.screen === 'play' && ++hudT % 6 === 0) syncHud()
}

let raf = 0, lastT = 0, acc = 0
function frame(now) {
  raf = requestAnimationFrame(frame)
  acc += Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now
  let n = 0
  while (acc >= DT && n < 8) { update(DT); acc -= DT; n++ }
  if (n === 8) acc = 0
  render()
}
function startLoop() { if (!raf) { lastT = performance.now(); acc = 0; raf = requestAnimationFrame(frame) } }
function stopLoop() { cancelAnimationFrame(raf); raf = 0 }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopLoop(); app.spaceHeld = false
    if (app.s && !app.s.over) { persist(); if (app.s.mode === 'rush' && !ui.modalOpen && !app.ending) openPause() }
  } else startLoop()
})
window.addEventListener('pagehide', () => { if (app.s && !app.s.over) persist() })

function relayout() {
  const b = stage.getBoundingClientRect(), portrait = b.height > b.width
  stage.classList.toggle('portrait', portrait)
  uiRoot.style.fontSize = (portrait ? Math.max(12.5, Math.min(21, b.width / 25)) : Math.max(11.5, Math.min(21, b.height / 40))) + 'px'
  R.resize()
  R.layout(ui.slot())
}
new ResizeObserver(relayout).observe(stage)
document.addEventListener('fullscreenchange', relayout)
stage.addEventListener('oddvale:fullscreen', () => requestAnimationFrame(relayout))

// ------------------------------------------------------------------ boot

wireChrome({ stage })
tellUs(document.getElementById('tell-us'), { game: 'soupspell', issueUrl: 'https://github.com/JohnGarrisonDev/soupspell/issues/new?template=feedback.yml' })
buildDemo()
ui.show('title'); refreshTitle(); relayout()
if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout)
startLoop()
{
  const last = save.last
  if (last && save.progress[last]) dictReady.then(() => { if (app.dict && ui.screen === 'title' && !ui.modalOpen) startMode(last) })
}

if (DEBUG) {
  window.__game = {
    app, save, store, actions, ui, fx, chef, demo, R,
    state() { const s = app.s; return { screen: ui.screen, modal: ui.modalKind, dict: !!app.dict, mode: s && s.mode, score: s && s.score, words: s && s.wordCount, ladle: s && ladleLeft(s), tiles: s && s.tiles.length, chain: app.chain.slice(), over: s && s.over, timeLeft: s && s.timeLeft, chili: s && s.chili } },
    /** Run the simulation for a number of seconds, then draw. */
    advance(sec = 1) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) update(DT); render(); return this.state() },
    /** Client coordinates of a tile (for synthetic pointer events). */
    tilePoint(id) { const t = tileById(app.s, id), p = R.toScreen(t.x, t.y), b = canvas.getBoundingClientRect(); return { x: b.left + p.x, y: b.top + p.y } },
    worldPoint(x, y) { const p = R.toScreen(x, y), b = canvas.getBoundingClientRect(); return { x: b.left + p.x, y: b.top + p.y } },
    words(maxLen) { return linkedWords(app.s, app.dict, maxLen, 300).slice(0, 12) },
    /** Spell the best linked word through the real code path. Returns the word or null. */
    spellBest(maxLen) { const w = linkedWords(app.s, app.dict, maxLen, 300)[0]; if (!w) return null; setChain(w.ids); trySpell(true); return w.word },
    stroke(seed = 1) { strokeIn(app.s, makeRng(seed)); render() },
    /** Finish the bowl quickly with the position-blind bot (test helper). */
    devour(maxLen = 5) { playFree(app.s, app.dict, { maxLen }); persist(); if (app.s.over) endBowl(); return this.state() },
    setChain, trySpell, relayout, persist,
  }
}
