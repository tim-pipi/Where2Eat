# Deploying Where2Eat to Vercel

## Why this needs a database

Where2Eat is a two-device app: one person's location has to become visible to
the other. Locally that state lives in one Node process, so a JSON file is
enough. On Vercel it is not — each request may be served by a different
instance, so without shared storage the two people in a session would simply
never see each other.

It would not crash. It would work when both requests happened to hit the same
instance and fail when they did not, which is the worst kind of bug to
diagnose after launch. So the app now **refuses to start on Vercel without
Redis configured**, rather than degrading quietly.

## 1. Add Redis

In the Vercel dashboard: **Storage → Create Database → Upstash Redis** (the
free tier is ample — sessions are a few hundred bytes and expire in 24 hours).

Connect it to the project. Vercel injects `KV_REST_API_URL` and
`KV_REST_API_TOKEN` automatically; the app reads either those or the
`UPSTASH_REDIS_REST_*` pair, so a standalone Upstash project works too.

Redis TTL is what enforces the 24-hour deletion promise (PR-2) — no cron, no
sweeper, and no way for coordinates to outlive their session.

## 2. Add the environment variables

**Settings → Environment Variables.** Set all three for Production, Preview and
Development:

| Variable | Value |
|---|---|
| `GOOGLE_MAPS_SERVER_KEY` | Your server key — Places API (New) + Geocoding API |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Your browser key — Maps JavaScript API |
| `NEXT_PUBLIC_APP_ORIGIN` | Optional; falls back to the request host |

> `NEXT_PUBLIC_*` values are **inlined at build time**, not read at runtime.
> Setting one after a deployment has no effect until you redeploy. If the map
> falls back to the schematic in production, this is almost always why.

## 3. Update the browser key's referrer restrictions

The browser key is public by design and protected only by its referrer list.
Add your deployment domains alongside `http://localhost:3000/*`:

```
https://your-project.vercel.app/*
https://*.vercel.app/*        ← preview deployments, if you want them working
https://yourdomain.com/*      ← once a custom domain is attached
```

Leave the **server** key's application restriction as *None* unless you have
static egress IPs — Vercel's are not fixed on Hobby plans. Keep it secret
instead; it is never sent to the browser.

## 4. Deploy

```bash
npx vercel          # preview
npx vercel --prod   # production
```

Or connect the Git repository and let Vercel build on push. No `vercel.json` is
needed — Next.js is detected automatically.

## 5. Verify the deployment

```bash
curl https://your-project.vercel.app/api/health
```

```json
{
  "ok": true,
  "storage": "upstash-redis",
  "shared": true,
  "places": "google",
  "map": "google"
}
```

What to check:

- **`storage`** must be `upstash-redis`. If it is `unconfigured`, the Redis
  integration is not connected.
- **`places`** must be `google`, not `demo-fixtures`.
- **`map`** must be `google`, not `schematic-fallback`.
- A **`warning`** field appears if the map key is set while Places is not — that
  combination plots invented restaurants on a real Google map, which looks
  entirely genuine and is the one failure mode worth being loud about.

Then open the app, create a session, and load the link **on a second device or
in a private window**. Both sides seeing each other is the thing that shared
storage exists to make true, and it is the one check a single browser cannot
give you.

## Costs

Places and Geocoding bill per request; the Maps JS API bills per map load.
Check Google's current pricing rather than trusting a number here, and set a
budget alert on the Cloud project.

Results are cached in Redis per session, keyed by both origins, so the 2.5s
polling never re-bills a Places search — a session costs roughly one search
regardless of how long it stays open.
