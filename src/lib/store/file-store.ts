import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { LatLng, Seat } from "../types.ts";
import { hashToken, newSlug, newToken } from "./tokens.ts";
import {
  SESSION_TTL_MS,
  versionOf,
  type CachedResults,
  type SessionStore,
  type StoredParticipant,
  type StoredSession,
} from "./types.ts";

const DATA_FILE = join(process.cwd(), "data", "sessions.json");

/**
 * Local-development store: an in-memory map mirrored to a JSON file.
 *
 * Assumes a single long-lived process, which is true of `next dev` and false
 * of every serverless platform — hence KvSessionStore for deployment.
 */
export class FileSessionStore implements SessionStore {
  readonly kind = "file";

  private sessions = new Map<string, StoredSession>();
  private results = new Map<string, CachedResults & { expiresAt: number }>();
  private loaded = false;

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = JSON.parse(readFileSync(DATA_FILE, "utf8")) as StoredSession[];
      for (const session of parsed) this.sessions.set(session.slug, session);
    } catch {
      // No file yet, or unreadable. Either way we start empty.
    }
    this.purge();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(DATA_FILE), { recursive: true });
      // Write-then-rename so a crash mid-write cannot truncate the store.
      const tmp = `${DATA_FILE}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify([...this.sessions.values()]), "utf8");
      renameSync(tmp, DATA_FILE);
    } catch {
      // Best effort; the in-memory map stays authoritative.
    }
  }

  /** Hard-delete expired sessions and their coordinates (PR-2). */
  private purge(): void {
    const now = Date.now();
    let removed = false;
    for (const [slug, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(slug);
        this.results.delete(slug);
        removed = true;
      }
    }
    if (removed) this.persist();
  }

  private sync(session: StoredSession): StoredSession {
    session.participants.sort((a, b) => a.seat.localeCompare(b.seat));
    session.version = versionOf(session.createdAt, session.participants);
    this.persist();
    return session;
  }

  async create(): Promise<{ session: StoredSession; token: string }> {
    this.load();
    this.purge();

    const now = Date.now();
    const token = newToken();
    const session: StoredSession = {
      slug: newSlug(),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      participants: [
        {
          seat: "A",
          tokenHash: hashToken(token),
          location: null,
          areaLabel: null,
          joinedAt: now,
          updatedAt: now,
        },
      ],
      version: now,
    };

    this.sessions.set(session.slug, session);
    return { session: this.sync(session), token };
  }

  async get(slug: string): Promise<StoredSession | null> {
    this.load();
    const session = this.sessions.get(slug);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(slug);
      this.results.delete(slug);
      this.persist();
      return null;
    }
    return session;
  }

  async join(slug: string): Promise<{ session: StoredSession; token: string } | null> {
    const session = await this.get(slug);
    if (!session) return null;

    const taken = new Set(session.participants.map((p) => p.seat));
    const seat = (["A", "B"] as const).find((s) => !taken.has(s));
    if (!seat) return null;

    const now = Date.now();
    const token = newToken();
    session.participants.push({
      seat,
      tokenHash: hashToken(token),
      location: null,
      areaLabel: null,
      joinedAt: now,
      updatedAt: now,
    });

    return { session: this.sync(session), token };
  }

  async setLocation(
    slug: string,
    seat: Seat,
    location: LatLng,
    areaLabel: string | null,
  ): Promise<StoredSession | null> {
    const session = await this.get(slug);
    if (!session) return null;

    const participant = session.participants.find((p) => p.seat === seat);
    if (!participant) return null;

    participant.location = location;
    participant.areaLabel = areaLabel;
    participant.updatedAt = Date.now();

    return this.sync(session);
  }

  async getResults(slug: string): Promise<CachedResults | null> {
    const hit = this.results.get(slug);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.results.delete(slug);
      return null;
    }
    return hit;
  }

  async setResults(slug: string, results: CachedResults, ttlMs: number): Promise<void> {
    this.results.set(slug, { ...results, expiresAt: Date.now() + ttlMs });
  }
}
