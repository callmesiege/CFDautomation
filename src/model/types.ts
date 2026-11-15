/**
 * Core data model for a parametric 2026-style Formula 1 car.
 *
 * Coordinate system (FIA convention):
 *   x  — longitudinal, positive REARWARD, origin at the front axle centre line (XF)
 *   y  — lateral, positive to the car's left? (we treat it as symmetric; sign only matters for asymmetric parts)
 *   z  — vertical, positive UP, origin at the reference plane (underside of the plank)
 * All lengths are millimetres, angles are degrees.
 */

export interface NacaProfile {
  kind: 'naca4'
  /** max camber as % of chord (0-9) */
  m: number
  /** position of max camber in tenths of chord (0-9) */
  p: number
  /** max thickness as % of chord (1-40) */
  t: number
}

export interface CustomProfile {
  kind: 'custom'
  /** closed loop, normalised chord coordinates, starting at trailing edge going over the upper surface */
  points: [number, number][]
}

export type Profile = NacaProfile | CustomProfile

export interface WingElement {
  id: string
  name: string
  profile: Profile
  /** root chord (mm) */
  chord: number
  /** tip chord (mm) */
  tipChord: number
  /** full span (mm), symmetric about y = 0 */
  span: number
  /** inboard start of the element (mm from centreline). 0 = full width */
  spanStart: number
  /** leading-edge x at the root (mm, rearward positive from front axle) */
  x: number
  /** leading-edge z at the root (mm above reference plane) */
  z: number
  /** incidence, positive = trailing edge UP = more downforce for an inverted wing (deg) */
  angle: number
  /** dihedral of the element along span (deg), positive = tips higher */
  dihedral: number
  /** sweep of the leading edge (deg), positive = tips rearward */
  sweep: number
  /** FIA 2026 active-aero: element may rotate into X-mode */
  active: boolean
  /** incidence in X-mode (deg) if active */
  xModeAngle: number
  /** material thickness proxy used for the flexibility advisory (mm) */
  skinThickness: number
}

export interface Endplate {
  height: number
  length: number
  thickness: number
  /** outward cant of the endplate (deg) */
  cant: number
}

export interface FrontWing {
  elements: WingElement[]
  endplate: Endplate
}

export interface RearWing {
  elements: WingElement[]
  endplate: Endplate
  pylonSpacing: number
}

export interface FloorSpec {
  /** overall floor length (mm), begins behind the front wheels */
  startX: number
  length: number
  width: number
  /** height of the floor edge above the reference plane (mm) */
  edgeHeight: number
  /** tunnel/venturi inlet height (mm) */
  tunnelInletHeight: number
  /** diffuser ramp angle (deg) */
  diffuserAngle: number
  /** diffuser length (mm) */
  diffuserLength: number
  /** diffuser exit height above reference plane (mm) */
  diffuserExitHeight: number
  plankThickness: number
}

export interface Sidepod {
  startX: number
  length: number
  width: number
  height: number
  /** undercut depth (mm) */
  undercut: number
  /** inlet area (mm²) */
  inletArea: number
}

export interface Chassis {
  wheelbase: number
  frontTrack: number
  rearTrack: number
  /** overall bodywork width (mm) */
  width: number
  /** nose tip x (mm, negative = ahead of the front axle) */
  noseTipX: number
  noseTipZ: number
  /** engine cover top height (mm above reference plane) */
  engineCoverHeight: number
  /** ride heights at static (mm) */
  rideHeightFront: number
  rideHeightRear: number
}

export interface Tyres {
  rimDiameter: number // inches
  diameter: number // mm
  frontWidth: number
  rearWidth: number
}

export interface MassSpec {
  /** car + driver, no fuel (kg) */
  mass: number
  /** front axle share (%) */
  frontBalance: number
  /** centre of gravity height (mm) */
  cgHeight: number
}

export type PartKind = 'wing-element' | 'endplate' | 'winglet' | 'fence' | 'strake'

export interface CustomPart {
  id: string
  name: string
  kind: PartKind
  /** Element definition — reused for winglets/fences/strakes as a flat plate */
  element: WingElement
  /** where the part lives on the car */
  mount: 'front-wing' | 'rear-wing' | 'floor' | 'free'
  /** free-mounted parts carry their own location (mm) and yaw (deg) */
  position: { x: number; y: number; z: number; yaw: number; roll: number }
  createdAt: number
  notes: string
}

