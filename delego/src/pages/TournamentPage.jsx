import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import PersonFieldsEditor from '../components/PersonFieldsEditor'
import DelegationPersons from '../components/DelegationPersons'
import VehiclesManager from '../components/VehiclesManager'
import TravelDisposition from '../components/TravelDisposition'

const emptyForm = {
  name: '',
  country_code: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  notes: '',
}

const DELEGATION_COLS =
  'id, name, country_code, contact_name, contact_email, contact_phone, status, access_token, notes'

function portalLink(token) {
  return `${window.location.origin}/portal/${token}`
}

export default function TournamentPage() {
  const { tournamentId } = useParams()
  const [tournament, setTournament] = useState(null)
  const [delegations, setDelegations] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [counts, setCounts] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])

  const personFields = Array.isArray(tournament?.settings?.person_fields)
    ? tournament.settings.person_fields
    : []

  const loadVehicles = useCallback(async () => {
    const { data } = await supabase
      .from('vehicles')
      .select('id, label, capacity')
      .eq('tournament_id', tournamentId)
      .order('label', { ascending: true })
    setVehicles(data ?? [])
  }, [tournamentId])

  useEffect(() => { loadVehicles() }, [loadVehicles])

  // Fahrer = Mitglieder der Organisation mit Rolle 'driver'. Nur user_id
  // verfügbar (kein Profil-Schema in V1) – Anzeige daher per ID-Kürzel.
  useEffect(() => {
    const orgId = tournament?.organization_id
    if (!orgId) return
    supabase
      .from('memberships')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('role', 'driver')
      .then(({ data }) => setDrivers(data ?? []))
  }, [tournament?.organization_id])

  const load = useCallback(async () => {
    const [tRes, dRes] = await Promise.all([
      supabase
        .from('tournaments')
        .select('id, name, starts_on, ends_on, venue, status, submission_deadline, settings, organization_id')
        .eq('id', tournamentId)
        .single(),
      supabase
        .from('delegations')
        .select(DELEGATION_COLS)
        .eq('tournament_id', tournamentId)
        .order('name', { ascending: true }),
    ])
    if (tRes.error) setError(tRes.error.message)
    else setTournament(tRes.data)
    if (dRes.error) {
      setError(dRes.error.message)
      return
    }
    setDelegations(dRes.data)

    // Personenzahl pro Delegation für die Meldeübersicht.
    const ids = dRes.data.map((d) => d.id)
    if (ids.length === 0) {
      setCounts({})
      return
    }
    const { data: pRows, error: pErr } = await supabase
      .from('persons')
      .select('delegation_id')
      .in('delegation_id', ids)
    if (pErr) {
      setError(pErr.message)
      return
    }
    setCounts(
      (pRows ?? []).reduce((acc, r) => {
        acc[r.delegation_id] = (acc[r.delegation_id] ?? 0) + 1
        return acc
      }, {}),
    )
  }, [tournamentId])

  // Personenfelder in tournaments.settings zurückschreiben (Merge, um andere
  // settings-Schlüssel wie fees/meal_slots nicht zu überschreiben).
  async function saveFields(nextFields) {
    const nextSettings = { ...(tournament.settings ?? {}), person_fields: nextFields }
    const { error: upErr } = await supabase
      .from('tournaments')
      .update({ settings: nextSettings })
      .eq('id', tournamentId)
    if (upErr) throw new Error(upErr.message)
    setTournament((t) => ({ ...t, settings: nextSettings }))
  }

  useEffect(() => { load() }, [load])

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function startEdit(d) {
    setEditingId(d.id)
    setForm({
      name: d.name ?? '',
      country_code: d.country_code ?? '',
      contact_name: d.contact_name ?? '',
      contact_email: d.contact_email ?? '',
      contact_phone: d.contact_phone ?? '',
      notes: d.notes ?? '',
    })
    setError(null)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const payload = {
      name: form.name,
      country_code: form.country_code || null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      notes: form.notes || null,
    }

    const { error: writeError } = editingId
      ? await supabase.from('delegations').update(payload).eq('id', editingId)
      : await supabase.from('delegations').insert({ ...payload, tournament_id: tournamentId })

    if (writeError) setError(writeError.message)
    else {
      resetForm()
      await load()
    }
    setBusy(false)
  }

  async function handleDelete(d) {
    if (!confirm(`Delegation „${d.name}" löschen? Personen, Reisen und Wünsche werden mitgelöscht.`)) return
    const { error: delError } = await supabase.from('delegations').delete().eq('id', d.id)
    if (delError) setError(delError.message)
    else {
      if (editingId === d.id) resetForm()
      await load()
    }
  }

  // Token neu erzeugen → alter Zugangslink wird sofort ungültig.
  async function handleRegenerate(d) {
    if (!confirm(`Zugangslink für „${d.name}" neu erzeugen? Der bisherige Link funktioniert danach nicht mehr.`)) return
    const { error: regenError } = await supabase
      .from('delegations')
      .update({ access_token: crypto.randomUUID() })
      .eq('id', d.id)
    if (regenError) setError(regenError.message)
    else await load()
  }

  async function copyLink(d) {
    try {
      await navigator.clipboard.writeText(portalLink(d.access_token))
      setCopiedId(d.id)
      setTimeout(() => setCopiedId((c) => (c === d.id ? null : c)), 2000)
    } catch {
      setError('Konnte den Link nicht in die Zwischenablage kopieren.')
    }
  }

  const deadlinePassed =
    tournament?.submission_deadline &&
    new Date(tournament.submission_deadline).getTime() < Date.now()

  return (
    <div className="page">
      {tournament && (
        <p>
          <Link to={`/org/${tournament.organization_id}`}>← Zurück zur Organisation</Link>
        </p>
      )}
      <h2>{tournament ? tournament.name : 'Lade …'}</h2>
      {tournament && (
        <p className="muted">
          {tournament.starts_on} – {tournament.ends_on}
          {tournament.venue ? ` · ${tournament.venue}` : ''}
          {tournament.submission_deadline
            ? ` · Meldeschluss: ${new Date(tournament.submission_deadline).toLocaleString('de-DE')}`
            : ' · kein Meldeschluss gesetzt'}
          {deadlinePassed ? ' (abgelaufen – Portal ist schreibgeschützt)' : ''}
        </p>
      )}

      <h3>Delegationen &amp; Meldestand</h3>
      {delegations === null && <p className="muted">Lade …</p>}
      {delegations?.length === 0 && <p className="muted">Noch keine Delegationen angelegt.</p>}

      <ul className="item-list">
        {delegations?.map((d) => {
          const count = counts[d.id] ?? 0
          const expanded = expandedId === d.id
          return (
            <li key={d.id} className="item item-col">
              <div className="item-row">
                <div>
                  <strong>{d.name}</strong>
                  {d.country_code ? <span className="muted"> · {d.country_code}</span> : null}
                  <div className="muted">
                    {d.contact_name || '—'}
                    {d.contact_email ? ` · ${d.contact_email}` : ''}
                    {d.contact_phone ? ` · ${d.contact_phone}` : ''}
                  </div>
                </div>
                <div className="meld-status">
                  <span className={count === 0 ? 'count count-zero' : 'count'}>
                    {count} {count === 1 ? 'Person' : 'Personen'}
                  </span>
                  <span className="badge">{d.status}</span>
                </div>
              </div>

              <div className="link-row">
                <input readOnly value={portalLink(d.access_token)} onFocus={(e) => e.target.select()} />
                <button onClick={() => copyLink(d)}>
                  {copiedId === d.id ? 'Kopiert ✓' : 'Kopieren'}
                </button>
              </div>

              <div className="actions">
                <button onClick={() => setExpandedId(expanded ? null : d.id)}>
                  {expanded ? 'Personen ausblenden' : `Personen anzeigen (${count})`}
                </button>
                <button onClick={() => startEdit(d)}>Bearbeiten</button>
                <button onClick={() => handleRegenerate(d)}>Link neu erzeugen</button>
                <button onClick={() => handleDelete(d)}>Löschen</button>
              </div>

              {expanded && (
                <div className="person-panel">
                  <DelegationPersons delegationId={d.id} personFields={personFields} />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {tournament && (
        <TravelDisposition
          tournamentId={tournamentId}
          vehicles={vehicles}
          drivers={drivers}
          venue={tournament.venue}
        />
      )}

      {tournament && <VehiclesManager tournamentId={tournamentId} vehicles={vehicles} onChanged={loadVehicles} />}

      {tournament && <PersonFieldsEditor fields={personFields} onChange={saveFields} />}

      <div className="card">
        <h3>{editingId ? 'Delegation bearbeiten' : 'Neue Delegation'}</h3>
        <form onSubmit={handleSubmit} className="stack">
          <div className="row">
            <label>
              Name
              <input value={form.name} onChange={setField('name')} required
                placeholder="z. B. Deutschland Nord" />
            </label>
            <label>
              Länderkürzel
              <input value={form.country_code} onChange={setField('country_code')}
                placeholder="z. B. DEU-NR" />
            </label>
          </div>
          <label>
            Ansprechpartner
            <input value={form.contact_name} onChange={setField('contact_name')} placeholder="optional" />
          </label>
          <div className="row">
            <label>
              E-Mail
              <input type="email" value={form.contact_email} onChange={setField('contact_email')}
                placeholder="optional" />
            </label>
            <label>
              Telefon
              <input value={form.contact_phone} onChange={setField('contact_phone')} placeholder="optional" />
            </label>
          </div>
          <label>
            Notizen
            <input value={form.notes} onChange={setField('notes')} placeholder="optional" />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Bitte warten …' : editingId ? 'Änderungen speichern' : 'Delegation anlegen'}
            </button>
            {editingId && <button type="button" onClick={resetForm} disabled={busy}>Abbrechen</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
