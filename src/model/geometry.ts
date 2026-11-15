/**
 * Three.js geometry builders for the parametric car.
 * Car coords (x rearward, y lateral, z up, mm) → scene coords (metres): sx = -x, sy = z, sz = y
 * so the car faces +X in the scene and the viewer's "up" is Z-up in car terms.
 */
import * as THREE from 'three'
import type { CarDesign, Endplate, WingElement } from './types'
import { elementSection2D } from './airfoil'

export const MM = 0.001

export function toScene(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(-x * MM, z * MM, y * MM)
}

/** Loft a wing element along its span (both halves). */
export function wingElementGeometry(el: WingElement, mirrored = true, stations = 14): THREE.BufferGeometry {
  const half = el.span / 2
  const inner = el.spanStart
  const positions: number[] = []
  const indices: number[] = []
  const buildHalf = (sign: 1 | -1) => {
    const base = positions.length / 3
    const sections: [number, number][][] = []
    for (let s = 0; s <= stations; s++) {
      const y = inner + ((half - inner) * s) / stations
      sections.push(elementSection2D(el, y).pts)
    }
    const m = sections[0].length
    sections.forEach((sec, s) => {
      const y = (inner + ((half - inner) * s) / stations) * sign
      for (const [x, z] of sec) {
        const v = toScene(x, y, z)
        positions.push(v.x, v.y, v.z)
      }
    })
    for (let s = 0; s < stations; s++) {
      for (let k = 0; k < m; k++) {
        const k1 = (k + 1) % m
        const a = base + s * m + k
        const b = base + s * m + k1
        const c = base + (s + 1) * m + k
        const d = base + (s + 1) * m + k1
        indices.push(a, c, b, b, c, d)
      }
    }
    // caps
    const capIndices = (offset: number) => {
      const centre = positions.length / 3
      let cx = 0
      let cy = 0
      let cz = 0
      for (let k = 0; k < m; k++) {
        cx += positions[(offset + k) * 3]
        cy += positions[(offset + k) * 3 + 1]
        cz += positions[(offset + k) * 3 + 2]
      }
      positions.push(cx / m, cy / m, cz / m)
      for (let k = 0; k < m; k++) indices.push(centre, offset + k, offset + ((k + 1) % m))
    }
    capIndices(base)
    capIndices(base + stations * m)
  }
  buildHalf(1)
  if (mirrored && inner >= 0) buildHalf(-1)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

export function endplateGeometry(ep: Endplate, xStart: number, zBottom: number, y: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(ep.length * MM, ep.height * MM, ep.thickness * MM)
  const m = new THREE.Matrix4()
  const centre = toScene(xStart + ep.length / 2, y, zBottom + ep.height / 2)
  m.makeRotationX((Math.sign(y) * ep.cant * Math.PI) / 180)
  m.setPosition(centre)
  g.applyMatrix4(m)
  return g
}

/** Loft a closed superellipse tube along x from a list of sections. */
function loftSections(sections: { x: number; y: number; z: number; w: number; h: number; n?: number }[], segments = 24): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  sections.forEach((s) => {
    const n = s.n ?? 2.6
    for (let k = 0; k < segments; k++) {
      const t = (k / segments) * Math.PI * 2
      const c = Math.cos(t)
      const si = Math.sin(t)
      const yy = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * s.w
      const zz = Math.sign(si) * Math.pow(Math.abs(si), 2 / n) * s.h
      const v = toScene(s.x, s.y + yy, s.z + zz)
      positions.push(v.x, v.y, v.z)
    }
  })
  for (let s = 0; s < sections.length - 1; s++) {
    for (let k = 0; k < segments; k++) {
      const k1 = (k + 1) % segments
      const a = s * segments + k
      const b = s * segments + k1
      const c = (s + 1) * segments + k
      const d = (s + 1) * segments + k1
      indices.push(a, b, c, b, d, c)
    }
  }
  // end caps
  const cap = (offset: number, flip: boolean) => {
    const centre = positions.length / 3
    let cx = 0
    let cy = 0
    let cz = 0
    for (let k = 0; k < segments; k++) {
      cx += positions[(offset + k) * 3]
      cy += positions[(offset + k) * 3 + 1]
      cz += positions[(offset + k) * 3 + 2]
    }
    positions.push(cx / segments, cy / segments, cz / segments)
    for (let k = 0; k < segments; k++) {
      const k1 = (k + 1) % segments
      if (flip) indices.push(centre, offset + k1, offset + k)
      else indices.push(centre, offset + k, offset + k1)
    }
  }
  cap(0, false)
  cap((sections.length - 1) * segments, true)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

export function noseAndChassisGeometry(car: CarDesign): THREE.BufferGeometry {
  const c = car.chassis
  const wb = c.wheelbase
  const sections = [
    { x: c.noseTipX, y: 0, z: c.noseTipZ, w: 55, h: 45, n: 2.2 },
    { x: c.noseTipX + 350, y: 0, z: c.noseTipZ + 40, w: 110, h: 90, n: 2.4 },
    { x: -250, y: 0, z: 330, w: 190, h: 160, n: 2.6 },
    { x: 150, y: 0, z: 380, w: 260, h: 230, n: 2.8 },
    { x: 700, y: 0, z: 420, w: 300, h: 260, n: 3 },
    { x: 1300, y: 0, z: 430, w: 310, h: 270, n: 3 },
    { x: wb - 600, y: 0, z: 420, w: 300, h: 250, n: 3 },
    { x: wb + 100, y: 0, z: 380, w: 190, h: 160, n: 2.6 },
    { x: wb + 650, y: 0, z: 350, w: 110, h: 90, n: 2.4 },
    { x: wb + 800, y: 0, z: 350, w: 40, h: 40, n: 2.2 },
  ]
  return loftSections(sections)
}

export function engineCoverGeometry(car: CarDesign): THREE.BufferGeometry {
  const c = car.chassis
  const wb = c.wheelbase
  const top = c.engineCoverHeight
  const sections = [
    { x: 900, y: 0, z: 640, w: 60, h: 40, n: 2.2 },
    { x: 1100, y: 0, z: 700, w: 140, h: 120, n: 2.4 },
    { x: 1500, y: 0, z: top - 120, w: 170, h: 150, n: 2.6 },
    { x: 1900, y: 0, z: top - 170, w: 190, h: 170, n: 2.6 },
    { x: 2500, y: 0, z: top - 260, w: 180, h: 160, n: 2.6 },
    { x: wb - 200, y: 0, z: top - 380, w: 130, h: 120, n: 2.4 },
    { x: wb + 350, y: 0, z: 450, w: 70, h: 60, n: 2.2 },
    { x: wb + 650, y: 0, z: 400, w: 30, h: 20, n: 2 },
  ]
  return loftSections(sections)
}

export function sidepodGeometry(car: CarDesign, side: 1 | -1): THREE.BufferGeometry {
  const s = car.sidepod
  const yc = (300 + s.width / 2) * side
  const sections = [
    { x: s.startX, y: yc, z: s.height / 2 + 120, w: s.width * 0.42, h: s.height * 0.42, n: 2.4 },
    { x: s.startX + 150, y: yc, z: s.height / 2 + 110, w: s.width * 0.5, h: s.height * 0.5, n: 3 },
    { x: s.startX + s.length * 0.4, y: yc - 40 * side, z: s.height / 2 + 100 + s.undercut * 0.1, w: s.width * 0.48, h: s.height * 0.45, n: 3.2 },
    { x: s.startX + s.length * 0.7, y: yc - 120 * side, z: s.height / 2 + 60, w: s.width * 0.34, h: s.height * 0.36, n: 3 },
    { x: s.startX + s.length, y: yc - 230 * side, z: 180, w: s.width * 0.14, h: 60, n: 2.4 },
  ]
  return loftSections(sections)
}

export function floorGeometry(car: CarDesign): THREE.BufferGeometry {
  const f = car.floor
  const shape = new THREE.Shape()
  const x0 = f.startX
  const x1 = f.startX + f.length
  const w = f.width / 2
  const dStart = x1 - f.diffuserLength
  shape.moveTo(-x0 * MM, -w * MM * 0.55)
  shape.lineTo(-(x0 + 200) * MM, -w * MM)
  shape.lineTo(-dStart * MM, -w * MM)
  shape.lineTo(-x1 * MM, -w * MM * 0.7)
  shape.lineTo(-x1 * MM, w * MM * 0.7)
  shape.lineTo(-dStart * MM, w * MM)
  shape.lineTo(-(x0 + 200) * MM, w * MM)
  shape.lineTo(-x0 * MM, w * MM * 0.55)
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: f.edgeHeight * MM * 0.5, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.translate(0, f.edgeHeight * MM * 0.5, 0)
  return g
}

export function diffuserGeometry(car: CarDesign): THREE.BufferGeometry {
  const f = car.floor
  const x1 = f.startX + f.length
  const dStart = x1 - f.diffuserLength
  const w = f.width / 2
  const sections = [
    { x: dStart, y: 0, z: f.tunnelInletHeight / 2 + 10, w: w * 0.95, h: f.tunnelInletHeight / 2, n: 4 },
    { x: dStart + f.diffuserLength * 0.5, y: 0, z: (f.tunnelInletHeight + f.diffuserExitHeight) / 4 + 10, w: w * 0.8, h: (f.tunnelInletHeight + f.diffuserExitHeight) / 4, n: 4 },
    { x: x1, y: 0, z: f.diffuserExitHeight / 2 + 10, w: w * 0.7, h: f.diffuserExitHeight / 2, n: 4 },
  ]
  return loftSections(sections, 32)
}

export function plankGeometry(car: CarDesign): THREE.BufferGeometry {
  const f = car.floor
  const g = new THREE.BoxGeometry((f.length - f.diffuserLength) * MM, f.plankThickness * MM, 0.3)
  const c = toScene(f.startX + (f.length - f.diffuserLength) / 2, 0, f.plankThickness / 2)
  g.translate(c.x, c.y, c.z)
  return g
}

export function tyreGeometry(car: CarDesign, front: boolean, side: 1 | -1): { tyre: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  const t = car.tyres
  const width = front ? t.frontWidth : t.rearWidth
  const track = front ? car.chassis.frontTrack : car.chassis.rearTrack
  const x = front ? 0 : car.chassis.wheelbase
  const y = (track / 2) * side
  const z = t.diameter / 2 - (front ? car.chassis.rideHeightFront : car.chassis.rideHeightRear) * 0.0 // wheels sit on the ground plane
  const tyre = new THREE.CylinderGeometry((t.diameter / 2) * MM, (t.diameter / 2) * MM, width * MM, 48, 1, false)
  const rim = new THREE.CylinderGeometry((t.rimDiameter * 25.4) / 2 * MM, (t.rimDiameter * 25.4) / 2 * MM, width * MM * 1.02, 32)
  for (const g of [tyre, rim]) {
    g.rotateX(Math.PI / 2)
    const c = toScene(x, y, z)
    g.translate(c.x, c.y, c.z)
  }
  return { tyre, rim }
}

export function haloGeometry(): THREE.BufferGeometry {
  const x0 = 1000
  const pts: THREE.Vector3[] = []
  const n = 24
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = Math.PI * (t - 0.5)
    const y = Math.sin(a) * 340
    const x = x0 - 250 + Math.cos(a) * 520 - 140
    pts.push(toScene(x, y, 840 - Math.abs(y) * 0.1))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const g = new THREE.TubeGeometry(curve, 48, 0.03, 10, false)
  // centre strut
  const strut = new THREE.CylinderGeometry(0.018, 0.022, 0.5, 10)
  strut.rotateZ(0.95)
  const sc = toScene(x0 - 880 + 240, 0, 700)
  strut.translate(sc.x, sc.y, sc.z)
  const merged = mergeGeometries([g, strut])
  return merged
}

export function pylonGeometry(car: CarDesign, side: 1 | -1): THREE.BufferGeometry {
  const rw = car.rearWing
  const main = rw.elements[0]
  if (!main) return new THREE.BufferGeometry()
  const y = (rw.pylonSpacing / 2) * side
  const h = main.z - 350
  const g = new THREE.BoxGeometry(0.18, h * MM, 0.02)
  const c = toScene(main.x + main.chord * 0.3, y, 350 + h / 2)
  g.translate(c.x, c.y, c.z)
  return g
}

export function suspensionGeometry(car: CarDesign): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const wb = car.chassis.wheelbase
  const arm = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.012) => {
    const a = toScene(x0, y0, z0)
    const b = toScene(x1, y1, z1)
    const len = a.distanceTo(b)
    const g = new THREE.CylinderGeometry(r, r, len, 6)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const dir = b.clone().sub(a).normalize()
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    g.applyQuaternion(quat)
    g.translate(mid.x, mid.y, mid.z)
    parts.push(g)
  }
  for (const side of [1, -1] as const) {
    const yF = (car.chassis.frontTrack / 2 - car.tyres.frontWidth / 2 - 30) * side
    const yR = (car.chassis.rearTrack / 2 - car.tyres.rearWidth / 2 - 30) * side
    // front wishbones
    arm(-150, 230 * side, 420, 40, yF, 480)
    arm(200, 230 * side, 430, 40, yF, 480)
    arm(-150, 230 * side, 240, -20, yF, 260)
    arm(220, 230 * side, 240, -20, yF, 260)
    // rear wishbones
    arm(wb - 250, 200 * side, 440, wb + 20, yR, 470)
    arm(wb + 150, 200 * side, 420, wb + 20, yR, 470)
    arm(wb - 250, 200 * side, 230, wb - 10, yR, 250)
    arm(wb + 150, 200 * side, 230, wb - 10, yR, 250)
  }
  return mergeGeometries(parts)
}

