/**
 * Loads the Google Maps JavaScript API.
 *
 * Two things about the bootstrap are easy to get wrong, and this module exists
 * to get both right:
 *
 * 1. `loading=async` explicitly "prevents JavaScript execution triggered by the
 *    script's load event", so `script.onload` tells you nothing — at that point
 *    `google.maps` may be absent or half-built. Readiness is signalled *only*
 *    through the `callback` parameter.
 * 2. Even once ready, the bootstrap is just a loader. No library exists until
 *    `importLibrary` is awaited.
 *
 * Getting either wrong breaks the map while server-side Places calls keep
 * working perfectly, which makes it look like a bad map key when it is not.
 */

export interface MapsLibraries {
  Map: new (el: HTMLElement, options: Record<string, unknown>) => GMap;
  LatLngBounds: new () => GBounds;
  Marker: new (options: Record<string, unknown>) => GMarker;
}

export interface GMap {
  fitBounds: (bounds: GBounds, padding?: number) => void;
  panTo: (position: { lat: number; lng: number }) => void;
}
export interface GBounds {
  extend: (position: { lat: number; lng: number }) => void;
}
export interface GMarker {
  setMap: (map: GMap | null) => void;
  addListener: (event: string, handler: () => void) => void;
  setIcon: (icon: unknown) => void;
  setZIndex: (z: number) => void;
}

interface MapsNamespace {
  importLibrary?: (name: string) => Promise<Record<string, unknown>>;
}

declare global {
  interface Window {
    google?: { maps?: MapsNamespace };
    __w2eMapsBootstrap?: Promise<void>;
    /** Google calls this once the API is ready. The only valid readiness signal. */
    __w2eMapsReady?: () => void;
    /** Google calls this on key, referrer or billing failures. */
    gm_authFailure?: () => void;
  }
}

let authFailed = false;

export class MapsLoadError extends Error {
  /** True when Google rejected the key itself, rather than a network fault. */
  isAuthFailure: boolean;

  constructor(message: string, isAuthFailure: boolean) {
    super(message);
    this.name = "MapsLoadError";
    this.isAuthFailure = isAuthFailure;
  }
}

const READY_CALLBACK = "__w2eMapsReady";
const BOOTSTRAP_ID = "w2e-google-maps-bootstrap";
/** Google is slow sometimes, but a minute means it is never coming. */
const READY_TIMEOUT_MS = 60_000;

function loadBootstrap(apiKey: string): Promise<void> {
  if (window.__w2eMapsBootstrap) return window.__w2eMapsBootstrap;

  window.__w2eMapsBootstrap = new Promise<void>((resolve, reject) => {
    window.gm_authFailure = () => {
      authFailed = true;
    };

    if (window.google?.maps?.importLibrary) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      reject(
        new MapsLoadError(
          "Google Maps did not finish loading in time.",
          authFailed,
        ),
      );
    }, READY_TIMEOUT_MS);

    window[READY_CALLBACK] = () => {
      clearTimeout(timer);
      resolve();
    };

    const script = document.createElement("script");
    script.id = BOOTSTRAP_ID;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&loading=async&v=weekly&callback=${READY_CALLBACK}`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      reject(new MapsLoadError("The Google Maps script could not be fetched.", false));
    };
    document.head.appendChild(script);
  });

  return window.__w2eMapsBootstrap;
}

export async function loadMapsLibraries(apiKey: string): Promise<MapsLibraries> {
  await loadBootstrap(apiKey);

  const importLibrary = window.google?.maps?.importLibrary;
  if (!importLibrary) {
    throw new MapsLoadError(
      "Google Maps reported ready but exposed no libraries.",
      authFailed,
    );
  }

  // core carries LatLngBounds; Map and Marker live in their own libraries.
  const [core, maps, marker] = await Promise.all([
    importLibrary("core"),
    importLibrary("maps"),
    importLibrary("marker"),
  ]);

  const libs = {
    Map: maps.Map,
    LatLngBounds: core.LatLngBounds,
    Marker: marker.Marker,
  };

  for (const [name, value] of Object.entries(libs)) {
    if (typeof value !== "function") {
      throw new MapsLoadError(`Google Maps did not provide ${name}.`, authFailed);
    }
  }

  return libs as unknown as MapsLibraries;
}

/** Test seam: forget that the bootstrap ever ran. */
export function __resetMapsLoader(): void {
  authFailed = false;
  if (typeof window !== "undefined") {
    delete window.__w2eMapsBootstrap;
    delete window.__w2eMapsReady;
  }
}
