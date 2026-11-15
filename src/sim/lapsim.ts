/**
 * Quasi-steady point-mass lap simulation.
 *
 * Classic forward/backward integration: the corner-speed envelope comes from the friction
 * circle with downforce-dependent normal load, acceleration is the lesser of the traction and
 * power limits minus drag and rolling resistance, braking is traction-limited with drag helping.
 * Active aero: Z-mode everywhere except straights flagged as X-mode zones.
 */
import type { CarDesign } from '../model/types'
import { computeAero } from './aero'
import { airProperties, type Atmosphere } from './atmosphere'
import { gripCoefficient, type Circuit, type Weather } from './circuits'

export interface LapResult {
  lapTime: number
  topSpeedKMH: number
  minCornerSpeedKMH: number
  avgSpeedKMH: number
  /** share of lap distance spent in X-mode */
  xmodeShare: number
  /** share of lap time at full throttle (power-limited) */
  fullThrottleShare: number
  /** energy spent against drag (MJ) */
  dragEnergyMJ: number
  coolingDerate: number
  plankPenaltyS: number
  /** grip lost to an aero balance outside the 43–48.5 % front window (fraction) */
  balancePenalty: number
  trace: { s: number; v: number }[]
  aero: { clAZ: number; cdAZ: number; clAX: number; cdAX: number; balance: number }
}

export interface LapOptions {
  /** step length (m) */
  ds?: number
  /** keep the speed trace (costs memory) */
  trace?: boolean
  /** multiply the car's downforce (sensitivity studies) */
  clAScale?: number
  /** multiply the car's drag (sensitivity studies) */
  cdAScale?: number
  /** grip multiplier (sensitivity studies) */
  gripScale?: number
}

/** X-mode is armed a short distance into a zone (ECU activation point), like DRS was. */
const XMODE_ACTIVATION_M = 250

export function weatherToAtmosphere(c: Circuit, w: Weather): Atmosphere {
  return {
    temperatureC: w.airTempC,
    humidity: w.humidity,
    elevation: c.elevation,
    useISA: w.pressureHPa === null,
    pressureHPa: w.pressureHPa ?? 1013.25,
    windMS: w.windMS,
  }
}

/** 2026 power unit: ~400 kW ICE + 350 kW MGU-K, with MGU-K deployment tapering at high speed. */
export function powerAvailableW(vMS: number, derate = 0): number {
  const kmh = vMS * 3.6
  const taper = kmh < 300 ? 1 : kmh > 365 ? 0 : 1 - (kmh - 300) / 65
  const p = 400e3 * (1 - derate) + 350e3 * taper
  return p * 0.95 // driveline efficiency
}

/** Cooling demand: hotter and thinner air needs a bigger inlet; a deficit derates the ICE. */
export function coolingDerate(car: CarDesign, airTempC: number, densityRatio: number): number {
  const required = 34000 + 950 * (airTempC - 15) + 40000 * Math.max(0, 1 - densityRatio)
  const deficit = required - car.sidepod.inletArea
  if (deficit <= 0) return 0
  return Math.min(0.15, deficit / 120000)
}

