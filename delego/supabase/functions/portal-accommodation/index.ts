// POST { token, action, request } → Unterkunftswunsch anlegen/ändern/löschen.
// action: 'create' | 'update' | 'delete'
//
// Durchsetzung (serverseitig, autoritativ, gleiche Reihenfolge wie portal-*):
//  1. Token → genau eine delegation_id + tournament_id.
//  2. Deadline: nach Ablauf 403 für JEDEN Schreibvorgang – VOR allem anderen.
//  3. Dreifache Cross-Tournament-Kette (jeweils harte 400, kein Filtern):
//     - person_id gehört zur Delegation des Tokens (person_not_in_delegation)
//     - hotel_id gehört zum Turnier des Tokens (hotel_not_in_tournament)
//     - room_category_id gehört zum angegebenen Hotel (category_not_in_hotel)
//  4. check_out > check_in (sonst 400).
//  5. update/delete zusätzlich gescopet auf die Personen der Delegation
//     (fremde request-id → 404).
import { corsHeaders, json } from '../_shared/cors.ts'
import {
  adminClient,
  categoryInHotel,
  getHotelInTournament,
  listAccommodationRequests,
  listDelegationPersonIds,
  resolveToken,
  validateDelegationPersons,
} from '../_shared/portal.ts'

type RequestInput = {
  id?: unknown
  person_id?: unknown
  hotel_id?: unknown
  room_category_id?: unknown
  check_in?: unknown
  check_out?: unknown
  roommate_wish?: unknown
  remarks?: unknown
}

function cleanRequest(r: RequestInput) {
  const check_in = typeof r.check_in === 'string' ? r.check_in : ''
  const check_out = typeof r.check_out === 'string' ? r.check_out : ''
  const roommate_wish =
    typeof r.roommate_wish === 'string' && r.roommate_wish.trim() ? r.roommate_wish.trim() : null
  const remarks = typeof r.remarks === 'string' && r.remarks.trim() ? r.remarks.trim() : null
  return { check_in, check_out, roommate_wish, remarks }
}

function validDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const { token, action, request } = await req.json().catch(() => ({}))
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

    const personIds = await listDelegationPersonIds(admin, ctx.delegationId)

    if (action === 'create' || action === 'update') {
      const r = request ?? {}
      const personId = typeof r.person_id === 'string' ? r.person_id : null
      const hotelId = typeof r.hotel_id === 'string' ? r.hotel_id : null
      const categoryId = typeof r.room_category_id === 'string' ? r.room_category_id : null
      const f = cleanRequest(r)

      if (!personId) return json({ error: 'person_id fehlt' }, 400)

      // 1) Person gehört zur Delegation des Tokens.
      const pCheck = await validateDelegationPersons(admin, ctx.delegationId, [personId])
      if ('error' in pCheck) {
        return json({ error: 'person_not_in_delegation', message: 'Diese Person gehört nicht zu dieser Delegation.' }, 400)
      }
      // 2) Hotel gehört zum Turnier des Tokens (inkl. is_official).
      const hotel = await getHotelInTournament(admin, ctx.tournamentId, hotelId)
      if (!hotel) {
        return json({ error: 'hotel_not_in_tournament', message: 'Dieses Hotel gehört nicht zu diesem Turnier.' }, 400)
      }

      let payload
      if (hotel.is_official) {
        // Offizielles Hotel: Kategorie und Zeitraum sind Pflicht.
        if (!categoryId) {
          return json({ error: 'category_required_for_official_hotel', message: 'Bei einem offiziellen Hotel ist die Zimmerkategorie Pflicht.' }, 400)
        }
        // 3) Kategorie gehört zum angegebenen Hotel.
        if (!(await categoryInHotel(admin, hotel.id, categoryId))) {
          return json({ error: 'category_not_in_hotel', message: 'Diese Zimmerkategorie gehört nicht zum gewählten Hotel.' }, 400)
        }
        // 4) Zeitraum plausibel.
        if (!validDate(f.check_in) || !validDate(f.check_out)) {
          return json({ error: 'dates_required_for_official_hotel', message: 'Bei einem offiziellen Hotel sind Check-in und Check-out Pflicht.' }, 400)
        }
        if (f.check_out <= f.check_in) {
          return json({ error: 'check_out muss nach check_in liegen' }, 400)
        }
        payload = {
          person_id: personId,
          hotel_id: hotel.id,
          room_category_id: categoryId,
          check_in: f.check_in,
          check_out: f.check_out,
          roommate_wish: f.roommate_wish,
          remarks: f.remarks,
        }
      } else {
        // Selbstbucher-Hotel: Kategorie und Zeitraum sind bedeutungslos und
        // werden auf null normalisiert (ignoriert, kein 400). Der Eintrag hält
        // fest: "bucht selbst" – plus optionale Freitext-Bemerkung.
        payload = {
          person_id: personId,
          hotel_id: hotel.id,
          room_category_id: null,
          check_in: null,
          check_out: null,
          roommate_wish: f.roommate_wish,
          remarks: f.remarks,
        }
      }

      if (action === 'create') {
        const { error } = await admin.from('accommodation_requests').insert(payload)
        if (error) throw error

        if (ctx.status === 'invited') {
          await admin.from('delegations').update({ status: 'in_progress' }).eq('id', ctx.delegationId)
        }
      } else {
        const id = typeof r.id === 'string' ? r.id : null
        if (!id) return json({ error: 'request.id fehlt' }, 400)
        const { data, error } = await admin
          .from('accommodation_requests')
          .update(payload)
          .eq('id', id)
          .in('person_id', personIds) // Scope-Schutz: nur eigene Zeilen
          .select('id')
        if (error) throw error
        if (!data || data.length === 0) return json({ error: 'not found' }, 404)
      }
    } else if (action === 'delete') {
      const id = typeof request?.id === 'string' ? request.id : null
      if (!id) return json({ error: 'request.id fehlt' }, 400)
      const { data, error } = await admin
        .from('accommodation_requests')
        .delete()
        .eq('id', id)
        .in('person_id', personIds) // Scope-Schutz
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) return json({ error: 'not found' }, 404)
    } else {
      return json({ error: 'unbekannte action' }, 400)
    }

    const accommodation_requests = await listAccommodationRequests(admin, personIds)
    return json({ accommodation_requests })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
