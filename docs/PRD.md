# Where2Eat — Product Requirements Document

| | |
|---|---|
| **Status** | Draft v1.0 |
| **Last updated** | 2026-09-15 |
| **Author** | tim-pipi |
| **Target release** | V1 (MVP) |

---

## 1. Summary

Where2Eat is a zero-signup web app that settles the question *"where should we meet to eat?"* for two people who are starting from different places.

One person creates a session and gets a unique link. They send that link to the other person. Both enter their starting location. Where2Eat computes a fair meeting point between them and shows popular food places near it, ranked and filterable, with travel time from each person's origin shown side by side.

The entire experience is one link, two inputs, one shared result page.

## 2. Problem

Deciding where to eat with someone who is starting from a different part of the city is a small but genuinely annoying coordination problem:

- **Manual midpoint-finding is tedious.** People eyeball a map, pick a neighbourhood, then search for restaurants in it separately.
- **"Fair" is contested.** Whoever suggests the place usually suggests somewhere convenient for themselves. There is no neutral arbiter.
- **Existing tools solve half of it.** Map apps find a midpoint but not good restaurants; review apps find good restaurants but not a midpoint; group-decision apps require both people to install something and make an account.
- **The friction budget is tiny.** This decision happens in a chat thread and needs to be resolved in under a minute. Any app that requires sign-up, download, or a lengthy setup flow loses to just guessing.

**Where2Eat's bet:** a shareable link that needs no account and answers the question in under 60 seconds will win this micro-decision.

## 3. Goals and non-goals

### Goals

| # | Goal |
|---|---|
| G1 | Two people, from two devices, reach a shared, ranked list of food options in under 60 seconds from link creation |
| G2 | The result is defensibly *fair* — travel effort is roughly balanced, and the app shows the numbers that prove it |
| G3 | Zero friction: no account, no install, works on a phone browser from a chat link |
| G4 | The shared link is genuinely shared state — both people see the same list at the same time |

### Non-goals (V1)

- Groups of 3+ people (designed for, not built in V1 — see §11)
- Reservations, ordering, payments, or delivery
- User accounts, saved history, friends lists, or social features
- Our own restaurant reviews, photos, or ratings (we lean entirely on a third-party places provider)
- Native mobile apps
- Multi-modal route planning beyond a single selected travel mode per user

## 4. Users and use cases

### Primary personas

**"The chat-thread decider"** — Two friends, colleagues, or a couple, mid-conversation in WhatsApp/iMessage/Slack, trying to pick a dinner spot. They are on phones. They want an answer, not a tool.

**"The halfway-meeter"** — Two people in different parts of a metro area (or a person meeting someone from out of town) with no shared mental map of a convenient middle.

### Core use cases

| ID | Use case |
|---|---|
| UC1 | A creates a session, shares the link, B opens it; both enter locations and see the same result list |
| UC2 | A wants to use their current GPS location instead of typing an address |
| UC3 | B is arriving by train while A is driving — the midpoint should account for that |
| UC4 | The pair filters the list down (cuisine, price, open now) and lands on a single choice |
| UC5 | A opens the link again an hour later and the session is still there |

### Anti-personas

- People planning a week ahead who want reservations and menus (use a booking app)
- Large group outings requiring polls and RSVPs (V2+)

## 5. User flow

```
  ┌────────────────────┐
  │  Landing page      │  User A clicks "Find a spot"
  └─────────┬──────────┘
            │  POST /sessions
            ▼
  ┌────────────────────┐
  │  Session created   │  Unique link: where2eat.app/s/{slug}
  │  Share sheet shown │  Copy link / native share
  └─────────┬──────────┘
            │
            ├──── A enters their location ────┐
            │                                 │
            │   (link sent via chat)          │
            │                                 │
            └──── B opens link, enters ───────┤
                  their location              │
                                              ▼
                                  ┌────────────────────────┐
                                  │  Both locations set    │
                                  │  → compute midpoint    │
                                  │  → fetch food places   │
                                  └───────────┬────────────┘
                                              ▼
                                  ┌────────────────────────┐
                                  │  Shared results page   │
                                  │  Map + ranked list     │
                                  │  Filters, travel times │
                                  └────────────────────────┘
```

