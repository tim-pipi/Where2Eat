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

/**
 * The slice of Redis this store needs. Keeping it this narrow means the store
 * can be tested against a fake without a live database.
 */
export interface KvClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    opts?: { exSeconds?: number; ifNotExists?: boolean },
  ): Promise<"OK" | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  del(keys: string[]): Promise<number>;
}

const meta = (slug: string) => `w2e:s:${slug}`;
const seatKey = (slug: string, seat: Seat) => `w2e:s:${slug}:${seat}`;
const resultsKey = (slug: string) => `w2e:r:${slug}`;

interface SessionMeta {
  slug: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Shared-state store for serverless deployments, where every request may land
 * on a different instance.
 *
 * Each participant owns a separate key, which buys two things:
 *
 *  - Seats are claimed with SET NX, so two people opening the link at the same
 *    moment can never both take seat B.
 *  - Nobody performs a read-modify-write over another participant's data, so
 *    simultaneous writes cannot lose one another's updates.
 *
 * Expiry is Redis TTL rather than a sweeper, which satisfies the hard-delete
 * requirement (PR-2) without anything needing to run on a schedule.
 */
export class KvSessionStore implements SessionStore {
  readonly kind: string;
  private readonly kv: KvClient;

  constructor(kv: KvClient, kind = "kv") {
    this.kv = kv;
    this.kind = kind;
  }

  private ttlSeconds(expiresAt: number): number {
    return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
  }

  async create(): Promise<{ session: StoredSession; token: string }> {
    const now = Date.now();
    const info: SessionMeta = {
      slug: newSlug(),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    };
    const ttl = this.ttlSeconds(info.expiresAt);

    await this.kv.set(meta(info.slug), JSON.stringify(info), { exSeconds: ttl });

    const token = newToken();
    const participant: StoredParticipant = {
      seat: "A",
      tokenHash: hashToken(token),
      location: null,
      areaLabel: null,
      joinedAt: now,
      updatedAt: now,
    };
    await this.kv.set(seatKey(info.slug, "A"), JSON.stringify(participant), {
      exSeconds: ttl,
      ifNotExists: true,
    });

    return { session: assemble(info, [participant]), token };
  }

  async get(slug: string): Promise<StoredSession | null> {
    const [rawMeta, rawA, rawB] = await this.kv.mget([
      meta(slug),
      seatKey(slug, "A"),
      seatKey(slug, "B"),
    ]);
    if (!rawMeta) return null;

    const info = parse<SessionMeta>(rawMeta);
    if (!info || info.expiresAt <= Date.now()) return null;

    const participants = [parse<StoredParticipant>(rawA), parse<StoredParticipant>(rawB)].filter(
      (p): p is StoredParticipant => p !== null,
    );

    return assemble(info, participants);
  }

  async join(slug: string): Promise<{ session: StoredSession; token: string } | null> {
    const session = await this.get(slug);
    if (!session) return null;

    const ttl = this.ttlSeconds(session.expiresAt);

    for (const seat of ["A", "B"] as const) {
      if (session.participants.some((p) => p.seat === seat)) continue;

      const now = Date.now();
      const token = newToken();
      const participant: StoredParticipant = {
        seat,
        tokenHash: hashToken(token),
        location: null,
        areaLabel: null,
        joinedAt: now,
        updatedAt: now,
      };

      // NX is what makes this safe: whoever loses the race gets null and
      // simply tries the next seat, or ends up spectating.
      const claimed = await this.kv.set(
        seatKey(slug, seat),
        JSON.stringify(participant),
        { exSeconds: ttl, ifNotExists: true },
      );
      if (claimed) {
        const refreshed = await this.get(slug);
        return refreshed ? { session: refreshed, token } : null;
      }
    }

    return null;
  }

  async setLocation(
    slug: string,
    seat: Seat,
    location: LatLng,
    areaLabel: string | null,
  ): Promise<StoredSession | null> {
    const raw = await this.kv.get(seatKey(slug, seat));
    const participant = parse<StoredParticipant>(raw);
    if (!participant) return null;

    const session = await this.get(slug);
    if (!session) return null;

    const updated: StoredParticipant = {
      ...participant,
      location,
      areaLabel,
      updatedAt: Date.now(),
    };
    // Only this seat's holder writes this key, so a plain overwrite is safe.
    await this.kv.set(seatKey(slug, seat), JSON.stringify(updated), {
      exSeconds: this.ttlSeconds(session.expiresAt),
    });

    return this.get(slug);
  }

  async getResults(slug: string): Promise<CachedResults | null> {
    return parse<CachedResults>(await this.kv.get(resultsKey(slug)));
  }

  async setResults(slug: string, results: CachedResults, ttlMs: number): Promise<void> {
    await this.kv.set(resultsKey(slug), JSON.stringify(results), {
      exSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
    });
  }
}

function assemble(info: SessionMeta, participants: StoredParticipant[]): StoredSession {
  const sorted = [...participants].sort((a, b) => a.seat.localeCompare(b.seat));
  return {
    slug: info.slug,
    createdAt: info.createdAt,
    expiresAt: info.expiresAt,
    participants: sorted,
    version: versionOf(info.createdAt, sorted),
  };
}

function parse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
