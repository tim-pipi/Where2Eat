import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { LatLng, Seat } from "./types";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // FR-1.6

export interface StoredParticipant {
  seat: Seat;
  tokenHash: string;
  location: LatLng | null;
  areaLabel: string | null;
  joinedAt: number;
}

export interface StoredSession {
  slug: string;
  createdAt: number;
  expiresAt: number;
  participants: StoredParticipant[];
  version: number;
}

const DATA_FILE = join(process.cwd(), "data", "sessions.json");

/**
 * Sessions live in a JSON file behind an in-memory map.
 *
 * Deliberate V1 choice: sessions are tiny, short-lived (24h) and low-volume,
 * and this keeps the app to zero infrastructure and zero native dependencies.
 * It assumes a single server process — swap this module for Redis or Postgres
 * before running more than one.
 */
class SessionStore {
  private sessions = new Map<string, StoredSession>();
  private loaded = false;

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw) as StoredSession[];
      for (const session of parsed) this.sessions.set(session.slug, session);
    } catch {
      // No file yet, or it is unreadable. Either way we start empty.
    }
    this.purgeExpired();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(DATA_FILE), { recursive: true });
      // Write-then-rename so a crash mid-write cannot truncate the store.
      const tmp = `${DATA_FILE}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify([...this.sessions.values()]), "utf8");
      renameSync(tmp, DATA_FILE);
    } catch {
      // Persistence is best-effort; the in-memory map remains authoritative.
    }
  }

  /** Hard-delete expired sessions and their coordinates (PR-2). */
  private purgeExpired(): void {
    const now = Date.now();
    let removed = false;
    for (const [slug, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(slug);
        removed = true;
      }
    }
    if (removed) this.persist();
  }

  create(): { session: StoredSession; token: string } {
    this.load();
    this.purgeExpired();

    const now = Date.now();
    const session: StoredSession = {
      slug: newSlug(),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      participants: [],
      version: 1,
    };
    this.sessions.set(session.slug, session);

    // The creator takes seat A immediately, so the link they share is
    // already a two-seat session with one seat filled.
    const token = this.claimSeat(session, "A");
    this.persist();
    return { session, token };
  }

  get(slug: string): StoredSession | null {
    this.load();
    const session = this.sessions.get(slug);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(slug);
      this.persist();
      return null;
    }
    return session;
  }

  /** Seat held by this token, or null for a spectator (FR-7.2). */
  seatFor(session: StoredSession, token: string | undefined): Seat | null {
    if (!token) return null;
    const hash = hashToken(token);
    return session.participants.find((p) => p.tokenHash === hash)?.seat ?? null;
  }

  /**
   * Take the free seat if there is one. Returns the new token, or null when
   * both seats are already taken — that caller becomes a spectator (FR-1.4).
   */
  join(session: StoredSession): string | null {
    const taken = new Set(session.participants.map((p) => p.seat));
    const seat: Seat | undefined = (["A", "B"] as const).find((s) => !taken.has(s));
    if (!seat) return null;

    const token = this.claimSeat(session, seat);
    this.touch(session);
    return token;
  }

  private claimSeat(session: StoredSession, seat: Seat): string {
    const token = randomBytes(32).toString("hex");
    session.participants.push({
      seat,
      tokenHash: hashToken(token),
      location: null,
      areaLabel: null,
      joinedAt: Date.now(),
    });
    return token;
  }

  setLocation(
    session: StoredSession,
    seat: Seat,
    location: LatLng,
    areaLabel: string | null,
  ): void {
    const participant = session.participants.find((p) => p.seat === seat);
    if (!participant) return;
    participant.location = location;
    participant.areaLabel = areaLabel;
    this.touch(session);
  }

  private touch(session: StoredSession): void {
    session.version += 1;
    this.persist();
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const SLUG_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * 12 characters of unbiased base-58-ish randomness — about 70 bits, well past
 * the 64 the PRD asks for (FR-1.2). Ambiguous glyphs (I, O, l) are excluded so
 * the link survives being read aloud or retyped.
 */
function newSlug(): string {
  const size = SLUG_ALPHABET.length;
  // Reject bytes in the ragged tail so every character stays equally likely.
  const limit = 256 - (256 % size);
  let slug = "";
  while (slug.length < 12) {
    for (const byte of randomBytes(16)) {
      if (byte >= limit) continue;
      slug += SLUG_ALPHABET[byte % size];
      if (slug.length === 12) break;
    }
  }
  return slug;
}

/**
 * Survives dev-server hot reloads, which would otherwise re-evaluate this
 * module and drop every in-flight session.
 */
const globalForStore = globalThis as unknown as { __w2eStore?: SessionStore };
export const store = globalForStore.__w2eStore ?? new SessionStore();
globalForStore.__w2eStore = store;
