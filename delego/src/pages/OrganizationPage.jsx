import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const emptyForm = {
  name: '',
  starts_on: '',
  ends_on: '',
  venue: '',
  submission_deadline: '',
}

export default function OrganizationPage() {
  const { orgId } = useParams()
  const [org, setOrg] = useState(null)
  const [tournaments, setTournaments] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [orgRes, tourRes] = await Promise.all([
      supabase.from('organizations').select('id, name, slug').eq('id', orgId).single(),
      supabase
        .from('tournaments')
        .select('id, name, starts_on, ends_on, venue, status, submission_deadline')
        .eq('organization_id', orgId)
        .order('starts_on', { ascending: true }),
    ])
    if (orgRes.error) setError(orgRes.error.message)
    else setOrg(orgRes.data)
    if (tourRes.error) setError(tourRes.error.message)
    else setTournaments(tourRes.data)
  }, [orgId])

  useEffect(() => { load() }, [load])

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)

    if (form.ends_on < form.starts_on) {
      setError('Das Enddatum darf nicht vor dem Startdatum liegen.')
      return
    }

    setBusy(true)
    const { error: insertError } = await supabase.from('tournaments').insert({
      organization_id: orgId,
      name: form.name,
      starts_on: form.starts_on,
      ends_on: form.ends_on,
      venue: form.venue || null,
      status: 'draft',
      submission_deadline: form.submission_deadline
        ? new Date(form.submission_deadline).toISOString()
        : null,
      settings: {},
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setForm(emptyForm)
      await load()
    }
    setBusy(false)
  }

  return (
    <div className="page">
      <p><Link to="/">← Alle Organisationen</Link></p>
      <h2>{org ? org.name : 'Lade …'}</h2>

      <h3>Turniere</h3>
      {tournaments === null && <p className="muted">Lade …</p>}
      {tournaments?.length === 0 && (
        <p className="muted">Noch keine Turniere in dieser Organisation.</p>
      )}
      <ul className="item-list">
        {tournaments?.map((t) => (
          <li key={t.id}>
            <Link to={`/tournament/${t.id}`} className="item">
              <div>
                <strong>{t.name}</strong>
                <div className="muted">
                  {t.starts_on} – {t.ends_on}
                  {t.venue ? ` · ${t.venue}` : ''}
                  {t.submission_deadline
                    ? ` · Meldeschluss: ${new Date(t.submission_deadline).toLocaleString('de-DE')}`
                    : ''}
                </div>
              </div>
              <span className="badge">{t.status}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="card">
        <h3>Neues Turnier anlegen</h3>
        <form onSubmit={handleCreate} className="stack">
          <label>
            Name
            <input value={form.name} onChange={update('name')} required
              placeholder="z. B. BJEC 2026" />
          </label>
          <div className="row">
            <label>
              Start
              <input type="date" value={form.starts_on} onChange={update('starts_on')} required />
            </label>
            <label>
              Ende
              <input type="date" value={form.ends_on} onChange={update('ends_on')} required />
            </label>
          </div>
          <label>
            Austragungsort
            <input value={form.venue} onChange={update('venue')} placeholder="optional" />
          </label>
          <label>
            Meldeschluss (Deadline für Delegationen)
            <input
              type="datetime-local"
              value={form.submission_deadline}
              onChange={update('submission_deadline')}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Bitte warten …' : 'Turnier anlegen'}
          </button>
        </form>
      </div>
    </div>
  )
}
