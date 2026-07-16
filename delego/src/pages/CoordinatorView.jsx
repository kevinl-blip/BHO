import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  coordinatorAddWalkin,
  coordinatorRemoveWalkin,
  coordinatorSession,
  coordinatorSetStatus,
} from '../lib/einsatzApi'

const STATUSES = ['expected', 'present', 'missing']
const POLL_MS = 5000

function fmt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB')
}

export default function CoordinatorView() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [walkinForm, setWalkinForm] = useState({ name: '', note: '', delegation_id: '' })
  const [busy, setBusy] = useState(false)
  const pollRef = useRef(null)

  const reload = useCallback(async (silent) => {
    try {
      const data = await coordinatorSession(token)
      setState({ loading: false, error: null, data })
    } catch (e) {
      if (!silent) setState({ loading: false, error: e, data: null })
    }
  }, [token])

  useEffect(() => {
    reload(false)
    // Live-Aktualisierung per Polling (~5 s), damit Check-ins anderer
    // Koordinatoren sichtbar werden.
    pollRef.current = setInterval(() => reload(true), POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [reload])

  if (state.loading) return <div className="mobile"><p className="muted">Loading…</p></div>

  if (state.error) {
    const invalid = state.error.status === 404
    return (
      <div className="mobile">
        <div className="card">
          <h2>{invalid ? 'Invalid link' : 'Something went wrong'}</h2>
          <p className="muted">
            {invalid
              ? 'This coordinator link is not valid or has been deactivated. Please contact the organizer.'
              : state.error.message}
          </p>
        </div>
      </div>
    )
  }

  const { tournament, delegations, walkins } = state.data

  const allPersons = delegations.flatMap((d) => d.persons)
  const counts = allPersons.reduce(
    (acc, p) => { acc[p.status] = (acc[p.status] ?? 0) + 1; return acc },
    { expected: 0, present: 0, missing: 0 },
  )

  function patchStatus(personId, status) {
    setState((s) => ({
      ...s,
      data: {
        ...s.data,
        delegations: s.data.delegations.map((d) => ({
          ...d,
          persons: d.persons.map((p) => (p.id === personId ? { ...p, status } : p)),
        })),
      },
    }))
  }

  async function setStatus(personId, status) {
    patchStatus(personId, status) // optimistisch
    try {
      await coordinatorSetStatus(token, personId, status)
    } catch (e) {
      alert(e.message)
      reload(true) // bei Fehler neu synchronisieren
    }
  }

  async function addWalkin(e) {
    e.preventDefault()
    if (!walkinForm.name.trim()) return
    setBusy(true)
    try {
      const res = await coordinatorAddWalkin(token, {
        name: walkinForm.name.trim(),
        note: walkinForm.note.trim() || undefined,
        delegation_id: walkinForm.delegation_id || undefined,
      })
      setState((s) => ({ ...s, data: { ...s.data, walkins: res.walkins } }))
      setWalkinForm({ name: '', note: '', delegation_id: '' })
    } catch (e2) {
      alert(e2.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeWalkin(id) {
    try {
      const res = await coordinatorRemoveWalkin(token, id)
      setState((s) => ({ ...s, data: { ...s.data, walkins: res.walkins } }))
    } catch (e) {
      alert(e.message)
    }
  }

  const delById = new Map(delegations.map((d) => [d.id, d.name]))

  return (
    <div className="mobile">
      <header className="mobile-head">
        <span className="brand">Delego</span>
        <h1>Arrivals</h1>
        <p className="muted">{tournament.name}</p>
      </header>

      <div className="summary-bar">
        <span className="pill pill-present">{counts.present} present</span>
        <span className="pill">{counts.expected} expected</span>
        <span className="pill pill-missing">{counts.missing} missing</span>
      </div>

      {delegations.map((d) => (
        <div key={d.id} className="card">
          <h3>{d.name}</h3>
          {d.persons.length === 0 && <p className="muted">No people registered.</p>}
          <ul className="checkin-list">
            {d.persons.map((p) => (
              <li key={p.id} className="checkin-row">
                <div>
                  <strong>{p.last_name}, {p.first_name}</strong>
                  <div className="muted">
                    {p.arrival
                      ? `${fmt(p.arrival.scheduled_at)}${p.arrival.location ? ` · ${p.arrival.location}` : ''}${p.arrival.carrier_ref ? ` · ${p.arrival.carrier_ref}` : ''}`
                      : 'no arrival info'}
                    {p.driver_name ? ` · ${p.driver_name}` : ''}
                    {` · Hotel: ${p.destination_hotel ?? 'not assigned yet'}`}
                  </div>
                </div>
                <div className="status-btns">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      className={p.status === s ? `status-btn status-${s} active` : 'status-btn'}
                      onClick={() => setStatus(p.id, s)}
                    >
                      {s === 'expected' ? 'exp' : s === 'present' ? '✓' : '✗'}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="card">
        <h3>Walk-ins ({walkins.length})</h3>
        <p className="muted">People who show up without being registered.</p>
        <ul className="item-list">
          {walkins.map((w) => (
            <li key={w.id} className="item">
              <div>
                <strong>{w.name}</strong>
                <div className="muted">
                  {w.delegation_id ? (delById.get(w.delegation_id) ?? 'unknown delegation') : 'no delegation'}
                  {w.note ? ` · ${w.note}` : ''}
                </div>
              </div>
              <button onClick={() => removeWalkin(w.id)}>Remove</button>
            </li>
          ))}
        </ul>
        <form onSubmit={addWalkin} className="stack field-form">
          <h4>Add walk-in</h4>
          <div className="row">
            <label>
              Name
              <input
                value={walkinForm.name}
                onChange={(e) => setWalkinForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Delegation
              <select
                value={walkinForm.delegation_id}
                onChange={(e) => setWalkinForm((f) => ({ ...f, delegation_id: e.target.value }))}
              >
                <option value="">— unknown —</option>
                {delegations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          </div>
          <label>
            Note
            <input
              value={walkinForm.note}
              onChange={(e) => setWalkinForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="optional"
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Add walk-in'}
          </button>
        </form>
      </div>
    </div>
  )
}
