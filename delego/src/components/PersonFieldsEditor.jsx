import { useState } from 'react'
import { FIELD_TYPES, generateFieldKey } from '../lib/personFields'

// Verwaltet die turnierspezifischen Personenfelder. `fields` kommt aus
// tournaments.settings.person_fields; jede Änderung wird über onChange(next)
// persistiert (der Aufrufer schreibt settings zurück).
const emptyDraft = { label: '', type: 'text', optionsText: '', required: false }

export default function PersonFieldsEditor({ fields, onChange }) {
  const [draft, setDraft] = useState(emptyDraft)
  const [editingKey, setEditingKey] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const list = Array.isArray(fields) ? fields : []

  function resetDraft() {
    setDraft(emptyDraft)
    setEditingKey(null)
    setError(null)
  }

  function startEdit(f) {
    setEditingKey(f.key)
    setDraft({
      label: f.label ?? '',
      type: FIELD_TYPES.includes(f.type) ? f.type : 'text',
      optionsText: Array.isArray(f.options) ? f.options.join('\n') : '',
      required: !!f.required,
    })
    setError(null)
  }

  async function persist(next) {
    setBusy(true)
    try {
      await onChange(next)
      resetDraft()
    } catch (e) {
      setError(e.message ?? 'Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setError(null)

    const label = draft.label.trim()
    if (!label) {
      setError('Bezeichnung ist Pflicht.')
      return
    }

    let options
    if (draft.type === 'select') {
      options = draft.optionsText
        .split('\n')
        .map((o) => o.trim())
        .filter(Boolean)
      if (options.length === 0) {
        setError('Ein Auswahlfeld braucht mindestens eine Option.')
        return
      }
    }

    const field = {
      key: editingKey ?? generateFieldKey(),
      label,
      type: draft.type,
      required: !!draft.required,
      ...(options ? { options } : {}),
    }

    const next = editingKey
      ? list.map((f) => (f.key === editingKey ? field : f))
      : [...list, field]

    await persist(next)
  }

  async function handleDelete(key) {
    if (!confirm('Feld löschen? Bereits gespeicherte Werte in diesem Feld bleiben in den Personendaten erhalten, werden aber nicht mehr angezeigt.')) return
    await persist(list.filter((f) => f.key !== key))
  }

  async function move(index, dir) {
    const target = index + dir
    if (target < 0 || target >= list.length) return
    const next = [...list]
    ;[next[index], next[target]] = [next[target], next[index]]
    await persist(next)
  }

  return (
    <div className="card">
      <h3>Personenfelder (turnierspezifisch)</h3>
      <p className="muted">
        Zusätzliche Felder, die Delegationen pro Person im Portal ausfüllen
        (z. B. Gewichtsklasse, ITC-Teilnahme). Reihenfolge bestimmt die Anzeige.
      </p>

      {list.length === 0 && <p className="muted">Noch keine Felder definiert.</p>}

      <ul className="item-list">
        {list.map((f, i) => (
          <li key={f.key} className="item">
            <div>
              <strong>{f.label}</strong>
              <div className="muted">
                {f.type}
                {f.type === 'select' && Array.isArray(f.options)
                  ? ` · ${f.options.length} Optionen`
                  : ''}
                {f.required ? ' · Pflicht' : ''}
              </div>
            </div>
            <div className="actions">
              <button onClick={() => move(i, -1)} disabled={busy || i === 0} title="Nach oben">↑</button>
              <button onClick={() => move(i, 1)} disabled={busy || i === list.length - 1} title="Nach unten">↓</button>
              <button onClick={() => startEdit(f)} disabled={busy}>Bearbeiten</button>
              <button onClick={() => handleDelete(f.key)} disabled={busy}>Löschen</button>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSave} className="stack field-form">
        <h4>{editingKey ? 'Feld bearbeiten' : 'Feld hinzufügen'}</h4>
        <div className="row">
          <label>
            Bezeichnung
            <input
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="z. B. Gewichtsklasse"
            />
          </label>
          <label>
            Typ
            <select
              value={draft.type}
              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
            >
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>

        {draft.type === 'select' && (
          <label>
            Optionen (eine pro Zeile)
            <textarea
              rows={4}
              value={draft.optionsText}
              onChange={(e) => setDraft((d) => ({ ...d, optionsText: e.target.value }))}
              placeholder={'-60 kg\n-66 kg\n-73 kg'}
            />
          </label>
        )}

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
            disabled={draft.type === 'boolean'}
          />
          Pflichtfeld
          {draft.type === 'boolean' && (
            <span className="muted"> (bei Ja/Nein ohne Wirkung – es gibt immer einen Wert)</span>
          )}
        </label>

        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Speichern …' : editingKey ? 'Änderungen speichern' : 'Feld hinzufügen'}
          </button>
          {editingKey && (
            <button type="button" onClick={resetDraft} disabled={busy}>Abbrechen</button>
          )}
        </div>
      </form>
    </div>
  )
}
