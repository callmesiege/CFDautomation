/**
 * Track advisor: evaluates library components (and custom parts) against a circuit and
 * weather by lap simulation, and explains which ones suit the conditions.
 */
import { applyComponentData, type CarDesign, type ComponentKind, type CustomPart, type SavedComponent } from '../model/types'
import { runCompliance } from '../regulations/compliance'
import { simulateLap, type LapResult } from './lapsim'
import { circuitStats, type Circuit, type Weather } from './circuits'

export interface SlotOption {
  id: string
  name: string
  /** component (or null = keep what the car has now) */
  component: SavedComponent | null
}

export interface Slot {
  kind: ComponentKind
  label: string
  options: SlotOption[]
}

export interface SlotRanking {
  kind: ComponentKind
  label: string
  rows: {
    option: SlotOption
    lapTime: number
    delta: number
    topSpeedKMH: number
    minCornerSpeedKMH: number
    clA: number
    cdA: number
    balance: number
    legal: boolean
    reasons: string[]
  }[]
}

export interface PartRanking {
  part: CustomPart
  mountedNow: boolean
  deltaIfMounted: number
  legal: boolean
}

export interface Sensitivities {
  /** seconds per +1 % downforce (all else equal) */
  perPctDownforce: number
  /** seconds per +1 % drag */
  perPctDrag: number
  /** seconds per +10 kg */
  per10kg: number
  /** seconds per +1 % grip */
  perPctGrip: number
}

export interface WingPair {
  fw: SlotOption
  rw: SlotOption
  delta: number
  legal: boolean
  balance: number
  clA: number
  cdA: number
}

export interface AdvisorReport {
  wingPairs: WingPair[]
  circuit: Circuit
  weather: Weather
  baseline: LapResult
  sensitivities: Sensitivities
  slots: SlotRanking[]
  parts: PartRanking[]
  best: { car: CarDesign; result: LapResult; choices: Record<ComponentKind, SlotOption>; mountedParts: string[]; delta: number }
  headline: string[]
}

const KIND_LABEL: Record<ComponentKind, string> = {
  frontWing: 'Front wing',
  rearWing: 'Rear wing',
  floor: 'Floor & diffuser',
  sidepod: 'Sidepods & cooling',
  setup: 'Ride height & balance',
}

const KINDS: ComponentKind[] = ['frontWing', 'rearWing', 'floor', 'sidepod', 'setup']

export function buildSlots(library: SavedComponent[]): Slot[] {
  return KINDS.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    options: [{ id: 'current', name: 'Current (as fitted)', component: null }, ...library.filter((c) => c.kind === kind).map((c) => ({ id: c.id, name: c.name, component: c }))],
  }))
}

function withOption(car: CarDesign, opt: SlotOption): CarDesign {
  return opt.component ? applyComponentData(car, opt.component.kind, opt.component.data) : car
}

function isLegal(car: CarDesign): boolean {
  return runCompliance(car).every((c) => c.status !== 'fail')
}

export function computeSensitivities(car: CarDesign, circuit: Circuit, weather: Weather, base: LapResult): Sensitivities {
  const df = simulateLap(car, circuit, weather, { clAScale: 1.02 })
  const dr = simulateLap(car, circuit, weather, { cdAScale: 1.02 })
  const massRes = simulateLap({ ...car, mass: { ...car.mass, mass: car.mass.mass + 10 } }, circuit, weather)
  const gripRes = simulateLap(car, circuit, weather, { gripScale: 1.01 })
  return {
    perPctDownforce: (df.lapTime - base.lapTime) / 2,
    perPctDrag: (dr.lapTime - base.lapTime) / 2,
    per10kg: massRes.lapTime - base.lapTime,
    perPctGrip: gripRes.lapTime - base.lapTime,
  }
}

function explain(kind: ComponentKind, row: { delta: number; topSpeedKMH: number; minCornerSpeedKMH: number; clA: number; cdA: number; balance: number }, base: LapResult, circuit: Circuit, weather: Weather, sens: Sensitivities, car: CarDesign): string[] {
  const r: string[] = []
  const dCl = ((row.clA - base.aero.clAZ) / base.aero.clAZ) * 100
  const dCd = ((row.cdA - base.aero.cdAZ) / base.aero.cdAZ) * 100
  const dV = row.topSpeedKMH - base.topSpeedKMH
  const dVc = row.minCornerSpeedKMH - base.minCornerSpeedKMH
  const st = circuitStats(circuit)
  if (Math.abs(dCd) > 0.5) r.push(`${dCd > 0 ? '+' : ''}${dCd.toFixed(1)} % drag → ${dV > 0 ? '+' : ''}${dV.toFixed(1)} km/h top speed (${(st.straightShare * 100).toFixed(0)} % of the lap is straight)`)
  if (Math.abs(dCl) > 0.5) r.push(`${dCl > 0 ? '+' : ''}${dCl.toFixed(1)} % downforce → ${dVc > 0 ? '+' : ''}${dVc.toFixed(1)} km/h in the slowest corner`)
  if (kind === 'sidepod') {
    if (weather.airTempC >= 28 || circuit.elevation > 1500) r.push('Cooling demand is high here (hot air or altitude): small inlets derate the engine')
    else r.push('Cool conditions: the smallest inlet that still cools is free lap time')
  }
  if (kind === 'setup') {
    if (circuit.minRideHeightRear > car.chassis.rideHeightRear) r.push(`Bumpy circuit: rear ride height below ${circuit.minRideHeightRear} mm risks plank wear`)
    else r.push('Ride height clears the bump allowance for this surface')
  }
  if ((kind === 'frontWing' || kind === 'rearWing') && (row.balance < 43 || row.balance > 48.5)) {
    r.unshift(`On its own it moves the aero balance to ${row.balance.toFixed(1)} % front, outside the 43–48.5 % window: pair it with a matching ${kind === 'frontWing' ? 'rear' : 'front'} wing`)
  }
  if (weather.condition !== 'dry') r.push('Wet track: grip is low, so downforce is worth more than usual')
  if (r.length === 0) r.push(Math.abs(sens.perPctDrag) > Math.abs(sens.perPctDownforce) ? 'This circuit rewards low drag more than downforce' : 'This circuit rewards downforce more than low drag')
  return r
}

