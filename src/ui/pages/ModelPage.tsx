import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { useAppStore, type WingKey } from '../../store/useAppStore'
import { buildCarMeshes, type CarMeshes } from '../../model/geometry'
import { exportGLB, exportOBJ, exportSTL, exportJSON } from '../../model/exporters'
import { Panel, Slider, Toggle } from '../components/controls'
import { ElementEditor } from '../components/ElementEditor'
import { COMPONENT_KIND_LABEL, type CarDesign, type ComponentKind } from '../../model/types'

type Section = 'chassis' | 'frontWing' | 'rearWing' | 'floor' | 'body' | 'mass' | 'export'

interface ViewOpts {
  wireframe: boolean
  showBody: boolean
  showFloor: boolean
  showTyres: boolean
  xray: boolean
}

function CarScene({ car, selected, onSelect, view }: { car: CarDesign; selected: string | null; onSelect: (id: string | null, wing: WingKey | null) => void; view: ViewOpts }) {
  const meshes = useMemo<CarMeshes>(() => buildCarMeshes(car), [car])
  useEffect(() => {
    return () => {
      meshes.wings.forEach((w) => w.geometry.dispose())
      ;[...meshes.endplates, ...meshes.body, ...meshes.floor, ...meshes.tyres, ...meshes.rims, ...meshes.details].forEach((g) => g.dispose())
      meshes.parts.forEach((p) => p.geometry.dispose())
    }
  }, [meshes])
  const opacity = view.xray ? 0.35 : 1
  const common = { wireframe: view.wireframe, transparent: view.xray, opacity, side: THREE.DoubleSide }
  return (
    <group>
      {meshes.wings.map((w) => (
        <mesh
          key={w.el.id}
          geometry={w.geometry}
          castShadow
          onClick={(e) => {
            e.stopPropagation()
            onSelect(w.el.id, w.wing)
          }}
        >
          <meshStandardMaterial color={selected === w.el.id ? '#3987e5' : w.el.active ? '#d95926' : '#c9ccd1'} emissive={selected === w.el.id ? '#1b4a8a' : '#000'} metalness={0.25} roughness={0.45} {...common} />
        </mesh>
      ))}
      {meshes.parts.map((p) => (
        <mesh key={p.part.id} geometry={p.geometry} castShadow onClick={(e) => { e.stopPropagation(); onSelect(p.part.id, null) }}>
          <meshStandardMaterial color={selected === p.part.id ? '#3987e5' : '#199e70'} metalness={0.2} roughness={0.5} {...common} />
        </mesh>
      ))}
      {meshes.endplates.map((g, i) => (
        <mesh key={`ep${i}`} geometry={g} castShadow>
          <meshStandardMaterial color="#8d939c" metalness={0.3} roughness={0.5} {...common} />
        </mesh>
      ))}
      {view.showBody && meshes.body.map((g, i) => (
        <mesh key={`b${i}`} geometry={g} castShadow>
          <meshStandardMaterial color={i === 0 ? '#1f5fb0' : '#2563b8'} metalness={0.35} roughness={0.4} {...common} />
        </mesh>
      ))}
      {view.showFloor && meshes.floor.map((g, i) => (
        <mesh key={`f${i}`} geometry={g} castShadow>
          <meshStandardMaterial color={i === 2 ? '#c9b48a' : '#2a3240'} metalness={0.2} roughness={0.7} {...common} />
        </mesh>
      ))}
      {view.showTyres && meshes.tyres.map((g, i) => (
        <mesh key={`t${i}`} geometry={g} castShadow>
          <meshStandardMaterial color="#15171a" roughness={0.95} {...common} />
        </mesh>
      ))}
      {view.showTyres && meshes.rims.map((g, i) => (
        <mesh key={`r${i}`} geometry={g}>
          <meshStandardMaterial color="#9ea4ad" metalness={0.8} roughness={0.3} {...common} />
        </mesh>
      ))}
      {view.showBody && meshes.details.map((g, i) => (
        <mesh key={`d${i}`} geometry={g} castShadow>
          <meshStandardMaterial color={i === 2 ? '#e7e7e7' : '#2b2f36'} metalness={0.5} roughness={0.4} {...common} />
        </mesh>
      ))}
    </group>
  )
}

function SaveComponentButton({ kind }: { kind: ComponentKind }) {
  const saveComponent = useAppStore((s) => s.saveComponent)
  return (
    <button
      className="btn small"
      title={`Save the current ${COMPONENT_KIND_LABEL[kind].toLowerCase()} to the component library`}
      onClick={() => {
        const name = window.prompt(`Name for this ${COMPONENT_KIND_LABEL[kind].toLowerCase()} component:`)
        if (name) saveComponent(kind, name.trim())
      }}
    >
      Save to library
    </button>
  )
}