**Waiting state matters.** Whoever enters their location first sees a live "waiting for the other person" state that updates the moment the second location lands. This is the moment the app feels shared rather than single-player, and it should not require a manual refresh.

## 6. Functional requirements

### 6.1 Session creation and the unique link

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | Landing page has a single primary action that creates a session and returns a unique URL of the form `/s/{slug}` | P0 |
| FR-1.2 | `{slug}` is a URL-safe, non-sequential, non-guessable identifier (≥ 64 bits of entropy, e.g. 12-char base62 / nanoid) | P0 |
| FR-1.3 | The creator is shown the link with one-tap copy and, where supported, the native Web Share sheet | P0 |
| FR-1.4 | Anyone with the link can join as a participant until the session has 2 participants; after that the link is view-only for additional openers | P0 |
| FR-1.5 | A participant is identified by an opaque token in a first-party cookie / localStorage, so reopening the link on the same device resumes the same seat | P0 |
| FR-1.6 | Sessions expire 24 hours after creation; an expired link shows a friendly "this session has expired — start a new one" page | P0 |
| FR-1.7 | Sessions are not listed, indexed, or enumerable; result pages send `noindex` | P0 |

### 6.2 Location entry

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | Each participant enters a starting location via an address/place autocomplete field | P0 |
| FR-2.2 | "Use my current location" invokes the browser Geolocation API, with graceful fallback to manual entry if denied or unavailable | P0 |
| FR-2.3 | The entered location is resolved to lat/lng and echoed back as a human-readable label for confirmation | P0 |
| FR-2.4 | A participant can change their location after submitting; doing so recomputes the result for both participants | P0 |
| FR-2.5 | Each participant selects a travel mode (driving / transit / walking / cycling), defaulting to driving | P1 |
| FR-2.6 | Input is validated: unresolvable addresses show an inline error, not a dead end | P0 |

### 6.3 Midpoint computation

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | With both locations present, compute a **meeting point** between them | P0 |
| FR-3.2 | V1 baseline: geographic midpoint via great-circle interpolation (haversine) between the two coordinates | P0 |
| FR-3.3 | V1.1 refinement: **travel-time-balanced midpoint** — search along the corridor between the two origins for the point minimising the absolute difference in travel time, subject to each person's selected mode | P1 |
| FR-3.4 | If the two locations are within ~1 km of each other, skip midpoint logic and search around their shared area, with an explanatory note | P1 |
| FR-3.5 | If the two locations are implausibly far apart (> 150 km, configurable), warn that a midpoint may be meaningless and offer to search near either person instead | P1 |
| FR-3.6 | If the raw midpoint falls somewhere with no food places (water, motorway, industrial zone), progressively widen the search radius and/or snap to the nearest viable dining cluster, and disclose that the point was adjusted | P1 |

> **Design note.** The naive geographic midpoint is the honest V1: it is instant, cheap, and correct often enough. But it is wrong in exactly the cases users notice — one person on a motorway and the other on a slow bus route are not equidistant in any way they care about. FR-3.3 is what makes the product's fairness claim true, and it should ship close behind V1.