export function helmetGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.135, 24, 16)
  const c = toScene(1180, 0, 760)
  g.translate(c.x, c.y, c.z)
  return g
}

export function mergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  let offset = 0
  for (const g of geoms) {
    const pos = g.getAttribute('position')
    const idx = g.getIndex()
    for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset)
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(i + offset)
    }
    offset += pos.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  out.setIndex(indices)
  out.computeVertexNormals()
  return out
}

export interface CarMeshes {
  wings: { el: WingElement; geometry: THREE.BufferGeometry; wing: 'frontWing' | 'rearWing' }[]
  endplates: THREE.BufferGeometry[]
  body: THREE.BufferGeometry[]
  floor: THREE.BufferGeometry[]
  tyres: THREE.BufferGeometry[]
  rims: THREE.BufferGeometry[]
  details: THREE.BufferGeometry[]
  parts: { part: CarDesign['parts'][number]; geometry: THREE.BufferGeometry }[]
}

export function buildCarMeshes(car: CarDesign): CarMeshes {
  const mode = car.aeroMode
  const withMode = (el: WingElement): WingElement => (mode === 'X' && el.active ? { ...el, angle: el.xModeAngle } : el)
  const wings: CarMeshes['wings'] = []
  car.frontWing.elements.forEach((el) => wings.push({ el, wing: 'frontWing', geometry: wingElementGeometry(withMode(el)) }))
  car.rearWing.elements.forEach((el) => wings.push({ el, wing: 'rearWing', geometry: wingElementGeometry(withMode(el)) }))

  const endplates: THREE.BufferGeometry[] = []
  const fwMain = car.frontWing.elements[0]
  if (fwMain) {
    for (const s of [1, -1] as const) endplates.push(endplateGeometry(car.frontWing.endplate, fwMain.x - 40, fwMain.z - 30, (fwMain.span / 2 + car.frontWing.endplate.thickness / 2) * s))
  }
  const rwMain = car.rearWing.elements[0]
  if (rwMain) {
    for (const s of [1, -1] as const) endplates.push(endplateGeometry(car.rearWing.endplate, rwMain.x - 120, rwMain.z - 310, (rwMain.span / 2 + car.rearWing.endplate.thickness / 2) * s))
    for (const s of [1, -1] as const) endplates.push(pylonGeometry(car, s))
  }

  const body = [noseAndChassisGeometry(car), engineCoverGeometry(car), sidepodGeometry(car, 1), sidepodGeometry(car, -1)]
  const floor = [floorGeometry(car), diffuserGeometry(car), plankGeometry(car)]
  const tyres: THREE.BufferGeometry[] = []
  const rims: THREE.BufferGeometry[] = []
  for (const front of [true, false]) {
    for (const s of [1, -1] as const) {
      const t = tyreGeometry(car, front, s)
      tyres.push(t.tyre)
      rims.push(t.rim)
    }
  }
  const details = [haloGeometry(), suspensionGeometry(car), helmetGeometry()]
  const parts = car.parts.map((part) => {
    const el = withMode(part.element)
    const g = wingElementGeometry(el, part.mount !== 'free')
    if (part.mount === 'free') {
      const m = new THREE.Matrix4()
      const p = toScene(part.position.x, part.position.y, part.position.z)
      const rot = new THREE.Euler(0, (part.position.yaw * Math.PI) / 180, (part.position.roll * Math.PI) / 180)
      m.makeRotationFromEuler(rot)
      m.setPosition(p)
      g.applyMatrix4(m)
    }
    return { part, geometry: g }
  })
  return { wings, endplates, body, floor, tyres, rims, details, parts }
}
