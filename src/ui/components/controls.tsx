import type { ReactNode } from 'react'

export function Panel({ title, right, children, style }: { title?: string; right?: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <section className="panel" style={style}>
      {title && (
        <h3>
          {title}
          {right && <span className="right">{right}</span>}
        </h3>
      )}
      {children}
    </section>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  decimals,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
  decimals?: number
}) {
  const d = decimals ?? (step < 1 ? 2 : 0)
  return (
    <div className="slider">
      <label>{label}</label>
      <div className="val">
        <input
          type="number"
          value={Number(value.toFixed(d))}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v)) onChange(v)
          }}
        />{' '}
        <span className="muted">{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  )
}

export function Stat({ label, value, unit, sub }: { label: string; value: string | number; unit?: string; sub?: string }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  )
}

export function Badge({ kind, children }: { kind: 'pass' | 'warn' | 'fail' | 'info' | 'neutral'; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>
}

export function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="toggle">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function fmt(n: number, d = 0): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })
}

export function fmtSci(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const e = Math.floor(Math.log10(Math.abs(n)))
  const m = n / 10 ** e
  return `${m.toFixed(2)}×10^${e}`
}
