import type { CarDesign, WingElement } from '../model/types'
import { elementExtents, elementSection2D, bbox } from '../model/airfoil'
import { findLimit, type LimitStatus } from './regs2026'

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'info'

export interface CheckResult {
  key: string
  article: string
  title: string
  status: CheckStatus
  measured: number
  limitText: string
  unit: string
  message: string
  provenance: LimitStatus
}

function check(key: string, measured: number, opts: { title?: string; warnMargin?: number } = {}): CheckResult {
  const found = findLimit(key)
  if (!found) {
    return { key, article: '—', title: opts.title ?? key, status: 'info', measured, limitText: 'no limit on file', unit: '', message: 'No limit recorded', provenance: 'target' }
  }
  const { article, limit } = found
  const unit = limit.unit
  let status: CheckStatus = 'pass'
  let message = 'Within limit'
  const margin = opts.warnMargin ?? 0.03
  const parts: string[] = []
  if (limit.exact !== undefined) {
    parts.push(`= ${limit.exact}`)
    if (Math.abs(measured - limit.exact) > 1e-6) {
      status = 'fail'
      message = `Must equal ${limit.exact} ${unit}`
    }
  }
  if (limit.max !== undefined) {
    parts.push(`≤ ${limit.max}`)
    if (measured > limit.max) {
      status = 'fail'
      message = `Exceeds maximum by ${(measured - limit.max).toFixed(1)} ${unit}`
    } else if (measured > limit.max * (1 - margin) && measured < limit.max && unit !== 'elements' && status === 'pass') {
      status = 'warn'
      message = `Within ${((1 - measured / limit.max) * 100).toFixed(1)} % of the maximum`
    }
  }
  if (limit.min !== undefined) {
    parts.push(`≥ ${limit.min}`)
    if (measured < limit.min) {
      status = 'fail'
      message = `Below minimum by ${(limit.min - measured).toFixed(1)} ${unit}`
    } else if (limit.min > 0 && measured < limit.min * (1 + margin) && measured > limit.min && unit !== 'elements' && status === 'pass') {
      status = 'warn'
      message = `Within ${((measured / limit.min - 1) * 100).toFixed(1)} % of the minimum`
    }
  }
  if (limit.status === 'target' && status === 'fail') {
    status = 'warn'
    message = `Outside engineering target: ${message}`
  }
  return {
    key,
    article: article.id,
    title: opts.title ?? limit.label,
    status,
    measured: Math.round(measured * 100) / 100,
    limitText: parts.join(', '),
    unit,
    message,
    provenance: limit.status,
  }
}

function wingSpan(elements: WingElement[]): number {
  return elements.reduce((m, e) => Math.max(m, e.span), 0)
}

function wingTop(elements: WingElement[]): number {
  return elements.reduce((m, e) => Math.max(m, elementExtents(e).maxZ), -Infinity)
}

function wingBottom(elements: WingElement[]): number {
  return elements.reduce((m, e) => Math.min(m, elementExtents(e).minZ), Infinity)
}

function minThickness(el: WingElement): number {
  // thickness ratio times the smaller chord
  const t = el.profile.kind === 'naca4' ? el.profile.t / 100 : 0.08
  return t * Math.min(el.chord, el.tipChord)
}

