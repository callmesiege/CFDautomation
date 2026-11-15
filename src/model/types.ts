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
