import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { WingElement } from '../../model/types'
import { elementSection2D, pointInPolygon, bbox } from '../../model/airfoil'
import { LBM } from '../../sim/lbm'
import { SPEED_LUT, DIVERGING_LUT } from '../../sim/colormaps'
import { airProperties, reynolds } from '../../sim/atmosphere'
import { Panel, Slider, Toggle, fmt, fmtSci } from '../components/controls'

const NX = 400
const NY = 160
const SCALE = 3 // canvas pixels per cell

interface Target {
  key: string
  label: string
  el: WingElement
  apply: (patch: Partial<WingElement>) => void
}

interface Section {
  key: string
  label: string
  pts: [number, number][]
  le: [number, number]
  te: [number, number]
  chord: number
  angle: number
  effSpanM: number
}

interface Domain {
  x0: number
  z0: number
  cell: number
  ground: boolean
}

interface LiveReadout {
  cl: number
  cd: number
}

function computeSections(targets: Target[], station: number): Section[] {
  return targets.map((t) => {
    const s = elementSection2D(t.el, station)
    const pts = s.pts
    // trailing edge = first point of the loop (NACA loop starts at TE)
    const te = pts[0]
    return { key: t.key, label: t.label, pts, le: s.le, te, chord: s.chord, angle: t.el.angle, effSpanM: Math.max(0.05, (t.el.span - 2 * t.el.spanStart) / 1000) }
  })
}

function computeDomain(sections: Section[], mode: 'frontWing' | 'rearWing' | 'part', rideHeight: number): Domain {
  if (sections.length === 0) return { x0: -1500, z0: -rideHeight, cell: 2000 / NX, ground: true }
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  sections.forEach((s) => {
    const b = bbox(s.pts)
    minX = Math.min(minX, b.minX)
    maxX = Math.max(maxX, b.maxX)
    minZ = Math.min(minZ, b.minY)
    maxZ = Math.max(maxZ, b.maxY)
  })
  const span = maxX - minX
  const widthMM = Math.max(1400, span * 3.2)
  const cell = widthMM / NX
  const heightMM = cell * NY
  const x0 = minX - widthMM * 0.28
  const groundZ = -rideHeight
  if (mode !== 'rearWing' && minZ - groundZ < heightMM * 0.5) {
    return { x0, z0: groundZ, cell, ground: true }
  }
  const z0 = (minZ + maxZ) / 2 - heightMM / 2
  return { x0, z0, cell, ground: z0 <= groundZ + 1 }
}

function rasterize(sections: Section[], d: Domain, mask: Uint8Array): void {
  mask.fill(0)
  sections.forEach((s, idx) => {
    const b = bbox(s.pts)
    const i0 = Math.max(1, Math.floor((b.minX - d.x0) / d.cell))
    const i1 = Math.min(NX - 2, Math.ceil((b.maxX - d.x0) / d.cell))
    const j0 = Math.max(1, Math.floor((b.minY - d.z0) / d.cell))
    const j1 = Math.min(NY - 2, Math.ceil((b.maxY - d.z0) / d.cell))
    for (let j = j0; j <= j1; j++) {
      const z = d.z0 + (j + 0.5) * d.cell
      for (let i = i0; i <= i1; i++) {
        const x = d.x0 + (i + 0.5) * d.cell
        if (pointInPolygon(x, z, s.pts)) mask[j * NX + i] = idx + 1
      }
    }
  })
}

