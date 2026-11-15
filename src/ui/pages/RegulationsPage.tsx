import { useMemo, useState } from 'react'
import { ARTICLES, CHAPTERS, REGS_ISSUE, STATUS_LABEL } from '../../regulations/regs2026'
import { runCompliance, summarize } from '../../regulations/compliance'
import { useAppStore } from '../../store/useAppStore'
import { Panel, Badge } from '../components/controls'

export function RegulationsPage() {
  const car = useAppStore((s) => s.car)
  const [query, setQuery] = useState('')
  const [chapter, setChapter] = useState('all')
  const [view, setView] = useState<'articles' | 'compliance'>('articles')
  const checks = useMemo(() => runCompliance(car), [car])
  const summary = summarize(checks)

  const articles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ARTICLES.filter((a) => (chapter === 'all' || a.chapter === chapter) && (!q || a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q)) || a.limits.some((l) => l.label.toLowerCase().includes(q)) || a.id.toLowerCase().includes(q)))
  }, [query, chapter])

  return (
    <div className="page">
      <div className="page-header">
        <h1>2026 Technical Regulations</h1>
        <p>{REGS_ISSUE}</p>
      </div>
      <div className="notice">
        This is an engineering digest. Figures tagged <b>FIA-stated</b> come from the FIA's 2026 announcements; <b>Reported</b> and <b>Derived</b> figures must be checked against the
        current Section C issue before a design is frozen. Every limit lives in <span className="mono">src/regulations/regs2026.ts</span> so it can be updated when a new issue is published.
      </div>
      <div className="tabs">
        <button className={view === 'articles' ? 'active' : ''} onClick={() => setView('articles')}>
          Articles ({ARTICLES.length})
        </button>
        <button className={view === 'compliance' ? 'active' : ''} onClick={() => setView('compliance')}>
          Compliance report — {summary.fail} fail · {summary.warn} warn · {summary.pass} pass
        </button>
      </div>

      {view === 'articles' && (
        <>
          <div className="row">
            <input className="txt" placeholder="Search articles, limits, tags…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, maxWidth: 420 }} />
            <select className="sel" value={chapter} onChange={(e) => setChapter(e.target.value)}>
              <option value="all">All chapters</option>
              {CHAPTERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} — {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid cols-2">
            {articles.map((a) => (
              <article key={a.id} className="article">
                <h4>
                  <span className="id">{a.id}</span>
                  {a.title}
                </h4>
                <p>{a.summary}</p>
                {a.designNotes.length > 0 && (
                  <ul>
                    {a.designNotes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
                {a.limits.length > 0 && (
                  <table className="tbl">
                    <tbody>
                      {a.limits.map((l) => (
                        <tr key={l.key}>
                          <td>
                            {l.label}
                            {l.note && <div className="muted small">{l.note}</div>}
                          </td>
                          <td className="num">
                            {l.exact !== undefined && `= ${l.exact}`}
                            {l.min !== undefined && `≥ ${l.min}`}
                            {l.min !== undefined && l.max !== undefined && ' · '}
                            {l.max !== undefined && `≤ ${l.max}`} {l.unit}
                          </td>
                          <td>
                            <Badge kind={l.status === 'official' ? 'pass' : l.status === 'target' ? 'neutral' : 'warn'}>{STATUS_LABEL[l.status]}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: 6 }}>
                  {a.tags.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {view === 'compliance' && (
        <Panel title={`Compliance report for ${car.name}`} right={<Badge kind={summary.legal ? 'pass' : 'fail'}>{summary.legal ? 'Legal' : 'Not legal'}</Badge>}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Status</th>
                <th>Check</th>
                <th>Article</th>
                <th style={{ textAlign: 'right' }}>Measured</th>
                <th style={{ textAlign: 'right' }}>Limit</th>
                <th>Provenance</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
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
                  <td className="small muted">{STATUS_LABEL[c.provenance]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}