### 6.4 Food place discovery

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Fetch food places (restaurants, cafés, bars serving food) near the meeting point from a third-party places provider | P0 |
| FR-4.2 | Default search radius scales with the distance between the two origins (e.g. 10% of the separation, clamped to 500 m – 5 km) | P0 |
| FR-4.3 | Return at least 10 and at most 30 results in the default view | P0 |
| FR-4.4 | "Popular" ranking = a blended score of provider rating, rating count, distance from midpoint, and travel-time fairness. The weighting is configurable server-side | P0 |
| FR-4.5 | Each result shows: name, cuisine/category, rating + review count, price level, photo, distance, and open/closed status | P0 |
| FR-4.6 | Each result shows **travel time from each participant** side by side, with a visual fairness indicator when the two are close | P1 |
| FR-4.7 | Tapping a result opens a detail view: larger photos, address, phone, hours, and deep links to Google Maps / Apple Maps directions from each origin | P0 |
| FR-4.8 | Attribution and linking requirements of the places provider are honoured on every surface that shows their data | P0 |

### 6.5 Filtering and sorting

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Filters: cuisine/category, price level, minimum rating, open now | P0 |
| FR-5.2 | Sort: recommended (default), rating, distance from midpoint, fairest travel split | P1 |
| FR-5.3 | Filters are session-scoped and shared — a filter one person sets is visible to the other | P1 |
| FR-5.4 | Filters that produce zero results show a clear empty state with a one-tap "relax filters" action | P0 |

### 6.6 Shared, live session state

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | Both participants see the same session state without a manual refresh; updates propagate within ~2 s | P0 |
| FR-6.2 | Transport: server-sent events or WebSockets, with polling fallback (≤ 5 s interval) where those are unavailable | P0 |
| FR-6.3 | The pre-result screen shows who has joined and whose location is still outstanding | P0 |
| FR-6.4 | Either participant can shortlist / "heart" a place; shortlists are visible to both. When both heart the same place it is marked as a match | P1 |
| FR-6.5 | The result page is re-openable and stable for the session's lifetime — same link, same results, unless an input changes | P0 |

### 6.7 Non-happy paths

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | Second participant never arrives → creator sees a persistent waiting state and can enter a second location themselves ("just show me places near a midpoint I pick") | P1 |
| FR-7.2 | A third person opens the link → read-only spectator view, clearly labelled, with a "start your own" action | P1 |
| FR-7.3 | Places provider errors or rate-limits → cached results if available, otherwise a retry-able error state; never a blank page | P0 |
| FR-7.4 | Geolocation denied → the manual address field is already focused, with no dead end or nagging re-prompt | P0 |
| FR-7.5 | Offline / connection lost → a reconnecting banner; state resyncs on reconnect | P1 |

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | Landing page LCP < 1.5 s on 4G mid-tier mobile. Results render < 2.5 s after the second location is submitted. |
| **Platform** | Mobile-web first (≥ 70% of traffic assumed to be phones opening a chat link). Responsive up to desktop. Latest two versions of Safari iOS, Chrome Android, Chrome, Firefox, Safari, Edge. |
| **Accessibility** | WCAG 2.1 AA: keyboard-navigable, screen-reader labels on map and list, AA contrast, the list view is a complete alternative to the map (never map-only). |
| **Availability** | 99.5% monthly for session create + results. |
| **Scalability** | 1,000 concurrent sessions, 10,000 sessions/day at launch scale. |
| **Cost** | Places/routing API spend is the dominant variable cost. Cache aggressively (§9.3) and target < $0.02 per completed session. |
| **Security** | HTTPS only. Session slugs unguessable. No PII beyond coarse location. Rate-limit session creation and location submission per IP. |
| **Localisation** | English at launch; copy externalised for future locales. Metric/imperial follows locale. |

## 8. Privacy

Starting locations are frequently home or workplace addresses. This is the most sensitive thing the product touches and it deserves explicit treatment, not a line in a privacy policy.

| ID | Requirement |
|---|---|
| PR-1 | No account, no email, no phone number is ever collected |
| PR-2 | Coordinates are stored only for the session's lifetime and hard-deleted at expiry (24 h) via a scheduled purge job, not just marked expired |
| PR-3 | A participant sees the other's location **only** as an approximate area label (e.g. neighbourhood) and as a marker on the map — never a precise street address |
| PR-4 | Coordinates are truncated to ~3 decimal places (~100 m) before storage and before any client exposure |
| PR-5 | Location data is never sold, shared for advertising, or used to build a profile across sessions |
| PR-6 | The location entry screen states plainly, in-line, what happens to the location and when it is deleted — not buried behind a policy link |
| PR-7 | Analytics events carry no raw coordinates; only derived, non-identifying values (e.g. separation distance bucket) |

