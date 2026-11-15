/** Small perceptual colour maps, baked to 256-entry lookup tables. */

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function buildLUT(stops: [number, number, number][]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(t))
    const u = t - k
    lut[i * 3] = lerp(stops[k][0], stops[k + 1][0], u)
    lut[i * 3 + 1] = lerp(stops[k][1], stops[k + 1][1], u)
    lut[i * 3 + 2] = lerp(stops[k][2], stops[k + 1][2], u)
  }
  return lut
}

/** sequential magnitude map (dark navy → cyan → yellow) */
export const SPEED_LUT = buildLUT([
  [16, 24, 48],
  [32, 64, 160],
  [20, 140, 200],
  [60, 200, 150],
  [200, 220, 60],
  [255, 240, 120],
])

/** diverging map with a neutral grey midpoint (blue ← grey → orange-red) */
export const DIVERGING_LUT = buildLUT([
  [36, 90, 200],
  [110, 160, 230],
  [120, 120, 120],
  [235, 150, 90],
  [220, 70, 40],
])

export type FieldKind = 'speed' | 'pressure' | 'vorticity'
