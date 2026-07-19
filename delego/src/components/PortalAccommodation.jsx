import { useState } from 'react'
import {
  portalCreateAccommodation,
  portalDeleteAccommodation,
  portalUpdateAccommodation,
} from '../lib/portalApi'

const emptyForm = {
  person_id: '',
  hotel_id: '',
  room_category_id: '',
  check_in: '',
  check_out: '',
  roommate_wish: '',
  remarks: '',
}

export default function PortalAccommodation({ token, persons, hotels, requests, readOnly, onChange }) {
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const personById = new Map(persons.map((p) => [p.id, `${p.last_name}, ${p.first_name}`]))
  const hotelById = new Map(hotels.map((h) => [h.id, h]))
  const categoryById = new Map(
    hotels.flatMap((h) => (h.room_categories ?? []).map((c) => [c.id, c])),
  )
  const selectedHotel = hotelById.get(form.hotel_id)
  const categoryOptions = selectedHotel?.room_categories ?? []
  const selfBooked = selectedHotel && !selectedHotel.is_official

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setError(null)
  }

  function startEdit(r) {
    setEditingId(r.id)
    setForm({
      person_id: r.person_id ?? '',
      hotel_id: r.hotel_id ?? '',
      room_category_id: r.room_category_id ?? '',
      check_in: r.check_in ?? '',
      check_out: r.check_out ?? '',
      roommate_wish: r.roommate_wish ?? '',
      remarks: r.remarks ?? '',
    })
    setError(null)
  }

  function setField(field) {
    return (e) => {
      const value = e.target.value
      setForm((f) => {
        const next = { ...f, [field]: value }
        // Hotelwechsel: Kategorie zurücksetzen, wenn sie nicht zum Hotel passt.
        if (field === 'hotel_id') {
          const cats = hotelById.get(value)?.room_categories ?? []
          if (!cats.some((c) => c.id === next.room_category_id)) next.room_category_id = ''
        }
        return next
      })
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.person_id) return setError('Please choose a person.')
    if (!form.hotel_id) return setError('Please choose a hotel.')
    // Selbstbucher: keine Kategorie/Daten nötig.
    if (!selfBooked) {
      if (!form.room_category_id) return setError('Please choose a room category.')
      if (!form.check_in || !form.check_out) return setError('Please set check-in and check-out.')
      if (form.check_out <= form.check_in) return setError('Check-out must be after check-in.')
    }

    setSaving(true)
    try {
      const result = editingId
        ? await portalUpdateAccommodation(token, { ...form, id: editingId })
        : await portalCreateAccommodation(token, form)
      onChange(result.accommodation_requests)
      resetForm()
    } catch (err) {
      if (err.code === 'submission_deadline_passed') onChange(null, true)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this accommodation request?')) return
    try {
      const result = await portalDeleteAccommodation(token, id)
      onChange(result.accommodation_requests)
      if (editingId === id) resetForm()
    } catch (err) {
      if (err.code === 'submission_deadline_passed') onChange(null, true)
      alert(err.message)
    }
  }

  return (
    <div className="card">
      <h3>Accommodation requests</h3>
      <p className="muted">
        Per person you can add one or more rows (e.g. 1 night single, then 2 nights
        double). Choose a hotel and room category, and the nights.
      </p>

      {requests.length === 0 && <p className="muted">No requests yet.</p>}
      <ul className="item-list">
        {requests.map((r) => {
          const hotel = hotelById.get(r.hotel_id)
          const cat = categoryById.get(r.room_category_id)
          const selfBooked = hotel && !hotel.is_official
          return (
            <li key={r.id} className="item">
              <div>
                <strong>{personById.get(r.person_id) ?? 'unknown person'}</strong>
                {selfBooked && <span className="badge badge-free selfbook-tag">Self-booked</span>}
                <div className="muted">
                  {(hotel?.name ?? 'hotel')}
                  {selfBooked
                    ? ' · books own accommodation'
                    : `${cat ? ` · ${cat.label}` : ''} · ${r.check_in} → ${r.check_out}${r.roommate_wish ? ` · with: ${r.roommate_wish}` : ''}`}
                  {r.remarks ? ` · ${r.remarks}` : ''}
                </div>
              </div>
              {!readOnly && (
                <div className="actions">
                  <button onClick={() => startEdit(r)}>Edit</button>
                  <button onClick={() => handleDelete(r.id)}>Delete</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {!readOnly && (
        <form onSubmit={handleSubmit} className="stack field-form">
          <h4>{editingId ? 'Edit request' : 'Add request'}</h4>
          {persons.length === 0 && <p className="muted">Add people first, then request rooms for them.</p>}
          {hotels.length === 0 && <p className="muted">The organizer has not added any hotels yet.</p>}
          <div className="row">
            <label>
              Person
              <select value={form.person_id} onChange={setField('person_id')}>
                <option value="">— choose —</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label>
              Hotel
              <select value={form.hotel_id} onChange={setField('hotel_id')}>
                <option value="">— choose —</option>
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}{h.is_official ? '' : ' (self-booked)'}</option>
                ))}
              </select>
            </label>
            {!selfBooked && (
              <label>
                Room category
                <select value={form.room_category_id} onChange={setField('room_category_id')} disabled={!form.hotel_id}>
                  <option value="">— choose —</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {selfBooked ? (
            <div className="banner banner-open">
              This hotel is self-booked — your delegation arranges it directly.
              No room category or dates needed. Add anything relevant in the remarks.
            </div>
          ) : (
            <>
              <div className="row">
                <label>
                  Check-in
                  <input type="date" value={form.check_in} onChange={setField('check_in')} />
                </label>
                <label>
                  Check-out
                  <input type="date" value={form.check_out} onChange={setField('check_out')} />
                </label>
              </div>
              <label>
                Roommate wish
                <input value={form.roommate_wish} onChange={setField('roommate_wish')} placeholder="optional (free text)" />
              </label>
            </>
          )}
          <label>
            Remarks
            <input value={form.remarks} onChange={setField('remarks')} placeholder="optional" />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add request'}
            </button>
            {editingId && <button type="button" onClick={resetForm} disabled={saving}>Cancel</button>}
          </div>
        </form>
      )}
    </div>
  )
}
