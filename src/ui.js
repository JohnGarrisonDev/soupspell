// DOM overlays: title, HUD, modals, toasts. Builds the markup once and exposes dumb setters; never touches game state.
// Buttons carry data-act="name"; one click listener calls actions[name](dataset, element).

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const ICON = {
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 5l-7 7 7 7"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h11v14H9l-6-7z"/><path d="m12 9 5 6M17 9l-5 6"/></svg>',
}
const noodle = (t) => `<i class="nd ${t.kind}">${t.kind === 'star' ? '★' : esc(t.ch.toUpperCase())}</i>`

export function createUI(root, actions) {
  root.innerHTML = `
  <div class="screen title" data-screen="title">
    <div class="title-head">
      <span class="eyebrow">Word physics</span>
      <h2 class="wordmark">Soup<em>spell</em></h2>
      <p class="howto">Stir the soup. Herd the letters together. Spell something tasty.</p>
    </div>
    <div class="slot" data-slot="title"></div>
    <div class="title-menu">
      <button class="bigbtn orange" data-act="daily"><b>Daily Bowl</b><span data-f="dailySub">Same recipe for everyone</span></button>
      <div class="row2">
        <button class="bigbtn yellow" data-act="rush"><b>Rush</b><span data-f="rushSub">90 seconds</span></button>
        <button class="bigbtn mint" data-act="zen"><b>Zen</b><span data-f="zenSub">Endless doodling</span></button>
      </div>
      <div class="title-foot">
        <div class="days" data-f="days" aria-label="Your last 7 Daily Bowls"></div>
        <button class="btn small" data-act="records">Records</button>
      </div>
    </div>
  </div>
  <div class="screen play" data-screen="play" hidden>
    <div class="hud">
      <button class="iconbtn" data-act="menu" aria-label="Pause and menu">${ICON.pause}</button>
      <div class="hud-mode"><b data-f="mode">Daily Bowl</b><span data-f="modeSub"></span></div>
      <div class="hud-chips"><span class="pill clock" data-f="clock" hidden></span><span class="pill combo" data-f="combo" hidden></span><span class="pill hot" data-f="hot" hidden></span></div>
      <div class="hud-score"><span class="eyebrow">Score</span><b data-f="score">0</b></div>
    </div>
    <div class="wordbox" data-f="wordbox" aria-live="polite">
      <div class="word" data-f="word"></div>
      <div class="wordsub" data-f="wordsub"></div>
    </div>
    <div class="slot" data-slot="play"></div>
    <div class="ladle">
      <div class="ladle-info"><span class="eyebrow">Ladle</span><b data-f="ladle">34</b><span class="next" data-f="next" aria-label="Next noodles"></span></div>
      <button class="btn small" data-act="hint" data-f="hintBtn">Stuck?</button>
      <button class="btn small full" data-act="full" data-f="fullBtn" hidden>I'm full</button>
    </div>
    <div class="actions">
      <button class="btn small" data-act="clear" data-f="clearBtn" disabled>Clear</button>
      <button class="btn small undo" data-act="undo" data-f="undoBtn" aria-label="Remove the last letter" title="Remove the last letter (Backspace)" disabled>${ICON.undo}</button>
      <button class="btn primary" data-act="spell" data-f="spellBtn" disabled>Spell it</button>
    </div>
  </div>
  <div class="callout" data-f="callout" hidden></div>
  <div class="toast" data-f="toast" hidden></div>
  <div class="modal-wrap" data-f="modalWrap" hidden><div class="modal" role="dialog" aria-modal="true" data-f="modal"></div></div>`

  const f = {}
  for (const el of root.querySelectorAll('[data-f]')) f[el.dataset.f] = el
  const screens = {}
  for (const el of root.querySelectorAll('[data-screen]')) screens[el.dataset.screen] = el
  let current = 'title', toastTimer = 0, calloutTimer = 0, lastFocus = null

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]')
    if (!btn || btn.disabled || !root.contains(btn)) return
    const fn = actions[btn.dataset.act]
    if (fn) fn(btn.dataset, btn)
  })
  const text = (el, v) => { v = String(v); if (el.textContent !== v) el.textContent = v }
  const html = (el, v) => { if (el._h !== v) { el._h = v; el.innerHTML = v } }
  const hide = (el, h) => { if (el.hidden !== h) el.hidden = h }

  return {
    get screen() { return current },
    show(name) { current = name; for (const k in screens) screens[k].hidden = k !== name },
    /** Rectangle of the bowl slot of the current screen, in stage pixels. */
    slot() {
      const el = screens[current].querySelector('[data-slot]'), a = el.getBoundingClientRect(), b = root.getBoundingClientRect()
      return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }
    },
    rectOf(name) { const a = f[name].getBoundingClientRect(), b = root.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 } },
    setTitle({ dailySub, rushSub, zenSub, days }) {
      text(f.dailySub, dailySub); text(f.rushSub, rushSub); text(f.zenSub, zenSub)
      html(f.days, days.map((d) => `<span class="day${d.done ? ' done' : ''}${d.today ? ' today' : ''}" title="${esc(d.title)}"><i>${esc(d.label)}</i><b>${d.done ? esc(d.mark) : '·'}</b></span>`).join(''))
    },
    setHud(h) {
      text(f.mode, h.mode); text(f.modeSub, h.modeSub); text(f.score, h.score)
      hide(f.clock, h.clock == null); if (h.clock != null) { text(f.clock, h.clock); f.clock.classList.toggle('low', !!h.clockLow) }
      hide(f.combo, !h.combo); if (h.combo) text(f.combo, h.combo)
      hide(f.hot, !h.hot); if (h.hot) text(f.hot, h.hot)
      text(f.ladle, h.ladle)
      html(f.next, h.next.map(noodle).join(''))
      f.clearBtn.disabled = !h.canClear; f.undoBtn.disabled = !h.canClear; f.spellBtn.disabled = !h.canSpell
      hide(f.fullBtn, !h.canFull); hide(f.hintBtn, !h.canHint)
    },
    /** state: '' | 'valid' | 'bad' | 'done' | 'idle' */
    setWord({ letters, state, sub }) {
      html(f.word, letters.length ? letters.map((l) => `<span class="${l.star ? 'star' : ''}">${esc(l.ch.toUpperCase())}</span>`).join('') + (state === 'valid' ? '<span class="tick" aria-label="valid word">✓</span>' : '') : '')
      f.wordbox.dataset.state = state
      f.wordbox.style.setProperty('--n', String(Math.max(3, letters.length)))
      text(f.wordsub, sub)
    },
    shakeWord() { f.wordbox.classList.remove('shake'); void f.wordbox.offsetWidth; f.wordbox.classList.add('shake') },
    bumpScore() { f.score.classList.remove('bump'); void f.score.offsetWidth; f.score.classList.add('bump') },
    /** A "+24" that flies from the word to the score. */
    pop(label, reduced) {
      const a = this.rectOf('wordbox'), b = this.rectOf('score'), el = document.createElement('div')
      el.className = 'pop'; el.textContent = label; el.style.left = a.x + 'px'; el.style.top = a.y + 'px'
      root.appendChild(el)
      const done = () => el.remove()
      if (reduced || !el.animate) { setTimeout(done, 700); return }
      const dx = b.x - a.x, dy = b.y - a.y
      el.animate([
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -90%) scale(1.25)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -90%) scale(1.1)', opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5)`, opacity: 0.2 },
      ], { duration: 900, easing: 'cubic-bezier(.3,.1,.3,1)' }).onfinish = done
      setTimeout(done, 1200)
    },
    toast(msg, ms = 2200) {
      text(f.toast, msg); f.toast.hidden = false
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { f.toast.hidden = true }, ms)
    },
    /** A small card introducing something new. */
    callout(kind, title, body, ms = 5200) {
      html(f.callout, `<i class="nd ${esc(kind)}">${kind === 'star' ? '★' : kind === 'gold' ? '×2' : kind === 'chili' ? '!' : kind === 'meat' ? '' : '~'}</i><div><b>${esc(title)}</b><span>${esc(body)}</span></div>`)
      f.callout.hidden = false
      clearTimeout(calloutTimer); calloutTimer = setTimeout(() => { f.callout.hidden = true }, ms)
    },
    hideCallout() { clearTimeout(calloutTimer); f.callout.hidden = true },
    get modalOpen() { return !f.modalWrap.hidden },
    get modalKind() { return f.modalWrap.hidden ? '' : f.modal.dataset.kind },
    openModal(kind, markup) {
      if (f.modalWrap.hidden) lastFocus = document.activeElement
      f.modal.dataset.kind = kind; f.modal.innerHTML = markup; f.modal._h = null
      f.modalWrap.hidden = false
      const first = f.modal.querySelector('[data-focus]') || f.modal.querySelector('button')
      if (first) first.focus({ preventScroll: true })
    },
    closeModal() {
      if (f.modalWrap.hidden) return
      f.modalWrap.hidden = true; f.modal.innerHTML = ''
      if (lastFocus && lastFocus.focus && root.contains(lastFocus)) lastFocus.focus({ preventScroll: true })
    },
    modalEl: f.modal,
    esc, noodle, ICON,
  }
}
