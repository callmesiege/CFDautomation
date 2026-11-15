import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useAppStore } from '../../store/useAppStore'
import { makeElement, uid, type CustomPart, type PartKind, type WingElement } from '../../model/types'
import { naca4, zeroLiftAngle, elementExtents } from '../../model/airfoil'
import { wingElementGeometry } from '../../model/geometry'
import { airProperties } from '../../sim/atmosphere'
import { Panel, Slider, Badge, fmt } from '../components/controls'
import { ElementEditor } from '../components/ElementEditor'

const KINDS: { id: PartKind; label: string; hint: string }[] = [
  { id: 'wing-element', label: 'Wing element', hint: 'A lifting profile: flap, main plane or beam-style element.' },
  { id: 'winglet', label: 'Winglet', hint: 'Small lifting surface, e.g. on the endplate or floor edge.' },
  { id: 'endplate', label: 'Endplate', hint: 'Flat plate; modelled as a thin symmetric section.' },
  { id: 'fence', label: 'Floor fence', hint: 'Vertical vane in the underfloor tunnel inlet.' },
  { id: 'strake', label: 'Diffuser strake', hint: 'Vertical vane inside the diffuser.' },
]

function newPart(kind: PartKind): CustomPart {
  const base: Partial<WingElement> = kind === 'wing-element'
    ? { profile: { kind: 'naca4', m: 7, p: 4, t: 10 }, chord: 180, tipChord: 150, span: 1200, spanStart: 300, x: -560, z: 300, angle: 20 }
    : kind === 'winglet'
      ? { profile: { kind: 'naca4', m: 4, p: 4, t: 9 }, chord: 120, tipChord: 80, span: 300, spanStart: 0, x: 3900, z: 600, angle: 8 }
      : { profile: { kind: 'naca4', m: 0, p: 5, t: 4 }, chord: 400, tipChord: 300, span: 120, spanStart: 0, x: 600, z: 60, angle: 0, dihedral: 0 }
  return {
    id: uid('part'),
    name: `${KINDS.find((k) => k.id === kind)?.label ?? 'Part'} ${Math.floor(Math.random() * 90 + 10)}`,
    kind,
    element: makeElement({ name: 'section', ...base }),
    mount: kind === 'wing-element' ? 'front-wing' : kind === 'fence' || kind === 'strake' ? 'floor' : 'free',
    position: { x: kind === 'fence' ? 600 : 3900, y: kind === 'fence' ? 650 : 500, z: kind === 'fence' ? 0 : 600, yaw: 0, roll: kind === 'fence' || kind === 'strake' ? 90 : 0 },
    createdAt: Date.now(),
    notes: '',
  }
}

function PartPreview({ part }: { part: CustomPart }) {
  const { geometry, size } = useMemo(() => {
    const g = wingElementGeometry(part.element, true)
    g.computeBoundingBox()
    const bb = g.boundingBox!
    const c = new THREE.Vector3()
    bb.getCenter(c)
    g.translate(-c.x, -c.y, -c.z)
    const s = new THREE.Vector3()
    bb.getSize(s)
    return { geometry: g, size: Math.max(s.x, s.y, s.z, 0.2) }
  }, [part.element])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#199e70" metalness={0.3} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      <Grid args={[6, 6]} cellSize={size / 10} sectionSize={size / 2} cellColor="#243040" sectionColor="#34465c" fadeDistance={size * 6} infiniteGrid position={[0, -size * 0.4, 0]} />
      <OrbitControls makeDefault minDistance={size * 0.5} maxDistance={size * 8} />
      <CameraRig size={size} />
    </>
  )
}

