import { useState } from 'react'
import {
  portalCreateTravelGroup,
  portalDeleteTravelGroup,
  portalUpdateTravelGroup,
} from '../lib/portalApi'

const DIRECTIONS = [
  { value: 'arrival', label: 'Arrival' },
  { value: 'departure', label: 'Departure' },
]

const emptyForm = {
  direction: 'arrival',
  scheduledLocal: '',
  location: '',
  carrier_ref: '',
  notes: '',
  person_ids: [],
}

// datetime-local (lokale Zeit) ↔ ISO (UTC) umrechnen.
function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB')
}

export default function PortalTravel({ token, persons, travelGroups, readOnly, onChange, embedded }) {
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const personById = new Map(persons.map((p) => [p.id, p]))
  const arrivals = travelGroups.filter((g) => g.direction === 'arrival')
  const departures = travelGroups.filter((g) => g.direction === 'departure')

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setError(null)
  }

  function startEdit(g) {
    setEditingId(g.id)
    setForm({
      direction: g.direction,
      scheduledLocal: isoToLocalInput(g.scheduled_at),
      location: g.location ?? '',
      carrier_ref: g.carrier_ref ?? '',
      notes: g.notes ?? '',
      person_ids: [...(g.member_ids ?? [])],
    })
    setError(null)
  }

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function togglePerson(id) {
    setForm((f) => ({
      ...f,
      person_ids: f.person_ids.includes(id)
        ? f.person_ids.filter((x) => x !== id)
        : [...f.person_ids, id],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.scheduledLocal) {
      setError('Please set date and time.')
      return
    }
    if (form.person_ids.length === 0) {
      setError('Please select at least one person for this travel group.')
      return
    }
    const payload = {
      direction: form.direction,
      scheduled_at: new Date(form.scheduledLocal).toISOString(),
      location: form.location,
      carrier_ref: form.carrier_ref,
      notes: form.notes,
      member_ids: form.person_ids,
    }
    setSaving(true)
    try {
      const result = editingId
        ? await portalUpdateTravelGroup(token, { ...payload, id: editingId })
        : await portalCreateTravelGroup(token, payload)
      onChange(result.travel_groups)
      resetForm()
    } catch (err) {
      if (err.code === 'submission_deadline_passed') onChange(null, true)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this travel group?')) return
    try {
      const result = await portalDeleteTravelGroup(token, id)
      onChange(result.travel_groups)
      if (editingId === id) resetForm()
    } catch (err) {
      if (err.code === 'submission_deadline_passed') onChange(null, true)
      alert(err.message)
    }
  }

  function renderGroup(g) {
    const members = (g.member_ids ?? [])
      .map((id) => personById.get(id))
      .filter(Boolean)
    return (
      <li key={g.id} className="item item-col">
        <div className="item-row">
          <div>
            <strong>{formatWhen(g.scheduled_at)}</strong>
            {g.location ? <span className="muted"> · {g.location}</span> : null}
            {g.carrier_ref ? <span className="muted"> · {g.carrier_ref}</span> : null}
            <div className="muted">
              {members.length === 0
                ? 'No people assigned'
                : members.map((m) => `${m.last_name}, ${m.first_name}`).join(' · ')}
            </div>
          </div>
          {!readOnly && (
            <div className="actions">
              <button onClick={() => startEdit(g)}>Edit</button>
              <button onClick={() => handleDelete(g.id)}>Delete</button>
            </div>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className={embedded ? undefined : 'card'}>
      {!embedded && <h3>Travel</h3>}
      <p className="muted">
        Add how your delegation arrives and departs. Each travel group records
        one arrival or departure (time, place, flight/train no.) and who travels.
      </p>

      <h4>Arrivals ({arrivals.length})</h4>
      {arrivals.length === 0 && <p className="muted">No arrivals yet.</p>}
      <ul className="item-list">{arrivals.map(renderGroup)}</ul>

      <h4>Departures ({departures.length})</h4>
      {departures.length === 0 && <p className="muted">No departures yet.</p>}
      <ul className="item-list">{departures.map(renderGroup)}</ul>

      {!readOnly && (
        <form onSubmit={handleSubmit} className="stack field-form">
          <h4>{editingId ? 'Edit travel group' : 'Add travel group'}</h4>
          <div className="row">
            <label>
              Direction
              <select value={form.direction} onChange={setField('direction')}>
                {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <label>
              Date &amp; time
              <input
                type="datetime-local"
                value={form.scheduledLocal}
                onChange={setField('scheduledLocal')}
                required
              />
            </label>
          </div>
          <div className="row">
            <label>
              Place
              <input value={form.location} onChange={setField('location')} placeholder="e.g. BER T1" />
            </label>
            <label>
              Flight / train no.
              <input value={form.carrier_ref} onChange={setField('carrier_ref')} placeholder="e.g. LH123" />
            </label>
          </div>

          <div>
            <span className="field-legend">People travelling</span>
            {persons.length === 0 ? (
              <p className="muted">Add people first, then assign them here.</p>
            ) : (
              <div className="check-grid">
                {persons.map((p) => (
                  <label key={p.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.person_ids.includes(p.id)}
                      onChange={() => togglePerson(p.id)}
                    />
                    {p.last_name}, {p.first_name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add travel group'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} disabled={saving}>Cancel</button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
