import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useEditScroll } from '../lib/useEditScroll'

// Wiederverwendbar für Fahrer (drivers) und Koordinatoren (coordinators) –
// strukturell identisch: name, phone, active, notes, access_token mit Link.
// props: table, title, linkPath, tournamentId, items, onChanged
const emptyForm = { name: '', phone: '', notes: '', active: true }

function link(linkPath, token) {
  return `${window.location.origin}/${linkPath}/${token}`
}

export default function TokenStaffManager({ table, title, linkPath, tournamentId, items, onChanged }) {
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const editRef = useEditScroll(editingId)

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setError(null)
  }

  function startEdit(x) {
    setEditingId(x.id)
    setForm({ name: x.name ?? '', phone: x.phone ?? '', notes: x.notes ?? '', active: x.active })
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('Name ist Pflicht.')
    setBusy(true)
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      active: form.active,
    }
    const { error: writeErr } = editingId
      ? await supabase.from(table).update(payload).eq('id', editingId)
      : await supabase.from(table).insert({ ...payload, tournament_id: tournamentId })
    if (writeErr) setError(writeErr.message)
    else {
      resetForm()
      await onChanged()
    }
    setBusy(false)
  }

  async function toggleActive(x) {
    const { error: e } = await supabase.from(table).update({ active: !x.active }).eq('id', x.id)
    if (e) setError(e.message)
    else await onChanged()
  }

  async function regenerate(x) {
    if (!confirm(`Zugangslink für „${x.name}" neu erzeugen? Der bisherige Link funktioniert danach nicht mehr.`)) return
    const { error: e } = await supabase
      .from(table)
      .update({ access_token: crypto.randomUUID() })
      .eq('id', x.id)
    if (e) setError(e.message)
    else await onChanged()
  }

  async function remove(x) {
    if (!confirm(`„${x.name}" löschen?`)) return
    const { error: e } = await supabase.from(table).delete().eq('id', x.id)
    if (e) setError(e.message)
    else {
      if (editingId === x.id) resetForm()
      await onChanged()
    }
  }

  async function copyLink(x) {
    try {
      await navigator.clipboard.writeText(link(linkPath, x.access_token))
      setCopiedId(x.id)
      setTimeout(() => setCopiedId((c) => (c === x.id ? null : c)), 2000)
    } catch {
      setError('Konnte den Link nicht kopieren.')
    }
  }

  return (
    <div className="card">
      <h3>{title}</h3>
      {items.length === 0 && <p className="muted">Noch keine Einträge.</p>}
      <ul className="item-list">
        {items.map((x) => (
          <li key={x.id} className="item item-col">
            <div className="item-row">
              <div>
                <strong>{x.name}</strong>
                {x.phone ? <span className="muted"> · {x.phone}</span> : null}
              </div>
              <span className={x.active ? 'badge badge-free' : 'badge'}>
                {x.active ? 'aktiv' : 'inaktiv'}
              </span>
            </div>
            <div className="link-row">
              <input readOnly value={link(linkPath, x.access_token)} onFocus={(e) => e.target.select()} />
              <button onClick={() => copyLink(x)}>{copiedId === x.id ? 'Kopiert ✓' : 'Kopieren'}</button>
            </div>
            <div className="actions">
              <button onClick={() => startEdit(x)}>Bearbeiten</button>
              <button onClick={() => toggleActive(x)}>{x.active ? 'Deaktivieren' : 'Aktivieren'}</button>
              <button onClick={() => regenerate(x)}>Link neu erzeugen</button>
              <button onClick={() => remove(x)}>Löschen</button>
            </div>
          </li>
        ))}
      </ul>

      <form ref={editRef} onSubmit={handleSubmit} className="stack field-form">
        <h4>{editingId ? 'Bearbeiten' : 'Hinzufügen'}</h4>
        <div className="row">
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label>
            Telefon
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="optional" />
          </label>
        </div>
        <label>
          Notizen
          <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="optional" />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
          Aktiv
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Speichern …' : editingId ? 'Änderungen speichern' : 'Hinzufügen'}
          </button>
          {editingId && <button type="button" onClick={resetForm} disabled={busy}>Abbrechen</button>}
        </div>
      </form>
    </div>
  )
}
