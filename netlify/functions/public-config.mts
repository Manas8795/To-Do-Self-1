export default async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        allow: 'GET',
      },
    })
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '').trim()
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim()

  return new Response(
    JSON.stringify({
      supabaseUrl,
      supabaseAnonKey,
    }),
    {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    }
  )
}
