// Client für das öffentliche Delegationsportal. Spricht ausschließlich die
// Edge Functions an (kein direkter Tabellenzugriff). Der Token wird im Body
// übertragen, nicht als URL-Query, damit er nicht in Access-/Referer-Logs
// landet. Der anon-Key im Authorization-Header ist nur der Gateway-Schlüssel
// (öffentlich); die eigentliche Auth ist der Token.
const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

async function call(fn, body) {
  const res = await fetch(`${base}/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    // leer lassen
  }
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Fehler (${res.status})`)
    err.status = res.status
    err.code = data.error
    throw err
  }
  return data
}

export function portalSession(token) {
  return call('portal-session', { token })
}

export function portalCreatePerson(token, person) {
  return call('portal-persons', { token, action: 'create', person })
}

export function portalUpdatePerson(token, person) {
  return call('portal-persons', { token, action: 'update', person })
}

export function portalDeletePerson(token, id) {
  return call('portal-persons', { token, action: 'delete', person: { id } })
}

export function portalCreateTravelGroup(token, travel_group) {
  return call('portal-travel', { token, action: 'create', travel_group })
}

export function portalUpdateTravelGroup(token, travel_group) {
  return call('portal-travel', { token, action: 'update', travel_group })
}

export function portalDeleteTravelGroup(token, id) {
  return call('portal-travel', { token, action: 'delete', travel_group: { id } })
}
