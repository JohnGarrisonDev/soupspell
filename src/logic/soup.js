// Soup physics: round noodles floating in a round bowl. No DOM. World units: the bowl is a circle of radius 1 at (0, 0).
// A "soup" is { tiles: [...], omega, events: [] }. Each tile is a body: { x, y, vx, vy, r, m, air, wob } plus whatever the game adds.
//   air > 0  the noodle is still falling from the ladle: it does not collide and cannot be picked until it lands
//   wob      0..1 wobble for the renderer, bumped by knocks
//   tired    it was being pulled toward a neighbour but something is in the way: no more pulling until it is knocked
// Physics does not need to be identical across devices: the daily is fair because everyone gets the same letters.

export const BOWL_R = 1
export const TILE_R = 0.125
export const MEAT_R = 0.165
/** Two noodles are "touching" (linkable) when their centres are within LINK_K radii. */
export const LINK_K = 2.35
export const DT = 1 / 60

const DRAG = 4.4            // how fast a noodle gives up its speed to the broth (per second)
const OMEGA_DECAY = 1.5     // how fast the swirl of the whole bowl dies down
const OMEGA_MAX = 2.6
const REST = 0.12           // bounciness
const PUSH = 0.8            // share of an overlap fixed per pass (soft, so no jitter)
const ATTRACT = 0.24        // "cheerios effect": floating noodles that are nearly touching drift together
const ATTRACT_GAP = 0.9 * TILE_R
const TOUCH_EPS = 0.004
const SLOP = 0.0015           // overlap that is left alone, so resting contacts do not creep
const SLEEP = 0.006
const STUCK = 0.0025
const WAKE = 0.03
const SPOON_R = 0.34        // reach of the spoon
const SPOON_GRIP = 15       // how firmly the spoon drags broth along (per second)
const SPOON_MAX = 3.4       // top spoon speed that counts, bowl radii per second
const SPOON_SWIRL = 0.55
const SPLASH_R = 3.3 * TILE_R
const SPLASH_V = 0.55

export const createSoup = () => ({ tiles: [], omega: 0, events: [] })
export const isLetter = (t) => t.kind !== 'meat'
export const landed = (t) => !(t.air > 0)

/** Can these two be chained when spelling? */
export function linked(a, b) {
  if (a === b || !isLetter(a) || !isLetter(b) || !landed(a) || !landed(b)) return false
  const dx = a.x - b.x, dy = a.y - b.y, reach = LINK_K * (a.r + b.r) / 2
  return dx * dx + dy * dy <= reach * reach
}

const emit = (soup, e) => { if (soup.events.length < 48) soup.events.push(e) }

function land(soup, t) {
  t.air = 0; t.vx = 0; t.vy = 0; t.wob = 1
  for (const o of soup.tiles) {
    if (o === t || !landed(o)) continue
    let dx = o.x - t.x, dy = o.y - t.y
    const d = Math.hypot(dx, dy)
    if (d >= SPLASH_R) continue
    if (d < 1e-6) { dx = 1; dy = 0 } else { dx /= d; dy /= d }
    const k = SPLASH_V * (1 - d / SPLASH_R) / o.m
    o.vx += dx * k; o.vy += dy * k; o.wob = Math.min(1, o.wob + 0.5)
  }
  emit(soup, { type: 'splash', x: t.x, y: t.y, id: t.id })
}