function CameraRig({ size }: { size: number }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.position.set(size * 0.8, size * 0.5, size * 0.95)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

export function PartsPage() {
  const library = useAppStore((s) => s.library)
  const savePart = useAppStore((s) => s.savePart)
  const deletePart = useAppStore((s) => s.deletePart)
  const mountPart = useAppStore((s) => s.mountPart)
  const unmountPart = useAppStore((s) => s.unmountPart)
  const car = useAppStore((s) => s.car)
  const atm = useAppStore((s) => s.atmosphere)
  const speed = useAppStore((s) => s.speedKMH)
  const setTunnel = useAppStore((s) => s.setTunnel)
  const setTab = useAppStore((s) => s.setTab)
  const [draft, setDraft] = useState<CustomPart | null>(library[0] ?? null)
  const [pointsText, setPointsText] = useState('')

  const mounted = draft ? car.parts.some((p) => p.id === draft.id) : false
  const inLibrary = draft ? library.some((p) => p.id === draft.id) : false

  const quick = useMemo(() => {
    if (!draft) return null
    const el = draft.element
    const air = airProperties(atm)
    const v = speed / 3.6
    const q = 0.5 * air.density * v * v
    const a0 = zeroLiftAngle(el.profile)
    const chord = (el.chord + el.tipChord) / 2 / 1000
    const span = Math.max(0.01, (el.span - 2 * el.spanStart) / 1000)
    const AR = span / chord
    const cl2d = 2 * Math.PI * ((el.angle - a0) * Math.PI) / 180
    const cl = cl2d * (AR / (AR + 2))
    const cd = 0.012 + (cl * cl) / (Math.PI * 0.85 * AR)
    const area = chord * span
    return { cl, cd, down: cl * q * area, drag: cd * q * area, area, AR, a0, mass: area * 2 * (el.skinThickness / 1000) * 1600 }
  }, [draft, atm, speed])

  const update = (patch: Partial<CustomPart>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const updateEl = (patch: Partial<WingElement>) => setDraft((d) => (d ? { ...d, element: { ...d.element, ...patch } } : d))

  const toCustomProfile = () => {
    if (!draft) return
    const p = draft.element.profile
    const pts = p.kind === 'naca4' ? naca4(p.m, p.p, p.t, 30) : p.points
    setPointsText(pts.map(([x, y]) => `${x.toFixed(4)}, ${y.toFixed(4)}`).join('\n'))
    updateEl({ profile: { kind: 'custom', points: pts } })
  }

  const applyPoints = () => {
    const pts: [number, number][] = []
    pointsText.split(/\n+/).forEach((line) => {
      const m = line.split(/[,\s]+/).filter(Boolean).map(Number)
      if (m.length >= 2 && m.every((x) => Number.isFinite(x))) pts.push([m[0], m[1]])
    })
    if (pts.length >= 6) updateEl({ profile: { kind: 'custom', points: pts } })
  }

  const envelope = draft ? elementExtents(draft.element) : null

  return (
    <div className="page">
      <div className="page-header">
        <h1>Parts designer</h1>
        <p>Design new aerodynamic parts from a parametric profile, check them against the 2026 envelope, preview them in 3D, mount them on the car and send them to the wind tunnel.</p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '260px minmax(0,1fr) 380px' }}>
        <Panel title="Library" right={`${library.length} parts`}>
          <div className="row" style={{ marginBottom: 8 }}>
            <select className="sel" style={{ flex: 1 }} id="newkind" defaultValue="wing-element">
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <button
              className="btn primary small"
              onClick={() => {
                const sel = document.getElementById('newkind') as HTMLSelectElement
                setDraft(newPart(sel.value as PartKind))
                setPointsText('')
              }}
            >
              New
            </button>
          </div>
          <div className="list">
            {library.map((p) => (
              <div key={p.id} className={`item ${draft?.id === p.id ? 'selected' : ''}`} onClick={() => { setDraft(p); setPointsText('') }}>
                <div>{p.name}</div>
                <div className="muted small">
                  {KINDS.find((k) => k.id === p.kind)?.label} · {p.mount}
                  {car.parts.some((x) => x.id === p.id) && <Badge kind="info">mounted</Badge>}
                </div>
              </div>
            ))}
            {library.length === 0 && <p className="muted small">The library is empty. Create a part to begin.</p>}
          </div>
        </Panel>

        {draft ? (
          <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
            <Panel title="Part" right={<span className="muted">{KINDS.find((k) => k.id === draft.kind)?.hint}</span>}>
              <div className="row" style={{ marginBottom: 8 }}>
                <input className="txt" value={draft.name} onChange={(e) => update({ name: e.target.value })} style={{ flex: 1 }} />
                <select className="sel" value={draft.kind} onChange={(e) => update({ kind: e.target.value as PartKind })}>
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <select className="sel" value={draft.mount} onChange={(e) => update({ mount: e.target.value as CustomPart['mount'] })}>
                  <option value="front-wing">Mount: front wing</option>
                  <option value="rear-wing">Mount: rear wing</option>
                  <option value="floor">Mount: floor</option>
                  <option value="free">Mount: free position</option>
                </select>
              </div>
              <ElementEditor el={draft.element} onChange={updateEl} showPlacement={draft.mount !== 'free'} />
              {draft.mount === 'free' && (
                <>
                  <h3 style={{ marginTop: 10 }}>Placement (free mount, one side mirrored)</h3>
                  <Slider label="x (rearward from front axle)" value={draft.position.x} min={-1300} max={4600} step={5} unit="mm" onChange={(v) => update({ position: { ...draft.position, x: v } })} />
                  <Slider label="y (lateral)" value={draft.position.y} min={-950} max={950} step={5} unit="mm" onChange={(v) => update({ position: { ...draft.position, y: v } })} />
                  <Slider label="z (height)" value={draft.position.z} min={0} max={950} step={5} unit="mm" onChange={(v) => update({ position: { ...draft.position, z: v } })} />
                  <Slider label="yaw" value={draft.position.yaw} min={-90} max={90} step={1} unit="°" onChange={(v) => update({ position: { ...draft.position, yaw: v } })} />
                  <Slider label="roll" value={draft.position.roll} min={-90} max={90} step={1} unit="°" onChange={(v) => update({ position: { ...draft.position, roll: v } })} />
                </>
              )}
            </Panel>
            <Panel title="Profile points" right={draft.element.profile.kind === 'custom' ? 'custom profile' : 'NACA 4-digit'}>
              <div className="row" style={{ marginBottom: 6 }}>
                <button className="btn small" onClick={toCustomProfile}>
                  {draft.element.profile.kind === 'custom' ? 'Reload points into editor' : 'Convert to editable points'}
                </button>
                {draft.element.profile.kind === 'custom' && (
                  <button className="btn small" onClick={() => updateEl({ profile: { kind: 'naca4', m: 6, p: 4, t: 10 } })}>
                    Back to NACA
                  </button>
                )}
                <button className="btn small primary" onClick={applyPoints} disabled={!pointsText}>
                  Apply points
                </button>
              </div>
              <textarea className="textarea" placeholder="x, y per line in chord units (0–1), closed loop starting at the trailing edge over the upper surface" value={pointsText} onChange={(e) => setPointsText(e.target.value)} />
              <textarea className="textarea" style={{ minHeight: 40, marginTop: 6 }} placeholder="Design notes…" value={draft.notes} onChange={(e) => update({ notes: e.target.value })} />
            </Panel>
          </div>
        ) : (
          <Panel title="No part selected">
            <p className="muted">Pick a part from the library or create a new one.</p>
          </Panel>
        )}

        {draft && (
          <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
            <div className="viewer3d" style={{ height: 260 }}>
              <Canvas camera={{ position: [1.2, 0.7, 1.4], fov: 40 }} dpr={[1, 2]}>
                <Suspense fallback={null}>
                  <hemisphereLight intensity={0.7} color="#dfe8ff" groundColor="#222" />
                  <directionalLight position={[3, 4, 2]} intensity={1.4} />
                  <PartPreview part={draft} />
                </Suspense>
              </Canvas>
            </div>
            <Panel title="Quick aero estimate" right={`${speed} km/h`}>
              {quick && (
                <div className="kv">
                  <dt>Planform area</dt>
                  <dd>{quick.area.toFixed(3)} m²</dd>
                  <dt>Aspect ratio</dt>
                  <dd>{quick.AR.toFixed(2)}</dd>
                  <dt>Zero-lift angle</dt>
                  <dd>{quick.a0.toFixed(1)}°</dd>
                  <dt>Cl (3-D)</dt>
                  <dd>{quick.cl.toFixed(3)}</dd>
                  <dt>Cd</dt>
                  <dd>{quick.cd.toFixed(4)}</dd>
                  <dt>Downforce</dt>
                  <dd>{fmt(quick.down)} N</dd>
                  <dt>Drag</dt>
                  <dd>{fmt(quick.drag)} N</dd>
                  <dt>Mass estimate</dt>
                  <dd>{quick.mass.toFixed(2)} kg (CFRP skin)</dd>
                </div>
              )}
            </Panel>
            <Panel title="Envelope check">
              {envelope && (
                <div className="kv">
                  <dt>x range</dt>
                  <dd>{fmt(envelope.minX)} … {fmt(envelope.maxX)} mm</dd>
                  <dt>z range</dt>
                  <dd>{fmt(envelope.minZ)} … {fmt(envelope.maxZ)} mm</dd>
                  <dt>half span</dt>
                  <dd>{fmt(envelope.maxY)} mm</dd>
                  <dt>Status</dt>
                  <dd>
                    {envelope.maxZ > 950 || envelope.maxY > 950 || envelope.minX < -1225 ? <Badge kind="fail">outside bodywork volume</Badge> : <Badge kind="pass">inside bodywork volume</Badge>}
                  </dd>
                </div>
              )}
              <p className="help">Full checks (slot gaps, flexibility, beam-wing rule) run once the part is mounted; see the compliance report.</p>
            </Panel>
            <Panel title="Actions">
              <div className="row">
                <button className="btn primary" onClick={() => savePart(draft)}>
                  {inLibrary ? 'Save changes' : 'Save to library'}
                </button>
                {inLibrary && !mounted && (
                  <button className="btn" onClick={() => { savePart(draft); mountPart(draft.id) }}>
                    Mount on car
                  </button>
                )}
                {mounted && (
                  <button className="btn" onClick={() => unmountPart(draft.id)}>
                    Remove from car
                  </button>
                )}
                <button
                  className="btn"
                  onClick={() => {
                    savePart(draft)
                    setTunnel({ mode: 'part', partId: draft.id })
                    setTab('tunnel')
                  }}
                >
                  Test in wind tunnel
                </button>
                {inLibrary && (
                  <button className="btn danger" onClick={() => { if (confirm(`Delete "${draft.name}" from the library?`)) { deletePart(draft.id); setDraft(null) } }}>
                    Delete
                  </button>
                )}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  )
}
