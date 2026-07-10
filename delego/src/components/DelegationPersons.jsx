import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCustomValue } from '../lib/personFields'

// Nur-Lese-Ansicht der gemeldeten Personen einer Delegation (Veranstalterseite).
// Liest über den authentifizierten Client; RLS (per_select) erlaubt Mitgliedern
// der Organisation den Zugriff. Keine Bearbeitung in diesem Meilenstein.
export default function DelegationPersons({ delegationId, personFields }) {
  const [persons, setPersons] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    supabase
      .from('persons')
      .select('id, last_name, first_name, gender, role, custom_fields, notes')
      .eq('delegation_id', delegationId)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .then(({ data, error: err }) => {
        if (!active) return
        if (err) setError(err.message)
        else setPersons(data)
      })
    return () => { active = false }
  }, [delegationId])

  if (error) return <p className="error">{error}</p>
  if (persons === null) return <p className="muted">Lade Personen …</p>
  if (persons.length === 0) return <p className="muted">Keine Personen gemeldet.</p>

  const fields = Array.isArray(personFields) ? personFields : []

  return (
    <ul className="person-list">
      {persons.map((p) => (
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
          {p.notes && <div className="muted">Notiz: {p.notes}</div>}
        </li>
      ))}
    </ul>
  )
}
