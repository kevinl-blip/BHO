import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { driverSession } from '../lib/einsatzApi'

function fmt(iso) {
  if (!iso) return 'time TBD'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'time TBD' : d.toLocaleString('en-GB')
}

export default function DriverView() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, error: null, data: null })

  const load = useCallback(async () => {
    try {
      const data = await driverSession(token)
      setState({ loading: false, error: null, data })
    } catch (e) {
      setState({ loading: false, error: e, data: null })
    }
  }, [token])

  useEffect(() => { load() }, [load])

  if (state.loading) return <div className="mobile"><p className="muted">Loading…</p></div>

  if (state.error) {
    const invalid = state.error.status === 404
    return (
      <div className="mobile">
        <div className="card">
          <h2>{invalid ? 'Invalid link' : 'Something went wrong'}</h2>
          <p className="muted">
            {invalid
              ? 'This driver link is not valid or has been deactivated. Please contact the organizer.'
              : state.error.message}
          </p>
        </div>
      </div>
    )
  }

  const { driver, rides } = state.data

  return (
    <div className="mobile">
      <header className="mobile-head">
        <span className="brand">Delego</span>
        <h1>My rides</h1>
        <p className="muted">{driver.name}</p>
      </header>

      {rides.length === 0 && <p className="muted">No rides assigned yet.</p>}

      <ul className="ride-list">
        {rides.map((r) => (
          <li key={r.id} className="card ride">
            <div className="ride-head">
              <strong>{fmt(r.pickup_at)}</strong>
              <span className="badge">{r.status}</span>
            </div>
            <div className="ride-route">
              {(r.from_location || '—')} → {(r.to_location || '—')}
            </div>
            <div className="ride-hotel muted">
              Hotel: {r.destination_hotel ?? 'not assigned yet'}
            </div>
            <div className="ride-people">
              <span className="field-legend">People ({r.people.length})</span>
              {r.people.length === 0
                ? <span className="muted">—</span>
                : (
                  <ul className="plain">
                    {r.people.map((p, i) => (
                      <li key={i}>{p.last_name}, {p.first_name}</li>
                    ))}
                  </ul>
                )}
            </div>
          </li>
        ))}
      </ul>

      <button className="refresh" onClick={load}>Refresh</button>
    </div>
  )
}
