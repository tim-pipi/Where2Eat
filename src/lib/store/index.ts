import { Redis } from "@upstash/redis";

import { FileSessionStore } from "./file-store.ts";
import { KvSessionStore, type KvClient } from "./kv-store.ts";
import type { SessionStore } from "./types.ts";

export { SESSION_TTL_MS } from "./types.ts";
export type { CachedResults, StoredParticipant, StoredSession } from "./types.ts";
export { seatFor } from "./tokens.ts";
export { KvSessionStore } from "./kv-store.ts";
export type { KvClient } from "./kv-store.ts";

/**
 * Vercel's Upstash integration sets the KV_* names; a direct Upstash project
 * sets the UPSTASH_* ones. Accept either so neither setup needs hand-editing.
 */
function redisCredentials(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

function upstashClient(url: string, token: string): KvClient {
  // Deserialisation is off so values round-trip as the exact strings we wrote.
  const redis = new Redis({ url, token, automaticDeserialization: false });

  return {
    get: (key) => redis.get<string>(key),
    // Upstash types SET options as a discriminated union, so the combinations
    // are spelled out rather than spread together.
    set: (key, value, opts) => {
      const ex = opts?.exSeconds;
      const nx = opts?.ifNotExists;
      const result =
        ex && nx
          ? redis.set(key, value, { ex, nx: true })
          : ex
            ? redis.set(key, value, { ex })
            : nx
              ? redis.set(key, value, { nx: true })
              : redis.set(key, value);
      return result as Promise<"OK" | null>;
    },
    mget: (keys) => redis.mget<(string | null)[]>(...keys),
    del: (keys) => redis.del(...keys),
  };
}

function build(): SessionStore {
  const credentials = redisCredentials();
  if (credentials) {
    return new KvSessionStore(upstashClient(credentials.url, credentials.token), "upstash-redis");
  }

  if (process.env.VERCEL) {
    // Failing loudly beats a deployment that looks fine until two people try
    // to share a session and land on different instances.
    throw new Error(
      "No Redis credentials found. Where2Eat needs shared storage on Vercel: " +
        "add the Upstash Redis integration, or set KV_REST_API_URL and KV_REST_API_TOKEN.",
    );
  }

  return new FileSessionStore();
}

/** Survives dev-server hot reloads, which would otherwise drop live sessions. */
const globalForStore = globalThis as unknown as { __w2eStore?: SessionStore };

export function getStore(): SessionStore {
  globalForStore.__w2eStore ??= build();
  return globalForStore.__w2eStore;
}
