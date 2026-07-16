// POST { token } → Fahrer-Kontext + dessen eigene Fahrten (chronologisch),
// inkl. Check-in-Status der Passagiere und Kontakte der aktiven Koordinatoren.
// Nur Lesen. Öffentlich erreichbar (Deploy mit --no-verify-jwt); Auth = Token.
//
// Scope: Passagiere und Check-in-Status stammen ausschließlich aus den
// Reisegruppen der Fahrten DIESES Fahrers; Koordinatoren aus DESSEN Turnier.
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

    // Personen (inkl. id) aller referenzierten Reisegruppen laden.
    const groupIds = [...new Set((transfers ?? []).flatMap((t) => t.travel_group_ids ?? []))]
    const groupPeople = new Map<string, { id: string; last_name: string; first_name: string }[]>()
    const allPersonIds = new Set<string>()
    if (groupIds.length > 0) {
      const { data: groups, error: gErr } = await admin
        .from('travel_groups')
        .select('id, travel_group_members ( persons ( id, last_name, first_name ) )')
        .in('id', groupIds)
      if (gErr) throw gErr
      for (const g of groups ?? []) {
        const members = Array.isArray(g.travel_group_members) ? g.travel_group_members : []
        const people = members
          .map((m: { persons: unknown }) => (Array.isArray(m.persons) ? m.persons[0] : m.persons))
          .filter(Boolean) as { id: string; last_name: string; first_name: string }[]
        for (const p of people) allPersonIds.add(p.id)
        groupPeople.set(g.id, people)
      }
    }

    // Check-in-Status genau dieser Passagiere.
    const statusByPerson = new Map<string, string>()
    if (allPersonIds.size > 0) {
      const { data: checkins, error: cErr } = await admin
        .from('arrival_checkins')
        .select('person_id, status')
        .in('person_id', [...allPersonIds])
      if (cErr) throw cErr
      for (const c of checkins ?? []) statusByPerson.set(c.person_id, c.status)
    }

    const rides = (transfers ?? []).map((t) => {
      const people = (t.travel_group_ids ?? []).flatMap((gid: string) =>
        (groupPeople.get(gid) ?? []).map((p) => ({
          last_name: p.last_name,
          first_name: p.first_name,
          status: statusByPerson.get(p.id) ?? 'expected',
        })),
      )
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

    // Aktive Koordinatoren des Turniers als Kontakt.
    const { data: coordinators, error: coErr } = await admin
      .from('coordinators')
      .select('name, phone')
      .eq('tournament_id', ctx.tournamentId)
      .eq('active', true)
      .order('name', { ascending: true })
    if (coErr) throw coErr

    return json({ driver: { name: ctx.name }, rides, coordinators: coordinators ?? [] })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