/** Advance the soup by dt seconds (use the fixed DT). */
export function stepSoup(soup, dt = DT) {
  const tiles = soup.tiles, n = tiles.length
  soup.omega *= Math.exp(-OMEGA_DECAY * dt)
  if (Math.abs(soup.omega) < 0.012) soup.omega = 0
  const om = soup.omega, k = 1 - Math.exp(-DRAG * dt)

  for (let i = 0; i < n; i++) {
    const t = tiles[i]
    t.pulled = false
    if (t.tired && t.vx * t.vx + t.vy * t.vy > WAKE * WAKE) t.tired = false   // knocked or stirred: free to drift together again
    if (t.wob > 0) t.wob = Math.max(0, t.wob - dt * 2.2)
    if (t.air > 0) { t.air -= dt; if (t.air <= 0) land(soup, t); continue }
    if (!(t.x === t.x && t.y === t.y && t.vx === t.vx && t.vy === t.vy)) { t.x = 0; t.y = 0; t.vx = 0; t.vy = 0 }   // NaN guard
    // relax toward the velocity of the broth itself (a slow rigid swirl), which is zero when the soup is calm
    t.vx += (-om * t.y - t.vx) * k
    t.vy += (om * t.x - t.vy) * k
  }
  // nearly-touching letters drift together
  for (let i = 0; i < n; i++) {
    const a = tiles[i]
    if (a.air > 0 || a.kind === 'meat' || a.tired) continue
    for (let j = i + 1; j < n; j++) {
      const b = tiles[j]
      if (b.air > 0 || b.kind === 'meat' || b.tired) continue
      const dx = b.x - a.x, dy = b.y - a.y, sum = a.r + b.r
      if (dx > sum + ATTRACT_GAP || dx < -sum - ATTRACT_GAP) continue
      const d = Math.hypot(dx, dy), gap = d - sum
      if (gap <= TOUCH_EPS || gap >= ATTRACT_GAP) continue
      const f = ATTRACT * dt / d
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f
      a.pulled = b.pulled = true
    }
  }
  for (let i = 0; i < n; i++) { const t = tiles[i]; if (t.air > 0) continue; t.px = t.x; t.py = t.y; t.x += t.vx * dt; t.y += t.vy * dt }

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      const a = tiles[i]
      if (a.air > 0) continue
      for (let j = i + 1; j < n; j++) {
        const b = tiles[j]
        if (b.air > 0) continue
        let dx = b.x - a.x, dy = b.y - a.y
        const sum = a.r + b.r
        if (dx >= sum || dx <= -sum || dy >= sum || dy <= -sum) continue
        let d = Math.hypot(dx, dy)
        if (d >= sum) continue
        if (d < 1e-7) { const ang = (i * 7 + j * 13) % 17; dx = Math.cos(ang); dy = Math.sin(ang); d = 0 } else { dx /= d; dy /= d }
        const over = (sum - d - SLOP) * PUSH, im = 1 / a.m, jm = 1 / b.m, tot = im + jm
        if (over > 0) {
          a.x -= dx * over * im / tot; a.y -= dy * over * im / tot
          b.x += dx * over * jm / tot; b.y += dy * over * jm / tot
        }
        const vn = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy
        if (vn < 0) {
          const jn = -(1 + (vn < -0.2 ? REST : 0)) * vn / tot
          a.vx -= dx * jn * im; a.vy -= dy * jn * im; b.vx += dx * jn * jm; b.vy += dy * jn * jm
          if (vn < -0.25) { const w = Math.min(1, -vn * 0.9); if (w > a.wob) a.wob = w; if (w > b.wob) b.wob = w }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const t = tiles[i]
      if (t.air > 0) continue
      const d = Math.hypot(t.x, t.y), max = BOWL_R - t.r
      if (d <= max) continue
      const nx = t.x / d, ny = t.y / d
      t.x = nx * max; t.y = ny * max
      const vn = t.vx * nx + t.vy * ny
      if (vn > 0) { t.vx -= (1 + REST) * vn * nx; t.vy -= (1 + REST) * vn * ny; if (vn > 0.3 && t.wob < 0.6) t.wob = 0.6 }
    }
  }
  if (om === 0) {
    for (let i = 0; i < n; i++) {
      const t = tiles[i]
      if (t.air > 0) continue
      if (!t.pulled) { if (t.vx * t.vx + t.vy * t.vy < SLEEP * SLEEP) { t.vx = 0; t.vy = 0 } continue }
      // pulled toward a neighbour but going nowhere (something is in the way): give up, so the soup can rest
      const mx = t.x - t.px, my = t.y - t.py, lim = STUCK * dt
      if (mx * mx + my * my < lim * lim) { t.vx = 0; t.vy = 0; t.tired = true }
    }
  }
}

/** The spoon moved from (x0, y0) to (x1, y1) during dt seconds: drag nearby noodles along and add a little swirl. */
export function stirSoup(soup, x0, y0, x1, y1, dt = DT) {
  if (!(dt > 0)) return
  let vx = (x1 - x0) / dt, vy = (y1 - y0) / dt
  const sp = Math.hypot(vx, vy)
  if (!(sp > 1e-6)) return
  if (sp > SPOON_MAX) { vx *= SPOON_MAX / sp; vy *= SPOON_MAX / sp }
  const sx = x1 - x0, sy = y1 - y0, len2 = sx * sx + sy * sy, grip = Math.min(1, SPOON_GRIP * dt)
  for (const t of soup.tiles) {
    if (t.air > 0) continue
    let u = len2 > 0 ? ((t.x - x0) * sx + (t.y - y0) * sy) / len2 : 0
    u = u < 0 ? 0 : u > 1 ? 1 : u
    const dx = t.x - (x0 + sx * u), dy = t.y - (y0 + sy * u), d2 = dx * dx + dy * dy
    if (d2 >= SPOON_R * SPOON_R) continue
    const q = 1 - d2 / (SPOON_R * SPOON_R), w = q * q * grip / t.m
    t.vx += (vx * 0.9 - t.vx) * w; t.vy += (vy * 0.9 - t.vy) * w
    if (t.wob < 0.35) t.wob = 0.35
  }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
  soup.omega += (mx * vy - my * vx) * SPOON_SWIRL * dt
  if (soup.omega > OMEGA_MAX) soup.omega = OMEGA_MAX; else if (soup.omega < -OMEGA_MAX) soup.omega = -OMEGA_MAX
}

/** True when nothing is moving and nothing is in the air. */
export function atRest(soup) {
  if (soup.omega !== 0) return false
  for (const t of soup.tiles) if (t.air > 0 || t.vx !== 0 || t.vy !== 0) return false
  return true
}

/** Step until the soup is calm (headless use). Returns the number of steps taken. */
export function settle(soup, maxSteps = 900) {
  let i = 0
  do { stepSoup(soup, DT); i++ } while (i < maxSteps && !atRest(soup))
  soup.events.length = 0
  return i
}

/** Pick a landing spot for a new noodle of radius r: the best of a few seeded candidates (close to company, not on top of it). */
export function dropSpot(soup, rng, r) {
  let best = null, bestScore = -Infinity
  for (let c = 0; c < 12; c++) {
    const rad = Math.sqrt(rng()) * (BOWL_R - r - 0.06), ang = rng() * Math.PI * 2
    const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad
    let gap = Infinity
    for (const t of soup.tiles) { const g = Math.hypot(t.x - x, t.y - y) - t.r - r; if (g < gap) gap = g }
    const score = gap >= 0.01 ? -Math.abs(gap - 0.03) : gap - 1
    if (best === null || score > bestScore) { bestScore = score; best = { x, y } }
  }
  return best
}

/** While the player traces a word the soup is frozen: noodles in the air still land, but nothing drifts. */
export function stepAir(soup, dt = DT) {
  for (const t of soup.tiles) {
    if (t.wob > 0) t.wob = Math.max(0, t.wob - dt * 2.2)
    if (t.air > 0) { t.air -= dt; if (t.air <= 0) land(soup, t) }
  }
}
