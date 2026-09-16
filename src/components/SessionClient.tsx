"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatDistance } from "@/lib/geo";
import { seatLabels } from "@/lib/labels";
import type { SessionView } from "@/lib/types";

import { GoogleMapView } from "./GoogleMapView";
import { LocationForm } from "./LocationForm";
import { PlaceList } from "./PlaceList";
import { SchematicMap } from "./SchematicMap";

const POLL_MS = 2500;

export function SessionClient({ slug }: { slug: string }) {
  const [view, setView] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<"map" | "list">("list");
  const [copied, setCopied] = useState(false);

  // Take a seat on arrival, if one is free (FR-1.4).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sessions/${slug}/join`, { method: "POST" })
      .then(async (response) => {
        const data = (await response.json()) as SessionView;
        if (!cancelled) setView(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load this session.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Poll for the other person (FR-6.1). Stops once both locations are in.
  const shouldPoll = view?.status === "waiting";
  useEffect(() => {
    if (!shouldPoll) return;
    let cancelled = false;

    const timer = setInterval(() => {
      fetch(`/api/sessions/${slug}`, { cache: "no-store" })
        .then(async (response) => {
          const data = (await response.json()) as SessionView;
          if (!cancelled) setView(data);
        })
        .catch(() => {
          /* Transient — the next tick will retry. */
        });
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [shouldPoll, slug]);

  const onSelect = useCallback((id: string | null) => setSelectedId(id), []);

  if (loadError) {
    return <Shell><div className="card empty"><h2>{loadError}</h2></div></Shell>;
  }
  if (!view) {
    return <Shell><p className="eyebrow" style={{ textAlign: "center" }}>Loading…</p></Shell>;
  }
  if (view.status === "expired") {
    return (
      <Shell>
        <div className="card empty">
          <h2>This session has expired</h2>
          <p>Sessions last 24 hours, then the locations in them are deleted.</p>
          <p style={{ marginTop: 16 }}>
            <Link className="btn" href="/" style={{ textDecoration: "none" }}>
              Start a new one
            </Link>
          </p>
        </div>
      </Shell>
    );
  }

  const seatA = view.participants.find((p) => p.seat === "A");
  const seatB = view.participants.find((p) => p.seat === "B");
  const you = view.participants.find((p) => p.seat === view.yourSeat);
  const labels = seatLabels(view.yourSeat);
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Where2Eat", url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Dismissed or unsupported — the link is on screen to copy by hand. */
    }
  }

  if (view.status === "waiting") {
    return (
      <Shell demoMode={view.demoMode}>
        <div className="setup">
          <div>
            <h1>{view.yourSeat ? "Almost there" : "You are watching this session"}</h1>
            <p className="lede">
              {view.yourSeat
                ? "Send this link to whoever you are meeting. You can both enter your locations in any order."
                : "Both seats are taken, so you can follow along but not take part."}
            </p>
          </div>

          <div className="card share">
            <span className="eyebrow">Shared link</span>
            <div className="row">
              <div className="link">{shareUrl}</div>
              <button className="btn" type="button" onClick={share}>
                {copied ? "Copied" : "Share"}
              </button>
            </div>
          </div>

          <div className="seats">
            <SeatRow
              seat="A"
              label={view.yourSeat === "A" ? "You" : "First person"}
              area={seatA?.areaLabel ?? null}
              joined={Boolean(seatA)}
            />
            <SeatRow
              seat="B"
              label={view.yourSeat === "B" ? "You" : "Second person"}
              area={seatB?.areaLabel ?? null}
              joined={Boolean(seatB)}
            />
          </div>

          {view.yourSeat ? (
            <LocationForm
              slug={slug}
              hasLocation={Boolean(you?.location)}
              onUpdated={setView}
            />
          ) : null}

          {you?.location && !bothSet(view) ? (
            <p className="banner info">
              <span className="waiting-pulse" aria-hidden="true" />
              Waiting for the other person to say where they are starting from.
            </p>
          ) : null}
        </div>
      </Shell>
    );
  }

  // status === "ready"
  const originA = seatA?.location ?? null;
  const originB = seatB?.location ?? null;
  const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";

  return (
    <Shell demoMode={view.demoMode}>
      <div className="results-head">
        <span className="eyebrow">Between the two of you</span>
        <h1>{view.places.length} places to eat</h1>
        <p className="summary">
          You are <b>{formatDistance(view.separation ?? 0)}</b> apart. These are
          ranked around the midpoint, within{" "}
          <b>{formatDistance(view.searchRadius ?? 0)}</b> of it.
        </p>
      </div>

      {view.notice ? (
        <p className="banner info" style={{ marginBottom: 14 }}>{view.notice}</p>
      ) : null}

      <div className="pane-toggle" role="group" aria-label="Show map or list">
        <button type="button" aria-pressed={pane === "list"} onClick={() => setPane("list")}>
          List
        </button>
        <button type="button" aria-pressed={pane === "map"} onClick={() => setPane("map")}>
          Map
        </button>
      </div>

      <div className="split">
        <div className={pane === "map" ? "pane map-pane" : "pane map-pane hidden-sm"}>
          {originA && originB && view.midpoint ? (
            browserKey ? (
              <GoogleMapView
                apiKey={browserKey}
                originA={originA}
                originB={originB}
                midpoint={view.midpoint}
                places={view.places}
                selectedId={selectedId}
                onSelect={onSelect}
                labels={labels}
              />
            ) : (
              <SchematicMap
                originA={originA}
                originB={originB}
                midpoint={view.midpoint}
                places={view.places}
                selectedId={selectedId}
                onSelect={onSelect}
                labels={labels}
              />
            )
          ) : null}

          <div className="map-legend">
            <span><i className="seat-dot a" /> {labels.a}</span>
            <span><i className="seat-dot b" /> {labels.b}</span>
            <span><i className="seat-dot mid" /> Midpoint</span>
            {!browserKey ? <span>Schematic — no map key configured</span> : null}
          </div>
        </div>

        <div className={pane === "list" ? "pane" : "pane hidden-sm"}>
          <PlaceList
            places={view.places}
            selectedId={selectedId}
            onSelect={onSelect}
            labels={labels}
          />

          <p className="attrib">
            {view.demoMode
              ? "Demo data — no Google API key is configured, so these places are invented."
              : "Places data © Google"}
            <br />
            Locations are rounded to about 100 m and deleted 24 hours after this
            session started.
          </p>

          {view.yourSeat ? (
            <details style={{ marginTop: 16 }}>
              <summary className="eyebrow" style={{ cursor: "pointer" }}>
                Change where you are starting from
              </summary>
              <div style={{ marginTop: 10 }}>
                <LocationForm slug={slug} hasLocation onUpdated={setView} />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

function bothSet(view: SessionView): boolean {
  return view.participants.filter((p) => p.location).length === 2;
}

function SeatRow({
  seat,
  label,
  area,
  joined,
}: {
  seat: "A" | "B";
  label: string;
  area: string | null;
  joined: boolean;
}) {
  return (
    <div className={`seat-row ${seat.toLowerCase()}`}>
      <span className={`seat-dot ${seat.toLowerCase()}`} aria-hidden="true" />
      <span>
        <span className="who">{label}</span>
        <br />
        <span className="where">
          {area ?? (joined ? "Has not said where yet" : "Has not opened the link yet")}
        </span>
      </span>
      <span className={area ? "state set" : "state"}>{area ? "Ready" : "Waiting"}</span>
    </div>
  );
}

function Shell({
  children,
  demoMode = false,
}: {
  children: React.ReactNode;
  demoMode?: boolean;
}) {
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="seat-dot mid" aria-hidden="true" />
          Where2Eat
        </Link>
        {demoMode ? <span className="demo-chip">Demo data</span> : null}
      </header>
      <main className="session">{children}</main>
    </>
  );
}
