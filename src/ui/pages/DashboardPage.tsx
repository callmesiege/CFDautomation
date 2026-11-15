import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { computeAero } from '../../sim/aero'
import { runCompliance, summarize } from '../../regulations/compliance'
import { Panel, Stat, Badge, Slider, fmt } from '../components/controls'
import { exportJSON, importJSONFile } from '../../model/exporters'

export function DashboardPage() {
  const car = useAppStore((s) => s.car)
  const atm = useAppStore((s) => s.atmosphere)
  const speed = useAppStore((s) => s.speedKMH)
  const setSpeed = useAppStore((s) => s.setSpeed)
  const setCar = useAppStore((s) => s.setCar)
  const setTab = useAppStore((s) => s.setTab)
  const saved = useAppStore((s) => s.savedDesigns)
  const saveDesign = useAppStore((s) => s.saveDesign)
  const loadDesign = useAppStore((s) => s.loadDesign)
  const deleteDesign = useAppStore((s) => s.deleteDesign)
  const importCar = useAppStore((s) => s.importCar)
  const resetCar = useAppStore((s) => s.resetCar)
  const [name, setName] = useState(car.name)

  const aero = useMemo(() => computeAero(car, atm, speed), [car, atm, speed])
  const checks = useMemo(() => runCompliance(car), [car])
  const summary = summarize(checks)
  const problems = checks.filter((c) => c.status === 'fail' || c.status === 'warn').slice(0, 8)

  return (
    <div className="page">
      <div className="page-header">
        <h1>Design overview — {car.name}</h1>
        <p>Live aero estimate at {speed} km/h in the current atmosphere, legality status against the 2026 digest, and quick design levers.</p>
      </div>

      <div className="stats-row">
        <Panel>
          <Stat label="Downforce" value={fmt(aero.totalDownforceN)} unit="N" sub={`${fmt(aero.totalDownforceN / 9.81)} kg at ${speed} km/h`} />
        </Panel>
        <Panel>
          <Stat label="Drag" value={fmt(aero.totalDragN)} unit="N" sub={`${aero.powerRequiredKW.toFixed(0)} kW to hold speed`} />
        </Panel>
        <Panel>
          <Stat label="Efficiency L/D" value={aero.efficiency.toFixed(2)} sub={`ClA ${aero.clA.toFixed(2)} · CdA ${aero.cdA.toFixed(2)} m²`} />
        </Panel>
        <Panel>
          <Stat label="Aero balance" value={aero.frontAeroBalance.toFixed(1)} unit="% front" sub={`mass balance ${car.mass.frontBalance.toFixed(1)} %`} />
        </Panel>
        <Panel>
          <Stat label="Top speed" value={fmt(aero.topSpeedKMH)} unit="km/h" sub={`${car.aeroMode === 'X' ? 'X-mode' : 'Z-mode'} · ρ ${aero.air.density.toFixed(3)} kg/m³`} />
        </Panel>
        <Panel>
          <Stat label="Legality" value={summary.fail ? `${summary.fail} fail` : 'Legal'} sub={`${summary.pass} pass · ${summary.warn} warn`} />
        </Panel>
      </div>

      <div className="grid side">
        <div className="grid" style={{ gap: 16 }}>
          <Panel title="Issues to resolve" right={<button className="btn small" onClick={() => setTab('regulations')}>Full compliance report</button>}>
            {problems.length === 0 ? (
              <p className="muted">No failures or warnings. The design is inside every limit on file.</p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Check</th>
                    <th>Article</th>
                    <th>Measured</th>
                    <th>Limit</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((c) => (
                    <tr key={c.key}>
                      <td>
                        <Badge kind={c.status}>{c.status}</Badge>
                      </td>
                      <td>
                        {c.title}
                        <div className="muted small">{c.message}</div>
                      </td>
                      <td className="mono">{c.article}</td>
                      <td className="num">
                        {c.measured} {c.unit}
                      </td>
                      <td className="num">{c.limitText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Component loads">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Component</th>
                  <th style={{ textAlign: 'right' }}>Downforce N</th>
                  <th style={{ textAlign: 'right' }}>Drag N</th>
                  <th style={{ textAlign: 'right' }}>ClA m²</th>
                  <th style={{ textAlign: 'right' }}>CdA m²</th>
                  <th style={{ textAlign: 'right' }}>xCp mm</th>
                </tr>
              </thead>
              <tbody>
                {aero.components.map((c) => (
                  <tr key={c.name}>
                    <td>
                      {c.name}
                      {c.notes.length > 0 && <div className="small" style={{ color: 'var(--warn)' }}>{c.notes.join(' · ')}</div>}
                    </td>
                    <td className="num">{fmt(c.downforceN)}</td>
                    <td className="num">{fmt(c.dragN)}</td>
                    <td className="num">{c.clA.toFixed(3)}</td>
                    <td className="num">{c.cdA.toFixed(3)}</td>
                    <td className="num">{fmt(c.xCp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <Panel title="Quick levers">
            <Slider label="Speed" value={speed} min={50} max={360} step={5} unit="km/h" onChange={setSpeed} />
            <Slider label="Front ride height" value={car.chassis.rideHeightFront} min={5} max={80} unit="mm" onChange={(v) => setCar((c) => ({ ...c, chassis: { ...c.chassis, rideHeightFront: v } }))} />
            <Slider label="Rear ride height" value={car.chassis.rideHeightRear} min={10} max={120} unit="mm" onChange={(v) => setCar((c) => ({ ...c, chassis: { ...c.chassis, rideHeightRear: v } }))} />
            {car.frontWing.elements.slice(1).map((el) => (
              <Slider key={el.id} label={`Front ${el.name} angle`} value={el.angle} min={-5} max={45} step={0.5} unit="°" decimals={1} onChange={(v) => setCar((c) => ({ ...c, frontWing: { ...c.frontWing, elements: c.frontWing.elements.map((e) => (e.id === el.id ? { ...e, angle: v } : e)) } }))} />
            ))}
            {car.rearWing.elements.slice(1).map((el) => (
              <Slider key={el.id} label={`Rear ${el.name} angle`} value={el.angle} min={-5} max={45} step={0.5} unit="°" decimals={1} onChange={(v) => setCar((c) => ({ ...c, rearWing: { ...c.rearWing, elements: c.rearWing.elements.map((e) => (e.id === el.id ? { ...e, angle: v } : e)) } }))} />
            ))}
          </Panel>

          <Panel title="Design files">
            <div className="row" style={{ marginBottom: 8 }}>
              <input className="txt" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
              <button className="btn primary" onClick={() => saveDesign(name || car.name)}>
                Save snapshot
              </button>
            </div>
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="btn small" onClick={() => exportJSON(car)}>
                Export JSON
              </button>
              <button
                className="btn small"
                onClick={async () => {
                  const c = await importJSONFile()
                  if (c) importCar(c)
                }}
              >
                Import JSON
              </button>
              <button className="btn small danger" onClick={() => { if (confirm('Reset the current design to the default 2026 baseline?')) resetCar() }}>
                Reset to baseline
              </button>
            </div>
            {saved.length === 0 ? (
              <p className="muted small">No snapshots yet.</p>
            ) : (
              <div className="list">
                {saved.map((d) => (
                  <div key={d.id} className="item row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <div>{d.name}</div>
                      <div className="muted small">{new Date(d.savedAt).toLocaleString()}</div>
                    </div>
                    <div className="row">
                      <button className="btn small" onClick={() => loadDesign(d.id)}>
                        Load
                      </button>
                      <button className="btn small danger" onClick={() => deleteDesign(d.id)}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {aero.warnings.length > 0 && (
            <Panel title="Aero warnings">
              <ul className="warnlist">
                {aero.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
