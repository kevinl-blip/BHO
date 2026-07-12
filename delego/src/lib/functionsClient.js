// Gemeinsamer Client für alle token-basierten Edge Functions (Portal, Fahrer,
// Koordinator). Der Token wird im POST-Body übertragen, nicht als URL-Query,
// damit er nicht in Access-/Referer-Logs landet. Der anon-Key im
// Authorization-Header ist nur der Gateway-Schlüssel (öffentlich); die
// eigentliche Auth ist der jeweilige Token im Body.
const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export async function callFunction(fn, body) {
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
