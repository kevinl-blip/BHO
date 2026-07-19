import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useEditScroll } from '../lib/useEditScroll'

const STATUSES = ['unassigned', 'assigned', 'en_route', 'completed']

function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localToIso(local) {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function fmt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE')
}

const emptyEdit = {
  driver_id: '',
  vehicle_id: '',
  pickupLocal: '',
  from_location: '',
  to_location: '',
  status: 'unassigned',
  notes: '',
}

// Disposition beim Veranstalter: Reisegruppen des Turniers → Fahrten (transfers).
// Alles über den authentifizierten Client; RLS (tg_select / tra_write) greift.
export default function TravelDisposition({ tournamentId, vehicles, drivers, venue }) {
  const [groups, setGroups] = useState(null)
  const [transfers, setTransfers] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [directionFilter, setDirectionFilter] = useState('arrival')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyEdit)
  const [error, setError] = useState(null)
  const editRef = useEditScroll(editingId)

  const load = useCallback(async () => {
    const [gRes, tRes] = await Promise.all([
      supabase
        .from('travel_groups')
        .select(
          'id, direction, scheduled_at, carrier_ref, location, status, delegation_id, delegations!inner ( name, tournament_id ), travel_group_members ( person_id )',
        )
        .eq('delegations.tournament_id', tournamentId)
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('transfers')
        .select('id, travel_group_ids, driver_id, vehicle_id, pickup_at, from_location, to_location, status, notes')
        .eq('tournament_id', tournamentId)
        .order('pickup_at', { ascending: true, nullsFirst: true }),
    ])
    if (gRes.error) return setError(gRes.error.message)
    if (tRes.error) return setError(tRes.error.message)

    setGroups(
      (gRes.data ?? []).map((g) => {
        const del = Array.isArray(g.delegations) ? g.delegations[0] : g.delegations
        const members = Array.isArray(g.travel_group_members) ? g.travel_group_members : []
        return {
          id: g.id,
          direction: g.direction,
          scheduled_at: g.scheduled_at,
          carrier_ref: g.carrier_ref,
          location: g.location,
          status: g.status,
          delegationName: del?.name ?? '—',
          memberCount: members.length,
        }
      }),
    )
    setTransfers(tRes.data ?? [])
  }, [tournamentId])

  useEffect(() => { load() }, [load])

  const groupById = new Map((groups ?? []).map((g) => [g.id, g]))
  const assignedIds = new Set((transfers ?? []).flatMap((t) => t.travel_group_ids ?? []))
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]))
  const driverById = new Map(drivers.map((d) => [d.id, d]))
  const activeDrivers = drivers.filter((d) => d.active)
  const shownGroups = (groups ?? []).filter((g) => g.direction === directionFilter)

  function driverName(id) {
    return id ? (driverById.get(id)?.name ?? 'Fahrer entfernt') : 'kein Fahrer'
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function createTransfer() {
    setError(null)
    const ids = [...selected]
    if (ids.length === 0) return
    const sel = ids.map((id) => groupById.get(id)).filter(Boolean)
    const earliest = sel.map((g) => g.scheduled_at).filter(Boolean).sort()[0] ?? null
    const commonLoc = sel.find((g) => g.location)?.location ?? null

    const { error: insErr } = await supabase.from('transfers').insert({
      tournament_id: tournamentId,
      travel_group_ids: ids,
      status: 'unassigned',
      pickup_at: earliest,
      from_location: commonLoc,
      to_location: venue ?? null,
    })
    if (insErr) return setError(insErr.message)
    setSelected(new Set())
    await load()
  }

  function startEdit(t) {
    setEditingId(t.id)
    setEditForm({
      driver_id: t.driver_id ?? '',
      vehicle_id: t.vehicle_id ?? '',
      pickupLocal: isoToLocalInput(t.pickup_at),
      from_location: t.from_location ?? '',
      to_location: t.to_location ?? '',
      status: t.status ?? 'unassigned',
      notes: t.notes ?? '',
    })
    setError(null)
  }

  async function saveTransfer() {
    setError(null)
    const payload = {
      driver_id: editForm.driver_id || null,
      vehicle_id: editForm.vehicle_id || null,
      pickup_at: localToIso(editForm.pickupLocal),
      from_location: editForm.from_location || null,
      to_location: editForm.to_location || null,
      status: editForm.status,
      notes: editForm.notes || null,
    }
    const { error: upErr } = await supabase.from('transfers').update(payload).eq('id', editingId)
    if (upErr) return setError(upErr.message)
    setEditingId(null)
    await load()
  }

  async function removeGroup(t, gid) {
    const next = (t.travel_group_ids ?? []).filter((x) => x !== gid)
    const { error: upErr } = await supabase
      .from('transfers')
      .update({ travel_group_ids: next })
      .eq('id', t.id)
    if (upErr) return setError(upErr.message)
    await load()
  }

  async function deleteTransfer(t) {
    if (!confirm('Fahrt löschen? Die Reisegruppen werden dadurch wieder frei.')) return
    const { error: delErr } = await supabase.from('transfers').delete().eq('id', t.id)
    if (delErr) return setError(delErr.message)
    await load()
  }

  function passengers(t) {
    return (t.travel_group_ids ?? []).reduce((sum, gid) => sum + (groupById.get(gid)?.memberCount ?? 0), 0)
  }

  if (groups === null || transfers === null) return <p className="muted">Lade Reisedaten …</p>

  return (
    <div className="card">
      <h3>Ankünfte &amp; Disposition</h3>
      {error && <p className="error">{error}</p>}

      <div className="dir-filter">
        {['arrival', 'departure'].map((d) => (
          <button
            key={d}
            className={directionFilter === d ? 'tab active' : 'tab'}
            onClick={() => setDirectionFilter(d)}
          >
            {d === 'arrival' ? 'Ankünfte' : 'Abreisen'}
          </button>
        ))}
      </div>

      {shownGroups.length === 0 && <p className="muted">Keine Reisegruppen in dieser Richtung.</p>}
      <ul className="item-list">
        {shownGroups.map((g) => {
          const isAssigned = assignedIds.has(g.id)
          return (
            <li key={g.id} className="item travel-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selected.has(g.id)}
                  disabled={isAssigned}
                  onChange={() => toggleSelect(g.id)}
                />
                <span>
                  <strong>{fmt(g.scheduled_at)}</strong>
                  {g.location ? ` · ${g.location}` : ''}
                  {g.carrier_ref ? ` · ${g.carrier_ref}` : ''}
                  <div className="muted">
                    {g.delegationName} · {g.memberCount} {g.memberCount === 1 ? 'Person' : 'Personen'}
                  </div>
                </span>
              </label>
              {isAssigned
                ? <span className="badge">verplant</span>
                : <span className="badge badge-free">frei</span>}
            </li>
          )
        })}
      </ul>

      <button className="primary" onClick={createTransfer} disabled={selected.size === 0}>
        Fahrt aus {selected.size} Auswahl{selected.size === 1 ? '' : 'en'} erstellen
      </button>

      <h4 className="section-gap">Fahrten ({transfers.length})</h4>
      {transfers.length === 0 && <p className="muted">Noch keine Fahrten angelegt.</p>}
      <ul className="item-list">
        {transfers.map((t) => {
          const cap = t.vehicle_id ? vehicleById.get(t.vehicle_id)?.capacity : null
          const pax = passengers(t)
          const over = cap != null && pax > cap
          return (
            <li key={t.id} className="item item-col">
              <div className="item-row">
                <div>
                  <strong>{fmt(t.pickup_at)}</strong>
                  <div className="muted">
                    {(t.from_location || '—')} → {(t.to_location || '—')}
                  </div>
                  <div className="muted">
                    {driverName(t.driver_id)}
                    {' · '}
                    {t.vehicle_id ? (vehicleById.get(t.vehicle_id)?.label ?? 'Fahrzeug') : 'kein Fahrzeug'}
                    {' · '}
                    <span className={over ? 'count-zero' : ''}>
                      {pax} Pax{cap != null ? ` / ${cap}` : ''}
                    </span>
                    {over ? ' ⚠ Kapazität überschritten' : ''}
                  </div>
                </div>
                <span className="badge">{t.status}</span>
              </div>

              <div className="muted transfer-groups">
                {(t.travel_group_ids ?? []).length === 0 && <em>keine Reisegruppen</em>}
                {(t.travel_group_ids ?? []).map((gid) => {
                  const g = groupById.get(gid)
                  return (
                    <span key={gid} className="chip">
                      {g ? `${g.delegationName} · ${fmt(g.scheduled_at)}` : gid}
                      <button className="chip-x" title="herauslösen" onClick={() => removeGroup(t, gid)}>×</button>
                    </span>
                  )
                })}
              </div>

              {editingId === t.id ? (
                <div ref={editRef} className="stack transfer-edit">
                  <div className="row">
                    <label>
                      Fahrer
                      <select
                        value={editForm.driver_id}
                        onChange={(e) => setEditForm((f) => ({ ...f, driver_id: e.target.value }))}
                      >
                        <option value="">— kein Fahrer —</option>
                        {activeDrivers.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                        {/* Bereits zugewiesener, inzwischen inaktiver Fahrer bleibt wählbar sichtbar */}
                        {editForm.driver_id && !driverById.get(editForm.driver_id)?.active && driverById.get(editForm.driver_id) && (
                          <option value={editForm.driver_id}>{driverById.get(editForm.driver_id).name} (inaktiv)</option>
                        )}
                      </select>
                    </label>
                    <label>
                      Fahrzeug
                      <select
                        value={editForm.vehicle_id}
                        onChange={(e) => setEditForm((f) => ({ ...f, vehicle_id: e.target.value }))}
                      >
                        <option value="">— kein Fahrzeug —</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>{v.label} ({v.capacity})</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Abholzeit
                      <input
                        type="datetime-local"
                        value={editForm.pickupLocal}
                        onChange={(e) => setEditForm((f) => ({ ...f, pickupLocal: e.target.value }))}
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Von
                      <input
                        value={editForm.from_location}
                        onChange={(e) => setEditForm((f) => ({ ...f, from_location: e.target.value }))}
                      />
                    </label>
                    <label>
                      Nach
                      <input
                        value={editForm.to_location}
                        onChange={(e) => setEditForm((f) => ({ ...f, to_location: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="actions">
                    <button className="primary" onClick={saveTransfer}>Speichern</button>
                    <button onClick={() => setEditingId(null)}>Abbrechen</button>
                  </div>
                </div>
              ) : (
                <div className="actions">
                  <button onClick={() => startEdit(t)}>Bearbeiten</button>
                  <button onClick={() => deleteTransfer(t)}>Löschen</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
