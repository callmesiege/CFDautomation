/**
 * Digest of the FIA 2026 Formula One Technical Regulations (Section C).
 *
 * IMPORTANT — provenance. This file is a structured engineering digest, not the regulation text.
 * Every numeric limit carries a `status`:
 *   'official'  — figure stated by the FIA in its published 2026 regulation announcements
 *   'reported'  — figure reported by teams / specialist press; verify against the current FIA issue
 *   'derived'   — figure derived from the 2022-25 rules plus the announced 2026 deltas; verify
 *   'target'    — not a regulation; an engineering target used by the compliance advisor
 * The FIA re-issues Section C several times a season (issue 17 was published 2026-04-28);
 * when you have the PDF, update the values below and bump `REGS_ISSUE`.
 */

export const REGS_ISSUE = '2026 Section C — digest aligned to FIA announcements through issue 17 (2026-04-28)'

export type LimitStatus = 'official' | 'reported' | 'derived' | 'target'

export interface RegLimit {
  key: string
  label: string
  /** inclusive minimum, if any */
  min?: number
  /** inclusive maximum, if any */
  max?: number
  /** exact value, if the rule prescribes one */
  exact?: number
  unit: string
  status: LimitStatus
  note?: string
}

export interface RegArticle {
  id: string
  title: string
  chapter: string
  summary: string
  /** plain-language design implications */
  designNotes: string[]
  limits: RegLimit[]
  tags: string[]
}

export const CHAPTERS: { id: string; title: string }[] = [
  { id: 'C1', title: 'General principles' },
  { id: 'C2', title: 'Definitions' },
  { id: 'C3', title: 'Bodywork and aerodynamics' },
  { id: 'C4', title: 'Mass' },
  { id: 'C5', title: 'Power unit' },
  { id: 'C6', title: 'Fuel and energy' },
  { id: 'C9', title: 'Transmission' },
  { id: 'C10', title: 'Suspension and steering' },
  { id: 'C11', title: 'Brakes' },
  { id: 'C12', title: 'Wheels and tyres' },
  { id: 'C13', title: 'Survival cell and safety structures' },
  { id: 'C15', title: 'Aerodynamic testing and flexibility' },
]

