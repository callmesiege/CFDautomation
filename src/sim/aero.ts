/**
 * Semi-empirical whole-car aerodynamic model.
 *
 * This is a fast "aero map" estimator, not a Navier-Stokes solve: each component is modelled
 * with classical thin-airfoil / lifting-line theory plus empirical ground-effect and
 * multi-element corrections, calibrated so a default 2026-style car lands near the
 * published 2026 targets (~15 % less downforce and ~30 % less drag than a 2025 car).
 * It runs in microseconds, so sweeps and live sliders are instant.
 */
import type { CarDesign, WingElement } from '../model/types'
import { zeroLiftAngle } from '../model/airfoil'
import { airProperties, reynolds, type Atmosphere, type AirProperties } from './atmosphere'

export interface ComponentLoads {
  name: string
  /** downforce coefficient × area (m²) — positive = downforce */
  clA: number
  /** drag coefficient × area (m²) */
  cdA: number
  /** x position of the centre of pressure (mm) */
  xCp: number
  downforceN: number
  dragN: number
  notes: string[]
}

export interface AeroResult {
  speedMS: number
  air: AirProperties
  dynamicPressure: number
  components: ComponentLoads[]
  totalDownforceN: number
  totalDragN: number
  clA: number
  cdA: number
  efficiency: number
  /** share of downforce on the front axle (%) */
  frontAeroBalance: number
  frontAxleLoadN: number
  rearAxleLoadN: number
  reynoldsFrontWing: number
  reynoldsCar: number
  mach: number
  powerRequiredKW: number
  /** quasi-steady top speed on a flat straight (km/h) */
  topSpeedKMH: number
  /** achievable lateral acceleration in a 100 m radius corner (g) */
  corneringG100m: number
  warnings: string[]
}

const DEG = Math.PI / 180

/** 2-D lift coefficient for one element, with stall softening. */
function elementCl2D(el: WingElement, angle: number, groundHeightRatio?: number, slotted = false): { cl: number; stalled: boolean } {
  const a0L = zeroLiftAngle(el.profile) // negative for positive camber
  // inverted wing: geometric incidence adds to camber lift
  const alphaEff = angle - a0L
  const clLinear = 2 * Math.PI * alphaEff * DEG
  // stall model: lift plateaus beyond ~13° effective and decays
  // a slotted flap sees a fresh boundary layer from the slot and stalls much later
  const stallAngle = 13 + (el.profile.kind === 'naca4' ? el.profile.t * 0.25 : 2) + (slotted ? 10 : 0)
  let cl = clLinear
  let stalled = false
  if (alphaEff > stallAngle) {
    const over = alphaEff - stallAngle
    cl = 2 * Math.PI * stallAngle * DEG * Math.max(0.55, 1 - over * 0.035)
    stalled = over > 4
  }
  if (groundHeightRatio !== undefined) {
    // ground effect: lift gain grows as h/c shrinks, then collapses when the gap chokes
    const h = Math.max(0.05, groundHeightRatio)
    const gain = 1 + 0.18 / h - 0.02 / (h * h)
    cl *= Math.max(0.6, Math.min(1.9, gain))
  }
  return { cl, stalled }
}

function wingLoads(name: string, elements: WingElement[], mode: 'Z' | 'X', q: number, air: AirProperties, groundEffect: boolean, endplateFactor: number): ComponentLoads {
  const notes: string[] = []
  let clA = 0
  let cdA = 0
  let moment = 0
  const n = elements.length
  const span = Math.max(...elements.map((e) => e.span)) / 1000
  const meanChord = elements.reduce((s, e) => s + (e.chord + e.tipChord) / 2, 0) / 1000
  const AR = span / Math.max(0.05, meanChord)
  // multi-element gain: the slot keeps the flow attached and the flaps see the main-plane downwash
  const slotGain = 1 + 0.12 * (n - 1)
  elements.forEach((el, i) => {
    const angle = mode === 'X' && el.active ? el.xModeAngle : el.angle
    const chord = (el.chord + el.tipChord) / 2 / 1000
    const effSpan = (el.span - 2 * el.spanStart) / 1000
    const area = Math.max(0, effSpan * chord)
    const hRatio = groundEffect ? el.z / 1000 / chord : undefined
    // upstream elements turn the flow for the flaps: effective incidence reduced
    const prev = i === 0 ? null : elements[i - 1]
    const prevAngle = prev ? (mode === 'X' && prev.active ? prev.xModeAngle : prev.angle) : 0
    const downwash = 0.65 * prevAngle
    const { cl, stalled } = elementCl2D(el, angle - downwash, hRatio, i > 0)
    const cl3d = cl * slotGain * (AR / (AR + 2)) * endplateFactor
    const clAEl = cl3d * area
    const Re = reynolds(air, 1, chord)
    const cf = 0.074 / Math.pow(Math.max(1e5, Re * 60), 0.2) // profile drag from flat-plate skin friction at ~60 m/s
    const cd0 = 2 * cf * (1 + 2 * (el.profile.kind === 'naca4' ? el.profile.t / 100 : 0.1)) + (stalled ? 0.08 : 0.004 * Math.abs(angle) / 10)
    // Oswald efficiency: endplates and the slot system make an F1 wing far more efficient than its geometric AR suggests
    const e = 1.1 * endplateFactor
    const cdi = (cl3d * cl3d) / (Math.PI * e * AR)
    cdA += (cd0 + cdi) * area
    clA += clAEl
    moment += clAEl * (el.x + chord * 1000 * 0.3)
    if (stalled) notes.push(`${el.name} is stalled at ${angle.toFixed(0)}°`)
  })
  const xCp = clA !== 0 ? moment / clA : elements[0]?.x ?? 0
  return { name, clA, cdA, xCp, downforceN: clA * q, dragN: cdA * q, notes }
}

