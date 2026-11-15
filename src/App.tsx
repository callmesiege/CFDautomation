import { useMemo } from 'react'
import { useAppStore, type Tab } from './store/useAppStore'
import { runCompliance, summarize } from './regulations/compliance'
import { Badge } from './ui/components/controls'
import { DashboardPage } from './ui/pages/DashboardPage'
import { RegulationsPage } from './ui/pages/RegulationsPage'
import { ModelPage } from './ui/pages/ModelPage'
import { WindTunnelPage } from './ui/pages/WindTunnelPage'
import { AeroPage } from './ui/pages/AeroPage'
import { PartsPage } from './ui/pages/PartsPage'
import { LibraryPage } from './ui/pages/LibraryPage'

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { id: 'regulations', label: 'Regulations', icon: 'M6 2h9l5 5v15H6V2zm8 1.5V8h4.5M8 12h8M8 16h8' },
  { id: 'model', label: '3D Model', icon: 'M12 2l9 5v10l-9 5-9-5V7l9-5zm0 2.3L5 8l7 3.8L19 8l-7-3.7zM5 10v6l6 3.3v-6L5 10zm14 0l-6 3.3v6l6-3.3V10z' },
  { id: 'tunnel', label: 'Wind Tunnel', icon: 'M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h9a2 2 0 1 1-2 2' },
  { id: 'aero', label: 'Aero Simulation', icon: 'M3 17l5-6 4 3 4-7 5 4M3 21h18' },
  { id: 'parts', label: 'Parts Designer', icon: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4L15 12l-3-3 2.7-2.7z' },
  { id: 'library', label: 'Library & Track Advisor', icon: 'M4 4h6v16H4zM14 4h6v7h-6zM14 13h6v7h-6z' },
]

export default function App() {
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const car = useAppStore((s) => s.car)
  const toggleAeroMode = useAppStore((s) => s.toggleAeroMode)
  const summary = useMemo(() => summarize(runCompliance(car)), [car])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#101418" />
            <path d="M4 20h7l3-6h12l-2 4H16l-2 4h-5z" fill="#3987e5" />
            <circle cx="9" cy="23" r="2.5" fill="#e6e8eb" />
            <circle cx="24" cy="23" r="2.5" fill="#e6e8eb" />
          </svg>
          Apex Studio <small>F1 design workbench · 2026 regulations</small>
        </div>
        <div className="spacer" />
        <span className="muted small design-label">Design</span>
        <span className="mono">{car.name}</span>
        <button className={`btn small ${car.aeroMode === 'X' ? 'active' : ''}`} onClick={toggleAeroMode} title="Toggle active-aero mode">
          Aero: {car.aeroMode === 'Z' ? 'Z-mode (downforce)' : 'X-mode (low drag)'}
        </button>
        <Badge kind={summary.fail ? 'fail' : summary.warn ? 'warn' : 'pass'}>
          {summary.fail ? `${summary.fail} illegal` : summary.warn ? `${summary.warn} warnings` : 'Legal'}
        </Badge>
      </header>
      <nav className="sidebar">
        {NAV.map((n) => (
          <button key={n.id} className={`navbtn ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)} aria-label={n.label} title={n.label}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={n.icon} />
            </svg>
            <span>{n.label}</span>
          </button>
        ))}
        <div className="foot">
          Browser-only. Designs persist locally.
          <br />
          Regulation values are a digest — verify against the FIA issue in force.
        </div>
      </nav>
      <main className="main">
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'regulations' && <RegulationsPage />}
        {tab === 'model' && <ModelPage />}
        {tab === 'tunnel' && <WindTunnelPage />}
        {tab === 'aero' && <AeroPage />}
        {tab === 'parts' && <PartsPage />}
        {tab === 'library' && <LibraryPage />}
      </main>
    </div>
  )
}
