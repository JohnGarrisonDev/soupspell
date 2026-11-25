// Canvas drawing: tablecloth, bowl, broth, noodles, the robot chef and his ladle. Reads state, never changes game rules.
import { C, FONT, fitCanvas, drawOddFace, makeRng } from '../kit/kit.js'
import { BOWL_R } from './logic/soup.js'
import { VALUES } from './logic/letters.js'

const BROTH = '#FF9A3D', BROTH_HI = '#FFB868', BROTH_LO = '#F07F2A', NOODLE = '#FFF6DF', WOOD = '#C98A4B', CHEF = '#FF8FC7'
const RIM = 1.1          // outer bowl radius, in bowl radii
const TAU = Math.PI * 2

export function createRenderer(canvas) {
  const g = canvas.getContext('2d')
  let W = 1, H = 1, dpr = 1, cloth = null
  const view = { cx: 0, cy: 0, S: 100 }
  // fixed decoration under the letters: herbs and veg, seeded so it never changes
  const rng = makeRng(77)
  const bits = []
  for (let i = 0; i < 16; i++) { const a = rng() * TAU, r = Math.sqrt(rng()) * 0.86; bits.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, rot: rng() * TAU, kind: i % 4, s: 0.7 + rng() * 0.6 }) }

  function resize() {
    const f = fitCanvas(canvas)
    W = f.w; H = f.h; dpr = f.dpr
    cloth = document.createElement('canvas')
    cloth.width = Math.round(W * dpr); cloth.height = Math.round(H * dpr)
    const c = cloth.getContext('2d')
    c.scale(dpr, dpr)
    c.fillStyle = C.paper; c.fillRect(0, 0, W, H)
    const cell = Math.max(22, Math.round(Math.min(W, H) / 13))
    c.fillStyle = 'rgba(255, 143, 199, 0.16)'
    for (let x = 0; x < W; x += cell * 2) c.fillRect(x, 0, cell, H)
    for (let y = 0; y < H; y += cell * 2) c.fillRect(0, y, W, cell)
    c.strokeStyle = 'rgba(23, 19, 31, 0.05)'; c.lineWidth = 1
    for (let x = 0; x < W; x += cell) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke() }
    for (let y = 0; y < H; y += cell) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke() }
  }

  /** Fit the bowl (plus the chef peeking over it) into a rectangle in stage pixels. */
  function layout(rect) {
    // above the bowl centre: rim 1.1 + chef head and hat = 1.62 radii; below: rim and its shadow = 1.2
    const S = Math.max(40, Math.min(rect.w / (RIM * 2 + 0.08), rect.h / 2.82))
    view.S = S; view.cx = rect.x + rect.w / 2; view.cy = rect.y + (rect.h - S * 2.82) / 2 + S * 1.62
    return view
  }
  const toWorld = (px, py) => ({ x: (px - view.cx) / view.S, y: (py - view.cy) / view.S })
  const toScreen = (x, y) => ({ x: view.cx + x * view.S, y: view.cy + y * view.S })

  const circle = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU) }
  const ink = (w) => { g.strokeStyle = C.ink; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round' }

  function starPath(r) {
    g.beginPath()
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.62 : r * 1.12; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) }
    g.closePath()
  }

  function drawChef(sc, behind) {
    const { cx, cy, S } = view, ch = sc.chef
    const lw = Math.max(2, S * 0.018)
    const bounce = ch.bounce > 0 ? Math.sin(ch.bounce * Math.PI) * S * 0.09 * ch.power : 0
    const hx = cx - S * 0.3, hy = cy - S * (RIM + 0.02) - bounce, hw = S * 0.56, hh = S * 0.46
    if (behind) {
      // ladle arm (behind the rim): handle from the chef's hand to the cup
      const pour = ch.pour, lx = cx + S * (0.52 - 0.14 * pour), ly = cy - S * (RIM + 0.16 - 0.2 * pour)
      g.save(); g.translate(lx, ly); g.rotate(-0.25 - pour * 0.75)
      ink(lw * 2.6); g.strokeStyle = C.ink; g.beginPath(); g.moveTo(-S * 0.5, -S * 0.06); g.lineTo(-S * 0.1, 0); g.stroke()
      g.strokeStyle = WOOD; g.lineWidth = lw * 1.3; g.beginPath(); g.moveTo(-S * 0.5, -S * 0.06); g.lineTo(-S * 0.1, 0); g.stroke()
      circle(0, 0, S * 0.15); g.fillStyle = '#D9D4E6'; g.fill(); ink(lw); g.stroke()
      circle(0, 0, S * 0.1); g.fillStyle = BROTH; g.fill(); ink(lw * 0.7); g.stroke()
      if (sc.ladleText) { g.fillStyle = C.ink; g.font = `500 ${S * 0.1}px ${FONT.mono}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sc.ladleText, 0, S * 0.005) }
      g.restore()
      // hat
      g.fillStyle = '#FFFDF8'; ink(lw)
      const hatY = hy - hh * 0.5
      g.beginPath(); g.arc(hx - hw * 0.24, hatY - S * 0.09, S * 0.105, 0, TAU); g.fill(); g.stroke()
      g.beginPath(); g.arc(hx + hw * 0.24, hatY - S * 0.09, S * 0.105, 0, TAU); g.fill(); g.stroke()
      g.beginPath(); g.arc(hx, hatY - S * 0.12, S * 0.12, 0, TAU); g.fill(); g.stroke()
      g.beginPath(); g.roundRect(hx - hw * 0.4, hatY - S * 0.08, hw * 0.8, S * 0.11, S * 0.03); g.fill(); g.stroke()
      // head
      g.fillStyle = C.ink; g.beginPath(); g.roundRect(hx - hw / 2 + lw * 2, hy - hh / 2 + lw * 2, hw, hh, S * 0.11); g.fill()
      g.fillStyle = CHEF; g.beginPath(); g.roundRect(hx - hw / 2, hy - hh / 2, hw, hh, S * 0.11); g.fill(); ink(lw); g.stroke()
      // ears (bolts)
      g.fillStyle = C.yellow
      for (const sx of [-1, 1]) { g.beginPath(); g.roundRect(hx + sx * hw / 2 - S * 0.03, hy - S * 0.05, S * 0.06, S * 0.1, S * 0.02); g.fill(); g.stroke() }
      const blink = ch.blink > 0 || ch.mood === 'kiss'
      drawOddFace(g, hx, hy - hh * 0.06, hh * 0.78, { look: ch.lookX, lookY: ch.lookY, blink })
      if (ch.mood === 'kiss') {
        // chef's kiss: little hearts floating off
        const p = 1 - ch.moodT / ch.moodLen
        g.fillStyle = C.orange
        for (let i = 0; i < 3; i++) { const q = (p + i * 0.22) % 1; heart(hx + hw * (0.45 + 0.25 * i * q), hy - hh * 0.2 - q * S * 0.3, S * 0.05 * (1 - q * 0.5)) }
      }
      if (ch.say && ch.sayT > 0) {
        const a = Math.min(1, ch.sayT * 4), tx = hx - hw * 0.62, ty = hy - hh * 0.55
        g.save(); g.globalAlpha = a; g.translate(tx, ty); g.rotate(-0.08)
        g.font = `800 ${S * 0.12}px ${FONT.display}`
        const tw = g.measureText(ch.say).width + S * 0.12
        g.fillStyle = C.yellow; g.beginPath(); g.roundRect(-tw, -S * 0.1, tw, S * 0.2, S * 0.08); g.fill(); ink(lw); g.stroke()
        g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch.say, -tw / 2, S * 0.008)
        g.restore()
      }
    } else {
      // hands gripping the rim, drawn over it
      ink(lw); g.fillStyle = CHEF
      for (const sx of [-1, 1]) { const x = hx + sx * hw * 0.62, y = cy - S * (RIM - 0.07) - Math.abs(sx * hw * 0.62 + S * 0.3) * 0.12; g.beginPath(); g.roundRect(x - S * 0.07, y - S * 0.06, S * 0.14, S * 0.12, S * 0.05); g.fill(); g.stroke() }
    }
  }
  function heart(x, y, s) {
    g.beginPath(); g.moveTo(x, y + s); g.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.3, x, y - s * 0.4); g.bezierCurveTo(x + s * 0.6, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s); g.fill()
  }

  function drawBit(b, S) {
    g.save(); g.translate(b.x * S, b.y * S); g.rotate(b.rot); g.scale(b.s, b.s)
    if (b.kind === 0) { g.fillStyle = '#3FAE6A'; g.beginPath(); g.ellipse(0, 0, S * 0.07, S * 0.03, 0, 0, TAU); g.fill() }               // herb leaf
    else if (b.kind === 1) { g.fillStyle = '#F4722B'; circle(0, 0, S * 0.055); g.fill(); g.fillStyle = '#FFA24D'; circle(0, 0, S * 0.028); g.fill() }  // carrot coin
    else if (b.kind === 2) { g.strokeStyle = '#FFD98A'; g.lineWidth = S * 0.022; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, S * 0.06, 0.3, 2.6); g.stroke() }  // stray noodle
    else { g.fillStyle = '#7CC96B'; circle(0, 0, S * 0.03); g.fill(); circle(S * 0.07, S * 0.02, S * 0.024); g.fill() }                       // peas
    g.restore()
  }

  function drawTile(t, sc, x, y, scale, alpha) {
    const S = view.S, r = t.r * S * scale, lw = Math.max(1.6, S * 0.014)
    const picked = sc.chainIndex.get(t.id), isPicked = picked !== undefined
    const wob = t.wob > 0 ? Math.sin(sc.time * 26 + t.id) * t.wob : 0
    g.save(); g.translate(x, y); g.globalAlpha = alpha
    if (t.kind === 'meat') {
      g.fillStyle = 'rgba(23,19,31,0.3)'; circle(lw * 1.6, lw * 2, r); g.fill()
      g.scale(1 + wob * 0.05, 1 - wob * 0.05)
      g.fillStyle = '#9A5536'; circle(0, 0, r); g.fill(); ink(lw); g.stroke()
      g.fillStyle = '#7A3E26'; for (const [a, d, q] of [[0.6, 0.5, 0.16], [2.4, 0.55, 0.13], [4.2, 0.45, 0.18], [5.4, 0.62, 0.1]]) { circle(Math.cos(a) * r * d, Math.sin(a) * r * d, r * q); g.fill() }
      g.fillStyle = '#C17A55'; circle(-r * 0.35, -r * 0.4, r * 0.16); g.fill()
      g.restore(); return
    }
    g.rotate(t.tilt + wob * 0.12)
    g.scale(1 + wob * 0.07, 1 - wob * 0.07)
    const star = t.kind === 'star'
    const shape = () => { if (star) starPath(r); else circle(0, 0, r) }
    // hard little shadow
    g.save(); g.rotate(-t.tilt); g.translate(lw * 1.5, lw * 1.9); g.rotate(t.tilt); g.fillStyle = 'rgba(23,19,31,0.32)'; shape(); g.fill(); g.restore()
    g.fillStyle = isPicked ? C.yellow : t.kind === 'gold' ? '#FFD75E' : star ? '#FFF1B8' : NOODLE
    shape(); g.fill()
    if (t.kind === 'gold' && !isPicked) { g.fillStyle = '#FFF3C2'; g.beginPath(); g.arc(0, 0, r * 0.78, 3.4, 4.6); g.arc(0, 0, r * 0.55, 4.6, 3.4, true); g.fill() }
    ink(isPicked ? lw * 1.6 : lw); shape(); g.stroke()
    if (t.kind === 'chili') { g.strokeStyle = '#E8362A'; g.lineWidth = lw * 1.5; g.setLineDash([r * 0.3, r * 0.2]); circle(0, 0, r * 0.8); g.stroke(); g.setLineDash([]) }
    if (t.kind === 'gold') { g.strokeStyle = C.orange; g.lineWidth = lw; circle(0, 0, r * 0.8); g.stroke() }
    // the letter
    const shown = star ? (sc.starLetters.get(t.id) || '?') : t.ch
    g.fillStyle = star && shown !== '?' ? '#C93A10' : C.ink
    g.font = `800 ${r * (star ? 1.0 : 1.22)}px ${FONT.display}`
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    g.fillText(shown.toUpperCase(), 0, r * (star ? 0.36 : 0.42))
    if (!star && r >= 17) { g.font = `500 ${r * 0.4}px ${FONT.mono}`; g.fillStyle = 'rgba(23,19,31,0.62)'; g.fillText(String(VALUES[t.ch] || ''), r * 0.56, r * 0.7) }
    // kind badges: never colour alone
    if (t.kind === 'chili') chiliIcon(r * 0.62, -r * 0.62, r * 0.42)
    if (t.kind === 'gold') { g.fillStyle = C.ink; g.font = `800 ${r * 0.5}px ${FONT.display}`; g.fillText('×2', -r * 0.5, -r * 0.42) }
    g.restore()
  }
  function chiliIcon(x, y, s) {
    g.save(); g.translate(x, y); g.rotate(0.5)
    g.fillStyle = '#E8362A'; g.beginPath(); g.moveTo(-s * 0.5, -s * 0.3); g.quadraticCurveTo(s * 0.6, -s * 0.5, s * 0.9, s * 0.7); g.quadraticCurveTo(0, s * 0.5, -s * 0.5, -s * 0.3); g.fill(); ink(Math.max(1, s * 0.14)); g.stroke()
    g.strokeStyle = '#2E9E5B'; g.lineWidth = Math.max(1.5, s * 0.22); g.beginPath(); g.moveTo(-s * 0.5, -s * 0.3); g.lineTo(-s * 0.85, -s * 0.6); g.stroke()
    g.restore()
  }

  /** Draw one frame. sc: the scene (see main.js buildScene). */
  function draw(sc) {
    const { cx, cy, S } = view
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (cloth) g.drawImage(cloth, 0, 0, W, H); else { g.fillStyle = C.paper; g.fillRect(0, 0, W, H) }
    const lw = Math.max(2, S * 0.02)

    drawChef(sc, true)
    // bowl: hard shadow, rim, inner wall, broth
    g.fillStyle = C.ink; circle(cx + S * 0.06, cy + S * 0.08, S * RIM); g.fill()
    g.fillStyle = C.mint; circle(cx, cy, S * RIM); g.fill(); ink(lw); g.stroke()
    g.fillStyle = '#FFFFFF'; g.globalAlpha = 0.45; g.beginPath(); g.arc(cx, cy, S * (RIM - 0.035), 3.5, 4.5); g.arc(cx, cy, S * (RIM - 0.065), 4.5, 3.5, true); g.fill(); g.globalAlpha = 1
    g.fillStyle = '#1FA882'; circle(cx, cy, S * (BOWL_R + 0.025)); g.fill(); ink(lw * 0.8); g.stroke()
    g.save()
    circle(cx, cy, S * BOWL_R); g.fillStyle = BROTH; g.fill(); g.clip()
    g.fillStyle = BROTH_LO; g.beginPath(); g.arc(cx, cy, S * BOWL_R, 0, TAU); g.arc(cx - S * 0.03, cy - S * 0.04, S * 0.95, 0, TAU, true); g.fill('evenodd')
    // slow flat highlights that turn with the swirl
    g.translate(cx, cy)
    g.save(); g.rotate(sc.spin * 0.6)
    g.strokeStyle = BROTH_HI; g.lineCap = 'round'; g.lineWidth = S * 0.035
    for (const [r, a0, a1] of [[0.7, 3.6, 4.5], [0.45, 0.4, 1.3], [0.84, 1.9, 2.4], [0.25, 4.2, 5.4]]) { g.beginPath(); g.arc(0, 0, S * r, a0, a1); g.stroke() }
    g.restore()
    g.save(); g.rotate(sc.spin); for (const b of bits) drawBit(b, S); g.restore()
    // ripples and wakes
    for (const rp of sc.ripples) {
      const p = rp.age / rp.life
      g.globalAlpha = (1 - p) * 0.75; g.strokeStyle = '#FFE2B0'; g.lineWidth = S * 0.018 * (1 - p * 0.5)
      circle(rp.x * S, rp.y * S, S * (rp.r0 + (rp.r1 - rp.r0) * p)); g.stroke()
    }
    g.globalAlpha = 1
    g.restore()

    // links between chained letters
    const pos = (t) => ({ x: cx + t.x * S, y: cy + (t.y + Math.sin(sc.time * 1.4 + t.id * 1.7) * 0.006) * S })
    if (sc.chain.length > 1) {
      for (const [w, col] of [[S * 0.085, C.ink], [S * 0.05, C.orange]]) {
        g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath()
        sc.chain.forEach((t, i) => { const p = pos(t); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y) })
        g.stroke()
      }
    }
    // noodles
    const tracing = sc.chain.length > 0
    for (const t of sc.tiles) {
      const p = pos(t)
      if (t.air > 0) {
        if (t.air > 0.3) continue                                   // still in the ladle
        const q = 1 - t.air / 0.3, e = q * q
        const lx = cx + S * 0.45, ly = cy - S * (RIM + 0.05)
        drawTile(t, sc, lx + (p.x - lx) * e, ly + (p.y - ly) * e - Math.sin(q * Math.PI) * S * 0.12, 1.25 - 0.25 * e, 1)
        continue
      }
      const reach = sc.reach.has(t.id), inChain = sc.chainIndex.has(t.id)
      const dim = tracing && !reach && !inChain && t.kind !== 'meat'
      if (reach && tracing) { g.strokeStyle = C.ink; g.lineWidth = Math.max(2, S * 0.016); g.setLineDash([S * 0.05, S * 0.04]); g.lineDashOffset = -sc.time * S * 0.12; circle(p.x, p.y, t.r * S * 1.2); g.stroke(); g.setLineDash([]); g.strokeStyle = '#FFFDF8'; g.lineWidth = Math.max(1, S * 0.008); circle(p.x, p.y, t.r * S * 1.2); g.stroke() }
      if (sc.hint.has(t.id)) { g.strokeStyle = C.blue; g.lineWidth = Math.max(3, S * 0.03); circle(p.x, p.y, t.r * S * (1.25 + 0.1 * Math.sin(sc.time * 6))); g.stroke() }
      if (sc.cursor === t.id) { g.strokeStyle = C.blue; g.lineWidth = Math.max(3, S * 0.024); circle(p.x, p.y, t.r * S * 1.32); g.stroke() }
      drawTile(t, sc, p.x, p.y, inChain ? 1.08 : 1, dim ? 0.5 : 1)
    }
    // slurped letters flying to the chef
    for (const f of sc.flying) {
      if (f.t < 0) { drawTile(f.tile, sc, cx + f.tile.x * S, cy + f.tile.y * S, 1.08, 1); continue }
      const q = Math.min(1, f.t / f.life), e = q * q * (3 - 2 * q)
      const tx = cx - S * 0.3, ty = cy - S * (RIM + 0.02), sx = cx + f.tile.x * S, sy = cy + f.tile.y * S
      drawTile(f.tile, sc, sx + (tx - sx) * e, sy + (ty - sy) * e - Math.sin(q * Math.PI) * S * 0.25, 1.1 - e * 0.85, 1 - Math.max(0, q - 0.85) / 0.15)
    }
    // splash droplets
    g.fillStyle = BROTH_HI
    for (const d of sc.drops) { const p = d.age / d.life; g.globalAlpha = 1 - p; circle(cx + d.x * S, cy + d.y * S - Math.sin(p * Math.PI) * S * d.h, S * d.r * (1 - p * 0.5)); g.fill(); ink(1); g.globalAlpha = (1 - p) * 0.6; g.stroke() }
    g.globalAlpha = 1
    drawChef(sc, false)

    // the spoon
    if (sc.spoon) {
      const x = cx + sc.spoon.x * S, y = cy + sc.spoon.y * S
      g.save(); g.translate(x, y); g.rotate(-0.7 + sc.spoon.lean * 0.3)
      g.fillStyle = 'rgba(23,19,31,0.25)'; g.beginPath(); g.ellipse(lw * 2, lw * 2.5, S * 0.1, S * 0.13, 0, 0, TAU); g.fill()
      ink(lw * 2.8); g.beginPath(); g.moveTo(0, -S * 0.1); g.lineTo(0, -S * 0.75); g.stroke()
      g.strokeStyle = WOOD; g.lineWidth = lw * 1.5; g.beginPath(); g.moveTo(0, -S * 0.1); g.lineTo(0, -S * 0.75); g.stroke()
      g.fillStyle = WOOD; g.beginPath(); g.ellipse(0, 0, S * 0.1, S * 0.13, 0, 0, TAU); g.fill(); ink(lw); g.stroke()
      g.fillStyle = '#E0A768'; g.beginPath(); g.ellipse(-S * 0.015, -S * 0.02, S * 0.055, S * 0.08, 0, 0, TAU); g.fill()
      g.restore()
    }
    // confetti
    for (const c of sc.confetti) { g.save(); g.translate(c.x, c.y); g.rotate(c.rot); g.globalAlpha = Math.min(1, (c.life - c.age) * 2); g.fillStyle = c.col; g.fillRect(-c.s, -c.s * 0.5, c.s * 2, c.s); g.restore() }
    g.globalAlpha = 1
  }

  return { resize, layout, draw, toWorld, toScreen, view, get size() { return { W, H } } }
}