export function simulateLap(car: CarDesign, circuit: Circuit, weather: Weather, opts: LapOptions = {}): LapResult {
  const ds = opts.ds ?? 2
  const atm = weatherToAtmosphere(circuit, weather)
  const air = airProperties(atm)
  const rho = air.density
  const aeroZraw = computeAero({ ...car, aeroMode: 'Z' }, atm, 200)
  const aeroXraw = computeAero({ ...car, aeroMode: 'X' }, atm, 200)
  const ks = opts.clAScale ?? 1
  const kd = opts.cdAScale ?? 1
  const aeroZ = { clA: aeroZraw.clA * ks, cdA: aeroZraw.cdA * kd, frontAeroBalance: aeroZraw.frontAeroBalance }
  const aeroX = { clA: aeroXraw.clA * ks, cdA: aeroXraw.cdA * kd }
  // aero balance outside the usable window costs grip (understeer / oversteer compromise)
  const bal = aeroZ.frontAeroBalance
  const balPenalty = bal < 43 ? (43 - bal) * 0.012 : bal > 48.5 ? (bal - 48.5) * 0.012 : 0
  const m = car.mass.mass + 40 // mid-race fuel load
  const g = 9.81
  const mu0 = gripCoefficient(circuit, weather) * (opts.gripScale ?? 1) * Math.max(0.8, 1 - balPenalty)
  const crr = 0.012
  const N0 = m * g
  /** tyre load sensitivity: the friction coefficient falls as the normal load rises */
  const muAt = (N: number) => mu0 * Math.pow(N0 / Math.max(N0 * 0.5, N), 0.18)
  const derate = coolingDerate(car, weather.airTempC, air.densityRatio)
  const wind = weather.windMS

  // discretise
  const n = Math.ceil(circuit.length / ds)
  const kappa = new Float64Array(n)
  const xmode = new Uint8Array(n)
  let seg = 0
  let segStart = 0
  let segEnd = circuit.segments[0].length
  for (let i = 0; i < n; i++) {
    const s = i * ds
    while (s >= segEnd && seg < circuit.segments.length - 1) {
      seg++
      segStart = segEnd
      segEnd += circuit.segments[seg].length
    }
    const sg = circuit.segments[seg]
    kappa[i] = sg.type === 'corner' ? 1 / sg.radius! : 0
    xmode[i] = sg.type === 'straight' && sg.xmode && s - segStart >= XMODE_ACTIVATION_M ? 1 : 0
  }

  const clA = (i: number) => (xmode[i] ? aeroX.clA : aeroZ.clA)
  const cdA = (i: number) => (xmode[i] ? aeroX.cdA : aeroZ.cdA)
  const vCap = 400 / 3.6

  // corner speed envelope
  const vLim = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const k = kappa[i]
    if (k === 0) {
      vLim[i] = vCap
      continue
    }
    // solve v² k m = μ(N) N with N = m g + ½ρ ClA v² by fixed-point iteration
    let v2 = (mu0 * g) / k
    for (let it = 0; it < 25; it++) {
      const N = m * g + 0.5 * rho * clA(i) * v2
      const mu = muAt(N)
      const next = (mu * N) / (m * k)
      if (!Number.isFinite(next) || next > vCap * vCap) {
        v2 = vCap * vCap
        break
      }
      v2 = 0.5 * v2 + 0.5 * next
    }
    vLim[i] = Math.min(vCap, Math.sqrt(v2))
  }

  const v = new Float64Array(n)
  for (let i = 0; i < n; i++) v[i] = vLim[i]
  const fullThrottle = new Uint8Array(n)

  const forwardPass = () => {
    for (let step = 0; step < n; step++) {
      const i = step
      const j = (i + 1) % n
      const vi = v[i]
      const va = vi + wind
      const q = 0.5 * rho * va * va
      const N = m * g + clA(i) * q
      const mu = muAt(N)
      const aLat = vi * vi * kappa[i]
      const fLatNeeded = m * aLat
      const fMax = Math.sqrt(Math.max(0, (mu * N) ** 2 - fLatNeeded ** 2)) * 0.95
      const drag = cdA(i) * q + crr * N
      const fPower = powerAvailableW(vi, derate) / Math.max(vi, 5)
      const fTract = Math.min(fMax, fPower)
      fullThrottle[i] = fPower <= fMax ? 1 : 0
      const a = (fTract - drag) / m
      const vNext = Math.sqrt(Math.max(1, vi * vi + 2 * a * ds))
      v[j] = Math.min(vNext, vLim[j], j === 0 ? v[0] : Infinity)
      if (j === 0) break
    }
  }
  const backwardPass = () => {
    for (let step = n - 1; step >= 0; step--) {
      const j = step
      const i = (j - 1 + n) % n
      const vj = v[j]
      const vi = v[i]
      const va = vi + wind
      const q = 0.5 * rho * va * va
      const N = m * g + clA(i) * q
      const mu = muAt(N)
      const aLat = vi * vi * kappa[i]
      const fMax = Math.sqrt(Math.max(0, (mu * N) ** 2 - (m * aLat) ** 2))
      const drag = cdA(i) * q + crr * N
      const aBrake = (fMax + drag) / m
      const vPrevMax = Math.sqrt(vj * vj + 2 * aBrake * ds)
      if (vPrevMax < v[i]) v[i] = vPrevMax
    }
  }

  // start from the envelope, iterate to a periodic solution
  v[0] = Math.min(v[0], 60)
  for (let it = 0; it < 3; it++) {
    forwardPass()
    backwardPass()
  }
  // the car starts the lap at the speed it finishes: run forward once more from the final speed
  forwardPass()
  backwardPass()

  let t = 0
  let vmax = 0
  let vmin = Infinity
  let xDist = 0
  let ftTime = 0
  let dragE = 0
  const trace: { s: number; v: number }[] = []
  for (let i = 0; i < n; i++) {
    const vi = v[i]
    const vj = v[(i + 1) % n]
    const vm = Math.max(1, (vi + vj) / 2)
    const dt = ds / vm
    t += dt
    vmax = Math.max(vmax, vi)
    if (kappa[i] > 0) vmin = Math.min(vmin, vi)
    if (xmode[i]) xDist += ds
    if (fullThrottle[i]) ftTime += dt
    dragE += cdA(i) * 0.5 * rho * vm * vm * ds
    if (opts.trace && i % 5 === 0) trace.push({ s: i * ds, v: vi * 3.6 })
  }

  // bumpy circuits punish low ride heights (plank wear / bottoming): soft penalty
  const rhDeficit = Math.max(0, circuit.minRideHeightRear - car.chassis.rideHeightRear)
  const plankPenaltyS = rhDeficit > 0 ? 0.08 * rhDeficit : 0

  return {
    lapTime: t + plankPenaltyS,
    topSpeedKMH: vmax * 3.6,
    minCornerSpeedKMH: (vmin === Infinity ? 0 : vmin) * 3.6,
    avgSpeedKMH: (circuit.length / t) * 3.6,
    xmodeShare: xDist / circuit.length,
    fullThrottleShare: ftTime / t,
    dragEnergyMJ: dragE / 1e6,
    coolingDerate: derate,
    plankPenaltyS,
    trace,
    aero: { clAZ: aeroZ.clA, cdAZ: aeroZ.cdA, clAX: aeroX.clA, cdAX: aeroX.cdA, balance: aeroZ.frontAeroBalance },
    balancePenalty: balPenalty,
  }
}
