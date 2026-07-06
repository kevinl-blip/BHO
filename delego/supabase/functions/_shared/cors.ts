// Öffentliches Delegationsportal: Aufruf von der Vercel-Domain (anderer Origin
// als die Functions). Keine Cookies im Spiel – die Auth läuft über den Token im
// Request-Body – daher ist '*' hier vertretbar.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
