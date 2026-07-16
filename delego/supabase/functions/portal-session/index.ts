// POST { token } → Kontext + Personenliste der zugehörigen Delegation.
// Öffentlich erreichbar (Deploy mit --no-verify-jwt); die Auth ist der Token.
import { corsHeaders, json } from '../_shared/cors.ts'
import {
  adminClient,
  listAccommodationRequests,
  listHotelsWithCategories,
  listPersons,
  listTravelGroups,
  resolveToken,
} from '../_shared/portal.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const { token } = await req.json().catch(() => ({}))
    const admin = adminClient()

    const ctx = await resolveToken(admin, token)
    if (!ctx) return json({ error: 'invalid token' }, 404)

    const [persons, travel_groups, hotels] = await Promise.all([
      listPersons(admin, ctx.delegationId),
      listTravelGroups(admin, ctx.delegationId),
      listHotelsWithCategories(admin, ctx.tournamentId),
    ])
    const accommodation_requests = await listAccommodationRequests(
      admin,
      (persons ?? []).map((p) => p.id),
    )

    return json({
      tournament: {
        name: ctx.tournament.name,
        starts_on: ctx.tournament.starts_on,
        ends_on: ctx.tournament.ends_on,
        venue: ctx.tournament.venue,
        submission_deadline: ctx.tournament.submission_deadline,
        // Turnierspezifische Zusatzfelder pro Person (konfigurierbar).
        person_fields: ctx.tournament.settings?.person_fields ?? [],
      },
      delegation: { status: ctx.status },
      read_only: ctx.readOnly,
      persons,
      travel_groups,
      hotels,
      accommodation_requests,
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
