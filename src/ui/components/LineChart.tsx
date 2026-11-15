import { useMemo, useRef, useState } from 'react'

export interface Series {
  name: string
  color: string
  values: number[]
  unit?: string
}

interface Props {
  x: number[]
  series: Series[]
  xLabel: string
  yLabel: string
  height?: number
  /** vertical marker, e.g. the current operating point */
  marker?: number
  yFormat?: (v: number) => string
}

/**
 * Minimal SVG line chart: single y axis, recessive grid, crosshair tooltip, legend for ≥ 2 series.
 */
export function LineChart({ x, series, xLabel, yLabel, height = 220, marker, yFormat }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const H = height
  const pad = { l: 56, r: 16, t: 12, b: 34 }
  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const xs = x
    let yMin = Infinity
    let yMax = -Infinity
    series.forEach((s) => s.values.forEach((v) => {
      if (Number.isFinite(v)) {
        yMin = Math.min(yMin, v)
        yMax = Math.max(yMax, v)
      }
    }))
    if (yMin === yMax) {
      yMin -= 1
      yMax += 1
    }
    const padY = (yMax - yMin) * 0.08
    return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: yMin - padY, yMax: yMax + padY }
  }, [x, series])
  const sx = (v: number) => pad.l + ((v - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r)
  const sy = (v: number) => H - pad.b - ((v - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b)
  const fmt = yFormat ?? ((v: number) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(Math.abs(v) < 10 ? 2 : 0)))
  const yTicks = 5
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks)
  const xTicks = Array.from({ length: 6 }, (_, i) => xMin + ((xMax - xMin) * i) / 5)

  const onMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const v = xMin + ((px - pad.l) / (W - pad.l - pad.r)) * (xMax - xMin)
    let best = 0
    let bd = Infinity
    x.forEach((xv, i) => {
      const d = Math.abs(xv - v)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    setHover(best)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="#2a333f" strokeWidth={1} />
            <text x={pad.l - 8} y={sy(t) + 4} fontSize={10} fill="#6f7a88" textAnchor="end" fontFamily="ui-monospace, monospace">
              {fmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={sx(t)} y={H - pad.b + 16} fontSize={10} fill="#6f7a88" textAnchor="middle" fontFamily="ui-monospace, monospace">
            {t.toFixed(0)}
          </text>
        ))}
        <text x={(pad.l + W - pad.r) / 2} y={H - 4} fontSize={10} fill="#a7b0bc" textAnchor="middle">
          {xLabel}
        </text>
        <text x={12} y={pad.t + 2} fontSize={10} fill="#a7b0bc" transform={`rotate(-90 12 ${pad.t + 2})`} textAnchor="end">
          {yLabel}
        </text>
        {marker !== undefined && marker >= xMin && marker <= xMax && <line x1={sx(marker)} x2={sx(marker)} y1={pad.t} y2={H - pad.b} stroke="#6f7a88" strokeDasharray="3 3" />}
        {series.map((s) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" points={x.map((xv, i) => `${sx(xv)},${sy(s.values[i])}`).join(' ')} />
        ))}
        {hover !== null && (
          <g>
            <line x1={sx(x[hover])} x2={sx(x[hover])} y1={pad.t} y2={H - pad.b} stroke="#a7b0bc" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.name} cx={sx(x[hover])} cy={sy(s.values[hover])} r={4} fill={s.color} stroke="#1a2029" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${(sx(x[hover]) / W) * 100}%`, top: 6, transform: sx(x[hover]) > W * 0.7 ? 'translateX(-105%)' : 'translateX(8px)' }}>
          <div style={{ color: '#a7b0bc' }}>
            {xLabel}: {x[hover]}
          </div>
          {series.map((s) => (
            <div key={s.name}>
              <span style={{ color: s.color }}>●</span> {s.name}: {fmt(s.values[hover])}
              {s.unit ?? ''}
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend" style={{ marginTop: 4 }}>
          {series.map((s) => (
            <span key={s.name}>
              <span className="sw" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
