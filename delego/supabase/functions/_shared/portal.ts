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
