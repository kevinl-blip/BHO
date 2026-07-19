import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCustomValue } from '../lib/personFields'

// Nur-Lese-Ansicht der gemeldeten Personen einer Delegation (Veranstalterseite),
// inkl. Unterkunftswünsche pro Person (mit Selbstbucher-Kennzeichnung).
// Liest über den authentifizierten Client; RLS (per_select / ar_select) erlaubt
// Mitgliedern der Organisation den Zugriff. Keine Bearbeitung in diesem Meilenstein.
export default function DelegationPersons({ delegationId, personFields, hotels = [] }) {
  const [persons, setPersons] = useState(null)
  const [requestsByPerson, setRequestsByPerson] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: pData, error: pErr } = await supabase
        .from('persons')
        .select('id, last_name, first_name, gender, role, custom_fields, notes')
        .eq('delegation_id', delegationId)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
      if (!active) return
      if (pErr) { setError(pErr.message); return }
      setPersons(pData)

      const ids = (pData ?? []).map((p) => p.id)
      if (ids.length === 0) { setRequestsByPerson({}); return }
      const { data: rData, error: rErr } = await supabase
        .from('accommodation_requests')
        .select('id, person_id, hotel_id, room_category_id, check_in, check_out, roommate_wish, remarks')
        .in('person_id', ids)
        .order('check_in', { ascending: true })
      if (!active) return
      if (rErr) { setError(rErr.message); return }
      const byPerson = {}
      for (const r of rData ?? []) {
        ;(byPerson[r.person_id] = byPerson[r.person_id] ?? []).push(r)
      }
      setRequestsByPerson(byPerson)
    }
    load()
    return () => { active = false }
  }, [delegationId])

  if (error) return <p className="error">{error}</p>
  if (persons === null) return <p className="muted">Lade Personen …</p>
  if (persons.length === 0) return <p className="muted">Keine Personen gemeldet.</p>

  const fields = Array.isArray(personFields) ? personFields : []
  const hotelById = new Map(hotels.map((h) => [h.id, h]))
  const categoryById = new Map(
    hotels.flatMap((h) => (h.room_categories ?? []).map((c) => [c.id, c])),
  )

  function renderRequest(r) {
    const hotel = hotelById.get(r.hotel_id)
    const selfBooked = hotel && !hotel.is_official
    if (selfBooked) {
      return (
        <span key={r.id} className="chip">
          {hotel?.name ?? 'Hotel'} · <strong>Selbstbucher</strong>
          {r.remarks ? ` · ${r.remarks}` : ''}
        </span>
      )
    }
    const cat = categoryById.get(r.room_category_id)
    return (
      <span key={r.id} className="chip">
        {(hotel?.name ?? 'Hotel')}{cat ? ` · ${cat.label}` : ''} · {r.check_in} → {r.check_out}
        {r.roommate_wish ? ` · mit: ${r.roommate_wish}` : ''}
      </span>
    )
  }

  return (
    <ul className="person-list">
      {persons.map((p) => {
        const reqs = requestsByPerson[p.id] ?? []
        return (
          <li key={p.id}>
            <strong>{p.last_name}, {p.first_name}</strong>
            <span className="muted">
              {' '}· {p.role}{p.gender ? ` · ${p.gender}` : ''}
            </span>
            {fields.length > 0 && (
              <div className="muted person-custom">
                {fields.map((f) => (
                  <span key={f.key} className="chip">
                    {f.label}: {formatCustomValue(f, p.custom_fields?.[f.key], { yes: 'Ja', no: 'Nein' })}
                  </span>
                ))}
              </div>
            )}
            {reqs.length > 0 && (
              <div className="muted person-custom">
                <span className="field-legend">Unterkunft:</span>
                {reqs.map(renderRequest)}
              </div>
            )}
            {p.notes && <div className="muted">Notiz: {p.notes}</div>}
          </li>
        )
      })}
    </ul>
  )
}
