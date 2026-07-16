// Gemeinsame Logik für das Delegationsportal.
//
// SICHERHEITSKERN: service_role umgeht RLS – die gesamte Zugriffskontrolle
// steckt hier. Jeder Portal-Request wird ausschließlich über den access_token
// zu genau EINER delegation_id aufgelöst; danach wird jede Query strikt auf
// diese ID gefiltert. Es gibt keinen Pfad, der Daten anderer Delegationen
// sieht oder schreibt.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

export type DelegationContext = {
  delegationId: string
  status: string
  tournament: {
    name: string
    starts_on: string
    ends_on: string
    venue: string | null
    submission_deadline: string | null
    settings: Record<string, unknown>
  }
  readOnly: boolean
}

// Löst den Token auf. Gibt null zurück, wenn der Token ungültig ist.
export async function resolveToken(
  admin: SupabaseClient,
  token: unknown,
): Promise<DelegationContext | null> {
  if (typeof token !== 'string' || token.length < 20) return null

  const { data, error } = await admin
    .from('delegations')
    .select(
      'id, status, tournaments!inner ( name, starts_on, ends_on, venue, submission_deadline, settings )',
    )
    .eq('access_token', token)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  // Supabase liefert die eingebettete Relation je nach Version als Objekt oder
  // als einelementiges Array – beides abfangen.
  const t = Array.isArray(data.tournaments) ? data.tournaments[0] : data.tournaments
  const deadline: string | null = t.submission_deadline ?? null
  const readOnly = deadline ? new Date(deadline).getTime() < Date.now() : false

  return {
    delegationId: data.id,
    status: data.status,
    tournament: {
      name: t.name,
      starts_on: t.starts_on,
      ends_on: t.ends_on,
      venue: t.venue ?? null,
      submission_deadline: deadline,
      settings: t.settings ?? {},
    },
    readOnly,
  }
}

// Liest die Personen genau einer Delegation.
export async function listPersons(admin: SupabaseClient, delegationId: string) {
  const { data, error } = await admin
    .from('persons')
    .select('id, last_name, first_name, gender, role, custom_fields, notes')
    .eq('delegation_id', delegationId)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
  if (error) throw error
  return data
}

// Liest die Reisegruppen genau einer Delegation, inklusive der zugeordneten
// Personen-IDs (member_ids), damit das Portal die Auswahl vorbelegen kann.
export async function listTravelGroups(admin: SupabaseClient, delegationId: string) {
  const { data, error } = await admin
    .from('travel_groups')
    .select(
      'id, direction, scheduled_at, carrier_ref, location, status, notes, travel_group_members ( person_id )',
    )
    .eq('delegation_id', delegationId)
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((g) => {
    const members = Array.isArray(g.travel_group_members) ? g.travel_group_members : []
    return {
      id: g.id,
      direction: g.direction,
      scheduled_at: g.scheduled_at,
      carrier_ref: g.carrier_ref,
      location: g.location,
      status: g.status,
      notes: g.notes,
      member_ids: members.map((m: { person_id: string }) => m.person_id),
    }
  })
}

// ------------------------------------------------------------
// Einsatztag-Sichten (V2): Fahrer- und Koordinator-Token.
// Gleiches Muster wie resolveToken: access_token → genau eine Ressource,
// zusätzlich active = true (deaktivierte Tokens gelten als ungültig).
// ------------------------------------------------------------

export type DriverContext = { driverId: string; tournamentId: string; name: string }

export async function resolveDriverToken(
  admin: SupabaseClient,
  token: unknown,
): Promise<DriverContext | null> {
  if (typeof token !== 'string' || token.length < 20) return null
  const { data, error } = await admin
    .from('drivers')
    .select('id, name, tournament_id, active')
    .eq('access_token', token)
    .maybeSingle()
  if (error) throw error
  if (!data || data.active !== true) return null
  return { driverId: data.id, tournamentId: data.tournament_id, name: data.name }
}

export type CoordinatorContext = { coordinatorId: string; tournamentId: string; name: string }

export async function resolveCoordinatorToken(
  admin: SupabaseClient,
  token: unknown,
): Promise<CoordinatorContext | null> {
  if (typeof token !== 'string' || token.length < 20) return null
  const { data, error } = await admin
    .from('coordinators')
    .select('id, name, tournament_id, active')
    .eq('access_token', token)
    .maybeSingle()
  if (error) throw error
  if (!data || data.active !== true) return null
  return { coordinatorId: data.id, tournamentId: data.tournament_id, name: data.name }
}

// Cross-Tournament-Schutz: arrival_checkins hat KEINE eigene tournament_id –
// die Zugehörigkeit läuft über person_id → persons → delegations.tournament_id.
// Gibt true zurück, wenn die Person zu genau diesem Turnier gehört.
export async function personInTournament(
  admin: SupabaseClient,
  tournamentId: string,
  personId: unknown,
): Promise<boolean> {
  if (typeof personId !== 'string') return false
  const { data, error } = await admin
    .from('persons')
    .select('id, delegations!inner ( tournament_id )')
    .eq('id', personId)
    .eq('delegations.tournament_id', tournamentId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

// Prüft, dass eine Delegation zu diesem Turnier gehört (für walkins.delegation_id).
export async function delegationInTournament(
  admin: SupabaseClient,
  tournamentId: string,
  delegationId: unknown,
): Promise<boolean> {
  if (typeof delegationId !== 'string') return false
  const { data, error } = await admin
    .from('delegations')
    .select('id')
    .eq('id', delegationId)
    .eq('tournament_id', tournamentId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

// Prüft, dass alle person_ids zu genau dieser Delegation gehören.
// Kernschutz gegen Cross-Delegation: es gibt KEIN DB-Constraint dafür, die
// Prüfung passiert ausschließlich hier. Rückgabe: geprüfte Liste oder Fehler.
export async function validateDelegationPersons(
  admin: SupabaseClient,
  delegationId: string,
  ids: unknown,
): Promise<{ ok: string[] } | { error: string }> {
  if (!Array.isArray(ids)) return { ok: [] }
  const wanted = [...new Set(ids.filter((x): x is string => typeof x === 'string'))]
  if (wanted.length === 0) return { ok: [] }

  const { data, error } = await admin
    .from('persons')
    .select('id')
    .eq('delegation_id', delegationId)
    .in('id', wanted)
  if (error) throw error

  const valid = new Set((data ?? []).map((r) => r.id))
  const foreign = wanted.filter((id) => !valid.has(id))
  if (foreign.length > 0) return { error: 'person_not_in_delegation' }
  return { ok: wanted }
}