export function runAdvisor(car: CarDesign, library: SavedComponent[], parts: CustomPart[], circuit: Circuit, weather: Weather): AdvisorReport {
  const baseline = simulateLap(car, circuit, weather, { trace: true })
  const sens = computeSensitivities(car, circuit, weather, baseline)
  const slots = buildSlots(library)
  const cache = new Map<string, { res: LapResult; legal: boolean }>()
  const evaluate = (c: CarDesign, key: string) => {
    const hit = cache.get(key)
    if (hit) return hit
    const res = simulateLap(c, circuit, weather)
    const out = { res, legal: isLegal(c) }
    cache.set(key, out)
    return out
  }

  // swap-in rankings per slot (others as fitted)
  const rankings: SlotRanking[] = slots.map((slot) => {
    const rows = slot.options.map((opt) => {
      const c = withOption(car, opt)
      const { res, legal } = evaluate(c, `${slot.kind}:${opt.id}`)
      const row = { option: opt, lapTime: res.lapTime, delta: res.lapTime - baseline.lapTime, topSpeedKMH: res.topSpeedKMH, minCornerSpeedKMH: res.minCornerSpeedKMH, clA: res.aero.clAZ, cdA: res.aero.cdAZ, balance: res.aero.balance, legal, reasons: [] as string[] }
      row.reasons = opt.component ? explain(slot.kind, row, baseline, circuit, weather, sens, c) : ['Reference: the configuration currently on the car']
      return row
    })
    rows.sort((a, b) => (a.legal === b.legal ? a.lapTime - b.lapTime : a.legal ? -1 : 1))
    return { kind: slot.kind, label: slot.label, rows }
  })

  // front × rear wing pairs (others as fitted)
  const fwSlot = slots.find((x) => x.kind === 'frontWing')!
  const rwSlot = slots.find((x) => x.kind === 'rearWing')!
  const wingPairs: WingPair[] = []
  for (const fw of fwSlot.options) {
    for (const rw of rwSlot.options) {
      const c = withOption(withOption(car, fw), rw)
      const { res, legal } = evaluate(c, `pair:${fw.id}:${rw.id}`)
      wingPairs.push({ fw, rw, delta: res.lapTime - baseline.lapTime, legal, balance: res.aero.balance, clA: res.aero.clAZ, cdA: res.aero.cdAZ })
    }
  }

  // parts: mounted vs not
  const partRankings: PartRanking[] = parts.map((p) => {
    const mountedNow = car.parts.some((x) => x.id === p.id)
    const alt: CarDesign = mountedNow ? { ...car, parts: car.parts.filter((x) => x.id !== p.id) } : { ...car, parts: [...car.parts, p] }
    const { res, legal } = evaluate(alt, `part:${p.id}:${mountedNow ? 'off' : 'on'}`)
    const mountedCar = mountedNow ? car : alt
    const deltaIfMounted = mountedNow ? baseline.lapTime - res.lapTime : res.lapTime - baseline.lapTime
    return { part: p, mountedNow, deltaIfMounted, legal: mountedNow ? isLegal(mountedCar) : legal }
  })

  // best combination: full factorial over the slots when affordable, else coordinate descent;
  // parts are then toggled greedily on top of the best slot combination.
  const choices = {} as Record<ComponentKind, SlotOption>
  for (const slot of slots) choices[slot.kind] = slot.options[0]
  const assemble = (ch: Record<ComponentKind, SlotOption>, mounted: string[]) => {
    let c = car
    for (const k of KINDS) c = withOption(c, ch[k])
    c = { ...c, parts: parts.filter((p) => mounted.includes(p.id)) }
    return c
  }
  const keyOf = (ch: Record<ComponentKind, SlotOption>, m: string[]) => KINDS.map((k) => ch[k].id).join('|') + '#' + m.join(',')
  let mounted = car.parts.map((p) => p.id)
  let bestCar = assemble(choices, mounted)
  let bestRes = evaluate(bestCar, keyOf(choices, mounted))
  const combos = slots.reduce((n, s) => n * s.options.length, 1)
  if (combos <= 800) {
    const idx = slots.map(() => 0)
    for (let n = 0; n < combos; n++) {
      const trial = {} as Record<ComponentKind, SlotOption>
      slots.forEach((slot, i) => (trial[slot.kind] = slot.options[idx[i]]))
      const c = assemble(trial, mounted)
      const r = evaluate(c, keyOf(trial, mounted))
      if (r.legal && r.res.lapTime < bestRes.res.lapTime - 1e-4) {
        for (const k of KINDS) choices[k] = trial[k]
        bestCar = c
        bestRes = r
      }
      for (let i = 0; i < idx.length; i++) {
        idx[i]++
        if (idx[i] < slots[i].options.length) break
        idx[i] = 0
      }
    }
  } else {
    for (let sweep = 0; sweep < 3; sweep++) {
      for (const slot of slots) {
        for (const opt of slot.options) {
          if (opt.id === choices[slot.kind].id) continue
          const trial = { ...choices, [slot.kind]: opt }
          const c = assemble(trial, mounted)
          const r = evaluate(c, keyOf(trial, mounted))
          if (r.legal && r.res.lapTime < bestRes.res.lapTime - 1e-4) {
            choices[slot.kind] = opt
            bestCar = c
            bestRes = r
          }
        }
      }
    }
  }
  for (let sweep = 0; sweep < 2; sweep++) {
    for (const p of parts) {
      const m = mounted.includes(p.id) ? mounted.filter((x) => x !== p.id) : [...mounted, p.id]
      const c = assemble(choices, m)
      const r = evaluate(c, keyOf(choices, m))
      if (r.legal && r.res.lapTime < bestRes.res.lapTime - 1e-4) {
        mounted = m
        bestCar = c
        bestRes = r
      }
    }
  }
  const bestResult = simulateLap(bestCar, circuit, weather, { trace: true })

  const headline: string[] = []
  const st = circuitStats(circuit)
  headline.push(`${circuit.name}: ${(st.straightShare * 100).toFixed(0)} % straights (${(st.xmodeShare * 100).toFixed(0)} % X-mode), ${st.slow} slow / ${st.medium} medium / ${st.fast} fast corners.`)
  headline.push(
    Math.abs(sens.perPctDrag) > Math.abs(sens.perPctDownforce)
      ? `Drag-sensitive: 1 % drag costs ${Math.abs(sens.perPctDrag).toFixed(3)} s versus ${Math.abs(sens.perPctDownforce).toFixed(3)} s gained per 1 % downforce.`
      : `Downforce-sensitive: 1 % downforce is worth ${Math.abs(sens.perPctDownforce).toFixed(3)} s versus ${Math.abs(sens.perPctDrag).toFixed(3)} s per 1 % drag.`,
  )
  if (baseline.coolingDerate > 0.005) headline.push(`Cooling: the fitted sidepods derate the engine by ${(baseline.coolingDerate * 100).toFixed(1)} % in ${weather.airTempC} °C air${circuit.elevation > 1000 ? ' at altitude' : ''}.`)
  if (baseline.plankPenaltyS > 0) headline.push(`Ride height: ${baseline.plankPenaltyS.toFixed(2)} s penalty for running below the ${circuit.minRideHeightRear} mm this surface needs.`)
  if (weather.condition !== 'dry') headline.push(`${weather.condition === 'wet' ? 'Wet' : 'Damp'} track: grip is reduced and downforce is worth more; expect the high-load components to win.`)
  const delta = bestResult.lapTime - baseline.lapTime
  headline.push(delta < -0.005 ? `Best combination found is ${Math.abs(delta).toFixed(2)} s per lap quicker than the car as fitted.` : 'The car as fitted is already the quickest legal combination in the library.')

  return { wingPairs, circuit, weather, baseline, sensitivities: sens, slots: rankings, parts: partRankings, best: { car: bestCar, result: bestResult, choices, mountedParts: mounted, delta }, headline }
}

/** For every circuit (typical weather) find the best swap-in option per slot. */
export function suitabilityMatrix(car: CarDesign, library: SavedComponent[], circuits: Circuit[], weatherFor: (c: Circuit) => Weather): { circuit: Circuit; lapTime: number; best: Record<ComponentKind, { name: string; delta: number }> }[] {
  const slots = buildSlots(library)
  return circuits.map((circuit) => {
    const weather = weatherFor(circuit)
    const base = simulateLap(car, circuit, weather)
    const best = {} as Record<ComponentKind, { name: string; delta: number }>
    for (const slot of slots) {
      let bestName = 'Current'
      let bestT = base.lapTime
      for (const opt of slot.options) {
        if (!opt.component) continue
        const c = withOption(car, opt)
        if (!isLegal(c)) continue
        const r = simulateLap(c, circuit, weather)
        if (r.lapTime < bestT - 1e-4) {
          bestT = r.lapTime
          bestName = opt.name
        }
      }
      best[slot.kind] = { name: bestName, delta: bestT - base.lapTime }
    }
    return { circuit, lapTime: base.lapTime, best }
  })
}