export function WindTunnelPage() {
  const car = useAppStore((s) => s.car)
  const atm = useAppStore((s) => s.atmosphere)
  const speed = useAppStore((s) => s.speedKMH)
  const setSpeed = useAppStore((s) => s.setSpeed)
  const setElement = useAppStore((s) => s.setElement)
  const library = useAppStore((s) => s.library)
  const savePart = useAppStore((s) => s.savePart)
  const tunnel = useAppStore((s) => s.tunnel)
  const setTunnel = useAppStore((s) => s.setTunnel)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lbmRef = useRef<LBM | null>(null)
  const maskRef = useRef(new Uint8Array(NX * NY))
  const sectionsRef = useRef<Section[]>([])
  const domainRef = useRef<Domain>({ x0: 0, z0: 0, cell: 5, ground: true })
  const domainKeyRef = useRef('')
  const targetsRef = useRef<Target[]>([])
  const particlesRef = useRef<Float32Array>(new Float32Array(0))
  const imgRef = useRef<ImageData | null>(null)
  const offRef = useRef<HTMLCanvasElement | null>(null)
  const vortRef = useRef(new Float32Array(NX * NY))
  const dirtyRef = useRef(true)
  const dragRef = useRef<{ idx: number; mode: 'move' | 'rotate'; dx: number; dz: number } | null>(null)
  const forcesRef = useRef<LiveReadout[]>([])
  const [running, setRunning] = useState(true)
  const [readout, setReadout] = useState<{ forces: LiveReadout[]; steps: number; fps: number; reSim: number; cell: number; ground: boolean }>({ forces: [], steps: 0, fps: 0, reSim: 0, cell: 5, ground: true })
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const air = useMemo(() => airProperties(atm), [atm])
  const v = speed / 3.6 + atm.windMS
  const q = 0.5 * air.density * v * v

  // --- targets from the store
  const targets = useMemo<Target[]>(() => {
    if (tunnel.mode === 'part') {
      const p = library.find((x) => x.id === tunnel.partId) ?? library[0]
      if (!p) return []
      return [{ key: p.id, label: p.name, el: p.element, apply: (patch) => savePart({ ...p, element: { ...p.element, ...patch } }) }]
    }
    const wing = tunnel.mode
    return car[wing].elements.map((el) => ({ key: el.id, label: el.name, el, apply: (patch) => setElement(wing, el.id, patch) }))
  }, [tunnel.mode, tunnel.partId, car, library, setElement, savePart])
  targetsRef.current = targets

  const rideHeight = tunnel.mode === 'frontWing' ? car.chassis.rideHeightFront : tunnel.mode === 'rearWing' ? car.chassis.rideHeightRear : car.chassis.rideHeightFront
  const station = tunnel.mode === 'part' ? Math.min(tunnel.station, targets[0]?.el.span ? targets[0].el.span / 2 - 10 : tunnel.station) : tunnel.station

  // sections derived from targets
  const sections = useMemo(() => computeSections(targets, station), [targets, station])

  // keep refs in sync + mark dirty. The domain is only recomputed when the section set changes
  // (mode, station, element count or ride height), not while an element is being dragged, so the
  // flow field is not disturbed by a rescale mid-interaction.
  const domainKey = `${tunnel.mode}|${station}|${rideHeight}|${targets.map((t) => t.key).join(',')}`
  useEffect(() => {
    sectionsRef.current = sections
    if (domainKeyRef.current !== domainKey) {
      domainRef.current = computeDomain(sections, tunnel.mode, rideHeight)
      domainKeyRef.current = domainKey
    }
    dirtyRef.current = true
  }, [sections, domainKey, tunnel.mode, rideHeight])

  // the real-world Reynolds number of the main section
  const reReal = reynolds(air, Math.max(1, v), (sections[0]?.chord ?? 300) / 1000)

  // --- solver setup
  useEffect(() => {
    const lbm = new LBM(NX, NY)
    lbmRef.current = lbm
    const n = 1400
    const p = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      p[i * 4] = Math.random() * NX
      p[i * 4 + 1] = Math.random() * NY
      p[i * 4 + 2] = p[i * 4]
      p[i * 4 + 3] = p[i * 4 + 1]
    }
    particlesRef.current = p
    const off = document.createElement('canvas')
    off.width = NX
    off.height = NY
    offRef.current = off
    imgRef.current = off.getContext('2d')!.createImageData(NX, NY)
    dirtyRef.current = true
    return () => {
      lbmRef.current = null
    }
  }, [])

  useEffect(() => {
    const lbm = lbmRef.current
    if (!lbm) return
    lbm.rollingRoad = tunnel.rollingRoad
    dirtyRef.current = true
  }, [tunnel.rollingRoad])

  useEffect(() => {
    const lbm = lbmRef.current
    if (!lbm) return
    const chordCells = (sections[0]?.chord ?? 300) / domainRef.current.cell
    lbm.setReynolds(Math.min(reReal, tunnel.reCap), chordCells)
  }, [reReal, tunnel.reCap, sections])

  const resetFlow = useCallback(() => {
    const lbm = lbmRef.current
    if (!lbm) return
    domainRef.current = computeDomain(sectionsRef.current, tunnel.mode, rideHeight)
    lbm.reset()
    dirtyRef.current = true
  }, [tunnel.mode, rideHeight])

  // --- render loop
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let frames = 0
    let fpsAcc = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const lbm = lbmRef.current
      const canvas = canvasRef.current
      const off = offRef.current
      const img = imgRef.current
      if (!lbm || !canvas || !off || !img) return
      const d = domainRef.current
      const secs = sectionsRef.current
      if (dirtyRef.current) {
        rasterize(secs, d, maskRef.current)
        lbm.setSolid(maskRef.current)
        lbm.forces = secs.map(() => ({ fx: 0, fy: 0 }))
        dirtyRef.current = false
      }
      const steps = tunnel.stepsPerFrame
      if (running) lbm.step(steps)

      // --- forces (EMA)
      const chordCellsMain = secs.length ? secs[0].chord / d.cell : 60
      const f = forcesRef.current
      secs.forEach((s, i) => {
        const fr = lbm.forces[i]
        if (!fr) return
        const cc = s.chord / d.cell
        const cl = -lbm.coefficient(fr.fy, cc)
        const cd = lbm.coefficient(fr.fx, cc)
        if (!f[i]) f[i] = { cl, cd }
        const a = running ? 0.05 : 0
        f[i].cl += (cl - f[i].cl) * a
        f[i].cd += (cd - f[i].cd) * a
      })
      forcesRef.current = f.slice(0, secs.length)

      // --- field image
      const data = img.data
      const { rho, ux, uy, solid } = lbm
      const u0 = lbm.u0
      const field = tunnel.field
      if (field === 'vorticity') lbm.vorticity(vortRef.current)
      const vort = vortRef.current
      for (let j = 0; j < NY; j++) {
        const row = (NY - 1 - j) * NX
        for (let i = 0; i < NX; i++) {
          const k = j * NX + i
          const o = (row + i) * 4
          if (solid[k]) {
            data[o] = 212
            data[o + 1] = 216
            data[o + 2] = 222
            data[o + 3] = 255
            continue
          }
          let idx: number
          let lut: Uint8ClampedArray
          if (field === 'speed') {
            const s = Math.sqrt(ux[k] * ux[k] + uy[k] * uy[k]) / (1.6 * u0)
            idx = Math.max(0, Math.min(255, Math.floor(s * 255)))
            lut = SPEED_LUT
          } else if (field === 'pressure') {
            const cp = ((rho[k] - 1) / 3) / (0.5 * u0 * u0)
            idx = Math.max(0, Math.min(255, Math.floor(((cp + 2.5) / 3.5) * 255)))
            lut = DIVERGING_LUT
          } else {
            const w = vort[k] / (0.25 * u0)
            idx = Math.max(0, Math.min(255, Math.floor(((w + 1) / 2) * 255)))
            lut = DIVERGING_LUT
          }
          data[o] = lut[idx * 3]
          data[o + 1] = lut[idx * 3 + 1]
          data[o + 2] = lut[idx * 3 + 2]
          data[o + 3] = 255
        }
      }
      off.getContext('2d')!.putImageData(img, 0, 0)
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height)

      const toPx = (x: number, z: number): [number, number] => [((x - d.x0) / d.cell) * SCALE, (NY - (z - d.z0) / d.cell) * SCALE]

      // --- streamlines
      if (tunnel.streamlines) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 1
        const nLines = 26
        for (let l = 0; l < nLines; l++) {
          let px = 2
          let py = ((l + 0.5) / nLines) * NY
          ctx.beginPath()
          ctx.moveTo(px * SCALE, (NY - py) * SCALE)
          for (let s = 0; s < 900; s++) {
            const [vx, vy] = lbm.sampleVelocity(px, py)
            const sp = Math.hypot(vx, vy)
            if (sp < 1e-5) break
            const h = 0.9
            const mx = px + (vx / sp) * h * 0.5
            const my = py + (vy / sp) * h * 0.5
            const [vx2, vy2] = lbm.sampleVelocity(mx, my)
            const sp2 = Math.hypot(vx2, vy2)
            if (sp2 < 1e-5) break
            px += (vx2 / sp2) * h
            py += (vy2 / sp2) * h
            if (px < 0 || px >= NX - 1 || py < 0 || py >= NY - 1) break
            if (solid[Math.floor(py) * NX + Math.floor(px)]) break
            ctx.lineTo(px * SCALE, (NY - py) * SCALE)
          }
          ctx.stroke()
        }
      }

      // --- particles
      if (tunnel.particles) {
        const p = particlesRef.current
        const n = p.length / 4
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const x = p[i * 4]
          const y = p[i * 4 + 1]
          const [vx, vy] = lbm.sampleVelocity(x, y)
          const k = running ? steps * 1.0 : 0
          const nx = x + vx * k
          const ny = y + vy * k
          p[i * 4 + 2] = x
          p[i * 4 + 3] = y
          const cell = solid[Math.min(NY - 1, Math.max(0, Math.floor(ny))) * NX + Math.min(NX - 1, Math.max(0, Math.floor(nx)))]
          if (nx >= NX - 1 || ny < 0 || ny >= NY - 1 || cell || Math.hypot(vx, vy) < 0.002) {
            p[i * 4] = Math.random() * 3
            p[i * 4 + 1] = Math.random() * NY
            p[i * 4 + 2] = p[i * 4]
            p[i * 4 + 3] = p[i * 4 + 1]
            continue
          }
          p[i * 4] = nx
          p[i * 4 + 1] = ny
          ctx.moveTo(x * SCALE, (NY - y) * SCALE)
          ctx.lineTo(nx * SCALE, (NY - ny) * SCALE)
        }
        ctx.stroke()
      }

      // --- element outlines + handles
      secs.forEach((s, i) => {
        const hot = hoverIdx === i || dragRef.current?.idx === i
        ctx.beginPath()
        s.pts.forEach(([x, z], k) => {
          const [px, py] = toPx(x, z)
          if (k === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.closePath()
        ctx.strokeStyle = hot ? '#3987e5' : '#0e1116'
        ctx.lineWidth = hot ? 2.5 : 1.5
        ctx.stroke()
        // pivot + rotate handle
        const [lx, ly] = toPx(s.le[0], s.le[1])
        const [tx, ty] = toPx(s.te[0], s.te[1])
        ctx.fillStyle = '#0e1116'
        ctx.beginPath()
        ctx.arc(lx, ly, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(tx, ty, 7, 0, Math.PI * 2)
        ctx.fillStyle = hot ? '#3987e5' : 'rgba(217,89,38,0.9)'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = '#0e1116'
        ctx.font = '12px ui-monospace, monospace'
        ctx.fillText(`${s.label} ${s.angle.toFixed(1)}°`, lx + 6, ly - 8)
      })
      if (d.ground) {
        const [, gy] = toPx(0, -rideHeight)
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.setLineDash([6, 6])
        ctx.beginPath()
        ctx.moveTo(0, gy)
        ctx.lineTo(canvas.width, gy)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.fillText(tunnel.rollingRoad ? 'rolling road' : 'fixed floor', 8, gy - 6)
      }

      // --- fps / readout
      frames++
      const now = performance.now()
      fpsAcc += now - last
      last = now
      if (fpsAcc > 400) {
        const fps = (frames * 1000) / fpsAcc
        frames = 0
        fpsAcc = 0
        setReadout({ forces: forcesRef.current.map((x) => ({ ...x })), steps: lbm.stepCount, fps, reSim: lbm.effectiveReynolds(chordCellsMain), cell: d.cell, ground: d.ground })
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, tunnel.field, tunnel.particles, tunnel.streamlines, tunnel.stepsPerFrame, tunnel.rollingRoad, hoverIdx, rideHeight])

  // --- pointer interaction
  const toMM = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * NX
    const py = ((e.clientY - r.top) / r.height) * NY
    const d = domainRef.current
    return [d.x0 + px * d.cell, d.z0 + (NY - py) * d.cell]
  }

  const hitTest = (x: number, z: number): { idx: number; mode: 'move' | 'rotate' } | null => {
    const d = domainRef.current
    const secs = sectionsRef.current
    const handleR = 9 * d.cell / SCALE * 1.2 + 4
    for (let i = secs.length - 1; i >= 0; i--) {
      const s = secs[i]
      if (Math.hypot(s.te[0] - x, s.te[1] - z) < handleR) return { idx: i, mode: 'rotate' }
    }
    for (let i = secs.length - 1; i >= 0; i--) {
      if (pointInPolygon(x, z, secs[i].pts)) return { idx: i, mode: 'move' }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, z] = toMM(e)
    const hit = hitTest(x, z)
    if (!hit) return
    const s = sectionsRef.current[hit.idx]
    dragRef.current = { idx: hit.idx, mode: hit.mode, dx: s.le[0] - x, dz: s.le[1] - z }
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, z] = toMM(e)
    const drag = dragRef.current
    if (!drag) {
      const hit = hitTest(x, z)
      setHoverIdx(hit ? hit.idx : null)
      canvasRef.current!.style.cursor = hit ? (hit.mode === 'rotate' ? 'grab' : 'move') : 'default'
      return
    }
    const t = targetsRef.current[drag.idx]
    const s = sectionsRef.current[drag.idx]
    if (!t || !s) return
    if (drag.mode === 'move') {
      const dom = domainRef.current
      const nx = Math.max(dom.x0 + 3 * dom.cell, Math.min(dom.x0 + (NX - 3) * dom.cell - s.chord, x + drag.dx))
      const nz = Math.max(dom.z0 + 3 * dom.cell, Math.min(dom.z0 + (NY - 3) * dom.cell, z + drag.dz))
      const dX = nx - s.le[0]
      const dZ = nz - s.le[1]
      t.apply({ x: Math.round((t.el.x + dX) * 2) / 2, z: Math.round((t.el.z + dZ) * 2) / 2 })
    } else {
      const ang = (Math.atan2(z - s.le[1], x - s.le[0]) * 180) / Math.PI
      const clamped = Math.max(-15, Math.min(60, Math.round(ang * 2) / 2))
      t.apply({ angle: clamped })
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    try {
      ;(e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (hoverIdx === null) return
    e.preventDefault()
    const t = targetsRef.current[hoverIdx]
    if (!t) return
    t.apply({ angle: Math.max(-15, Math.min(60, t.el.angle + (e.deltaY > 0 ? -0.5 : 0.5))) })
  }

  const d = { cell: readout.cell, ground: readout.ground }
  const totals = readout.forces.reduce(
    (acc, f, i) => {
      const s = sections[i]
      if (!s) return acc
      const chordM = s.chord / 1000
      acc.down += f.cl * q * chordM * s.effSpanM
      acc.drag += f.cd * q * chordM * s.effSpanM
      return acc
    },
    { down: 0, drag: 0 },
  )

  return (
    <div className="page">
      <div className="page-header">
        <h1>Live wind tunnel</h1>
        <p>A 2-D section of the wing solved in real time with a lattice-Boltzmann method. Drag an element to move it, drag the orange trailing-edge handle (or scroll over an element) to change its angle, and watch the flow and the forces respond. Changes write straight back to the design.</p>
      </div>
      <div className="grid side-wide">
        <div>
          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              width={NX * SCALE}
              height={NY * SCALE}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => setHoverIdx(null)}
              onWheel={onWheel}
            />
            <div className="overlay">
              <span>{tunnel.field === 'speed' ? '|u| / U∞' : tunnel.field === 'pressure' ? 'Cp' : 'vorticity'}</span>
              <span>step {readout.steps} · {readout.fps.toFixed(0)} fps · {tunnel.stepsPerFrame}×/frame</span>
              <span>Re sim {fmtSci(readout.reSim)} · Re real {fmtSci(reReal)}</span>
              <span>{d.cell.toFixed(1)} mm/cell · {fmt(d.cell * NX)} × {fmt(d.cell * NY)} mm</span>
            </div>
            <div className="overlay right">
              <span>ΣCl {readout.forces.reduce((a, f) => a + f.cl, 0).toFixed(2)} · ΣCd {readout.forces.reduce((a, f) => a + f.cd, 0).toFixed(3)}</span>
              <span>downforce {fmt(totals.down)} N · drag {fmt(totals.drag)} N</span>
              <span>{speed} km/h · ρ {air.density.toFixed(3)} · {station} mm station</span>
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className={`btn ${running ? '' : 'primary'}`} onClick={() => setRunning(!running)}>
              {running ? 'Pause' : 'Run'}
            </button>
            <button className="btn" onClick={resetFlow}>
              Reset flow
            </button>
            <span className="small muted">Field</span>
            <Toggle value={tunnel.field} options={[{ value: 'speed', label: 'Speed' }, { value: 'pressure', label: 'Pressure' }, { value: 'vorticity', label: 'Vorticity' }]} onChange={(v) => setTunnel({ field: v })} />
            <button className={`btn small ${tunnel.particles ? 'active' : ''}`} onClick={() => setTunnel({ particles: !tunnel.particles })}>
              Particles
            </button>
            <button className={`btn small ${tunnel.streamlines ? 'active' : ''}`} onClick={() => setTunnel({ streamlines: !tunnel.streamlines })}>
              Streamlines
            </button>
            <button className={`btn small ${tunnel.rollingRoad ? 'active' : ''}`} onClick={() => setTunnel({ rollingRoad: !tunnel.rollingRoad })}>
              Rolling road
            </button>
          </div>

          <Panel title="Element forces (2-D section, scaled by effective span)" style={{ marginTop: 16 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Element</th>
                  <th style={{ textAlign: 'right' }}>Angle</th>
                  <th style={{ textAlign: 'right' }}>Chord mm</th>
                  <th style={{ textAlign: 'right' }}>Cl (2-D)</th>
                  <th style={{ textAlign: 'right' }}>Cd (2-D)</th>
                  <th style={{ textAlign: 'right' }}>Downforce N</th>
                  <th style={{ textAlign: 'right' }}>Drag N</th>
                  <th style={{ textAlign: 'right' }}>L/D</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s, i) => {
                  const f = readout.forces[i] ?? { cl: 0, cd: 0 }
                  const chordM = s.chord / 1000
                  const dn = f.cl * q * chordM * s.effSpanM
                  const dr = f.cd * q * chordM * s.effSpanM
                  return (
                    <tr key={s.key} style={{ background: hoverIdx === i ? 'rgba(57,135,229,0.08)' : undefined }}>
                      <td>{s.label}</td>
                      <td className="num">{s.angle.toFixed(1)}°</td>
                      <td className="num">{fmt(s.chord)}</td>
                      <td className="num">{f.cl.toFixed(3)}</td>
                      <td className="num">{f.cd.toFixed(4)}</td>
                      <td className="num">{fmt(dn)}</td>
                      <td className="num">{fmt(dr)}</td>
                      <td className="num">{dr > 0 ? (dn / dr).toFixed(1) : '—'}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td><b>Total</b></td>
                  <td />
                  <td />
                  <td className="num">{readout.forces.reduce((a, f) => a + f.cl, 0).toFixed(3)}</td>
                  <td className="num">{readout.forces.reduce((a, f) => a + f.cd, 0).toFixed(4)}</td>
                  <td className="num"><b>{fmt(totals.down)}</b></td>
                  <td className="num"><b>{fmt(totals.drag)}</b></td>
                  <td className="num">{totals.drag > 0 ? (totals.down / totals.drag).toFixed(1) : '—'}</td>
                </tr>
              </tbody>
            </table>
            <p className="help">
              Coefficients come from momentum exchange on the lattice and are smoothed over ~20 frames. The solver runs at a reduced Reynolds number (capped below) for stability, so absolute values are indicative; relative changes as you move elements are the useful signal.
            </p>
          </Panel>
        </div>

        <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
          <Panel title="Section">
            <Toggle value={tunnel.mode} options={[{ value: 'frontWing', label: 'Front wing' }, { value: 'rearWing', label: 'Rear wing' }, { value: 'part', label: 'Library part' }]} onChange={(v) => { setTunnel({ mode: v }); dirtyRef.current = true }} />
            {tunnel.mode === 'part' && (
              <select className="sel" style={{ width: '100%', marginTop: 8 }} value={tunnel.partId ?? ''} onChange={(e) => setTunnel({ partId: e.target.value || null })}>
                {library.length === 0 && <option value="">No parts in the library yet</option>}
                {library.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <Slider label="Lateral station (from centreline)" value={tunnel.station} min={0} max={950} step={10} unit="mm" onChange={(v) => setTunnel({ station: v })} />
            <p className="help">The section is cut at this y-station so sweep, dihedral and taper are included. {d.ground ? `Ground sits ${rideHeight} mm below the reference plane.` : 'The section is far from the ground: free-stream below.'}</p>
          </Panel>
          <Panel title="Flow conditions">
            <Slider label="Speed" value={speed} min={50} max={360} step={5} unit="km/h" onChange={setSpeed} />
            <Slider label="Reynolds cap (stability)" value={tunnel.reCap} min={200} max={12000} step={100} onChange={(v) => setTunnel({ reCap: v })} />
            <Slider label="Solver steps per frame" value={tunnel.stepsPerFrame} min={1} max={12} step={1} onChange={(v) => setTunnel({ stepsPerFrame: v })} />
            <div className="kv" style={{ marginTop: 6 }}>
              <dt>Air density</dt>
              <dd>{air.density.toFixed(4)} kg/m³</dd>
              <dt>Viscosity</dt>
              <dd>{(air.viscosity * 1e5).toFixed(3)} ×10⁻⁵ Pa·s</dd>
              <dt>Dynamic pressure</dt>
              <dd>{fmt(q)} Pa</dd>
              <dt>Re (main chord)</dt>
              <dd>{fmtSci(reReal)}</dd>
            </div>
            <p className="help">Atmosphere (temperature, pressure, humidity, elevation, wind) is set on the Aero Simulation tab and shared here.</p>
          </Panel>
          <Panel title="How the tunnel works">
            <p className="small muted" style={{ margin: 0 }}>
              D2Q9 lattice-Boltzmann with a Smagorinsky sub-grid model on a {NX}×{NY} grid. Inlet at U∞ on the left, zero-gradient outlet on the right, moving-wall rolling road or fixed floor at the bottom, bounce-back on the elements. Lift and drag come from momentum exchange at the wall and are converted to real-world forces using the dynamic pressure at the chosen speed and atmosphere.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