export function computeAero(car: CarDesign, atm: Atmosphere, speedKMH: number): AeroResult {
  const air = airProperties(atm)
  const v = speedKMH / 3.6 + atm.windMS
  const q = 0.5 * air.density * v * v
  const warnings: string[] = []
  const comps: ComponentLoads[] = []

  // --- wings
  const fw = wingLoads('Front wing', car.frontWing.elements, car.aeroMode, q, air, true, 1 + Math.min(0.25, car.frontWing.endplate.height / 1000))
  const rw = wingLoads('Rear wing', car.rearWing.elements, car.aeroMode, q, air, false, 1 + Math.min(0.6, car.rearWing.endplate.height / 1000))
  comps.push(fw, rw)

  // --- floor + diffuser (venturi model)
  {
    const f = car.floor
    const hF = Math.max(5, car.chassis.rideHeightFront)
    const hR = Math.max(5, car.chassis.rideHeightRear)
    const hMean = (hF + 2 * hR) / 3 // the throat sits toward the rear
    const area = (f.length / 1000) * (f.width / 1000)
    // 2026 partially flat floor: peak coefficient ~55 % of a full-venturi 2022 floor
    const peak = 1.3
    const hOpt = 38 // mm
    const h = hMean
    // Lift coefficient rises as 1/h, saturates and then stalls below hOpt
    let clFloor = h >= hOpt ? peak * Math.pow(hOpt / h, 0.75) : peak * Math.max(0.35, 1 - ((hOpt - h) / hOpt) * 1.3)
    // diffuser: effectiveness grows with angle until ~12-14° where it separates
    const dEff = f.diffuserAngle <= 12 ? f.diffuserAngle / 12 : Math.max(0.5, 1 - (f.diffuserAngle - 12) * 0.08)
    const expansion = Math.min(3.5, f.diffuserExitHeight / Math.max(20, f.tunnelInletHeight))
    clFloor *= 0.55 + 0.45 * dEff * Math.min(1, expansion / 2.6)
    // rake adds expansion
    const rake = Math.atan((hR - hF) / car.chassis.wheelbase) / DEG
    clFloor *= 1 + 0.03 * rake
    const clA = clFloor * area * 0.42 // only part of the plan area is loaded
    const cdA = 0.018 * area + 0.015 * clA
    const notes: string[] = []
    if (h < hOpt) notes.push('Floor below optimum ride height: tunnels are choking')
    if (f.diffuserAngle > 12) notes.push('Diffuser angle above ~12°: separation on the ramp')
    const xCp = f.startX + f.length * 0.62
    comps.push({ name: 'Floor + diffuser', clA, cdA, xCp, downforceN: clA * q, dragN: cdA * q, notes })
  }

  // --- body, wheels, cooling
  {
    const t = car.tyres
    const frontalTyres = 2 * (t.frontWidth / 1000) * (t.diameter / 1000) * 0.78 + 2 * (t.rearWidth / 1000) * (t.diameter / 1000) * 0.8
    const cdTyres = 0.38 * frontalTyres
    const bodyFrontal = (car.sidepod.width * 2 + 600) / 1000 * (car.sidepod.height / 1000) * 0.8
    const cdBody = 0.16 * bodyFrontal + 0.6 * (car.sidepod.inletArea / 1e6) + 0.025 * (car.chassis.wheelbase / 3400)
    const halo = 0.045
    const cdA = cdTyres + cdBody + halo
    const clA = -0.12 * (car.sidepod.undercut / 140) + 0.1 // body lift, undercut recovers a little
    comps.push({ name: 'Body, wheels, cooling, halo', clA: -clA, cdA, xCp: car.chassis.wheelbase * 0.5, downforceN: -clA * q, dragN: cdA * q, notes: [] })
  }

  // --- custom parts
  car.parts.forEach((p) => {
    if (p.kind === 'wing-element' || p.kind === 'winglet') {
      const l = wingLoads(`Part: ${p.name}`, [p.element], car.aeroMode, q, air, p.mount === 'floor' || p.mount === 'front-wing', 1)
      comps.push(l)
    } else {
      const area = ((p.element.span - 2 * p.element.spanStart) / 1000) * ((p.element.chord + p.element.tipChord) / 2000)
      comps.push({ name: `Part: ${p.name}`, clA: 0.15 * area, cdA: 0.05 * area, xCp: p.element.x, downforceN: 0.15 * area * q, dragN: 0.05 * area * q, notes: [] })
    }
  })

  const clA = comps.reduce((s, c) => s + c.clA, 0)
  const cdA = comps.reduce((s, c) => s + c.cdA, 0)
  const totalDownforceN = clA * q
  const totalDragN = cdA * q
  // moment balance about the rear axle
  const wb = car.chassis.wheelbase
  const frontShare = clA !== 0 ? comps.reduce((s, c) => s + c.clA * (wb - c.xCp), 0) / (clA * wb) : 0.5
  const frontAeroBalance = frontShare * 100
  const massN = car.mass.mass * 9.81
  const frontAxleLoadN = massN * (car.mass.frontBalance / 100) + totalDownforceN * frontShare
  const rearAxleLoadN = massN * (1 - car.mass.frontBalance / 100) + totalDownforceN * (1 - frontShare)

  const fwChord = car.frontWing.elements[0] ? car.frontWing.elements[0].chord / 1000 : 0.3
  const reynoldsFrontWing = reynolds(air, Math.max(0.1, v), fwChord)
  const reynoldsCar = reynolds(air, Math.max(0.1, v), wb / 1000)
  const mach = v / air.speedOfSound

  // power balance
  const crr = 0.014
  const powerRequiredKW = ((totalDragN + crr * (massN + totalDownforceN)) * v) / 1000
  const pAvail = 740 * 0.93 // kW at the wheels, 2026 combined output less driveline loss
  // iterate for top speed
  let vt = 60
  for (let i = 0; i < 60; i++) {
    const qq = 0.5 * air.density * vt * vt
    const drag = cdA * qq
    const rr = crr * (massN + clA * qq)
    const pNeeded = ((drag + rr) * vt) / 1000
    vt *= Math.pow(pAvail / Math.max(1, pNeeded), 0.33)
  }
  const topSpeedKMH = vt * 3.6
  // cornering: μ ~1.7 on slicks, lateral acceleration = μ (m g + L) / m with speed solved for R = 100 m
  const mu = 1.7
  let vc = 30
  for (let i = 0; i < 40; i++) {
    const qq = 0.5 * air.density * vc * vc
    const ay = (mu * (massN + clA * qq)) / car.mass.mass
    vc = Math.sqrt(ay * 100)
  }
  const corneringG100m = (vc * vc) / 100 / 9.81

  if (frontAeroBalance < 38) warnings.push('Aero balance is rear-biased: expect understeer on entry')
  if (frontAeroBalance > 52) warnings.push('Aero balance is front-biased: expect a nervous rear')
  if (mach > 0.3) warnings.push('Compressibility becomes noticeable above Mach 0.3')
  comps.forEach((c) => c.notes.forEach((n) => warnings.push(`${c.name}: ${n}`)))

  return {
    speedMS: v,
    air,
    dynamicPressure: q,
    components: comps,
    totalDownforceN,
    totalDragN,
    clA,
    cdA,
    efficiency: cdA > 0 ? clA / cdA : 0,
    frontAeroBalance,
    frontAxleLoadN,
    rearAxleLoadN,
    reynoldsFrontWing,
    reynoldsCar,
    mach,
    powerRequiredKW,
    topSpeedKMH,
    corneringG100m,
    warnings,
  }
}

