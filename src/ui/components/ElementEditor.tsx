import type { WingElement, Profile } from '../../model/types'
import { Slider } from './controls'
import { ProfilePreview } from './ProfilePreview'

export function ElementEditor({ el, onChange, showPlacement = true }: { el: WingElement; onChange: (patch: Partial<WingElement>) => void; showPlacement?: boolean }) {
  const prof = el.profile
  const setProfile = (p: Partial<Profile>) => onChange({ profile: { ...prof, ...p } as Profile })
  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <input className="txt" value={el.name} onChange={(e) => onChange({ name: e.target.value })} style={{ flex: 1 }} />
        <label className="small row" style={{ gap: 4 }}>
          <input type="checkbox" checked={el.active} onChange={(e) => onChange({ active: e.target.checked })} /> active (X-mode)
        </label>
      </div>
      <ProfilePreview profile={prof} angle={el.angle} />
      {prof.kind === 'naca4' ? (
        <>
          <Slider label="Camber (NACA m)" value={prof.m} min={0} max={9} step={0.5} unit="%" onChange={(v) => setProfile({ m: v })} decimals={1} />
          <Slider label="Camber position (NACA p)" value={prof.p} min={1} max={9} step={0.5} unit="/10" onChange={(v) => setProfile({ p: v })} decimals={1} />
          <Slider label="Thickness (NACA t)" value={prof.t} min={4} max={30} step={0.5} unit="%" onChange={(v) => setProfile({ t: v })} decimals={1} />
        </>
      ) : (
        <p className="help">Custom profile with {prof.points.length} points. Edit it in the Parts Designer.</p>
      )}
      <Slider label="Incidence (Z-mode)" value={el.angle} min={-10} max={45} step={0.5} unit="°" onChange={(v) => onChange({ angle: v })} decimals={1} />
      {el.active && <Slider label="Incidence (X-mode)" value={el.xModeAngle} min={-10} max={45} step={0.5} unit="°" onChange={(v) => onChange({ xModeAngle: v })} decimals={1} />}
      <Slider label="Root chord" value={el.chord} min={40} max={700} step={5} unit="mm" onChange={(v) => onChange({ chord: v })} />
      <Slider label="Tip chord" value={el.tipChord} min={40} max={700} step={5} unit="mm" onChange={(v) => onChange({ tipChord: v })} />
      <Slider label="Span (tip to tip)" value={el.span} min={100} max={2000} step={10} unit="mm" onChange={(v) => onChange({ span: v })} />
      <Slider label="Inboard start (from centreline)" value={el.spanStart} min={0} max={900} step={10} unit="mm" onChange={(v) => onChange({ spanStart: v })} />
      {showPlacement && (
        <>
          <Slider label="Leading edge x (rearward +)" value={el.x} min={-1300} max={4600} step={5} unit="mm" onChange={(v) => onChange({ x: v })} />
          <Slider label="Leading edge z (height)" value={el.z} min={0} max={1000} step={5} unit="mm" onChange={(v) => onChange({ z: v })} />
        </>
      )}
      <Slider label="Dihedral" value={el.dihedral} min={-15} max={25} step={0.5} unit="°" onChange={(v) => onChange({ dihedral: v })} decimals={1} />
      <Slider label="Sweep" value={el.sweep} min={-20} max={35} step={0.5} unit="°" onChange={(v) => onChange({ sweep: v })} decimals={1} />
      <Slider label="Skin thickness (flex test)" value={el.skinThickness} min={0.8} max={6} step={0.1} unit="mm" onChange={(v) => onChange({ skinThickness: v })} decimals={1} />
    </div>
  )
}
