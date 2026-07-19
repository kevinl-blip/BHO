import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useEditScroll } from '../lib/useEditScroll'

// Fahrzeuge eines Turniers verwalten (vehicles). Direkter Tabellenzugriff über
// den authentifizierten Client; RLS veh_write erlaubt admin/staff.
export default function VehiclesManager({ tournamentId, vehicles, onChanged }) {
  const [label, setLabel] = useState('')
  const [capacity, setCapacity] = useState(8)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const editRef = useEditScroll(editingId)

  function resetForm() {
    setLabel('')
    setCapacity(8)
    setEditingId(null)
    setError(null)
  }

  function startEdit(v) {
    setEditingId(v.id)
    setLabel(v.label)
    setCapacity(v.capacity)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const cap = Number(capacity)
    if (!label.trim()) return setError('Bezeichnung ist Pflicht.')
    if (!Number.isInteger(cap) || cap < 1) return setError('Kapazität muss eine positive Zahl sein.')

    setBusy(true)
    const payload = { label: label.trim(), capacity: cap }
    const { error: writeErr } = editingId
      ? await supabase.from('vehicles').update(payload).eq('id', editingId)
      : await supabase.from('vehicles').insert({ ...payload, tournament_id: tournamentId })
    if (writeErr) setError(writeErr.message)
    else {
      resetForm()
      await onChanged()
    }
    setBusy(false)
  }

  async function handleDelete(v) {
    if (!confirm(`Fahrzeug „${v.label}" löschen?`)) return
    const { error: delErr } = await supabase.from('vehicles').delete().eq('id', v.id)
    if (delErr) setError(delErr.message)
    else {
      if (editingId === v.id) resetForm()
      await onChanged()
    }
  }

  return (
    <div className="card">
      <h3>Fahrzeuge</h3>
      {vehicles.length === 0 && <p className="muted">Noch keine Fahrzeuge angelegt.</p>}
      <ul className="item-list">
        {vehicles.map((v) => (
          <li key={v.id} className="item">
            <div>
              <strong>{v.label}</strong>
              <div className="muted">{v.capacity} Plätze</div>
            </div>
            <div className="actions">
              <button onClick={() => startEdit(v)}>Bearbeiten</button>
              <button onClick={() => handleDelete(v)}>Löschen</button>
            </div>
          </li>
        ))}
      </ul>

      <form ref={editRef} onSubmit={handleSubmit} className="stack field-form">
        <h4>{editingId ? 'Fahrzeug bearbeiten' : 'Fahrzeug hinzufügen'}</h4>
        <div className="row">
          <label>
            Bezeichnung
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Bus 1" />
          </label>
          <label>
            Kapazität
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Speichern …' : editingId ? 'Änderungen speichern' : 'Fahrzeug hinzufügen'}
          </button>
          {editingId && <button type="button" onClick={resetForm} disabled={busy}>Abbrechen</button>}
        </div>
      </form>
    </div>
  )
}