> **Open question (O-4).** PR-3 is a deliberate stance: it protects the other person but slightly reduces transparency about why a midpoint landed where it did. Worth validating in user testing.

## 9. Technical considerations

### 9.1 Architecture sketch

```
  Browser (A)                                  Browser (B)
      │                                             │
      │  HTTPS + SSE                    HTTPS + SSE │
      └──────────────┬──────────────────────────────┘
                     ▼
         ┌───────────────────────────┐
         │        Web app / API       │
         │  sessions · participants   │
         │  midpoint · search · rank  │
         └────────┬──────────┬────────┘
                  │          │
        ┌─────────▼───┐   ┌──▼────────────────┐
        │  Datastore  │   │ Places + Routing  │
        │  (TTL rows) │   │  provider API     │
        └─────────────┘   └───────────────────┘
                  │
           ┌──────▼──────┐
           │ Result cache │ (geohash + filter key)
           └─────────────┘
```

### 9.2 Third-party dependencies

| Need | Candidate | Notes |
|---|---|---|
| Place search, details, photos, ratings | Google Places API | Best coverage and rating density; strictest attribution/caching terms; highest cost |
| " (alternative) | Foursquare Places | Cheaper, more permissive caching, thinner ratings in some markets |
| Travel times | Google Routes / Distance Matrix, or Mapbox Matrix | Needed for FR-3.3 and FR-4.6; transit coverage varies by city |
| Address autocomplete | Same provider as place search, to keep session tokens and billing coherent | |
| Map rendering | Mapbox GL / MapLibre, or the provider's own SDK | |

> **Decision needed (O-1).** Provider choice materially affects unit cost, caching freedom, and the quality of the "popular" signal. Recommend prototyping place quality in two target cities before committing.

### 9.3 Caching and cost control

- Cache place-search responses keyed by (geohash precision ~6, radius bucket, filter set) with a TTL that respects the provider's terms.
- Cache travel-time matrices keyed by rounded origin/destination pairs and mode.
- Debounce autocomplete; use provider session tokens where they reduce billing.
- Compute the midpoint server-side once per input change, not per client render.
- Hard per-IP rate limits on session creation to blunt scripted abuse of paid APIs.

### 9.4 Data model (sketch)

```
Session        id, slug, created_at, expires_at, status,
               midpoint_lat, midpoint_lng, midpoint_method, filters_json

Participant    id, session_id, token_hash, seat (A|B),
               lat, lng, area_label, travel_mode, joined_at

Shortlist      session_id, participant_id, place_id, created_at

ResultCache    cache_key, payload_json, fetched_at, expires_at
```

## 10. Success metrics

### North star

**Completed sessions per week** — a session in which both participants submitted a location and at least one of them viewed the results.

### Supporting metrics

| Metric | Target (3 months post-launch) |
|---|---|
| Link-share rate (sessions created → link copied/shared) | > 70% |
| Second-participant join rate (link shared → B enters a location) | > 55% |
| Time from session creation to results rendered (median) | < 60 s |
| Result engagement (sessions where a place detail is opened or directions tapped) | > 45% |
| Shortlist match rate (sessions reaching a mutual match) | > 25% |
| Return rate (a device creating a second session within 30 days) | > 20% |
| Cost per completed session | < $0.02 |

### Counter-metrics

- Sessions abandoned at the waiting state (B never joins) — should fall over time
- Zero-result searches per completed session — should be near zero
- Median absolute travel-time difference between the two participants for the chosen place — the fairness claim, measured