export function runCompliance(car: CarDesign): CheckResult[] {
  const r: CheckResult[] = []
  const { chassis, frontWing, rearWing, floor, tyres, mass } = car

  // --- overall dimensions
  const trackWidthF = chassis.frontTrack + tyres.frontWidth
  const trackWidthR = chassis.rearTrack + tyres.rearWidth
  const overallWidth = Math.max(chassis.width, trackWidthF, trackWidthR, wingSpan(frontWing.elements), floor.width)
  r.push(check('chassis.width.max', overallWidth, { title: 'Overall width (widest of body, wheels, wings, floor)' }))
  r.push(check('chassis.wheelbase.max', chassis.wheelbase))
  const rwMainZ = rearWing.elements[0]?.z ?? 0
  const topHeight = Math.max(chassis.engineCoverHeight, wingTop(rearWing.elements), rwMainZ - 310 + rearWing.endplate.height)
  r.push(check('chassis.height.max', topHeight, { title: 'Highest bodywork point' }))
  const fwExt = frontWing.elements.map(elementExtents)
  const frontMost = Math.min(chassis.noseTipX, ...fwExt.map((e) => e.minX))
  r.push(check('chassis.frontOverhang.max', -frontMost, { title: 'Front overhang (nose / front wing)' }))
  const rwExt = rearWing.elements.map(elementExtents)
  const rearMost = Math.max(...rwExt.map((e) => e.maxX), floor.startX + floor.length)
  r.push(check('chassis.rearOverhang.max', rearMost - chassis.wheelbase, { title: 'Rear overhang (rear wing / diffuser)' }))

  // --- front wing
  r.push(check('fw.span.max', wingSpan(frontWing.elements) + 2 * frontWing.endplate.thickness, { title: 'Front wing span incl. endplates' }))
  r.push(check('fw.elements.max', frontWing.elements.length))
  r.push(check('fw.activeElements.max', frontWing.elements.filter((e) => e.active).length))
  r.push(check('fw.height.max', Math.max(wingTop(frontWing.elements), frontWing.endplate.height)))
  r.push(check('fw.height.min', wingBottom(frontWing.elements)))
  r.push(check('fw.leadingEdge.min', Math.min(...fwExt.map((e) => e.minX)), { title: 'Front wing forward-most point' }))
  frontWing.elements.forEach((e) => {
    r.push({ ...check('fw.elementThickness.min', minThickness(e)), title: `${e.name}: minimum thickness`, key: `fw.elementThickness.min.${e.id}` })
  })
  const fwChord = frontWing.elements.reduce((s, e) => s + e.chord, 0)
  r.push(check('fw.chordTotal.max', fwChord, { title: 'Front wing total chord (sum of elements)' }))
  if (frontWing.elements.length > 0 && !frontWing.elements[0].active && frontWing.elements.some((e) => e.active)) {
    r.push({ key: 'fw.mainPlaneFixed', article: 'C2.2', title: 'Main plane is fixed bodywork', status: 'pass', measured: 0, limitText: 'main plane not active', unit: '', message: 'Only the flaps are designated active elements', provenance: 'official' })
  } else if (frontWing.elements[0]?.active) {
    r.push({ key: 'fw.mainPlaneFixed', article: 'C2.2', title: 'Main plane is fixed bodywork', status: 'fail', measured: 1, limitText: 'main plane not active', unit: '', message: 'The main plane may not be an active element', provenance: 'official' })
  }
  // slot gaps between successive elements at the 500 mm station (advisory)
  for (let i = 1; i < frontWing.elements.length; i++) {
    const a = bbox(elementSection2D(frontWing.elements[i - 1], 500).pts)
    const b = bbox(elementSection2D(frontWing.elements[i], 500).pts)
    const gap = Math.hypot(Math.max(0, b.minX - a.maxX), Math.max(0, b.minY - a.maxY))
    const overlap = a.maxX - b.minX
    r.push({
      key: `fw.slot.${i}`,
      article: 'C3.9',
      title: `Slot gap ${frontWing.elements[i - 1].name} → ${frontWing.elements[i].name}`,
      status: gap < 5 && overlap > 0 ? 'warn' : gap > 60 ? 'warn' : 'pass',
      measured: Math.round(gap),
      limitText: '8 – 40 target',
      unit: 'mm',
      message: gap < 5 && overlap > 0 ? 'Elements touch or overlap: the slot will choke' : gap > 60 ? 'Slot too open: elements act independently' : 'Slot gap in the useful range',
      provenance: 'target',
    })
  }

  // --- rear wing
  r.push(check('rw.span.max', wingSpan(rearWing.elements) + 2 * rearWing.endplate.thickness, { title: 'Rear wing span incl. endplates' }))
  r.push(check('rw.elements.max', rearWing.elements.length))
  r.push(check('rw.activeElements.max', rearWing.elements.filter((e) => e.active).length))
  r.push(check('rw.height.max', wingTop(rearWing.elements)))
  r.push(check('rw.trailingEdge.max', Math.max(...rwExt.map((e) => e.maxX)), { title: 'Rear wing rearmost point' }))
  const beam = car.parts.filter((p) => p.mount === 'rear-wing' && p.kind === 'wing-element' && p.element.z < 450).length
  r.push(check('rw.beamWing.max', beam, { title: 'Beam-wing-like elements under the rear wing' }))

  // --- floor
  r.push(check('floor.width.max', floor.width))
  r.push(check('floor.edgeHeight.min', floor.edgeHeight))
  r.push(check('floor.plank.thickness', floor.plankThickness))
  r.push(check('floor.diffuser.exitHeight.max', floor.diffuserExitHeight))
  r.push(check('floor.diffuser.angle.max', floor.diffuserAngle))
  const plankWearRisk = chassis.rideHeightFront < 25 || chassis.rideHeightRear < 45
  r.push({
    key: 'floor.plank.wearRisk',
    article: 'C3.5',
    title: 'Plank wear risk at static ride height',
    status: plankWearRisk ? 'warn' : 'pass',
    measured: Math.min(chassis.rideHeightFront, chassis.rideHeightRear),
    limitText: 'front ≥ 25, rear ≥ 45 target',
    unit: 'mm',
    message: plankWearRisk ? 'Static ride height leaves little margin for the 1 mm wear allowance under aero load' : 'Static ride heights leave margin for plank wear',
    provenance: 'target',
  })

  // --- mass
  r.push(check('mass.min', mass.mass))
  r.push(check('mass.frontBalance.min', mass.frontBalance))
  r.push(check('mass.frontBalance.max', mass.frontBalance))

  // --- tyres
  r.push(check('tyres.rim', tyres.rimDiameter))
  r.push(check('tyres.frontWidth', tyres.frontWidth))
  r.push(check('tyres.rearWidth', tyres.rearWidth))
  r.push(check('tyres.diameter.max', tyres.diameter))

  // --- flexibility advisory from skin thickness
  const flapElements = [...frontWing.elements.slice(1), ...rearWing.elements.slice(1)]
  flapElements.forEach((e) => {
    // crude cantilever proxy: deflection ∝ L^3 / t^3 with calibration so that 2.5 mm at 1800 mm span ≈ 2.4 mm
    const L = e.span / 2 - e.spanStart
    const t = Math.max(0.5, e.skinThickness)
    const defl = 2.4 * (L / 900) ** 3 / (t / 2.5) ** 3
    r.push({
      key: `flex.flap.${e.id}`,
      article: 'C3.15',
      title: `${e.name}: trailing-edge deflection estimate (60 N)`,
      status: defl > 3 ? 'fail' : defl > 2.6 ? 'warn' : 'pass',
      measured: Math.round(defl * 100) / 100,
      limitText: '≤ 3',
      unit: 'mm',
      message: defl > 3 ? 'Predicted to fail the 3 mm trailing-edge test; increase skin thickness' : 'Predicted to pass the trailing-edge flexibility test',
      provenance: 'reported',
    })
  })

  // --- custom parts envelope
  car.parts.forEach((p) => {
    const ext = elementExtents(p.element)
    const px = p.mount === 'free' ? p.position.x : 0
    const pz = p.mount === 'free' ? p.position.z : 0
    const maxZ = ext.maxZ + pz
    const maxY = (p.mount === 'free' ? Math.abs(p.position.y) : 0) + ext.maxY
    const outside = maxZ > 950 || maxY > 950 || ext.minX + px < -1225 || ext.maxX + px > chassis.wheelbase + 1050
    r.push({
      key: `part.envelope.${p.id}`,
      article: 'C3.2',
      title: `Part "${p.name}": inside the bodywork envelope`,
      status: outside ? 'fail' : 'pass',
      measured: Math.round(Math.max(maxZ, maxY)),
      limitText: 'z ≤ 950, |y| ≤ 950, -1225 ≤ x ≤ WB+1050',
      unit: 'mm',
      message: outside ? 'Part protrudes outside the permitted bodywork volume' : 'Part is inside the permitted bodywork volume',
      provenance: 'derived',
    })
  })

  return r
}

export function summarize(results: CheckResult[]): { pass: number; warn: number; fail: number; info: number; legal: boolean } {
  const s = { pass: 0, warn: 0, fail: 0, info: 0, legal: true }
  for (const x of results) {
    s[x.status]++
  }
  s.legal = s.fail === 0
  return s
}
