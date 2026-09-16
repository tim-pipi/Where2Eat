import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { loadMapsLibraries, MapsLoadError, __resetMapsLoader } from "../maps-loader.ts";

/**
 * Stands in for Google's bootstrap, modelling the two behaviours that broke
 * the map in production:
 *
 *   - `onload` fires while `google.maps` is still empty, and
 *   - the API only announces itself by invoking the `callback` named in the URL.
 */
function stubBrowser({ authFails = false, missingLibrary = false, fireCallback = true } = {}) {
  class FakeMap {}
  class FakeBounds {}
  class FakeMarker {}

  const libraries: Record<string, Record<string, unknown>> = {
    core: { LatLngBounds: FakeBounds },
    maps: { Map: missingLibrary ? undefined : FakeMap },
    marker: { Marker: FakeMarker },
  };

  const scripts: { src: string; onload?: () => void; onerror?: () => void }[] = [];
  const win: Record<string, unknown> = {};

  const doc = {
    createElement: () => {
      const el: { src: string; onload?: () => void; onerror?: () => void } = { src: "" };
      scripts.push(el);
      return el;
    },
    head: {
      appendChild: () => {
        const el = scripts[scripts.length - 1];
        queueMicrotask(() => {
          // The load event fires with nothing usable behind it.
          el.onload?.();
          if (!fireCallback) return;

          win.google = {
            maps: {
              importLibrary: async (name: string) => {
                if (authFails) {
                  (win.gm_authFailure as (() => void) | undefined)?.();
                  return {};
                }
                return libraries[name] ?? {};
              },
            },
          };

          const name = new URL(el.src).searchParams.get("callback");
          (win[name as string] as (() => void) | undefined)?.();
        });
      },
    },
  };

  globalThis.window = win as unknown as Window & typeof globalThis;
  globalThis.document = doc as unknown as Document;
  return { FakeMap, FakeBounds, FakeMarker, scripts, win };
}

afterEach(() => {
  __resetMapsLoader();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

describe("loadMapsLibraries", () => {
  it("regression: does not treat the script load event as readiness", async () => {
    const { win } = stubBrowser();
    const done = loadMapsLibraries("test-key");

    // Let onload fire, but not yet the callback.
    await new Promise((r) => setTimeout(r, 0));

    // This is exactly what the old code read at this point, and why the map died.
    const maps = (win.google as { maps?: Record<string, unknown> } | undefined)?.maps;
    assert.equal(maps?.Map, undefined, "Map must not be expected to exist at onload");

    const libs = await done;
    assert.equal(typeof libs.Map, "function", "callback + importLibrary is what produces it");
  });

  it("passes callback and loading=async in the bootstrap URL", async () => {
    const { scripts } = stubBrowser();
    await loadMapsLibraries("my key&x");
    assert.match(scripts[0].src, /loading=async/);
    assert.match(scripts[0].src, /callback=__w2eMapsReady/);
    assert.match(scripts[0].src, /key=my%20key%26x/);
  });

  it("returns Map, LatLngBounds and Marker once the libraries resolve", async () => {
    const { FakeMap, FakeBounds, FakeMarker } = stubBrowser();
    const libs = await loadMapsLibraries("k");
    assert.equal(libs.Map, FakeMap);
    assert.equal(libs.LatLngBounds, FakeBounds);
    assert.equal(libs.Marker, FakeMarker);
  });

  it("requests the bootstrap exactly once across concurrent callers", async () => {
    const { scripts } = stubBrowser();
    await Promise.all([loadMapsLibraries("k"), loadMapsLibraries("k"), loadMapsLibraries("k")]);
    assert.equal(scripts.length, 1);
  });

  it("reports an auth failure distinctly, so the UI can explain it", async () => {
    stubBrowser({ authFails: true });
    const error = await loadMapsLibraries("bad-key").then(
      () => null,
      (e: unknown) => e,
    );
    assert.ok(error instanceof MapsLoadError, "expected a MapsLoadError");
    assert.equal(error.isAuthFailure, true);
  });

  it("fails loudly if a library resolves without its constructor", async () => {
    stubBrowser({ missingLibrary: true });
    await assert.rejects(loadMapsLibraries("k"), /did not provide Map/);
  });

  it("rejects when the script errors outright", async () => {
    const { scripts } = stubBrowser({ fireCallback: false });
    const done = loadMapsLibraries("k");
    await new Promise((r) => setTimeout(r, 0));
    scripts[0].onerror?.();
    await assert.rejects(done, /could not be fetched/);
  });
});
