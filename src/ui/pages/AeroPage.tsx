import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { computeAero, speedSweep, rideHeightSweep, flapSweep } from '../../sim/aero'
import { TRACKS, atmosphereFromTrack, isaPressurePa, isaTemperatureC } from '../../sim/atmosphere'
import { Panel, Slider, Stat, Toggle, fmt, fmtSci } from '../components/controls'
import { LineChart } from '../components/LineChart'

export function AeroPage() {
  const car = useAppStore((s) => s.car)
  const atm = useAppStore((s) => s.atmosphere)
  const setAtm = useAppStore((s) => s.setAtmosphere)
  const speed = useAppStore((s) => s.speedKMH)
  const setSpeed = useAppStore((s) => s.setSpeed)
  const updateCar = useAppStore((s) => s.updateCar)
  const [sweepWing, setSweepWing] = useState<'frontWing' | 'rearWing'>('frontWing')
  const [sweepEl, setSweepEl] = useState(1)

  const aero = useMemo(() => computeAero(car, atm, speed), [car, atm, speed])
  const sSweep = useMemo(() => speedSweep(car, atm), [car, atm])
  const hSweep = useMemo(() => rideHeightSweep(car, atm, speed), [car, atm, speed])
  const elIndex = Math.min(sweepEl, car[sweepWing].elements.length - 1)
  const fSweep = useMemo(() => flapSweep(car, atm, speed, sweepWing, elIndex), [car, atm, speed, sweepWing, elIndex])

  const isaDiff = atm.useISA ? isaPressurePa(atm.elevation) / 100 : atm.pressureHPa

  return (
    <div className="page">
      <div className="page-header">
        <h1>Aerodynamic simulation</h1>
        <p>Whole-car aero map from a component-based solver: thin-airfoil and lifting-line wing theory with ground-effect and multi-element corrections, a venturi floor model, and a body/wheel drag build-up. Change the atmosphere and watch every number move.</p>
      </div>

      <div className="grid side-wide">
        <div className="grid" style={{ gap: 16 }}>
          <div className="stats-row">
            <Panel>
              <Stat label="Downforce" value={fmt(aero.totalDownforceN)} unit="N" sub={`${(aero.totalDownforceN / (car.mass.mass * 9.81)).toFixed(2)} × car weight`} />
            </Panel>
            <Panel>
              <Stat label="Drag" value={fmt(aero.totalDragN)} unit="N" sub={`${aero.powerRequiredKW.toFixed(0)} kW at ${speed} km/h`} />
            </Panel>
            <Panel>
              <Stat label="L/D" value={aero.efficiency.toFixed(2)} sub={`ClA ${aero.clA.toFixed(2)} · CdA ${aero.cdA.toFixed(2)}`} />
            </Panel>
            <Panel>
              <Stat label="Balance" value={aero.frontAeroBalance.toFixed(1)} unit="% F" sub={`F ${fmt(aero.frontAxleLoadN / 9.81)} kg · R ${fmt(aero.rearAxleLoadN / 9.81)} kg`} />
            </Panel>
            <Panel>
              <Stat label="Top speed" value={fmt(aero.topSpeedKMH)} unit="km/h" sub={`${aero.corneringG100m.toFixed(2)} g in a 100 m corner`} />
            </Panel>
          </div>

          <Panel title="Air properties at the operating point">
            <div className="stats-row">
              <Stat label="Density" value={aero.air.density.toFixed(4)} unit="kg/m³" sub={`${((aero.air.densityRatio - 1) * 100).toFixed(1)} % vs ISA sea level`} />
              <Stat label="Dynamic pressure" value={fmt(aero.dynamicPressure)} unit="Pa" sub={`${(aero.speedMS).toFixed(1)} m/s airspeed`} />
              <Stat label="Viscosity" value={(aero.air.viscosity * 1e5).toFixed(3)} unit="×10⁻⁵ Pa·s" sub={`ν ${(aero.air.kinematicViscosity * 1e5).toFixed(3)} ×10⁻⁵ m²/s`} />
              <Stat label="Re (front wing chord)" value={fmtSci(aero.reynoldsFrontWing)} sub={`Re car ${fmtSci(aero.reynoldsCar)}`} />
              <Stat label="Mach" value={aero.mach.toFixed(3)} sub={`a = ${aero.air.speedOfSound.toFixed(1)} m/s`} />
              <Stat label="Station pressure" value={fmt(isaDiff, 1)} unit="hPa" sub={`vapour ${(aero.air.vapourPressurePa / 100).toFixed(1)} hPa`} />
            </div>
          </Panel>

          <div className="grid cols-2">
            <Panel title="Speed sweep">
              <LineChart x={sSweep.map((p) => p.x)} xLabel="speed km/h" yLabel="force N" marker={speed} series={[
                { name: 'Downforce', color: 'var(--series-1)', values: sSweep.map((p) => p.downforce), unit: ' N' },
                { name: 'Drag', color: 'var(--series-2)', values: sSweep.map((p) => p.drag), unit: ' N' },
              ]} />
            </Panel>
            <Panel title="Ride-height sweep (rear, front = 0.6 × rear)">
              <LineChart x={hSweep.map((p) => p.x)} xLabel="rear ride height mm" yLabel="force N" marker={car.chassis.rideHeightRear} series={[
                { name: 'Downforce', color: 'var(--series-1)', values: hSweep.map((p) => p.downforce), unit: ' N' },
                { name: 'Drag', color: 'var(--series-2)', values: hSweep.map((p) => p.drag), unit: ' N' },
              ]} />
            </Panel>
            <Panel title="Aero balance vs ride height">
              <LineChart x={hSweep.map((p) => p.x)} xLabel="rear ride height mm" yLabel="% front" marker={car.chassis.rideHeightRear} series={[{ name: 'Front balance', color: 'var(--series-3)', values: hSweep.map((p) => p.balance), unit: ' %' }]} />
            </Panel>
            <Panel
              title="Flap angle sweep"
              right={
                <span className="row">
                  <select className="sel" value={sweepWing} onChange={(e) => setSweepWing(e.target.value as 'frontWing' | 'rearWing')}>
                    <option value="frontWing">Front wing</option>
                    <option value="rearWing">Rear wing</option>
                  </select>
                  <select className="sel" value={elIndex} onChange={(e) => setSweepEl(parseInt(e.target.value))}>
                    {car[sweepWing].elements.map((e, i) => (
                      <option key={e.id} value={i}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </span>
              }
            >
              <LineChart x={fSweep.map((p) => p.x)} xLabel="element incidence °" yLabel="force N" marker={car[sweepWing].elements[elIndex]?.angle} series={[
                { name: 'Downforce', color: 'var(--series-1)', values: fSweep.map((p) => p.downforce), unit: ' N' },
                { name: 'Drag', color: 'var(--series-2)', values: fSweep.map((p) => p.drag), unit: ' N' },
              ]} />
            </Panel>
          </div>

          <Panel title="Component breakdown">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Component</th>
                  <th style={{ textAlign: 'right' }}>Downforce N</th>
                  <th style={{ textAlign: 'right' }}>Share</th>
                  <th style={{ textAlign: 'right' }}>Drag N</th>
                  <th style={{ textAlign: 'right' }}>L/D</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {aero.components.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="num">{fmt(c.downforceN)}</td>
                    <td className="num">{aero.totalDownforceN ? ((c.downforceN / aero.totalDownforceN) * 100).toFixed(0) : '—'} %</td>
                    <td className="num">{fmt(c.dragN)}</td>
                    <td className="num">{c.dragN ? (c.downforceN / c.dragN).toFixed(2) : '—'}</td>
                    <td className="small" style={{ color: 'var(--warn)' }}>{c.notes.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
          <Panel title="Operating point">
            <Slider label="Speed" value={speed} min={50} max={360} step={5} unit="km/h" onChange={setSpeed} />
            <div className="row" style={{ marginTop: 6 }}>
              <span className="small muted">Active aero</span>
              <Toggle value={car.aeroMode} options={[{ value: 'Z', label: 'Z-mode' }, { value: 'X', label: 'X-mode' }]} onChange={(v) => updateCar({ aeroMode: v })} />
            </div>
          </Panel>
          <Panel title="Atmosphere">
            <select
              className="sel"
              style={{ width: '100%', marginBottom: 8 }}
              value=""
              onChange={(e) => {
                const t = TRACKS.find((x) => x.id === e.target.value)
                if (t) setAtm(atmosphereFromTrack(t))
              }}
            >
              <option value="">Load a circuit preset…</option>
              {TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.elevation} m)
                </option>
              ))}
            </select>
            <Slider label="Air temperature" value={atm.temperatureC} min={-10} max={50} step={0.5} unit="°C" decimals={1} onChange={(v) => setAtm({ temperatureC: v })} />
            <Slider label="Relative humidity" value={atm.humidity} min={0} max={100} unit="%" onChange={(v) => setAtm({ humidity: v })} />
            <Slider label="Elevation" value={atm.elevation} min={-50} max={3000} step={10} unit="m" onChange={(v) => setAtm({ elevation: v, ...(atm.useISA ? {} : {}) })} />
            <div className="row" style={{ margin: '4px 0' }}>
              <label className="small row" style={{ gap: 6 }}>
                <input type="checkbox" checked={atm.useISA} onChange={(e) => setAtm({ useISA: e.target.checked, ...(e.target.checked ? { temperatureC: isaTemperatureC(atm.elevation) } : {}) })} />
                derive pressure from elevation (ISA)
              </label>
            </div>
            {!atm.useISA && <Slider label="Station pressure" value={atm.pressureHPa} min={700} max={1060} step={0.5} unit="hPa" decimals={1} onChange={(v) => setAtm({ pressureHPa: v })} />}
            <Slider label="Head wind (+) / tail wind (−)" value={atm.windMS} min={-15} max={15} step={0.5} unit="m/s" decimals={1} onChange={(v) => setAtm({ windMS: v })} />
            <p className="help">Density uses the humid-air equation of state (dry air + water vapour partial pressures); viscosity follows Sutherland's law.</p>
          </Panel>
          {aero.warnings.length > 0 && (
            <Panel title="Warnings">
              <ul className="warnlist">
                {aero.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Model fidelity">
            <p className="small muted" style={{ margin: 0 }}>
              This solver is a calibrated aero map for design trade-offs, not CFD: expect ±15 % on absolute loads, with trends (speed, density, ride height, flap angle, mode) being the reliable part. Use the Wind Tunnel tab for a flow-resolving 2-D section solve.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
