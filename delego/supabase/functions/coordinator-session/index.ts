// POST { token } → Koordinator-Kontext + gesamte Ankunftsübersicht des Turniers.
// Nur Lesen. Öffentlich erreichbar (Deploy mit --no-verify-jwt); Auth = Token.
// Alles strikt auf das Turnier des Tokens gescopet.
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, resolveCoordinatorToken } from '../_shared/portal.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const { token } = await req.json().catch(() => ({}))
    const admin = adminClient()

    const ctx = await resolveCoordinatorToken(admin, token)
    if (!ctx) return json({ error: 'invalid token' }, 404)

    const { data: tournament, error: tErr } = await admin
      .from('tournaments')
      .select('name')
      .eq('id', ctx.tournamentId)
      .single()
    if (tErr) throw tErr

    const { data: delegations, error: dErr } = await admin
      .from('delegations')
      .select('id, name')
      .eq('tournament_id', ctx.tournamentId)
      .order('name', { ascending: true })
    if (dErr) throw dErr
    const delIds = (delegations ?? []).map((d) => d.id)

    if (delIds.length === 0) {
      return json({ tournament: { name: tournament.name }, delegations: [], walkins: [] })
    }

    const [personsRes, groupsRes, transfersRes, driversRes, walkinsRes] = await Promise.all([
      admin.from('persons').select('id, last_name, first_name, delegation_id').in('delegation_id', delIds),
      admin
        .from('travel_groups')
        .select('id, scheduled_at, location, carrier_ref, direction, travel_group_members ( person_id )')
        .in('delegation_id', delIds)
        .eq('direction', 'arrival'),
      admin.from('transfers').select('driver_id, travel_group_ids').eq('tournament_id', ctx.tournamentId),
      admin.from('drivers').select('id, name').eq('tournament_id', ctx.tournamentId),
      admin.from('walkins').select('id, name, note, delegation_id').eq('tournament_id', ctx.tournamentId).order('created_at', { ascending: true }),
    ])
    for (const r of [personsRes, groupsRes, transfersRes, driversRes, walkinsRes]) {
      if (r.error) throw r.error
    }

    const persons = personsRes.data ?? []
    const personIds = persons.map((p) => p.id)

    const checkinsRes = personIds.length
      ? await admin.from('arrival_checkins').select('person_id, status').in('person_id', personIds)
      : { data: [], error: null }
    if (checkinsRes.error) throw checkinsRes.error
    const statusByPerson = new Map((checkinsRes.data ?? []).map((c) => [c.person_id, c.status]))

    const driverName = new Map((driversRes.data ?? []).map((d) => [d.id, d.name]))

    // travel_group_id → Fahrername (über die Fahrt, die die Gruppe enthält).
    const groupDriver = new Map<string, string>()
    for (const t of transfersRes.data ?? []) {
      const name = t.driver_id ? driverName.get(t.driver_id) : null
      if (!name) continue
      for (const gid of t.travel_group_ids ?? []) groupDriver.set(gid, name)
    }

    // person_id → früheste Ankunftsgruppe.
    const personArrival = new Map<string, { group_id: string; scheduled_at: string; location: string | null; carrier_ref: string | null }>()
    for (const g of groupsRes.data ?? []) {
      const members = Array.isArray(g.travel_group_members) ? g.travel_group_members : []
      for (const m of members) {
        const pid = m.person_id
        const prev = personArrival.get(pid)
        if (!prev || (g.scheduled_at && g.scheduled_at < prev.scheduled_at)) {
          personArrival.set(pid, {
            group_id: g.id,
            scheduled_at: g.scheduled_at,
            location: g.location,
            carrier_ref: g.carrier_ref,
          })
        }
      }
    }

    const personsByDel = new Map<string, unknown[]>()
    for (const p of persons) {
      const arr = personArrival.get(p.id) ?? null
      const row = {
        id: p.id,
        last_name: p.last_name,
        first_name: p.first_name,
        status: statusByPerson.get(p.id) ?? 'expected',
        arrival: arr
          ? { scheduled_at: arr.scheduled_at, location: arr.location, carrier_ref: arr.carrier_ref }
          : null,
        driver_name: arr ? (groupDriver.get(arr.group_id) ?? null) : null,
        // Zielhotel folgt mit der Hotelzuteilung (späterer Meilenstein).
        destination_hotel: null,
      }
      const list = personsByDel.get(p.delegation_id) ?? []
      list.push(row)
      personsByDel.set(p.delegation_id, list)
    }

    const result = (delegations ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      persons: (personsByDel.get(d.id) ?? []).sort((a: any, b: any) =>
        `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`),
      ),
    }))

    return json({
      tournament: { name: tournament.name },
      coordinator: { name: ctx.name },
      delegations: result,
      walkins: walkinsRes.data ?? [],
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
