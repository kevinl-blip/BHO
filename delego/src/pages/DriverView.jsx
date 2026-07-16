import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { driverSession } from '../lib/einsatzApi'

const POLL_MS = 5000

function fmt(iso) {
  if (!iso) return 'time TBD'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'time TBD' : d.toLocaleString('en-GB')
}

// Fahrt-Zusammenfassung: der Fahrer soll auf einen Blick sehen, ob er auf
// jemanden wartet, der laut Koordinator nicht kommt.
function rideSummary(people) {
  const total = people.length
  if (total === 0) return { kind: 'neutral', text: 'No passengers assigned' }
  const missing = people.filter((p) => p.status === 'missing').length
  const present = people.filter((p) => p.status === 'present').length
  if (missing > 0) {
    return {
      kind: 'missing',
      text: `${missing} ${missing === 1 ? 'person' : 'people'} missing — check with coordinator`,
    }
  }
  if (present === total) return { kind: 'present', text: 'All passengers here' }
  return { kind: 'neutral', text: `${present}/${total} present` }
}

export default function DriverView() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, error: null, data: null })

  const load = useCallback(async (silent) => {
    try {
      const data = await driverSession(token)
      setState({ loading: false, error: null, data })
    } catch (e) {
      if (!silent) setState({ loading: false, error: e, data: null })
    }
  }, [token])

  useEffect(() => {
    load(false)
    const id = setInterval(() => load(true), POLL_MS)
    return () => clearInterval(id)
  }, [load])

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

  const { driver, rides, coordinators = [] } = state.data

  return (
    <div className="mobile">
      <header className="mobile-head">
        <span className="brand">Delego</span>
        <h1>My rides</h1>
        <p className="muted">{driver.name}</p>
      </header>

      {rides.length === 0 && <p className="muted">No rides assigned yet.</p>}

      <ul className="ride-list">
        {rides.map((r) => {
          const summary = rideSummary(r.people)
          return (
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

              <div className={`ride-summary summary-${summary.kind}`}>{summary.text}</div>

              <div className="ride-people">
                <span className="field-legend">People ({r.people.length})</span>
                {r.people.length === 0
                  ? <span className="muted">—</span>
                  : (
                    <ul className="checkin-list">
                      {r.people.map((p, i) => (
                        <li key={i} className="checkin-row">
                          <strong>{p.last_name}, {p.first_name}</strong>
                          <span className={`status-tag status-${p.status}`}>{p.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="card">
        <h3>Coordinators</h3>
        {coordinators.length === 0 && <p className="muted">No coordinators listed.</p>}
        <ul className="contact-list">
          {coordinators.map((c, i) => (
            <li key={i} className="contact-row">
              <span>{c.name}</span>
              {c.phone
                ? <a className="tel" href={`tel:${c.phone.replace(/\s+/g, '')}`}>{c.phone}</a>
                : <span className="muted">no phone</span>}
            </li>
          ))}
        </ul>
      </div>

      <button className="refresh" onClick={() => load(false)}>Refresh</button>
    </div>
  )
}
