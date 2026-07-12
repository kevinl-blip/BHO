import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const POLL_MS = 5000
const EMPTY = { expected: 0, present: 0, missing: 0 }

// Live-Anwesenheitsübersicht für den Veranstalter: Check-in-Stand pro Delegation
// und Walk-ins, alle ~5 s per Polling aktualisiert. Nur Lesen – über den
// authentifizierten Client; RLS (chk_select / wlk_select) erlaubt Mitgliedern
// der Organisation den Zugriff.
export default function ArrivalBoard({ tournamentId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = useCallback(async (silent) => {
    try {
      const { data: dels, error: dErr } = await supabase
        .from('delegations')
        .select('id, name')
        .eq('tournament_id', tournamentId)
        .order('name', { ascending: true })
      if (dErr) throw dErr
      const delIds = (dels ?? []).map((d) => d.id)

      const { data: walkins, error: wErr } = await supabase
        .from('walkins')
        .select('id, name, note, delegation_id')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true })
      if (wErr) throw wErr

      let persons = []
      let checkins = []
      if (delIds.length > 0) {
        const pRes = await supabase
          .from('persons')
          .select('id, last_name, first_name, delegation_id')
          .in('delegation_id', delIds)
        if (pRes.error) throw pRes.error
        persons = pRes.data ?? []
        const pIds = persons.map((p) => p.id)
        if (pIds.length > 0) {
          const cRes = await supabase
            .from('arrival_checkins')
            .select('person_id, status')
            .in('person_id', pIds)
          if (cRes.error) throw cRes.error
          checkins = cRes.data ?? []
        }
      }

      const statusByPerson = new Map(checkins.map((c) => [c.person_id, c.status]))
      const byDel = new Map()
      for (const p of persons) {
        const list = byDel.get(p.delegation_id) ?? []
        list.push({
          id: p.id,
          last_name: p.last_name,
          first_name: p.first_name,
          status: statusByPerson.get(p.id) ?? 'expected',
        })
        byDel.set(p.delegation_id, list)
      }

      const delegations = (dels ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        persons: (byDel.get(d.id) ?? []).sort((a, b) =>
          `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`),
        ),
      }))

      setData({ delegations, walkins: walkins ?? [] })
      setUpdatedAt(new Date())
      setError(null)
    } catch (e) {
      if (!silent) setError(e.message)
    }
  }, [tournamentId])

  useEffect(() => {
    load(false)
    const id = setInterval(() => load(true), POLL_MS)
    return () => clearInterval(id)
  }, [load])

  if (error) return <div className="card"><h3>Anwesenheit</h3><p className="error">{error}</p></div>
  if (!data) return <div className="card"><h3>Anwesenheit</h3><p className="muted">Lade …</p></div>

  const all = data.delegations.flatMap((d) => d.persons)
  const totals = all.reduce((a, p) => ({ ...a, [p.status]: a[p.status] + 1 }), { ...EMPTY })

  return (
    <div className="card">
      <h3>Anwesenheit (live)</h3>
      <div className="summary-bar">
        <span className="pill pill-present">{totals.present} present</span>
        <span className="pill">{totals.expected} expected</span>
        <span className="pill pill-missing">{totals.missing} missing</span>
      </div>
      {updatedAt && (
        <p className="muted small">
          Aktualisiert {updatedAt.toLocaleTimeString('de-DE')} · alle 5 s
        </p>
      )}

      {data.delegations.length === 0 && <p className="muted">Keine Delegationen.</p>}
      <ul className="item-list">
        {data.delegations.map((d) => {
          const c = d.persons.reduce((a, p) => ({ ...a, [p.status]: a[p.status] + 1 }), { ...EMPTY })
          const isOpen = expanded === d.id
          return (
            <li key={d.id} className="item item-col">
              <div className="item-row">
                <div>
                  <strong>{d.name}</strong>
                  <div className="muted">
                    {d.persons.length} Personen ·{' '}
                    <span className="status-present-text">{c.present} present</span> ·{' '}
                    <span className="status-missing-text">{c.missing} missing</span> ·{' '}
                    {c.expected} expected
                  </div>
                </div>
                <button onClick={() => setExpanded(isOpen ? null : d.id)}>
                  {isOpen ? 'ausblenden' : 'Personen'}
                </button>
              </div>
              {isOpen && (
                <ul className="checkin-list">
                  {d.persons.length === 0 && <li className="muted">Keine Personen gemeldet.</li>}
                  {d.persons.map((p) => (
                    <li key={p.id} className="checkin-row">
                      <strong>{p.last_name}, {p.first_name}</strong>
                      <span className={`status-tag status-${p.status}`}>{p.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <h4 className="section-gap">Walk-ins ({data.walkins.length})</h4>
      {data.walkins.length === 0 && <p className="muted">Keine unangemeldeten Personen.</p>}
      <ul className="item-list">
        {data.walkins.map((w) => {
          const delName = data.delegations.find((d) => d.id === w.delegation_id)?.name
          return (
            <li key={w.id} className="item">
              <div>
                <strong>{w.name}</strong>
                <div className="muted">
                  {delName ?? 'keine Delegation'}{w.note ? ` · ${w.note}` : ''}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
