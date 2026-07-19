import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useEditScroll } from '../lib/useEditScroll'

// Teil A: Hotels und Zimmerkategorien eines Turniers. Direkter Tabellenzugriff
// über den authentifizierten Client; RLS (hot_write / rc_write) erlaubt
// admin/staff. is_official=false = "Non-official hotel" für Selbstbucher.
const emptyHotel = { name: '', address: '', is_official: true }
const emptyCat = { label: '', capacity: 2, price_per_person_night: 0 }

function CategoryManager({ hotelId, categories, onChanged }) {
  const [form, setForm] = useState(emptyCat)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState(null)
  const editRef = useEditScroll(editingId)

  function reset() {
    setForm(emptyCat)
    setEditingId(null)
    setError(null)
  }

  async function save(e) {
    e.preventDefault()
    setError(null)
    if (!form.label.trim()) return setError('Bezeichnung ist Pflicht.')
    const capacity = Number(form.capacity)
    const price = Number(form.price_per_person_night)
    if (!Number.isInteger(capacity) || capacity < 1) return setError('Bettenzahl muss ≥ 1 sein.')
    if (Number.isNaN(price) || price < 0) return setError('Preis muss ≥ 0 sein.')

    const payload = { label: form.label.trim(), capacity, price_per_person_night: price }
    const { error: e2 } = editingId
      ? await supabase.from('room_categories').update(payload).eq('id', editingId)
      : await supabase.from('room_categories').insert({ ...payload, hotel_id: hotelId })
    if (e2) setError(e2.message)
    else {
      reset()
      await onChanged()
    }
  }

  async function remove(c) {
    if (!confirm(`Kategorie „${c.label}" löschen?`)) return
    const { error: e } = await supabase.from('room_categories').delete().eq('id', c.id)
    if (e) setError(e.message)
    else await onChanged()
  }

  return (
    <div className="cat-panel">
      <span className="field-legend">Zimmerkategorien</span>
      {categories.length === 0 && <p className="muted">Noch keine Kategorien.</p>}
      <ul className="item-list">
        {categories.map((c) => (
          <li key={c.id} className="item">
            <div>
              <strong>{c.label}</strong>
              <div className="muted">{c.capacity} Betten · {Number(c.price_per_person_night).toFixed(2)} € p. P./Nacht</div>
            </div>
            <div className="actions">
              <button onClick={() => { setEditingId(c.id); setForm({ label: c.label, capacity: c.capacity, price_per_person_night: c.price_per_person_night }) }}>Bearbeiten</button>
              <button onClick={() => remove(c)}>Löschen</button>
            </div>
          </li>
        ))}
      </ul>
      <form ref={editRef} onSubmit={save} className="stack">
        <div className="row">
          <label>
            Bezeichnung
            <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="z. B. single / double" />
          </label>
          <label>
            Betten
            <input type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
          </label>
          <label>
            € p. P./Nacht
            <input type="number" min={0} step="0.01" value={form.price_per_person_night} onChange={(e) => setForm((f) => ({ ...f, price_per_person_night: e.target.value }))} />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary">{editingId ? 'Kategorie speichern' : 'Kategorie hinzufügen'}</button>
          {editingId && <button type="button" onClick={reset}>Abbrechen</button>}
        </div>
      </form>
    </div>
  )
}

export default function HotelsManager({ tournamentId, hotels, onChanged }) {
  const [form, setForm] = useState(emptyHotel)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState(null)
  const editRef = useEditScroll(editingId)
  const [expandedId, setExpandedId] = useState(null)

  function reset() {
    setForm(emptyHotel)
    setEditingId(null)
    setError(null)
  }

  async function save(e) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('Name ist Pflicht.')
    const payload = { name: form.name.trim(), address: form.address.trim() || null, is_official: form.is_official }
    const { error: e2 } = editingId
      ? await supabase.from('hotels').update(payload).eq('id', editingId)
      : await supabase.from('hotels').insert({ ...payload, tournament_id: tournamentId })
    if (e2) setError(e2.message)
    else {
      reset()
      await onChanged()
    }
  }

  async function remove(h) {
    if (!confirm(`Hotel „${h.name}" löschen? Kategorien und Kontingente werden mitgelöscht.`)) return
    const { error: e } = await supabase.from('hotels').delete().eq('id', h.id)
    if (e) setError(e.message)
    else await onChanged()
  }

  return (
    <div className="card">
      <h3>Hotels &amp; Kategorien</h3>
      {hotels.length === 0 && <p className="muted">Noch keine Hotels angelegt.</p>}
      <ul className="item-list">
        {hotels.map((h) => (
          <li key={h.id} className="item item-col">
            <div className="item-row">
              <div>
                <strong>{h.name}</strong>
                {h.address ? <span className="muted"> · {h.address}</span> : null}
                <div className="muted">{(h.room_categories ?? []).length} Kategorien</div>
              </div>
              <span className={h.is_official ? 'badge' : 'badge badge-free'}>
                {h.is_official ? 'offiziell' : 'Selbstbucher'}
              </span>
            </div>
            <div className="actions">
              <button onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}>
                {expandedId === h.id ? 'Kategorien ausblenden' : 'Kategorien verwalten'}
              </button>
              <button onClick={() => { setEditingId(h.id); setForm({ name: h.name, address: h.address ?? '', is_official: h.is_official }) }}>Bearbeiten</button>
              <button onClick={() => remove(h)}>Löschen</button>
            </div>
            {expandedId === h.id && (
              <CategoryManager hotelId={h.id} categories={h.room_categories ?? []} onChanged={onChanged} />
            )}
          </li>
        ))}
      </ul>

      <form ref={editRef} onSubmit={save} className="stack field-form">
        <h4>{editingId ? 'Hotel bearbeiten' : 'Hotel hinzufügen'}</h4>
        <div className="row">
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="z. B. Maritim Hotel" />
          </label>
          <label>
            Adresse
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="optional" />
          </label>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" checked={form.is_official} onChange={(e) => setForm((f) => ({ ...f, is_official: e.target.checked }))} />
          Offizielles Hotel (deaktivieren für „Non-official / Selbstbucher")
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary">{editingId ? 'Änderungen speichern' : 'Hotel hinzufügen'}</button>
          {editingId && <button type="button" onClick={reset}>Abbrechen</button>}
        </div>
      </form>
    </div>
  )
}
