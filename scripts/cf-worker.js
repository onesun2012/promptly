// Promptly anonymous install counter — Cloudflare Worker + KV.
/* eslint-disable no-undef */
//
// Deploy (one-time):
//   npm i -g wrangler
//   wrangler kv namespace create PROMPTLY_PING        # note the id
//   wrangler kv namespace create PROMPTLY_PING_META   # note the id
//   wrangler deploy                                    # uses this file via wrangler.toml
//
// wrangler.toml:
//   name = "promptly-ping"
//   main = "scripts/cf-worker.js"
//   compatibility_date = "2026-01-01"
//   [[kv_namespaces]]
//   binding = "PING"
//   id = "<PROMPTLY_PING_ID>"
//   [[kv_namespaces]]
//   binding = "META"
//   id = "<PROMPTLY_PING_META_ID>"
//
// Endpoints:
//   GET /ping?v=1.0.0&os=win   -> counts one install per version+os
//   GET /stats                 -> {"total": 123, "versions": {"1.0.0": 100}}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/ping') {
      const v = String(url.searchParams.get('v') || 'unknown').slice(0, 24)
      const os = String(url.searchParams.get('os') || 'unknown').slice(0, 24)
      const key = `install:${v}:${os}`
      const n = parseInt((await env.PING.get(key)) || '0', 10) + 1
      await env.PING.put(key, String(n))
      const total = parseInt((await env.META.get('total')) || '0', 10) + 1
      await env.META.put('total', String(total))
      return new Response('ok', {
        headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
      })
    }

    if (url.pathname === '/stats') {
      const total = (await env.META.get('total')) || '0'
      let versions = {}
      // KV list is eventually consistent and paginated at 1000 — fine for this scale
      const page = await env.PING.list({ prefix: 'install:' })
      for (const k of page.keys) {
        versions[k.name.slice('install:'.length)] = parseInt((await env.PING.get(k.name)) || '0', 10)
      }
      return new Response(
        JSON.stringify({ total: parseInt(total, 10), versions }),
        { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
      )
    }

    return new Response('not found', { status: 404 })
  }
}
