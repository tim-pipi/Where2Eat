import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { KvSessionStore } from "../kv-store.ts";
import type { KvClient } from "../kv-store.ts";
import { seatFor } from "../tokens.ts";

/** In-memory stand-in for Redis, honouring the NX and TTL semantics we rely on. */
function fakeKv(): KvClient & { size: () => number } {
  const data = new Map<string, { value: string; expiresAt: number }>();

  const live = (key: string) => {
    const hit = data.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      data.delete(key);
      return null;
    }
    return hit.value;
  };

  return {
    async get(key) {
      return live(key);
    },
    async set(key, value, opts) {
      if (opts?.ifNotExists && live(key) !== null) return null;
      data.set(key, {
        value,
        expiresAt: opts?.exSeconds ? Date.now() + opts.exSeconds * 1000 : Infinity,
      });
      return "OK";
    },
    async mget(keys) {
      return keys.map(live);
    },
    async del(keys) {
      let n = 0;
      for (const key of keys) if (data.delete(key)) n += 1;
      return n;
    },
    size: () => data.size,
  };
}

describe("KvSessionStore", () => {
  it("gives the creator seat A", async () => {
    const store = new KvSessionStore(fakeKv());
    const { session, token } = await store.create();

    assert.equal(session.participants.length, 1);
    assert.equal(seatFor(session, token), "A");
  });

  it("gives the second arrival seat B, and the third no seat", async () => {
    const store = new KvSessionStore(fakeKv());
    const { session } = await store.create();

    const second = await store.join(session.slug);
    assert.ok(second, "second person should get a seat");
    assert.equal(seatFor(second.session, second.token), "B");

    assert.equal(await store.join(session.slug), null, "third person spectates");
  });

  it("never hands the same seat to two simultaneous joiners", async () => {
    // The case that separates serverless from a single process: both requests
    // read "seat B is free" before either writes.
    const store = new KvSessionStore(fakeKv());
    const { session } = await store.create();

    const [first, second] = await Promise.all([
      store.join(session.slug),
      store.join(session.slug),
    ]);

    const claimed = [first, second].filter((r) => r !== null);
    assert.equal(claimed.length, 1, "exactly one joiner should win seat B");
    assert.equal(seatFor(claimed[0]!.session, claimed[0]!.token), "B");
  });

  it("keeps each participant's location independent of the other's writes", async () => {
    const store = new KvSessionStore(fakeKv());
    const { session } = await store.create();
    await store.join(session.slug);

    // Simultaneous writes: with a single shared record one would clobber the other.
    await Promise.all([
      store.setLocation(session.slug, "A", { lat: 51.5, lng: -0.09 }, "London Bridge"),
      store.setLocation(session.slug, "B", { lat: 51.54, lng: -0.14 }, "Camden"),
    ]);

    const after = await store.get(session.slug);
    assert.equal(after?.participants.filter((p) => p.location).length, 2);
  });

  it("advances version when a location is set, so pollers see a change", async () => {
    const store = new KvSessionStore(fakeKv());
    const { session } = await store.create();
    const before = session.version;

    await new Promise((r) => setTimeout(r, 2));
    const after = await store.setLocation(session.slug, "A", { lat: 1, lng: 2 }, "Somewhere");

    assert.ok(after!.version > before, "version should rise after a write");
  });

  it("returns null once a session has expired", async () => {
    const kv = fakeKv();
    const store = new KvSessionStore(kv);
    const { session } = await store.create();

    // Expire it the way Redis would, by dropping the keys.
    await kv.del([`w2e:s:${session.slug}`, `w2e:s:${session.slug}:A`]);
    assert.equal(await store.get(session.slug), null);
  });

  it("round-trips cached results and keeps them keyed to both origins", async () => {
    const store = new KvSessionStore(fakeKv());
    const { session } = await store.create();

    await store.setResults(
      session.slug,
      { signature: "a|b", places: [], notice: null, fetchedAt: Date.now() },
      60_000,
    );

    const cached = await store.getResults(session.slug);
    assert.equal(cached?.signature, "a|b");
  });

  it("issues unguessable, distinct slugs", async () => {
    const store = new KvSessionStore(fakeKv());
    const slugs = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const { session } = await store.create();
      assert.match(session.slug, /^[0-9A-Za-z]{12}$/);
      slugs.add(session.slug);
    }
    assert.equal(slugs.size, 50, "slugs must not collide");
  });
});