export interface SweepPoint {
  x: number
  downforce: number
  drag: number
  efficiency: number
  balance: number
}

export function speedSweep(car: CarDesign, atm: Atmosphere, from = 50, to = 350, step = 10): SweepPoint[] {
  const out: SweepPoint[] = []
  for (let s = from; s <= to; s += step) {
    const r = computeAero(car, atm, s)
    out.push({ x: s, downforce: r.totalDownforceN, drag: r.totalDragN, efficiency: r.efficiency, balance: r.frontAeroBalance })
  }
  return out
}

export function rideHeightSweep(car: CarDesign, atm: Atmosphere, speedKMH: number, from = 10, to = 90, step = 4): SweepPoint[] {
  const out: SweepPoint[] = []
  for (let h = from; h <= to; h += step) {
    const c: CarDesign = { ...car, chassis: { ...car.chassis, rideHeightFront: h * 0.6, rideHeightRear: h } }
    const r = computeAero(c, atm, speedKMH)
    out.push({ x: h, downforce: r.totalDownforceN, drag: r.totalDragN, efficiency: r.efficiency, balance: r.frontAeroBalance })
  }
  return out
}

export function flapSweep(car: CarDesign, atm: Atmosphere, speedKMH: number, wing: 'frontWing' | 'rearWing', elementIndex: number, from = 0, to = 40, step = 2): SweepPoint[] {
  const out: SweepPoint[] = []
  for (let a = from; a <= to; a += step) {
    const els = car[wing].elements.map((e, i) => (i === elementIndex ? { ...e, angle: a } : e))
    const c: CarDesign = { ...car, [wing]: { ...car[wing], elements: els } }
    const r = computeAero(c, atm, speedKMH)
    out.push({ x: a, downforce: r.totalDownforceN, drag: r.totalDragN, efficiency: r.efficiency, balance: r.frontAeroBalance })
  }
  return out
}