## 11. Out of scope for V1 / future

- **Groups of 3+.** The data model uses a `Participant` table rather than two columns on `Session` specifically so this is an extension, not a rewrite. Midpoint generalises to a geometric median.
- **Voting / tournament mode** — swipe or head-to-head to converge on one place.
- **Calendar and time-of-day awareness** — "open at 7:30pm on Friday" rather than "open now".
- **Dietary and accessibility filters** — vegetarian, halal, gluten-free, step-free access.
- **Saved favourites and history** (would require accounts; weigh against the zero-friction principle).
- **Chat-platform integrations** — a Slack/Discord/WhatsApp entry point where the link is generated in-thread.
- **Native apps.**

## 12. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Places API cost scales faster than usage value | High | Medium | Aggressive caching, rate limits, cost-per-session as a tracked metric from day one, evaluate cheaper providers early |
| The geographic midpoint feels unfair in real cities | High | High | Ship FR-3.3 (travel-time balancing) close behind V1; always show both travel times so the user can judge |
| Midpoint lands somewhere with no restaurants | Medium | Medium | FR-3.6 radius widening + snap-to-cluster, with disclosure |
| Second participant never opens the link | High | Medium | FR-7.1 single-player fallback; optimise the share step; measure join rate as a primary funnel metric |
| Provider terms restrict caching or display | Medium | Medium | Confirm terms before provider commitment; design the cache layer with per-provider TTL policy |
| Privacy perception ("this app wants my home address") | Medium | Medium | In-line plain-language disclosure (PR-6), visible deletion promise, approximate-area display (PR-3) |
| Thin place coverage outside major metros | Medium | Medium | Launch city-by-city; detect low-coverage areas and say so rather than showing three bad options |
| Unguessable-link model is the only access control | Medium | Low | High-entropy slugs, `noindex`, no enumeration, short TTL, seat-locking after 2 participants |

## 13. Open questions

| ID | Question | Owner | Needed by |
|---|---|---|---|
| O-1 | Which places provider? Cost, coverage, and caching terms need a head-to-head in two target cities | Eng + Product | Before build starts |
| O-2 | Does V1 ship with geographic midpoint only, or hold for travel-time balancing? | Product | Scoping |
| O-3 | Which launch market(s)? Coverage quality and transit-data availability vary sharply | Product | Before build starts |
| O-4 | Is the approximate-area-only display (PR-3) the right privacy/transparency trade-off? | Product + Design | User testing |
| O-5 | Is shortlisting (FR-6.4) V1 or V2? It is what turns a list into a decision, but adds real-time write complexity | Product | Scoping |
| O-6 | Monetisation direction — none at launch, but affiliate/booking links vs. sponsored placement affects ranking-integrity decisions later | Product | Post-launch |

## 14. Release plan

| Milestone | Contents |
|---|---|
| **M1 — Walking skeleton** | Session create, unique link, two-seat join, geographic midpoint, place search, static list. Internal only. |
| **M2 — V1 / MVP** | Full P0 set: live shared state, filters, detail view, directions deep links, privacy disclosures, error states. Limited public launch in one city. |
| **M3 — Fairness** | Travel-time-balanced midpoint (FR-3.3), per-participant travel times (FR-4.6), fairness sort, travel modes. |
| **M4 — Decision tools** | Shortlisting and mutual matches (FR-6.4), shared filters, single-player fallback (FR-7.1). |

---

## Appendix A — Terminology

| Term | Meaning |
|---|---|
| **Session** | One instance of the two-person flow, addressed by a unique link |
| **Participant / seat** | One of the two people in a session (seat A = creator, seat B = joiner) |
| **Meeting point / midpoint** | The computed location the food search is centred on |
| **Separation** | Great-circle distance between the two starting locations |
| **Fairness** | The absolute difference in travel time between the two participants and a candidate place |
| **Completed session** | Both locations submitted and results viewed by at least one participant |
