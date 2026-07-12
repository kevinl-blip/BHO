// POST { token, action, ... } → Anwesenheitsstatus setzen / Walk-ins pflegen.
// action: 'set_status' | 'walkin_add' | 'walkin_remove'
//
// Durchsetzung (serverseitig, autoritativ):
//  - Token → genau ein Koordinator → tournament_id (nie aus dem Client).
//  - set_status: person_id muss über persons→delegations zum Turnier des Tokens
//    gehören, sonst 400 person_not_in_tournament (harte Ablehnung, kein Filtern).
//  - walkins werden mit tournament_id = ctx.tournamentId geschrieben; ein
//    optionales delegation_id wird gegen dasselbe Turnier geprüft.
//  - Kein Deadline-Check: Check-ins passieren am Einsatztag NACH der Meldefrist.
import { corsHeaders, json } from '../_shared/cors.ts'
import {
  adminClient,
  delegationInTournament,
  personInTournament,
  resolveCoordinatorToken,
} from '../_shared/portal.ts'

const STATUSES = ['expected', 'present', 'missing']

async function listWalkins(admin: ReturnType<typeof adminClient>, tournamentId: string) {
  const { data, error } = await admin
    .from('walkins')
    .select('id, name, note, delegation_id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const { token, action } = body
    const admin = adminClient()

    const ctx = await resolveCoordinatorToken(admin, token)
    if (!ctx) return json({ error: 'invalid token' }, 404)

    if (action === 'set_status') {
      const personId = typeof body.person_id === 'string' ? body.person_id : null
      const status = typeof body.status === 'string' ? body.status : ''
      if (!personId) return json({ error: 'person_id fehlt' }, 400)
      if (!STATUSES.includes(status)) return json({ error: 'ungültiger Status' }, 400)

      // Cross-Tournament-Schutz: Person muss zum Turnier des Tokens gehören.
      const ok = await personInTournament(admin, ctx.tournamentId, personId)
      if (!ok) {
        return json(
          { error: 'person_not_in_tournament', message: 'Diese Person gehört nicht zu diesem Turnier.' },
          400,
        )
      }

      const { error } = await admin
        .from('arrival_checkins')
        .upsert(
          {
            person_id: personId,
            status,
            set_by_coordinator_id: ctx.coordinatorId,
            checked_at: new Date().toISOString(),
          },
          { onConflict: 'person_id' },
        )
      if (error) throw error
      return json({ person_id: personId, status })
    }

    if (action === 'walkin_add') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
      const delegationId = typeof body.delegation_id === 'string' ? body.delegation_id : null
      if (!name) return json({ error: 'name ist Pflicht' }, 400)

      if (delegationId) {
        const ok = await delegationInTournament(admin, ctx.tournamentId, delegationId)
        if (!ok) {
          return json(
            { error: 'delegation_not_in_tournament', message: 'Diese Delegation gehört nicht zu diesem Turnier.' },
            400,
          )
        }
      }

      const { error } = await admin.from('walkins').insert({
        tournament_id: ctx.tournamentId,
        delegation_id: delegationId,
        name,
        note,
        reported_by_coordinator_id: ctx.coordinatorId,
      })
      if (error) throw error
      return json({ walkins: await listWalkins(admin, ctx.tournamentId) })
    }

    if (action === 'walkin_remove') {
      const id = typeof body.id === 'string' ? body.id : null
      if (!id) return json({ error: 'id fehlt' }, 400)
      const { error } = await admin
        .from('walkins')
        .delete()
        .eq('id', id)
        .eq('tournament_id', ctx.tournamentId) // Scope-Schutz
      if (error) throw error
      return json({ walkins: await listWalkins(admin, ctx.tournamentId) })
    }

    return json({ error: 'unbekannte action' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
