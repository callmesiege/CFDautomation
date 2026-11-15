import { useMemo } from 'react'
import type { Profile } from '../../model/types'
import { profilePoints } from '../../model/airfoil'

export function ProfilePreview({ profile, angle, height = 110 }: { profile: Profile; angle: number; height?: number }) {
  const path = useMemo(() => {
    const pts = profilePoints(profile)
    const a = (angle * Math.PI) / 180
    const c = Math.cos(a)
    const s = Math.sin(a)
    const W = 300
    const scale = W * 0.8
    const ox = W * 0.1
    const oy = height * 0.45
    return pts
      .map(([px, py]) => {
        const x = px * scale
        const z = -py * scale // inverted wing
        const xr = x * c - z * s
        const zr = x * s + z * c
        return `${(ox + xr).toFixed(1)},${(oy - zr).toFixed(1)}`
      })
      .join(' ')
  }, [profile, angle, height])
  return (
    <svg viewBox={`0 0 300 ${height}`} className="profile-preview" style={{ height }}>
      <line x1={0} x2={300} y1={height - 8} y2={height - 8} stroke="#3a4654" strokeDasharray="4 4" />
      <polygon points={path} fill="rgba(57,135,229,0.25)" stroke="#3987e5" strokeWidth={1.5} />
      <text x={6} y={14} fontSize={10} fill="#6f7a88" fontFamily="ui-monospace, monospace">
        flow →  incidence {angle.toFixed(1)}°
      </text>
    </svg>
  )
}
