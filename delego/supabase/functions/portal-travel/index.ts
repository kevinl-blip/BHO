// POST { token, action, travel_group } → Reisegruppe anlegen/ändern/löschen.
// action: 'create' | 'update' | 'delete'
//
// Durchsetzung (serverseitig, autoritativ, gleiche Reihenfolge wie portal-persons):
//  1. Token → genau eine delegation_id.
//  2. Deadline: nach Ablauf 403 für JEDEN Schreibvorgang – VOR allem anderen.
//  3. Validierung (400): Richtung, scheduled_at, und – Kernschutz – alle
//     person_ids müssen zu DIESER Delegation gehören (validateDelegationPersons).
//  4. Schreiben: Gruppe wird immer mit delegation_id = ctx.delegationId angelegt;
//     update/delete filtern zusätzlich auf delegation_id (fremde id → 404).
//     Mitglieder werden atomar ersetzt (löschen + geprüften Satz einfügen).
import { corsHeaders, json } from '../_shared/cors.ts'
import {
  adminClient,
  listTravelGroups,
  resolveToken,
  validateDelegationPersons,
} from '../_shared/portal.ts'

const DIRECTIONS = ['arrival', 'departure']

type TravelInput = {
  id?: unknown
  direction?: unknown
  scheduled_at?: unknown
  carrier_ref?: unknown
  location?: unknown
  notes?: unknown
  person_ids?: unknown
}

function cleanTravel(t: TravelInput) {
  const direction = typeof t.direction === 'string' ? t.direction : ''
  const scheduled_at = typeof t.scheduled_at === 'string' ? t.scheduled_at : ''
  const carrier_ref =
    typeof t.carrier_ref === 'string' && t.carrier_ref.trim() ? t.carrier_ref.trim() : null
  const location =
    typeof t.location === 'string' && t.location.trim() ? t.location.trim() : null
  const notes = typeof t.notes === 'string' && t.notes.trim() ? t.notes.trim() : null
  return { direction, scheduled_at, carrier_ref, location, notes }
}

// Ersetzt die Mitglieder einer Gruppe durch den bereits geprüften Satz.
async function replaceMembers(
  admin: ReturnType<typeof adminClient>,
  groupId: string,
  personIds: string[],
) {
  const { error: delErr } = await admin
    .from('travel_group_members')
    .delete()
    .eq('travel_group_id', groupId)
  if (delErr) throw delErr
  if (personIds.length === 0) return
  const rows = personIds.map((pid) => ({ travel_group_id: groupId, person_id: pid }))
  const { error: insErr } = await admin.from('travel_group_members').insert(rows)
  if (insErr) throw insErr
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const { token, action, travel_group } = await req.json().catch(() => ({}))
    const admin = adminClient()

    const ctx = await resolveToken(admin, token)
    if (!ctx) return json({ error: 'invalid token' }, 404)

    // Deadline-Sperre: harte serverseitige Durchsetzung, VOR jeder anderen Prüfung.
    if (ctx.readOnly) {
      return json(
        { error: 'submission_deadline_passed', message: 'Die Meldefrist ist abgelaufen. Änderungen sind nicht mehr möglich.' },
        403,
      )
    }

    if (action === 'create' || action === 'update') {
      const t = cleanTravel(travel_group ?? {})
      if (!DIRECTIONS.includes(t.direction)) {
        return json({ error: 'ungültige Richtung (arrival|departure)' }, 400)
      }
      if (!t.scheduled_at || Number.isNaN(new Date(t.scheduled_at).getTime())) {
        return json({ error: 'scheduled_at ist Pflicht (gültiger Zeitpunkt)' }, 400)
      }

      // Mitglieder aus member_ids lesen (kanonisch, so liefert portal-session
      // sie auch). person_ids bleibt als Alias toleriert, damit ein
      // Feldnamen-Mismatch nicht still Mitglieder verschluckt.
      const rawMemberIds = (travel_group ?? {}).member_ids ?? (travel_group ?? {}).person_ids

      // Kernschutz gegen Cross-Delegation: ALLE IDs müssen zu DIESER Delegation
      // gehören. Eine fremde ID → harte Ablehnung, KEIN stilles Herausfiltern.
      const check = await validateDelegationPersons(admin, ctx.delegationId, rawMemberIds)
      if ('error' in check) {
        return json(
          { error: check.error, message: 'Mindestens eine ausgewählte Person gehört nicht zu dieser Delegation.' },
          400,
        )
      }
      const personIds = check.ok

      // Keine leere Reisegruppe: mindestens eine gültige Person dieser
      // Delegation ist Pflicht (auch bei Update).
      if (personIds.length === 0) {
        return json(
          { error: 'no_members', message: 'Eine Reisegruppe braucht mindestens eine Person dieser Delegation.' },
          400,
        )
      }

      if (action === 'create') {
        const { data, error } = await admin
          .from('travel_groups')
          .insert({ delegation_id: ctx.delegationId, ...t })
          .select('id')
          .single()
        if (error) throw error
        try {
          await replaceMembers(admin, data.id, personIds)
        } catch (memberErr) {
          // Kein Waise: eben erzeugte Gruppe wieder entfernen.
          await admin.from('travel_groups').delete().eq('id', data.id)
          throw memberErr
        }
      } else {
        const id = typeof travel_group?.id === 'string' ? travel_group.id : null
        if (!id) return json({ error: 'travel_group.id fehlt' }, 400)

        const { data, error } = await admin
          .from('travel_groups')
          .update(t)
          .eq('id', id)
          .eq('delegation_id', ctx.delegationId) // Scope-Schutz
          .select('id')
        if (error) throw error
        if (!data || data.length === 0) return json({ error: 'not found' }, 404)

        await replaceMembers(admin, id, personIds)
      }

      if (ctx.status === 'invited') {
        await admin
          .from('delegations')
          .update({ status: 'in_progress' })
          .eq('id', ctx.delegationId)
      }
    } else if (action === 'delete') {
      const id = typeof travel_group?.id === 'string' ? travel_group.id : null
      if (!id) return json({ error: 'travel_group.id fehlt' }, 400)

      const { data, error } = await admin
        .from('travel_groups')
        .delete()
        .eq('id', id)
        .eq('delegation_id', ctx.delegationId) // Scope-Schutz
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) return json({ error: 'not found' }, 404)
    } else {
      return json({ error: 'unbekannte action' }, 400)
    }

    const travel_groups = await listTravelGroups(admin, ctx.delegationId)
    return json({ travel_groups })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
