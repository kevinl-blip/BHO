// POST { token } → Fahrer-Kontext + dessen eigene Fahrten (chronologisch).
// Nur Lesen. Öffentlich erreichbar (Deploy mit --no-verify-jwt); Auth = Token.
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, resolveDriverToken } from '../_shared/portal.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const { token } = await req.json().catch(() => ({}))
    const admin = adminClient()

    const ctx = await resolveDriverToken(admin, token)
    if (!ctx) return json({ error: 'invalid token' }, 404)

    const { data: transfers, error: tErr } = await admin
      .from('transfers')
      .select('id, travel_group_ids, pickup_at, from_location, to_location, status')
      .eq('driver_id', ctx.driverId)
      .order('pickup_at', { ascending: true, nullsFirst: true })
    if (tErr) throw tErr

    // Personen aller referenzierten Reisegruppen in einem Rutsch laden.
    const groupIds = [...new Set((transfers ?? []).flatMap((t) => t.travel_group_ids ?? []))]
    const groupPeople = new Map<string, { last_name: string; first_name: string }[]>()
    if (groupIds.length > 0) {
      const { data: groups, error: gErr } = await admin
        .from('travel_groups')
        .select('id, travel_group_members ( persons ( last_name, first_name ) )')
        .in('id', groupIds)
      if (gErr) throw gErr
      for (const g of groups ?? []) {
        const members = Array.isArray(g.travel_group_members) ? g.travel_group_members : []
        groupPeople.set(
          g.id,
          members
            .map((m: { persons: unknown }) => (Array.isArray(m.persons) ? m.persons[0] : m.persons))
            .filter(Boolean),
        )
      }
    }

    const rides = (transfers ?? []).map((t) => {
      const people = (t.travel_group_ids ?? []).flatMap((gid: string) => groupPeople.get(gid) ?? [])
      return {
        id: t.id,
        pickup_at: t.pickup_at,
        from_location: t.from_location,
        to_location: t.to_location,
        status: t.status,
        // Zielhotel folgt mit der Hotelzuteilung (späterer Meilenstein).
        destination_hotel: null,
        people,
      }
    })

    return json({ driver: { name: ctx.name }, rides })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
