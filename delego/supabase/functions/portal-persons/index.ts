// POST { token, action, person } → Person anlegen/ändern/löschen.
// action: 'create' | 'update' | 'delete'
//
// Durchsetzung (serverseitig, autoritativ):
//  - Token wird zu genau einer delegation_id aufgelöst.
//  - Nach Ablauf von submission_deadline: 403 für JEDEN Schreibvorgang.
//  - update/delete filtern zusätzlich auf delegation_id → ein fremder person_id
//    trifft 0 Zeilen und liefert 404. Kein Cross-Delegation-Zugriff.
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, listPersons, resolveToken } from '../_shared/portal.ts'

const ROLES = ['athlete', 'coach', 'official']

type PersonInput = {
  id?: string
  last_name?: unknown
  first_name?: unknown
  gender?: unknown
  role?: unknown
  custom_fields?: unknown
  notes?: unknown
}

function cleanFields(p: PersonInput) {
  const last_name = typeof p.last_name === 'string' ? p.last_name.trim() : ''
  const first_name = typeof p.first_name === 'string' ? p.first_name.trim() : ''
  const role = typeof p.role === 'string' ? p.role : 'athlete'
  const gender = typeof p.gender === 'string' && p.gender.trim() ? p.gender.trim() : null
  const notes = typeof p.notes === 'string' && p.notes.trim() ? p.notes.trim() : null
  const custom_fields =
    p.custom_fields && typeof p.custom_fields === 'object' && !Array.isArray(p.custom_fields)
      ? (p.custom_fields as Record<string, unknown>)
      : {}
  return { last_name, first_name, role, gender, notes, custom_fields }
}

type FieldDef = { key?: unknown; label?: unknown; type?: unknown; required?: unknown }

// Serverseitige Pflichtfeld-Prüfung – autoritativ, spiegelt firstMissingRequired
// im Frontend (src/lib/personFields.js). Quelle ist dieselbe Konfiguration, die
// die Delegation im Portal sieht (tournaments.settings.person_fields). 'boolean'
// ist von 'required' ausgenommen (hat immer einen Wert). Gibt das Label des
// ersten fehlenden Pflichtfeldes zurück oder null.
function firstMissingRequired(
  personFields: unknown,
  custom: Record<string, unknown>,
): string | null {
  if (!Array.isArray(personFields)) return null
  for (const f of personFields as FieldDef[]) {
    if (!f || f.required !== true || f.type === 'boolean') continue
    const key = typeof f.key === 'string' ? f.key : ''
    if (!key) continue
    const v = custom?.[key]
    if (v === undefined || v === null || String(v).trim() === '') {
      return typeof f.label === 'string' && f.label ? f.label : key
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const { token, action, person } = await req.json().catch(() => ({}))
    const admin = adminClient()

    const ctx = await resolveToken(admin, token)
    if (!ctx) return json({ error: 'invalid token' }, 404)

    // Deadline-Sperre: harte serverseitige Durchsetzung für alle Schreibaktionen.
    if (ctx.readOnly) {
      return json(
        { error: 'submission_deadline_passed', message: 'Die Meldefrist ist abgelaufen. Änderungen sind nicht mehr möglich.' },
        403,
      )
    }

    const personFields = ctx.tournament.settings?.person_fields

    if (action === 'create') {
      const f = cleanFields(person ?? {})
      if (!f.last_name || !f.first_name) {
        return json({ error: 'last_name und first_name sind Pflicht' }, 400)
      }
      if (!ROLES.includes(f.role)) return json({ error: 'ungültige Rolle' }, 400)
      const missing = firstMissingRequired(personFields, f.custom_fields)
      if (missing) {
        return json({ error: 'required_field_missing', field: missing, message: `Pflichtfeld fehlt: ${missing}` }, 400)
      }

      const { error } = await admin
        .from('persons')
        .insert({ delegation_id: ctx.delegationId, ...f })
      if (error) throw error

      // Status von 'invited' auf 'in_progress' heben, sobald die Delegation
      // anfängt zu arbeiten.
      if (ctx.status === 'invited') {
        await admin
          .from('delegations')
          .update({ status: 'in_progress' })
          .eq('id', ctx.delegationId)
      }
    } else if (action === 'update') {
      const id = typeof person?.id === 'string' ? person.id : null
      if (!id) return json({ error: 'person.id fehlt' }, 400)
      const f = cleanFields(person)
      if (!f.last_name || !f.first_name) {
        return json({ error: 'last_name und first_name sind Pflicht' }, 400)
      }
      if (!ROLES.includes(f.role)) return json({ error: 'ungültige Rolle' }, 400)
      const missing = firstMissingRequired(personFields, f.custom_fields)
      if (missing) {
        return json({ error: 'required_field_missing', field: missing, message: `Pflichtfeld fehlt: ${missing}` }, 400)
      }

      const { data, error } = await admin
        .from('persons')
        .update(f)
        .eq('id', id)
        .eq('delegation_id', ctx.delegationId) // Scope-Schutz
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) return json({ error: 'not found' }, 404)
    } else if (action === 'delete') {
      const id = typeof person?.id === 'string' ? person.id : null
      if (!id) return json({ error: 'person.id fehlt' }, 400)

      const { data, error } = await admin
        .from('persons')
        .delete()
        .eq('id', id)
        .eq('delegation_id', ctx.delegationId) // Scope-Schutz
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) return json({ error: 'not found' }, 404)
    } else {
      return json({ error: 'unbekannte action' }, 400)
    }

    const persons = await listPersons(admin, ctx.delegationId)
    return json({ persons })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
