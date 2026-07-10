import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  portalCreatePerson,
  portalDeletePerson,
  portalSession,
  portalUpdatePerson,
} from '../lib/portalApi'
import { firstMissingRequired } from '../lib/personFields'

const ROLES = ['athlete', 'coach', 'official']

const emptyPerson = { last_name: '', first_name: '', gender: '', role: 'athlete', custom_fields: {}, notes: '' }

function customValue(field, person) {
  const v = person.custom_fields?.[field.key]
  return v === undefined || v === null ? '' : v
}

export default function PortalPage() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [form, setForm] = useState(emptyPerson)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const load = useCallback(async () => {
    setState({ loading: true, error: null, data: null })
    try {
      const data = await portalSession(token)
      setState({ loading: false, error: null, data })
    } catch (e) {
      setState({ loading: false, error: e, data: null })
    }
  }, [token])

  useEffect(() => { load() }, [load])

  if (state.loading) return <div className="portal"><p className="muted">Loading…</p></div>

  if (state.error) {
    const invalid = state.error.status === 404
    return (
      <div className="portal">
        <div className="card">
          <h2>{invalid ? 'Invalid access link' : 'Something went wrong'}</h2>
          <p className="muted">
            {invalid
              ? 'This delegation link is not valid. Please check the link your organizer sent you.'
              : state.error.message}
          </p>
        </div>
      </div>
    )
  }

  const { tournament, persons, read_only: readOnly } = state.data
  const personFields = Array.isArray(tournament.person_fields) ? tournament.person_fields : []
  const deadlineText = tournament.submission_deadline
    ? new Date(tournament.submission_deadline).toLocaleString('en-GB')
    : null

  function resetForm() {
    setForm(emptyPerson)
    setEditingId(null)
    setFormError(null)
  }

  function startEdit(p) {
    setEditingId(p.id)
    setForm({
      last_name: p.last_name ?? '',
      first_name: p.first_name ?? '',
      gender: p.gender ?? '',
      role: p.role ?? 'athlete',
      custom_fields: p.custom_fields ?? {},
      notes: p.notes ?? '',
    })
    setFormError(null)
  }

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function setCustom(key) {
    return (e) =>
      setForm((f) => ({ ...f, custom_fields: { ...f.custom_fields, [key]: e.target.value } }))
  }

  function setCustomBool(key) {
    return (e) =>
      setForm((f) => ({ ...f, custom_fields: { ...f.custom_fields, [key]: e.target.checked } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    // Pflichtfeld-Check im Frontend (UX). Die Edge Function prüft dasselbe
    // serverseitig autoritativ – das Frontend ist keine Vertrauensgrenze.
    const missing = firstMissingRequired(personFields, form.custom_fields)
    if (missing) {
      setFormError(`Please fill in the required field: ${missing}`)
      return
    }

    setSaving(true)
    try {
      const result = editingId
        ? await portalUpdatePerson(token, { ...form, id: editingId })
        : await portalCreatePerson(token, form)
      setState((s) => ({ ...s, data: { ...s.data, persons: result.persons } }))
      resetForm()
    } catch (err) {
      // Deadline serverseitig abgelaufen → Ansicht auf read-only umstellen.
      if (err.code === 'submission_deadline_passed') {
        setState((s) => ({ ...s, data: { ...s.data, read_only: true } }))
      }
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this person?')) return
    try {
      const result = await portalDeletePerson(token, id)
      setState((s) => ({ ...s, data: { ...s.data, persons: result.persons } }))
      if (editingId === id) resetForm()
    } catch (err) {
      if (err.code === 'submission_deadline_passed') {
        setState((s) => ({ ...s, data: { ...s.data, read_only: true } }))
      }
      alert(err.message)
    }
  }

  return (
    <div className="portal">
      <header className="portal-head">
        <span className="brand">Delego</span>
        <h1>{tournament.name}</h1>
        <p className="muted">
          {tournament.starts_on} – {tournament.ends_on}
          {tournament.venue ? ` · ${tournament.venue}` : ''}
        </p>
      </header>

      {readOnly ? (
        <div className="banner banner-locked">
          The submission deadline{deadlineText ? ` (${deadlineText})` : ''} has passed.
          Your entries are now read-only. Please contact the organizer for changes.
        </div>
      ) : deadlineText ? (
        <div className="banner banner-open">
          You can edit your delegation until <strong>{deadlineText}</strong>.
        </div>
      ) : null}

      <div className="card">
        <h3>People ({persons.length})</h3>
        {persons.length === 0 && <p className="muted">No people added yet.</p>}
        <ul className="item-list">
          {persons.map((p) => (
            <li key={p.id} className="item">
              <div>
                <strong>{p.last_name}, {p.first_name}</strong>
                <div className="muted">
                  {p.role}{p.gender ? ` · ${p.gender}` : ''}
                  {personFields
                    .map((f) => {
                      const v = p.custom_fields?.[f.key]
                      if (f.type === 'boolean') {
                        return v === undefined || v === null ? '' : ` · ${f.label}: ${v ? 'Yes' : 'No'}`
                      }
                      return v ? ` · ${f.label}: ${v}` : ''
                    })
                    .join('')}
                </div>
              </div>
              {!readOnly && (
                <div className="actions">
                  <button onClick={() => startEdit(p)}>Edit</button>
                  <button onClick={() => handleDelete(p.id)}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {!readOnly && (
        <div className="card">
          <h3>{editingId ? 'Edit person' : 'Add person'}</h3>
          <form onSubmit={handleSubmit} className="stack">
            <div className="row">
              <label>
                Last name
                <input value={form.last_name} onChange={setField('last_name')} required />
              </label>
              <label>
                First name
                <input value={form.first_name} onChange={setField('first_name')} required />
              </label>
            </div>
            <div className="row">
              <label>
                Role
                <select value={form.role} onChange={setField('role')}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label>
                Gender
                <input value={form.gender} onChange={setField('gender')} placeholder="optional" />
              </label>
            </div>

            {personFields.map((f) => {
              if (f.type === 'boolean') {
                return (
                  <label key={f.key} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!!form.custom_fields?.[f.key]}
                      onChange={setCustomBool(f.key)}
                    />
                    {f.label}
                  </label>
                )
              }
              if (f.type === 'select') {
                return (
                  <label key={f.key}>
                    {f.label}{f.required ? ' *' : ''}
                    <select
                      value={customValue(f, form)}
                      onChange={setCustom(f.key)}
                      required={!!f.required}
                    >
                      <option value="">–</option>
                      {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                )
              }
              return (
                <label key={f.key}>
                  {f.label}{f.required ? ' *' : ''}
                  <input
                    type={f.type === 'date' ? 'date' : 'text'}
                    value={customValue(f, form)}
                    onChange={setCustom(f.key)}
                    required={!!f.required}
                  />
                </label>
              )
            })}

            <label>
              Notes
              <input value={form.notes} onChange={setField('notes')} placeholder="optional" />
            </label>

            {formError && <p className="error">{formError}</p>}
            <div className="actions">
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add person'}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} disabled={saving}>Cancel</button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
