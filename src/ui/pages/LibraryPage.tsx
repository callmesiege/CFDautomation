import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { COMPONENT_KIND_LABEL, describeComponent, type ComponentKind, type SavedComponent } from '../../model/types'
import { CIRCUITS, circuitStats, findCircuit, typicalWeather, type Weather } from '../../sim/circuits'
import { runAdvisor, suitabilityMatrix, type AdvisorReport } from '../../sim/advisor'
import { weatherToAtmosphere } from '../../sim/lapsim'
import { Panel, Slider, Toggle, Badge, fmt } from '../components/controls'
import { LineChart } from '../components/LineChart'

const KINDS: ComponentKind[] = ['frontWing', 'rearWing', 'floor', 'sidepod', 'setup']

function fmtDelta(d: number): string {
  if (Math.abs(d) < 0.005) return '±0.00 s'
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} s`
}

function lapStr(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

export function LibraryPage() {
  const car = useAppStore((s) => s.car)
  const components = useAppStore((s) => s.components)
  const seeded = useAppStore((s) => s.componentsSeeded)
  const seed = useAppStore((s) => s.seedStarterComponents)
  const saveComponent = useAppStore((s) => s.saveComponent)
  const updateComponent = useAppStore((s) => s.updateComponent)
  const overwriteComponent = useAppStore((s) => s.overwriteComponent)
  const applyComponent = useAppStore((s) => s.applyComponent)
  const deleteComponent = useAppStore((s) => s.deleteComponent)
  const duplicateComponent = useAppStore((s) => s.duplicateComponent)
  const importComponents = useAppStore((s) => s.importComponents)
  const library = useAppStore((s) => s.library)
  const mountPart = useAppStore((s) => s.mountPart)
  const advisor = useAppStore((s) => s.advisor)
  const setAdvisor = useAppStore((s) => s.setAdvisor)
  const importCar = useAppStore((s) => s.importCar)
  const setAtmosphere = useAppStore((s) => s.setAtmosphere)
  const setTab = useAppStore((s) => s.setTab)

  const [filter, setFilter] = useState<ComponentKind | 'all'>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [report, setReport] = useState<AdvisorReport | null>(null)
  const [matrix, setMatrix] = useState<ReturnType<typeof suitabilityMatrix> | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'advisor' | 'matrix'>('advisor')

  useEffect(() => {
    if (!seeded && components.length === 0) seed()
  }, [seeded, components.length, seed])

  const circuit = findCircuit(advisor.circuitId)
  const weather: Weather = advisor.weather ?? typicalWeather(circuit)
  const stats = circuitStats(circuit)
  const setWeather = (patch: Partial<Weather>) => setAdvisor({ weather: { ...weather, ...patch } })

  const list = useMemo(() => components.filter((c) => filter === 'all' || c.kind === filter), [components, filter])
  const sel = components.find((c) => c.id === selected) ?? null

  const run = () => {
    setBusy(true)
    setTimeout(() => {
      setReport(runAdvisor(car, components, library, circuit, weather))
      setBusy(false)
    }, 10)
  }
  const runMatrix = () => {
    setBusy(true)
    setTimeout(() => {
      setMatrix(suitabilityMatrix(car, components, CIRCUITS, (c) => (c.id === circuit.id ? weather : typicalWeather(c))))
      setBusy(false)
    }, 10)
  }

  // invalidate when inputs change
  useEffect(() => setReport(null), [car, components, library, advisor.circuitId, advisor.weather])

  const exportLibrary = () => {
    const blob = new Blob([JSON.stringify({ components, parts: library }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'apex-component-library.json'
    a.click()
  }
  const importLibrary = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        const data = JSON.parse(await f.text())
        const items: SavedComponent[] = Array.isArray(data) ? data : data.components ?? []
        importComponents(items)
      } catch {
        alert('Could not read that library file.')
      }
    }
    input.click()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Component library &amp; track advisor</h1>
        <p>Save whole front wings, rear wings, floors, sidepod packages and setups from the current design, then let the advisor lap-simulate every combination at a circuit under chosen weather and tell you which components suit it and why.</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)' }}>
        {/* ---------------- library column ---------------- */}
        <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
          <Panel title="Library" right={`${components.length} components · ${library.length} parts`}>
            <div className="row" style={{ marginBottom: 8 }}>
              <select className="sel" value={filter} onChange={(e) => setFilter(e.target.value as ComponentKind | 'all')} style={{ flex: 1 }}>
                <option value="all">All kinds</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {COMPONENT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <select
                className="sel"
                value=""
                onChange={(e) => {
                  const kind = e.target.value as ComponentKind
                  if (!kind) return
                  const name = window.prompt(`Name for the current ${COMPONENT_KIND_LABEL[kind].toLowerCase()}:`)
                  if (name) {
                    const c = saveComponent(kind, name.trim())
                    setSelected(c.id)
                  }
                }}
              >
                <option value="">+ Save current…</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {COMPONENT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {list.map((c) => (
                <div key={c.id} className={`item ${selected === c.id ? 'selected' : ''}`} onClick={() => setSelected(c.id)}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      <span className="chip">{COMPONENT_KIND_LABEL[c.kind]}</span>
                      {c.name}
                    </span>
                    <button className="btn small" onClick={(e) => { e.stopPropagation(); applyComponent(c.id) }}>
                      Fit
                    </button>
                  </div>
                  <div className="muted small">{describeComponent(c)}</div>
                </div>
              ))}
              {list.length === 0 && <p className="muted small">Nothing here yet. Save a component from the 3D Model tab or with “Save current…”.</p>}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={exportLibrary}>Export library</button>
              <button className="btn small" onClick={importLibrary}>Import</button>
              <button className="btn small" onClick={seed}>Add starter set</button>
            </div>
          </Panel>

          {sel && (
            <Panel title="Component" right={<span className="muted">{new Date(sel.createdAt).toLocaleDateString()}</span>}>
              <input className="txt" style={{ width: '100%', marginBottom: 6 }} value={sel.name} onChange={(e) => updateComponent(sel.id, { name: e.target.value })} />
              <input className="txt" style={{ width: '100%', marginBottom: 6 }} placeholder="tags, comma separated" value={sel.tags.join(', ')} onChange={(e) => updateComponent(sel.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
              <textarea className="textarea" style={{ minHeight: 50 }} placeholder="Notes" value={sel.notes} onChange={(e) => updateComponent(sel.id, { notes: e.target.value })} />
              <p className="small muted">{describeComponent(sel)}</p>
              <div className="row">
                <button className="btn primary small" onClick={() => applyComponent(sel.id)}>Fit to car</button>
                <button className="btn small" onClick={() => { if (confirm(`Overwrite "${sel.name}" with the ${COMPONENT_KIND_LABEL[sel.kind].toLowerCase()} currently on the car?`)) overwriteComponent(sel.id) }}>Overwrite from car</button>
                <button className="btn small" onClick={() => duplicateComponent(sel.id)}>Duplicate</button>
                <button className="btn small danger" onClick={() => { if (confirm(`Delete "${sel.name}"?`)) { deleteComponent(sel.id); setSelected(null) } }}>Delete</button>
              </div>
            </Panel>
          )}
        </div>

        {/* ---------------- advisor column ---------------- */}
        <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
          <div className="grid cols-2">
            <Panel title="Circuit">
              <select className="sel" style={{ width: '100%' }} value={circuit.id} onChange={(e) => setAdvisor({ circuitId: e.target.value, weather: null })}>
                {CIRCUITS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.country}
                  </option>
                ))}
              </select>
              <p className="small muted" style={{ margin: '8px 0' }}>{circuit.character}</p>
              <div className="kv">
                <dt>Lap length</dt>
                <dd>{fmt(circuit.length)} m · 2025 reference {lapStr(circuit.referenceLapS)}</dd>
                <dt>Elevation</dt>
                <dd>{circuit.elevation} m</dd>
                <dt>Straights</dt>
                <dd>{(stats.straightShare * 100).toFixed(0)} % of lap · X-mode {(stats.xmodeShare * 100).toFixed(0)} % · longest {fmt(stats.longestStraight)} m</dd>
                <dt>Corners</dt>
                <dd>{stats.slow} slow · {stats.medium} medium · {stats.fast} fast</dd>
                <dt>Surface</dt>
                <dd>grip ×{circuit.surfaceGrip.toFixed(2)} · min rear ride height {circuit.minRideHeightRear} mm</dd>
              </div>
            </Panel>
            <Panel title="Weather" right={<button className="btn small" onClick={() => setAdvisor({ weather: null })}>Typical for this circuit</button>}>
              <div className="row" style={{ marginBottom: 4 }}>
                <span className="small muted">Track</span>
                <Toggle value={weather.condition} options={[{ value: 'dry', label: 'Dry' }, { value: 'damp', label: 'Damp' }, { value: 'wet', label: 'Wet' }]} onChange={(v) => setWeather({ condition: v })} />
              </div>
              <Slider label="Air temperature" value={weather.airTempC} min={0} max={45} step={0.5} unit="°C" decimals={1} onChange={(v) => setWeather({ airTempC: v })} />
              <Slider label="Track temperature" value={weather.trackTempC} min={5} max={65} step={0.5} unit="°C" decimals={1} onChange={(v) => setWeather({ trackTempC: v })} />
              <Slider label="Relative humidity" value={weather.humidity} min={0} max={100} unit="%" onChange={(v) => setWeather({ humidity: v })} />
              <Slider label="Head wind (+) / tail wind (−)" value={weather.windMS} min={-12} max={12} step={0.5} unit="m/s" decimals={1} onChange={(v) => setWeather({ windMS: v })} />
              <label className="small row" style={{ gap: 6, margin: '4px 0' }}>
                <input type="checkbox" checked={weather.pressureHPa !== null} onChange={(e) => setWeather({ pressureHPa: e.target.checked ? circuit.typical.pressureHPa : null })} />
                override station pressure (otherwise ISA at {circuit.elevation} m)
              </label>
              {weather.pressureHPa !== null && <Slider label="Station pressure" value={weather.pressureHPa} min={700} max={1060} step={0.5} unit="hPa" decimals={1} onChange={(v) => setWeather({ pressureHPa: v })} />}
            </Panel>
          </div>

          <div className="row">
            <button className="btn primary" onClick={run} disabled={busy}>
              {busy ? 'Simulating…' : `Advise for ${circuit.name}`}
            </button>
            <button className="btn" onClick={runMatrix} disabled={busy}>
              Suitability map (all circuits)
            </button>
            <button className="btn small" onClick={() => { setAtmosphere(weatherToAtmosphere(circuit, weather)); setTab('aero') }}>
              Send these conditions to Aero Simulation
            </button>
            {report && matrix && (
              <Toggle value={view} options={[{ value: 'advisor', label: 'Advisor' }, { value: 'matrix', label: 'Suitability map' }]} onChange={setView} />
            )}
          </div>

          {report && (view === 'advisor' || !matrix) && <AdvisorResults report={report} onApplyBest={() => importCar(report.best.car)} onMountPart={mountPart} />}

          {matrix && (view === 'matrix' || !report) && (
            <Panel title="Component suitability by circuit" right="best swap-in per slot vs the car as fitted · typical weather">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Circuit</th>
                    <th style={{ textAlign: 'right' }}>Lap (as fitted)</th>
                    {KINDS.map((k) => (
                      <th key={k}>{COMPONENT_KIND_LABEL[k]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row) => (
                    <tr key={row.circuit.id}>
                      <td>
                        {row.circuit.name}
                        <div className="muted small">{row.circuit.elevation} m · {row.circuit.typical.airTempC} °C</div>
                      </td>
                      <td className="num">{lapStr(row.lapTime)}</td>
                      {KINDS.map((k) => (
                        <td key={k}>
                          {row.best[k].name}
                          <div className="small" style={{ color: row.best[k].delta < 0 ? '#6fd36f' : 'var(--text-3)' }}>{fmtDelta(row.best[k].delta)}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {!report && !matrix && (
            <Panel title="How the advisor works">
              <p className="small muted" style={{ margin: 0 }}>
                A quasi-steady point-mass lap simulation drives the car around a representative profile of the circuit: corner speeds from the friction circle with downforce-dependent tyre load (with load sensitivity), acceleration limited by traction and by the 2026 power unit (400 kW ICE + 350 kW MGU-K with high-speed deployment taper), drag and downforce from the whole-car aero map in Z-mode, switching to X-mode in the designated zones. Weather sets air density (temperature, humidity, pressure or altitude), tyre grip (dry/damp/wet, track temperature) and cooling demand. Each library component is swapped in and lap-simulated; a coordinate-descent search then finds the quickest legal combination, and sensitivities explain whether the circuit is drag- or downforce-limited.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function WingPairMatrix({ report }: { report: AdvisorReport }) {
  const fws = Array.from(new Map(report.wingPairs.map((p) => [p.fw.id, p.fw])).values())
  const rws = Array.from(new Map(report.wingPairs.map((p) => [p.rw.id, p.rw])).values())
  if (fws.length < 2 && rws.length < 2) return null
  const best = report.wingPairs.filter((p) => p.legal).reduce((a, b) => (a && a.delta <= b.delta ? a : b), null as (typeof report.wingPairs)[number] | null)
  const find = (f: string, r: string) => report.wingPairs.find((p) => p.fw.id === f && p.rw.id === r)!
  return (
    <Panel title="Front × rear wing pairs" right="Δ lap vs as fitted · balance in brackets · other slots as fitted">
      <table className="tbl">
        <thead>
          <tr>
            <th>Front ↓ / Rear →</th>
            {rws.map((r) => (
              <th key={r.id}>{r.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fws.map((f) => (
            <tr key={f.id}>
              <td>{f.name}</td>
              {rws.map((r) => {
                const p = find(f.id, r.id)
                const isBest = best && p.fw.id === best.fw.id && p.rw.id === best.rw.id
                const outside = p.balance < 43 || p.balance > 48.5
                return (
                  <td key={r.id} className="num" style={{ color: !p.legal ? 'var(--text-3)' : p.delta < -0.005 ? '#6fd36f' : p.delta > 0.005 ? 'var(--bad)' : undefined, background: isBest ? 'rgba(12,163,12,0.12)' : undefined }} title={`ClA ${p.clA.toFixed(2)} · CdA ${p.cdA.toFixed(3)}`}>
                    {p.legal ? fmtDelta(p.delta) : 'illegal'} <span className="muted small">({p.balance.toFixed(0)} %{outside ? ' ⚠' : ''})</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help">⚠ marks pairs whose aero balance falls outside the 43–48.5 % front window; the simulator charges them a grip penalty.</p>
    </Panel>
  )
}

function AdvisorResults({ report, onApplyBest, onMountPart }: { report: AdvisorReport; onApplyBest: () => void; onMountPart: (id: string) => void }) {
  const { baseline, best, sensitivities: s } = report
  const traceX = baseline.trace.map((p) => p.s)
  const bestTrace = best.result.trace
  return (
    <>
      <Panel title={`Verdict — ${report.circuit.name}, ${report.weather.condition}, ${report.weather.airTempC} °C air / ${report.weather.trackTempC} °C track`}>
        <ul className="warnlist" style={{ fontSize: 13, color: 'var(--text)' }}>
          {report.headline.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
        <div className="stats-row" style={{ marginTop: 10 }}>
          <div className="stat">
            <span className="label">Lap as fitted</span>
            <span className="value">{lapStr(baseline.lapTime)}</span>
            <span className="sub">vmax {baseline.topSpeedKMH.toFixed(0)} km/h · full throttle {(baseline.fullThrottleShare * 100).toFixed(0)} %</span>
          </div>
          <div className="stat">
            <span className="label">Best combination</span>
            <span className="value" style={{ color: best.delta < -0.005 ? '#6fd36f' : undefined }}>{lapStr(best.result.lapTime)}</span>
            <span className="sub">{fmtDelta(best.delta)} · vmax {best.result.topSpeedKMH.toFixed(0)} km/h</span>
          </div>
          <div className="stat">
            <span className="label">1 % downforce</span>
            <span className="value">{s.perPctDownforce.toFixed(3)}<small>s</small></span>
            <span className="sub">1 % drag {s.perPctDrag > 0 ? '+' : ''}{s.perPctDrag.toFixed(3)} s</span>
          </div>
          <div className="stat">
            <span className="label">10 kg mass</span>
            <span className="value">{s.per10kg > 0 ? '+' : ''}{s.per10kg.toFixed(3)}<small>s</small></span>
            <span className="sub">1 % grip {s.perPctGrip.toFixed(3)} s</span>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {KINDS.map((k) => (
            <span key={k} className="chip" title={COMPONENT_KIND_LABEL[k]}>
              {COMPONENT_KIND_LABEL[k]}: <b>{best.choices[k].name}</b>
            </span>
          ))}
          {best.mountedParts.length > 0 && <span className="chip">Parts: <b>{best.mountedParts.length} mounted</b></span>}
          <button className="btn primary small" onClick={onApplyBest} disabled={best.delta > -0.005}>
            Fit best combination to car
          </button>
        </div>
      </Panel>

      <WingPairMatrix report={report} />

      <div className="grid cols-2">
        {report.slots.map((slot) => (
          <Panel key={slot.kind} title={slot.label} right={`${slot.rows.length} options · swap-in vs as fitted`}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Component</th>
                  <th style={{ textAlign: 'right' }}>Δ lap</th>
                  <th style={{ textAlign: 'right' }}>vmax</th>
                  <th style={{ textAlign: 'right' }}>ClA / CdA</th>
                </tr>
              </thead>
              <tbody>
                {slot.rows.map((r, i) => (
                  <tr key={r.option.id} style={{ opacity: r.legal ? 1 : 0.5 }}>
                    <td>
                      {i === 0 && r.legal && r.option.component && <Badge kind="pass">best</Badge>} {r.option.name}
                      {!r.legal && <Badge kind="fail">illegal</Badge>}
                      <div className="muted small">{r.reasons.join(' · ')}</div>
                    </td>
                    <td className="num" style={{ color: r.delta < -0.005 ? '#6fd36f' : r.delta > 0.005 ? 'var(--bad)' : undefined }}>{fmtDelta(r.delta)}</td>
                    <td className="num">{r.topSpeedKMH.toFixed(0)}</td>
                    <td className="num">{r.clA.toFixed(2)} / {r.cdA.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ))}
        {report.parts.length > 0 && (
          <Panel title="Custom parts" right="effect of mounting">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Δ lap if mounted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.parts.map((p) => (
                  <tr key={p.part.id}>
                    <td>{p.part.name}</td>
                    <td>{p.mountedNow ? <Badge kind="info">mounted</Badge> : <span className="muted small">not mounted</span>}{!p.legal && <Badge kind="fail">illegal</Badge>}</td>
                    <td className="num" style={{ color: p.deltaIfMounted < -0.005 ? '#6fd36f' : p.deltaIfMounted > 0.005 ? 'var(--bad)' : undefined }}>{fmtDelta(p.deltaIfMounted)}</td>
                    <td>{!p.mountedNow && p.legal && p.deltaIfMounted < 0 && <button className="btn small" onClick={() => onMountPart(p.part.id)}>Mount</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>

      <Panel title="Speed trace" right="as fitted vs best combination">
        <LineChart
          x={traceX}
          xLabel="distance m"
          yLabel="km/h"
          height={240}
          series={[
            { name: 'As fitted', color: 'var(--series-1)', values: baseline.trace.map((p) => p.v), unit: ' km/h' },
            { name: 'Best combination', color: 'var(--series-2)', values: traceX.map((_, i) => bestTrace[i]?.v ?? NaN), unit: ' km/h' },
          ]}
        />
      </Panel>
    </>
  )
}
