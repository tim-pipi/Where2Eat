import { createHash, randomBytes } from "node:crypto";

import type { Seat } from "../types.ts";
import type { StoredSession } from "./types.ts";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

/** Which seat this token holds, or null for a spectator (FR-8.2). */
export function seatFor(session: StoredSession, token: string | undefined): Seat | null {
  if (!token) return null;
  const hash = hashToken(token);
  return session.participants.find((p) => p.tokenHash === hash)?.seat ?? null;
}

const SLUG_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * 12 characters of unbiased randomness — about 70 bits, past the 64 the PRD
 * asks for (FR-1.2). Ambiguous glyphs (I, O, l) are excluded so the link
 * survives being read aloud or retyped.
 */
export function newSlug(): string {
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