export interface CarDesign {
  name: string
  version: number
  chassis: Chassis
  frontWing: FrontWing
  rearWing: RearWing
  floor: FloorSpec
  sidepod: Sidepod
  tyres: Tyres
  mass: MassSpec
  /** attached custom parts */
  parts: CustomPart[]
  /** active-aero mode */
  aeroMode: 'Z' | 'X'
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

export function makeElement(partial: Partial<WingElement> & { name: string }): WingElement {
  return {
    id: uid('el'),
    profile: { kind: 'naca4', m: 6, p: 4, t: 12 },
    chord: 300,
    tipChord: 250,
    span: 1800,
    spanStart: 0,
    x: -900,
    z: 80,
    angle: 6,
    dihedral: 0,
    sweep: 0,
    active: false,
    xModeAngle: 0,
    skinThickness: 2.5,
    ...partial,
  }
}

export function defaultCar(): CarDesign {
  return {
    name: 'AS26-01',
    version: 1,
    aeroMode: 'Z',
    chassis: {
      wheelbase: 3400,
      frontTrack: 1520,
      rearTrack: 1480,
      width: 1900,
      noseTipX: -1150,
      noseTipZ: 190,
      engineCoverHeight: 920,
      rideHeightFront: 30,
      rideHeightRear: 60,
    },
    frontWing: {
      elements: [
        makeElement({
          name: 'Main plane',
          profile: { kind: 'naca4', m: 5, p: 4, t: 11 },
          chord: 340,
          tipChord: 300,
          span: 1860,
          spanStart: 160,
          x: -1120,
          z: 105,
          angle: 4,
          dihedral: 2,
          sweep: 4,
          active: false,
        }),
        makeElement({
          name: 'Flap 1',
          profile: { kind: 'naca4', m: 7, p: 4, t: 10 },
          chord: 200,
          tipChord: 170,
          span: 1840,
          spanStart: 330,
          x: -840,
          z: 160,
          angle: 14,
          dihedral: 2,
          sweep: 6,
          active: true,
          xModeAngle: 2,
        }),
        makeElement({
          name: 'Flap 2',
          profile: { kind: 'naca4', m: 8, p: 4, t: 9 },
          chord: 150,
          tipChord: 120,
          span: 1820,
          spanStart: 420,
          x: -680,
          z: 245,
          angle: 26,
          dihedral: 2,
          sweep: 8,
          active: true,
          xModeAngle: 4,
        }),
      ],
      endplate: { height: 240, length: 700, thickness: 12, cant: 6 },
    },
    rearWing: {
      elements: [
        makeElement({
          name: 'Main plane',
          profile: { kind: 'naca4', m: 6, p: 4, t: 12 },
          chord: 420,
          tipChord: 400,
          span: 960,
          spanStart: 0,
          x: 3780,
          z: 690,
          angle: 8,
          dihedral: 0,
          sweep: 0,
          active: false,
        }),
        makeElement({
          name: 'Flap 1',
          profile: { kind: 'naca4', m: 7, p: 4, t: 10 },
          chord: 240,
          tipChord: 230,
          span: 960,
          spanStart: 0,
          x: 4130,
          z: 760,
          angle: 20,
          dihedral: 0,
          sweep: 0,
          active: true,
          xModeAngle: 3,
        }),
        makeElement({
          name: 'Flap 2',
          profile: { kind: 'naca4', m: 8, p: 4, t: 9 },
          chord: 150,
          tipChord: 150,
          span: 960,
          spanStart: 0,
          x: 4310,
          z: 850,
          angle: 30,
          dihedral: 0,
          sweep: 0,
          active: true,
          xModeAngle: 5,
        }),
      ],
      endplate: { height: 520, length: 720, thickness: 14, cant: 0 },
      pylonSpacing: 300,
    },
    floor: {
      startX: 450,
      length: 3300,
      width: 1500,
      edgeHeight: 55,
      tunnelInletHeight: 120,
      diffuserAngle: 11,
      diffuserLength: 1050,
      diffuserExitHeight: 330,
      plankThickness: 10,
    },
    sidepod: {
      startX: 1150,
      length: 1900,
      width: 520,
      height: 520,
      undercut: 140,
      inletArea: 48000,
    },
    tyres: { rimDiameter: 18, diameter: 720, frontWidth: 280, rearWidth: 375 },
    mass: { mass: 768, frontBalance: 45.8, cgHeight: 310 },
    parts: [],
  }
}

// ---------------------------------------------------------------------------
// Component library
// ---------------------------------------------------------------------------

export type ComponentKind = 'frontWing' | 'rearWing' | 'floor' | 'sidepod' | 'setup'

export interface SetupData {
  rideHeightFront: number
  rideHeightRear: number
  frontBalance: number
}

export type ComponentData = FrontWing | RearWing | FloorSpec | Sidepod | SetupData

export interface SavedComponent {
  id: string
  kind: ComponentKind
  name: string
  notes: string
  tags: string[]
  createdAt: number
  data: ComponentData
}

export const COMPONENT_KIND_LABEL: Record<ComponentKind, string> = {
  frontWing: 'Front wing',
  rearWing: 'Rear wing',
  floor: 'Floor & diffuser',
  sidepod: 'Sidepods & cooling',
  setup: 'Ride height & balance',
}

export function extractComponent(car: CarDesign, kind: ComponentKind): ComponentData {
  switch (kind) {
    case 'frontWing':
      return JSON.parse(JSON.stringify(car.frontWing))
    case 'rearWing':
      return JSON.parse(JSON.stringify(car.rearWing))
    case 'floor':
      return { ...car.floor }
    case 'sidepod':
      return { ...car.sidepod }
    case 'setup':
      return { rideHeightFront: car.chassis.rideHeightFront, rideHeightRear: car.chassis.rideHeightRear, frontBalance: car.mass.frontBalance }
  }
}

export function applyComponentData(car: CarDesign, kind: ComponentKind, data: ComponentData): CarDesign {
  switch (kind) {
    case 'frontWing':
      return { ...car, frontWing: JSON.parse(JSON.stringify(data)) as FrontWing }
    case 'rearWing':
      return { ...car, rearWing: JSON.parse(JSON.stringify(data)) as RearWing }
    case 'floor':
      return { ...car, floor: { ...(data as FloorSpec) } }
    case 'sidepod':
      return { ...car, sidepod: { ...(data as Sidepod) } }
    case 'setup': {
      const s = data as SetupData
      return { ...car, chassis: { ...car.chassis, rideHeightFront: s.rideHeightFront, rideHeightRear: s.rideHeightRear }, mass: { ...car.mass, frontBalance: s.frontBalance } }
    }
  }
}

/** One-line description of a component for lists. */
export function describeComponent(c: SavedComponent): string {
  switch (c.kind) {
    case 'frontWing':
    case 'rearWing': {
      const w = c.data as FrontWing
      return `${w.elements.length} elements · angles ${w.elements.map((e) => e.angle.toFixed(0)).join('/')}° · chords ${w.elements.map((e) => e.chord).join('/')} mm`
    }
    case 'floor': {
      const f = c.data as FloorSpec
      return `${f.width} mm wide · diffuser ${f.diffuserAngle}° to ${f.diffuserExitHeight} mm · edge ${f.edgeHeight} mm`
    }
    case 'sidepod': {
      const s = c.data as Sidepod
      return `inlet ${(s.inletArea / 1000).toFixed(0)}k mm² · ${s.length} × ${s.width} × ${s.height} mm · undercut ${s.undercut} mm`
    }
    case 'setup': {
      const s = c.data as SetupData
      return `ride height ${s.rideHeightFront}/${s.rideHeightRear} mm · ${s.frontBalance.toFixed(1)} % front`
    }
  }
}

/** A starter set of components derived from the baseline car so the advisor has alternatives to compare. */
export function starterComponents(): SavedComponent[] {
  const base = defaultCar()
  const t = Date.now()
  const mk = (kind: ComponentKind, name: string, notes: string, tags: string[], data: ComponentData, i: number): SavedComponent => ({ id: `starter-${kind}-${i}`, kind, name, notes, tags, createdAt: t - i, data })
  const fw = (angles: [number, number, number], xAngles: [number, number], chordScale: number, zShift = 0): FrontWing => ({
    ...JSON.parse(JSON.stringify(base.frontWing)),
    elements: base.frontWing.elements.map((e, i) => ({
      ...e,
      id: `${e.id}-${angles.join('')}`,
      angle: angles[i],
      xModeAngle: i === 0 ? e.xModeAngle : xAngles[i - 1],
      chord: Math.round(e.chord * (i === 0 ? 1 : chordScale)),
      tipChord: Math.round(e.tipChord * (i === 0 ? 1 : chordScale)),
      z: e.z + (i === 0 ? 0 : zShift * i),
    })),
  })
  const rw = (angles: [number, number, number], xAngles: [number, number], chordScale: number, zShift: number): RearWing => ({
    ...JSON.parse(JSON.stringify(base.rearWing)),
    elements: base.rearWing.elements.map((e, i) => ({
      ...e,
      id: `${e.id}-${angles.join('')}`,
      angle: angles[i],
      xModeAngle: i === 0 ? e.xModeAngle : xAngles[i - 1],
      chord: Math.round(e.chord * chordScale),
      tipChord: Math.round(e.tipChord * chordScale),
      z: e.z + zShift * i,
    })),
  })
  return [
    mk('frontWing', 'FW-A low drag', 'Flat flaps for Monza-type circuits.', ['low drag'], fw([3, 8, 16], [0, 2], 0.9), 1),
    mk('frontWing', 'FW-B balanced', 'Baseline front wing.', ['medium'], fw([4, 14, 26], [2, 4], 1), 2),
    mk('frontWing', 'FW-C high load', 'Steep flaps and longer chords for street circuits.', ['high downforce'], fw([5, 18, 30], [3, 6], 1.1, -12), 3),
    mk('rearWing', 'RW-A Monza', 'Skinny rear wing: small chords, shallow angles.', ['low drag'], rw([5, 10, 15], [1, 2], 0.82, -10), 1),
    mk('rearWing', 'RW-B medium', 'Baseline rear wing.', ['medium'], rw([8, 20, 30], [3, 5], 1, 0), 2),
    mk('rearWing', 'RW-C max load', 'Big-chord, high-angle wing for Monaco, Singapore, Hungary.', ['high downforce'], rw([11, 23, 32], [4, 7], 1.1, -6), 3),
    mk('floor', 'Floor std', 'Baseline floor.', ['medium'], { ...base.floor }, 1),
    mk('floor', 'Floor aggressive diffuser', 'Steeper, longer diffuser; more load, drag and ride-height sensitivity.', ['high downforce'], { ...base.floor, diffuserAngle: 13, diffuserLength: 1150, diffuserExitHeight: 330 }, 2),
    mk('floor', 'Floor low drag', 'Shallow diffuser and reduced tunnel inlet for low-drag circuits.', ['low drag'], { ...base.floor, diffuserAngle: 8, diffuserLength: 900, tunnelInletHeight: 100 }, 3),
    mk('sidepod', 'Cooling compact', 'Smallest inlets: cool climates and low-drag tracks.', ['low drag', 'cool'], { ...base.sidepod, inletArea: 40000, width: 500 }, 1),
    mk('sidepod', 'Cooling standard', 'Baseline sidepods.', ['medium'], { ...base.sidepod }, 2),
    mk('sidepod', 'Cooling hot climate', 'Enlarged inlets for Singapore, Bahrain, Mexico altitude.', ['hot', 'altitude'], { ...base.sidepod, inletArea: 64000, width: 560 }, 3),
    mk('setup', 'Setup low', 'Lowest safe ride heights for smooth circuits.', ['smooth'], { rideHeightFront: 24, rideHeightRear: 48, frontBalance: 45.8 }, 1),
    mk('setup', 'Setup standard', 'Baseline ride heights.', ['medium'], { rideHeightFront: 30, rideHeightRear: 60, frontBalance: 45.8 }, 2),
    mk('setup', 'Setup raised (bumpy)', 'Raised for street circuits and kerbs.', ['bumpy', 'street'], { rideHeightFront: 38, rideHeightRear: 72, frontBalance: 46.2 }, 3),
  ]
}