export const ARTICLES: RegArticle[] = [
  {
    id: 'C1.1',
    chapter: 'C1',
    title: 'Scope and intent of the 2026 formula',
    summary:
      'The 2026 regulations reset the chassis, aerodynamic and power-unit rules together. Cars are smaller and lighter, underfloor downforce is reduced to curb ground-effect porpoising and following-car wake sensitivity, and DRS is replaced by active front and rear wings (X-mode / Z-mode) paired with a Manual Override energy-deployment mode.',
    designNotes: [
      'Target roughly 30 % less drag and 15 % less downforce than a 2025 car at the same speed.',
      'The design brief rewards low-drag X-mode efficiency and energy management, not peak downforce alone.',
    ],
    limits: [],
    tags: ['overview', 'aero', 'power unit'],
  },
  {
    id: 'C2.1',
    chapter: 'C2',
    title: 'Reference axes and planes',
    summary:
      'Dimensions are measured in a car-fixed system: X runs rearward from the front-axle centre line (XF), Y is lateral from the car centre plane, Z is vertical from the reference plane (the lowest surface of the plank).',
    designNotes: ['This app uses the same convention: x rearward (mm), y lateral, z up from the reference plane.'],
    limits: [],
    tags: ['definitions'],
  },
  {
    id: 'C2.2',
    chapter: 'C2',
    title: 'Active aerodynamics: X-mode and Z-mode',
    summary:
      'Z-mode is the high-downforce configuration (both wings fully deployed). X-mode is the low-drag configuration available in designated zones, in which the adjustable front and rear wing elements rotate to a flatter angle under ECU control. Transition timing, hysteresis and fail-safe return to Z-mode are prescribed by the FIA standard ECU.',
    designNotes: [
      'Only the designated flap elements may move; main planes and endplates are fixed bodywork.',
      'The car must remain aerodynamically balanced in both modes: front and rear move together.',
    ],
    limits: [
      { key: 'fw.activeElements.max', label: 'Front wing adjustable elements', max: 2, unit: 'elements', status: 'official' },
      { key: 'rw.activeElements.max', label: 'Rear wing adjustable elements', max: 2, unit: 'elements', status: 'reported', note: 'Three-element rear wing with the upper elements active; some reports describe the whole rear wing assembly moving.' },
    ],
    tags: ['active aero', 'X-mode', 'Z-mode'],
  },
  {
    id: 'C3.2',
    chapter: 'C3',
    title: 'Overall dimensions',
    summary:
      'Maximum width of the bodywork is reduced to 1900 mm and the maximum wheelbase to 3400 mm. Bodywork height is limited to 950 mm above the reference plane. Front and rear overhang limits bound the front wing and rear wing positions.',
    designNotes: [
      'A 3400 mm wheelbase forces the floor, sidepod and cooling package to be shorter than 2022-25 cars.',
      'Narrower track plus narrower tyres shifts wheel-wake management inboard.',
    ],
    limits: [
      { key: 'chassis.width.max', label: 'Overall width', max: 1900, unit: 'mm', status: 'official' },
      { key: 'chassis.wheelbase.max', label: 'Wheelbase', max: 3400, unit: 'mm', status: 'official' },
      { key: 'chassis.height.max', label: 'Bodywork height above reference plane', max: 950, unit: 'mm', status: 'derived', note: 'Carried over from the 2022-25 regulations.' },
      { key: 'chassis.frontOverhang.max', label: 'Front overhang (ahead of front axle)', max: 1225, unit: 'mm', status: 'derived', note: 'Based on the 2022-25 front bodywork limit; the 2026 nose box is reported shorter.' },
      { key: 'chassis.rearOverhang.max', label: 'Rear overhang (behind rear axle)', max: 1050, unit: 'mm', status: 'derived' },
    ],
    tags: ['dimensions', 'chassis'],
  },
  {
    id: 'C3.5',
    chapter: 'C3',
    title: 'Floor body and underfloor',
    summary:
      'The floor is partially flat: the central section is flat between the tyres with reduced-depth venturi tunnels either side, cutting underfloor downforce relative to 2022-25. Floor width is reduced and the floor edge must sit above a minimum height. The plank remains, with a prescribed thickness and wear allowance.',
    designNotes: [
      'Peak underfloor load is capped by the shallower tunnels; expect roughly 50 % of the floor share seen in 2022-25.',
      'Lower ride heights still gain, but the stall ride height is higher with the flatter centre section.',
    ],
    limits: [
      { key: 'floor.width.max', label: 'Floor width', max: 1500, unit: 'mm', status: 'reported', note: 'Teams report a 100-150 mm narrower floor than 2025.' },
      { key: 'floor.edgeHeight.min', label: 'Floor edge minimum height', min: 35, unit: 'mm', status: 'derived' },
      { key: 'floor.plank.thickness', label: 'Plank thickness (new)', exact: 10, unit: 'mm', status: 'official', note: '±0.2 mm manufacturing tolerance.' },
      { key: 'floor.plank.wear.max', label: 'Plank wear', max: 1, unit: 'mm', status: 'official', note: 'Minimum 9 mm remaining at the measurement holes after the race.' },
      { key: 'floor.diffuser.exitHeight.max', label: 'Diffuser exit height', max: 330, unit: 'mm', status: 'reported' },
      { key: 'floor.diffuser.angle.max', label: 'Diffuser ramp angle (advisory)', max: 14, unit: 'deg', status: 'target', note: 'Not a regulation. Above ~14° the ramp separates at race ride heights.' },
    ],
    tags: ['floor', 'plank', 'diffuser'],
  },
  {
    id: 'C3.9',
    chapter: 'C3',
    title: 'Front wing',
    summary:
      'The front wing is 100 mm narrower than the 2025 wing and consists of a main plane plus up to two flaps. The two flaps form the active element that flattens in X-mode. Endplates are simplified and must stay within the reference volume. Minimum element thickness, trailing-edge radius and slot-gap rules protect against flexing and wake-shedding tricks.',
    designNotes: [
      'Three elements maximum (main plane + two flaps).',
      'The flap pair rotates about a common hinge line in X-mode; the hinge must remain inside the wing reference volume.',
      'Wheel-wake control is now done with the nose and bodywork, not with outwash cascades.',
    ],
    limits: [
      { key: 'fw.span.max', label: 'Front wing span (tip to tip)', max: 1900, unit: 'mm', status: 'derived', note: '100 mm narrower than 2025. One secondary source quotes 1600 mm; verify against the issue in force.' },
      { key: 'fw.elements.max', label: 'Front wing elements', max: 3, unit: 'elements', status: 'official' },
      { key: 'fw.height.max', label: 'Front wing maximum height', max: 320, unit: 'mm', status: 'derived' },
      { key: 'fw.height.min', label: 'Front wing lowest point', min: 55, unit: 'mm', status: 'derived', note: 'Protects the plank/ground clearance envelope.' },
      { key: 'fw.leadingEdge.min', label: 'Forward-most point of the front wing', min: -1225, unit: 'mm (x)', status: 'derived' },
      { key: 'fw.elementThickness.min', label: 'Minimum element thickness', min: 6, unit: 'mm', status: 'derived' },
      { key: 'fw.chordTotal.max', label: 'Total section chord (advisory)', max: 700, unit: 'mm', status: 'target' },
    ],
    tags: ['front wing', 'active aero'],
  },
  {
    id: 'C3.10',
    chapter: 'C3',
    title: 'Rear wing',
    summary:
      'The rear wing is a three-element assembly on twin pylons; the beam wing of 2022-25 is removed. The upper elements rotate to a low-drag position in X-mode. Rear wing height, span and chord are limited by the reference volume.',
    designNotes: [
      'No beam wing means the diffuser must be driven by the main plane alone; expect the main-plane angle to carry more load.',
      'X-mode drag reduction comes from the flap rotation; the main plane remains fixed.',
    ],
    limits: [
      { key: 'rw.span.max', label: 'Rear wing span', max: 1000, unit: 'mm', status: 'reported' },
      { key: 'rw.elements.max', label: 'Rear wing elements', max: 3, unit: 'elements', status: 'official' },
      { key: 'rw.height.max', label: 'Rear wing top height', max: 950, unit: 'mm', status: 'reported' },
      { key: 'rw.beamWing.max', label: 'Beam wing elements', max: 0, unit: 'elements', status: 'official' },
      { key: 'rw.trailingEdge.max', label: 'Rearmost point of the rear wing', max: 4450, unit: 'mm (x)', status: 'derived', note: 'Wheelbase + rear overhang limit.' },
    ],
    tags: ['rear wing', 'active aero'],
  },
  {
    id: 'C3.12',
    chapter: 'C3',
    title: 'Bodywork around the wheels',
    summary:
      'Front wheel bodywork (wheel arches) and wheel-wake control boards are permitted within defined volumes to manage front-tyre wake, replacing the outwash front wing philosophy.',
    designNotes: ['Parts mounted in the wheel region must be rigidly attached to the unsprung mass or to the chassis, not to the suspension.'],
    limits: [],
    tags: ['wheels', 'bodywork'],
  },
  {
    id: 'C3.15',
    chapter: 'C3',
    title: 'Aerodynamic component flexibility',
    summary:
      'Front and rear wing elements must pass static load-deflection tests. The 2025 tightening (front wing 10 mm under a 1000 N symmetric load; flap trailing edge 3 mm under 60 N) is carried into 2026, with additional tests on the active elements in both modes.',
    designNotes: [
      'Flap skin thickness below ~2 mm of carbon laminate is unlikely to meet the 3 mm trailing-edge test.',
      'Active elements are tested in both X-mode and Z-mode positions.',
    ],
    limits: [
      { key: 'flex.fw.load', label: 'Front wing symmetric test load', exact: 1000, unit: 'N', status: 'reported' },
      { key: 'flex.fw.deflection.max', label: 'Front wing vertical deflection', max: 10, unit: 'mm', status: 'reported' },
      { key: 'flex.flap.load', label: 'Flap trailing-edge test load', exact: 60, unit: 'N', status: 'reported' },
      { key: 'flex.flap.deflection.max', label: 'Flap trailing-edge deflection', max: 3, unit: 'mm', status: 'reported' },
      { key: 'flex.rw.deflection.max', label: 'Rear wing main plane deflection (500 N)', max: 6, unit: 'mm', status: 'reported' },
    ],
    tags: ['flexibility', 'testing'],
  },
  {
    id: 'C4.1',
    chapter: 'C4',
    title: 'Minimum mass',
    summary:
      'The minimum mass of the car with the driver, without fuel, is 768 kg (a 30 kg reduction from 2025). The figure is built from a 722 kg car-plus-driver component and a 46 kg tyre allowance.',
    designNotes: ['Most teams struggle to reach the limit; carry ballast only after the structural parts are at target.'],
    limits: [
      { key: 'mass.min', label: 'Minimum mass with driver, no fuel', min: 768, unit: 'kg', status: 'official' },
      { key: 'mass.driver.min', label: 'Driver + seat minimum', min: 82, unit: 'kg', status: 'derived' },
    ],
    tags: ['mass'],
  },
  {
    id: 'C4.2',
    chapter: 'C4',
    title: 'Mass distribution',
    summary:
      'The static mass on the front and rear axles must fall inside a prescribed window, specified with the tyre supplier, to keep tyre loading in a predictable range.',
    designNotes: ['Treat ~45-47 % front as the working window until the 2026 Pirelli construction is finalised.'],
    limits: [
      { key: 'mass.frontBalance.min', label: 'Front axle share', min: 44.5, unit: '%', status: 'reported' },
      { key: 'mass.frontBalance.max', label: 'Front axle share', max: 47.5, unit: '%', status: 'reported' },
    ],
    tags: ['mass', 'balance'],
  },
  {
    id: 'C5.1',
    chapter: 'C5',
    title: 'Power unit layout and power',
    summary:
      'The 1.6-litre V6 turbo remains, the MGU-H is removed, and the MGU-K is raised to 350 kW so that electrical and combustion power are roughly equal. Combustion power is limited through a fuel energy-flow cap rather than a mass-flow cap.',
    designNotes: [
      'A 50/50 power split makes energy recovery under braking the dominant lap-time lever; cooling for the battery and MGU-K grows.',
      'Combustion output is around 400 kW; peak combined output is a little over 740 kW before deployment tapering.',
    ],
    limits: [
      { key: 'pu.mguk.max', label: 'MGU-K maximum power', max: 350, unit: 'kW', status: 'official' },
      { key: 'pu.ice.max', label: 'ICE power (approximate)', max: 400, unit: 'kW', status: 'reported' },
      { key: 'pu.recovery.max', label: 'MGU-K recovery per lap', max: 8.5, unit: 'MJ', status: 'official' },
      { key: 'pu.rpm.max', label: 'Engine speed', max: 15000, unit: 'rpm', status: 'official' },
    ],
    tags: ['power unit'],
  },
  {
    id: 'C6.1',
    chapter: 'C6',
    title: 'Fuel and energy flow',
    summary:
      'Cars run on 100 % advanced sustainable fuel. The combustion power limit is set by a maximum fuel energy-flow rate of 3000 MJ/h, with a reduced race fuel allocation of roughly 70 kg.',
    designNotes: ['Fuel mass drop lets the tank shrink, helping the 3400 mm wheelbase.'],
    limits: [
      { key: 'fuel.energyFlow.max', label: 'Fuel energy flow', max: 3000, unit: 'MJ/h', status: 'official' },
      { key: 'fuel.raceMass.max', label: 'Race fuel mass (approximate)', max: 70, unit: 'kg', status: 'reported' },
    ],
    tags: ['fuel'],
  },
  {
    id: 'C10.1',
    chapter: 'C10',
    title: 'Suspension',
    summary:
      'Suspension must be passive; no active ride-height control is permitted. Inerters remain banned. Hydraulic and interconnected systems are restricted to the 2022 ruleset.',
    designNotes: ['Ride-height control under aerodynamic load must come from spring/damper design; the aero map must tolerate heave.'],
    limits: [],
    tags: ['suspension'],
  },
  {
    id: 'C12.1',
    chapter: 'C12',
    title: 'Wheels and tyres',
    summary:
      '18-inch wheels continue. Tyres narrow: the front tread is reduced by 25 mm and the rear by 30 mm relative to 2025, giving nominal widths of 280 mm front and 375 mm rear. Tyre blankets remain permitted for 2026.',
    designNotes: ['Narrower tyres cut the frontal area and the tyre-wake share of total drag, but reduce mechanical grip.'],
    limits: [
      { key: 'tyres.rim', label: 'Rim diameter', exact: 18, unit: 'in', status: 'official' },
      { key: 'tyres.frontWidth', label: 'Front tyre width', exact: 280, unit: 'mm', status: 'official' },
      { key: 'tyres.rearWidth', label: 'Rear tyre width', exact: 375, unit: 'mm', status: 'official' },
      { key: 'tyres.diameter.max', label: 'Tyre outer diameter', max: 720, unit: 'mm', status: 'derived' },
    ],
    tags: ['tyres', 'wheels'],
  },
  {
    id: 'C13.1',
    chapter: 'C13',
    title: 'Survival cell and safety structures',
    summary:
      'Front impact structures are lengthened and a two-stage nose is required to survive a secondary impact. Side intrusion panels gain area, roll-hoop load requirements increase, and the halo is unchanged.',
    designNotes: ['The nose box is heavier than 2025; it competes with the ballast budget.'],
    limits: [{ key: 'safety.rollHoop.load', label: 'Roll hoop static load', min: 167, unit: 'kN', status: 'reported' }],
    tags: ['safety'],
  },
  {
    id: 'C15.1',
    chapter: 'C15',
    title: 'Aerodynamic testing restrictions (ATR)',
    summary:
      'Wind-tunnel and CFD usage is allocated on a sliding scale by championship position. Wind tunnel runs are limited per period and CFD is capped in mega-allocation-unit hours. Full-scale testing on track is restricted to filming and demonstration days.',
    designNotes: ['A quick parametric solver like this app does not count against ATR, but any CFD above the FIA-defined cost threshold does.'],
    limits: [{ key: 'atr.windTunnelRuns.baseline', label: 'Wind tunnel runs per period (100 % allocation)', max: 320, unit: 'runs', status: 'derived' }],
    tags: ['testing'],
  },
]

export function findArticle(id: string): RegArticle | undefined {
  return ARTICLES.find((a) => a.id === id)
}

export function findLimit(key: string): { article: RegArticle; limit: RegLimit } | undefined {
  for (const article of ARTICLES) {
    const limit = article.limits.find((l) => l.key === key)
    if (limit) return { article, limit }
  }
  return undefined
}

export const STATUS_LABEL: Record<LimitStatus, string> = {
  official: 'FIA-stated',
  reported: 'Reported — verify',
  derived: 'Derived from 2025 — verify',
  target: 'Engineering target',
}
