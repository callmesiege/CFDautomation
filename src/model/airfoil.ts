import type { Profile, WingElement } from './types'

/** NACA 4-digit section, returned as a closed loop starting at the TE over the upper surface (x: 0..1). */
export function naca4(m: number, p: number, t: number, n = 60): [number, number][] {
  const mm = m / 100
  const pp = p / 10
  const tt = t / 100
  const upper: [number, number][] = []
  const lower: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const beta = (Math.PI * i) / n
    const x = 0.5 * (1 - Math.cos(beta)) // cosine spacing
    const yt =
      5 *
      tt *
      (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4) // closed TE
    let yc = 0
    let dyc = 0
    if (mm > 0 && pp > 0) {
      if (x < pp) {
        yc = (mm / (pp * pp)) * (2 * pp * x - x * x)
        dyc = ((2 * mm) / (pp * pp)) * (pp - x)
      } else {
        yc = (mm / ((1 - pp) ** 2)) * (1 - 2 * pp + 2 * pp * x - x * x)
        dyc = ((2 * mm) / ((1 - pp) ** 2)) * (pp - x)
      }
    }
    const th = Math.atan(dyc)
    upper.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)])
    lower.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)])
  }
  // TE -> upper -> LE -> lower -> TE
  const loop: [number, number][] = []
  for (let i = n; i >= 0; i--) loop.push(upper[i])
  for (let i = 1; i <= n; i++) loop.push(lower[i])
  return loop
}

export function profilePoints(profile: Profile): [number, number][] {
  if (profile.kind === 'naca4') return naca4(profile.m, profile.p, profile.t)
  return profile.points
}

/** Zero-lift angle for a NACA 4-digit camber line (deg). Thin-airfoil theory. */
export function zeroLiftAngle(profile: Profile): number {
  if (profile.kind !== 'naca4' || profile.m === 0) return 0
  const m = profile.m / 100
  const p = profile.p / 10
  // numerical integration of thin-airfoil zero-lift integral
  const n = 400
  let integral = 0
  for (let i = 0; i < n; i++) {
    const th = ((i + 0.5) / n) * Math.PI
    const x = 0.5 * (1 - Math.cos(th))
    const dyc = x < p ? ((2 * m) / (p * p)) * (p - x) : ((2 * m) / ((1 - p) ** 2)) * (p - x)
    integral += dyc * (Math.cos(th) - 1) * (Math.PI / n)
  }
  const a0L = -integral / Math.PI // radians — for a positive-camber airfoil this is negative
  return (a0L * 180) / Math.PI
}

/**
 * Section of a wing element at a given lateral station, expressed as a 2-D polygon in the
 * (x, z) plane in millimetres. The profile is INVERTED (camber faces the ground) because
 * F1 wings produce downforce. Positive `angle` rotates the trailing edge upward.
 */
export function elementSection2D(el: WingElement, y: number): { pts: [number, number][]; chord: number; le: [number, number] } {
  const half = el.span / 2
  const inner = el.spanStart
  const eta = half > inner ? Math.min(1, Math.max(0, (Math.abs(y) - inner) / (half - inner))) : 0
  const chord = el.chord + (el.tipChord - el.chord) * eta
  const spanOut = Math.abs(y) - inner
  const leX = el.x + Math.tan((el.sweep * Math.PI) / 180) * Math.max(0, spanOut)
  const leZ = el.z + Math.tan((el.dihedral * Math.PI) / 180) * Math.max(0, spanOut)
  const a = (el.angle * Math.PI) / 180 // positive rotation in the (x rearward, z up) plane lifts the trailing edge
  const raw = profilePoints(el.profile)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const pts: [number, number][] = raw.map(([px, py]) => {
    // invert: camber faces down
    const x = px * chord
    const z = -py * chord
    const xr = x * cos - z * sin
    const zr = x * sin + z * cos
    return [leX + xr, leZ + zr]
  })
  return { pts, chord, le: [leX, leZ] }
}

export function polygonArea(pts: [number, number][]): number {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1])
  }
  return Math.abs(a) / 2
}

export function pointInPolygon(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0]
    const yi = pts[i][1]
    const xj = pts[j][0]
    const yj = pts[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function bbox(pts: [number, number][]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, maxX, minY, maxY }
}

/** Bounding box of a whole element across its span (mm, car coords). */
export function elementExtents(el: WingElement): { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number } {
  const stations = [el.spanStart, (el.spanStart + el.span / 2) / 2, el.span / 2]
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const y of stations) {
    const b = bbox(elementSection2D(el, y).pts)
    minX = Math.min(minX, b.minX)
    maxX = Math.max(maxX, b.maxX)
    minZ = Math.min(minZ, b.minY)
    maxZ = Math.max(maxZ, b.maxY)
  }
  return { minX, maxX, minZ, maxZ, maxY: el.span / 2 }
}