export function ModelPage() {
  const car = useAppStore((s) => s.car)
  const setCar = useAppStore((s) => s.setCar)
  const setElement = useAppStore((s) => s.setElement)
  const addElement = useAppStore((s) => s.addElement)
  const removeElement = useAppStore((s) => s.removeElement)
  const moveElement = useAppStore((s) => s.moveElement)
  const updateCar = useAppStore((s) => s.updateCar)
  const [section, setSection] = useState<Section>('frontWing')
  const [selected, setSelected] = useState<string | null>(car.frontWing.elements[1]?.id ?? null)
  const [view, setView] = useState<ViewOpts>({ wireframe: false, showBody: true, showFloor: true, showTyres: true, xray: false })

  const wingKey: WingKey = section === 'rearWing' ? 'rearWing' : 'frontWing'
  const wing = car[wingKey]
  const selectedEl = wing.elements.find((e) => e.id === selected) ?? wing.elements[0]

  const onSelect = (id: string | null, w: WingKey | null) => {
    setSelected(id)
    if (w) setSection(w)
  }

  const c = car.chassis
  const f = car.floor
  const sp = car.sidepod

  return (
    <div className="page">
      <div className="page-header">
        <h1>Parametric 3D model</h1>
        <p>Every surface is generated from the design parameters. Click a wing element in the viewport to edit it; orange elements are active (they rotate in X-mode).</p>
      </div>
      <div className="grid side-wide">
        <div>
          <div className="viewer3d">
            <Canvas shadows camera={{ position: [5.2, 2.2, 4.4], fov: 40 }} dpr={[1, 2]} onPointerMissed={() => setSelected(null)}>
              <Suspense fallback={null}>
                <hemisphereLight intensity={0.6} color="#dfe8ff" groundColor="#222" />
                <directionalLight position={[6, 8, 4]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
                <directionalLight position={[-6, 4, -4]} intensity={0.5} />
                <group position={[1.7, 0, 0]}>
                  <CarScene car={car} selected={selected} onSelect={onSelect} view={view} />
                </group>
                <ContactShadows position={[0, 0.001, 0]} opacity={0.6} scale={12} blur={2} far={2} />
                <Grid args={[20, 20]} cellSize={0.5} sectionSize={2} cellColor="#243040" sectionColor="#34465c" fadeDistance={18} infiniteGrid position={[0, 0, 0]} />
                <OrbitControls makeDefault target={[0, 0.35, 0]} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={1.5} maxDistance={20} />
              </Suspense>
            </Canvas>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="small muted">View</span>
            <button className={`btn small ${view.wireframe ? 'active' : ''}`} onClick={() => setView({ ...view, wireframe: !view.wireframe })}>
              Wireframe
            </button>
            <button className={`btn small ${view.xray ? 'active' : ''}`} onClick={() => setView({ ...view, xray: !view.xray })}>
              X-ray
            </button>
            <button className={`btn small ${view.showBody ? 'active' : ''}`} onClick={() => setView({ ...view, showBody: !view.showBody })}>
              Body
            </button>
            <button className={`btn small ${view.showFloor ? 'active' : ''}`} onClick={() => setView({ ...view, showFloor: !view.showFloor })}>
              Floor
            </button>
            <button className={`btn small ${view.showTyres ? 'active' : ''}`} onClick={() => setView({ ...view, showTyres: !view.showTyres })}>
              Wheels
            </button>
            <span className="spacer" style={{ flex: 1 }} />
            <span className="small muted">Active aero</span>
            <Toggle value={car.aeroMode} options={[{ value: 'Z', label: 'Z-mode' }, { value: 'X', label: 'X-mode' }]} onChange={(v) => updateCar({ aeroMode: v })} />
          </div>
          <div className="legend" style={{ marginTop: 8 }}>
            <span><span className="sw" style={{ background: '#c9ccd1' }} />fixed element</span>
            <span><span className="sw" style={{ background: '#d95926' }} />active element</span>
            <span><span className="sw" style={{ background: '#3987e5' }} />selected</span>
            <span><span className="sw" style={{ background: '#199e70' }} />custom part</span>
          </div>
        </div>

        <div>
          <div className="tabs" style={{ flexWrap: 'wrap' }}>
            {(
              [
                ['frontWing', 'Front wing'],
                ['rearWing', 'Rear wing'],
                ['chassis', 'Chassis'],
                ['floor', 'Floor'],
                ['body', 'Body'],
                ['mass', 'Mass & tyres'],
                ['export', 'Export'],
              ] as [Section, string][]
            ).map(([id, label]) => (
              <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
                {label}
              </button>
            ))}
          </div>

          {(section === 'frontWing' || section === 'rearWing') && (
            <Panel title={`${section === 'frontWing' ? 'Front' : 'Rear'} wing elements`} right={<span className="row"><SaveComponentButton kind={wingKey} /><button className="btn small" onClick={() => addElement(wingKey)} disabled={wing.elements.length >= 3}>+ element</button></span>}>
              <div className="list" style={{ marginBottom: 10 }}>
                {wing.elements.map((e, i) => (
                  <div key={e.id} className={`item row ${selectedEl?.id === e.id ? 'selected' : ''}`} style={{ justifyContent: 'space-between' }} onClick={() => setSelected(e.id)}>
                    <span>
                      <span className="muted mono small">{i + 1} </span>
                      {e.name} <span className="muted small">{e.angle}° · {e.chord} mm</span>
                    </span>
                    <span className="row" style={{ gap: 4 }}>
                      <button className="btn small" onClick={(ev) => { ev.stopPropagation(); moveElement(wingKey, e.id, -1) }}>↑</button>
                      <button className="btn small" onClick={(ev) => { ev.stopPropagation(); moveElement(wingKey, e.id, 1) }}>↓</button>
                      <button className="btn small danger" onClick={(ev) => { ev.stopPropagation(); removeElement(wingKey, e.id) }} disabled={wing.elements.length <= 1}>✕</button>
                    </span>
                  </div>
                ))}
              </div>
              {selectedEl && <ElementEditor el={selectedEl} onChange={(p) => setElement(wingKey, selectedEl.id, p)} />}
              <h3 style={{ marginTop: 12 }}>Endplate</h3>
              <Slider label="Height" value={wing.endplate.height} min={50} max={800} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, [wingKey]: { ...cc[wingKey], endplate: { ...cc[wingKey].endplate, height: v } } }))} />
              <Slider label="Length" value={wing.endplate.length} min={100} max={1000} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, [wingKey]: { ...cc[wingKey], endplate: { ...cc[wingKey].endplate, length: v } } }))} />
              <Slider label="Cant" value={wing.endplate.cant} min={-15} max={25} step={0.5} unit="°" decimals={1} onChange={(v) => setCar((cc) => ({ ...cc, [wingKey]: { ...cc[wingKey], endplate: { ...cc[wingKey].endplate, cant: v } } }))} />
              {section === 'rearWing' && <Slider label="Pylon spacing" value={car.rearWing.pylonSpacing} min={0} max={700} step={10} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, rearWing: { ...cc.rearWing, pylonSpacing: v } }))} />}
            </Panel>
          )}

          {section === 'chassis' && (
            <Panel title="Chassis" right={<SaveComponentButton kind="setup" />}>
              <Slider label="Wheelbase" value={c.wheelbase} min={2800} max={3700} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, chassis: { ...cc.chassis, wheelbase: v } }))} />
              <Slider label="Front track" value={c.frontTrack} min={1300} max={1700} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, chassis: { ...cc.chassis, frontTrack: v } }))} />
              <Slider label="Rear track" value={c.rearTrack} min={1300} max={1700} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, chassis: { ...cc.chassis, rearTrack: v } }))} />
              <Slider label="Bodywork width" value={c.width} min={1400} max={2100} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, chassis: { ...cc.chassis, width: v } }))} />
              <Slider label="Nose tip x" value={c.noseTipX} min={-1400} max={-600} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, chassis: { ...cc.chassis, noseTipX: v } }))} />
              <Slider label="Nose tip height" value={c.noseTipZ} min={100} max={400} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, chassis: { ...cc.chassis, noseTipZ: v } }))} />
              <Slider label="Engine cover height" value={c.engineCoverHeight} min={700} max={1000} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, chassis: { ...cc.chassis, engineCoverHeight: v } }))} />
              <Slider label="Front ride height" value={c.rideHeightFront} min={5} max={80} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, chassis: { ...cc.chassis, rideHeightFront: v } }))} />
              <Slider label="Rear ride height" value={c.rideHeightRear} min={10} max={120} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, chassis: { ...cc.chassis, rideHeightRear: v } }))} />
            </Panel>
          )}

          {section === 'floor' && (
            <Panel title="Floor and diffuser" right={<SaveComponentButton kind="floor" />}>
              <Slider label="Floor start x" value={f.startX} min={200} max={900} step={10} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, floor: { ...cc.floor, startX: v } }))} />
              <Slider label="Floor length" value={f.length} min={2000} max={3800} step={10} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, floor: { ...cc.floor, length: v } }))} />
              <Slider label="Floor width" value={f.width} min={1000} max={1700} step={10} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, floor: { ...cc.floor, width: v } }))} />
              <Slider label="Floor edge height" value={f.edgeHeight} min={10} max={120} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, floor: { ...cc.floor, edgeHeight: v } }))} />
              <Slider label="Tunnel inlet height" value={f.tunnelInletHeight} min={40} max={250} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, floor: { ...cc.floor, tunnelInletHeight: v } }))} />
              <Slider label="Diffuser angle" value={f.diffuserAngle} min={2} max={22} step={0.5} unit="°" decimals={1} onChange={(v) => setCar((cc) => ({ ...cc, floor: { ...cc.floor, diffuserAngle: v } }))} />
              <Slider label="Diffuser length" value={f.diffuserLength} min={400} max={1500} step={10} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, floor: { ...cc.floor, diffuserLength: v } }))} />
              <Slider label="Diffuser exit height" value={f.diffuserExitHeight} min={100} max={450} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, floor: { ...cc.floor, diffuserExitHeight: v } }))} />
              <Slider label="Plank thickness" value={f.plankThickness} min={8} max={12} step={0.1} unit="mm" decimals={1} onChange={(v) => setCar((cc) => ({ ...cc, floor: { ...cc.floor, plankThickness: v } }))} />
            </Panel>
          )}

          {section === 'body' && (
            <Panel title="Sidepods and cooling" right={<SaveComponentButton kind="sidepod" />}>
              <Slider label="Sidepod start x" value={sp.startX} min={800} max={1800} step={10} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, sidepod: { ...cc.sidepod, startX: v } }))} />
              <Slider label="Sidepod length" value={sp.length} min={1000} max={2600} step={10} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, sidepod: { ...cc.sidepod, length: v } }))} />
              <Slider label="Sidepod width" value={sp.width} min={250} max={700} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, sidepod: { ...cc.sidepod, width: v } }))} />
              <Slider label="Sidepod height" value={sp.height} min={300} max={700} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, sidepod: { ...cc.sidepod, height: v } }))} />
              <Slider label="Undercut depth" value={sp.undercut} min={0} max={300} step={5} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, sidepod: { ...cc.sidepod, undercut: v } }))} />
              <Slider label="Inlet area (both sides)" value={sp.inletArea} min={20000} max={90000} step={1000} unit="mm²" onChange={(v) => setCar((cc) => ({ ...cc, sidepod: { ...cc.sidepod, inletArea: v } }))} />
              <p className="help">Inlet area trades cooling capacity for drag: each 10 000 mm² adds roughly 0.006 m² of CdA in the solver.</p>
            </Panel>
          )}

          {section === 'mass' && (
            <Panel title="Mass and tyres">
              <Slider label="Mass with driver, no fuel" value={car.mass.mass} min={700} max={850} step={0.5} unit="kg" decimals={1} onChange={(v) => setCar((cc) => ({ ...cc, mass: { ...cc.mass, mass: v } }))} />
              <Slider label="Front mass balance" value={car.mass.frontBalance} min={40} max={52} step={0.1} unit="%" decimals={1} onChange={(v) => setCar((cc) => ({ ...cc, mass: { ...cc.mass, frontBalance: v } }))} />
              <Slider label="CG height" value={car.mass.cgHeight} min={200} max={450} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, mass: { ...cc.mass, cgHeight: v } }))} />
              <Slider label="Tyre diameter" value={car.tyres.diameter} min={650} max={760} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, tyres: { ...cc.tyres, diameter: v } }))} />
              <Slider label="Front tyre width" value={car.tyres.frontWidth} min={240} max={320} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, tyres: { ...cc.tyres, frontWidth: v } }))} />
              <Slider label="Rear tyre width" value={car.tyres.rearWidth} min={330} max={420} unit="mm" onChange={(v) => setCar((cc) => ({ ...cc, tyres: { ...cc.tyres, rearWidth: v } }))} />
              <p className="help">Tyre dimensions are a supplier specification, so the compliance check flags any deviation from 280 / 375 mm.</p>
            </Panel>
          )}

          {section === 'export' && (
            <Panel title="Export the model">
              <p className="small muted">Geometry is exported in metres with the car facing −X, Y up (STL has no units; most CAD tools read it as mm — scale by 1000 if needed).</p>
              <div className="row">
                <button className="btn primary" onClick={() => exportSTL(car)}>STL (binary)</button>
                <button className="btn" onClick={() => exportOBJ(car)}>OBJ</button>
                <button className="btn" onClick={() => exportGLB(car)}>GLB</button>
                <button className="btn" onClick={() => exportJSON(car)}>Design JSON</button>
              </div>
              <p className="help">The STL is a watertight-enough starting point for a CFD meshing tool; wing elements, floor and body are separate solids inside one file.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
