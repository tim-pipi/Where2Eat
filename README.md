# Where2Eat

Two people, two starting points, one link — and a fair place to eat in between.

One person starts a session and gets a unique link. They send it to whoever
they are meeting. Both enter where they are setting off from. Both then see the
same map of popular food places around the midpoint, with each person's
distance to every option side by side.

No accounts, no install. V1 assumes both people travel by public transport, so
there is nothing to configure.

The product spec lives in [`docs/PRD.md`](docs/PRD.md); requirement IDs like
`FR-3.2` in the code comments refer to it.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests
```

It runs with **no API keys at all**. Without them the app is in *demo mode*:
sessions, links, seats, the midpoint maths and the whole two-person flow behave
exactly as they will in production, but the restaurants are invented fixtures
scattered around the computed midpoint, and the map is a schematic plot rather
than Google's.

In demo mode the location box also accepts raw `lat,lng` (`51.5045,-0.0865`),
which makes it easy to drive both sides of a session by hand.

### With Google

Copy `.env.example` to `.env.local` and fill in two keys from a Google Cloud
project with **Places API (New)**, **Geocoding API** and **Maps JavaScript API**
enabled:

| Variable | Used for | Exposure |
|---|---|---|
| `GOOGLE_MAPS_SERVER_KEY` | Places search, geocoding, photo fetching | Server only — never sent to the browser |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Loading the Maps JavaScript API | Public by necessity — restrict it by HTTP referrer |

Place photos are fetched through `/api/photo`, which validates the photo
reference against the exact shape Google issues, so the server key stays server
side.

> The map is Google's rather than a cheaper tile provider because Google's terms
> require Places data shown on a map to be shown on a Google map.

## How it fits together

```
src/
  app/
    page.tsx                     landing — creates a session
    s/[slug]/page.tsx            the shared session page
    api/sessions/                create · read · join · set location
    api/photo/                   Places photo proxy (keeps the key server-side)
  lib/
    geo.ts                       haversine, great-circle midpoint, radius, coarsening
    places.ts                    Google Places + geocoding, and the demo fixtures
    store/                       sessions, seats, tokens, 24h expiry
      index.ts                   picks the backend from the environment
      kv-store.ts                Redis: atomic seat claims, TTL expiry
      file-store.ts              JSON file, local development only
    maps-loader.ts               Google Maps bootstrap (callback + importLibrary)
    session-view.ts              assembles what each participant is allowed to see
    labels.ts                    who "you" and "them" refer to, per seat
  components/
    SessionClient.tsx            waiting state, polling, results layout
    GoogleMapView.tsx            Google map (when a browser key is set)
    SchematicMap.tsx             schematic fallback (when one is not)
    PlaceList.tsx                ranked list with the per-person distance split
```

**Sessions** use whichever backend is configured. With Redis credentials
present (`KV_REST_API_*` or `UPSTASH_REDIS_REST_*`) it uses Redis, where seats
are claimed with `SET NX` so two people opening the link at once can never take
the same seat, and expiry is a native TTL. With no credentials it falls back to
a JSON file, which keeps local development zero-config but assumes a single
process — so the app refuses to run on Vercel without Redis rather than failing
intermittently. See [`DEPLOY.md`](DEPLOY.md).

**Updates** reach the other person by polling every 2.5s, and only while a
session is still waiting for a location. Results are cached per session, keyed
by both origins, so polling never re-bills a Places search.

**Privacy.** Coordinates are rounded to ~100m before they are stored, each
person sees the other only as an area label rather than an address, and a
session and its coordinates are deleted 24 hours after it is created.

## Deploying

See [`DEPLOY.md`](DEPLOY.md). The short version: add Upstash Redis, set the two
Google keys, add your domain to the browser key's referrer list, and check
`/api/health` afterwards.

## Not built yet

The PRD scopes these to later milestones:

- **Transit travel times** (FR-3.3). V1 balances on straight-line distance and
  says so; real transit times need the Routes API and are an M3 item.
- **Filters and sorting** (§6.6) — cuisine, price, rating, open now.
- **Shortlisting and mutual matches** (FR-7.4).
- **Autocomplete** on the address box; it geocodes on submit instead.
- **Place detail view** (FR-4.7) beyond the "Open in Google Maps" link.
