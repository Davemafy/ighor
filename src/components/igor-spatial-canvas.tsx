"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  MapPin,
  Map as MapIcon,
  List,
  RefreshCw,
  Plus,
  Trash2,
} from "lucide-react";
import type { Candidate, Task } from "@/core/contracts";
import type { CanvasMutation, PresentationNode } from "@/core/presentation";

type Position = { lat: number; lng: number; altitude?: number };
type MapElement = HTMLElement & {
  center: Position;
  range: number;
  tilt: number;
  heading: number;
  flyCameraTo: (options: unknown) => void;
  stopCameraAnimation: () => void;
};
type Maps3DLibrary = {
  Map3DElement: new (options: unknown) => MapElement;
  Marker3DInteractiveElement: new (options: unknown) => HTMLElement;
};
type MapsAPI = { importLibrary: (name: string) => Promise<unknown> };
type MapsWindow = Window & {
  google?: { maps?: MapsAPI };
  igorMapsReady?: () => void;
};
let mapsPromise: Promise<MapsAPI> | undefined;

function loadMaps(): Promise<MapsAPI> {
  const win = window as MapsWindow;

  if (win.google?.maps?.importLibrary) {
    return Promise.resolve(win.google.maps);
  }

  if (mapsPromise) {
    return mapsPromise;
  }

  mapsPromise = (async () => {
    const response = await fetch("/api/maps/config");

    if (!response.ok) {
      throw new Error("The map could not be configured.");
    }

    const config = (await response.json()) as { browserKey?: string };

    if (!config.browserKey) {
      throw new Error(
        "3D Maps is not configured yet. Your places and plan are still available.",
      );
    }

    return new Promise<MapsAPI>((resolve, reject) => {
      const script = document.createElement("script");
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("The map took too long to load."));
      }, 20000);

      function cleanup() {
        clearTimeout(timer);
        delete win.igorMapsReady;
      }

      win.igorMapsReady = () => {
        const api = win.google?.maps;
        cleanup();

        if (api) {
          resolve(api);
        } else {
          reject(new Error("Maps is unavailable on this device."));
        }
      };

      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.browserKey!)}&v=weekly&loading=async&callback=igorMapsReady`;
      script.async = true;

      script.onerror = () => {
        cleanup();
        script.remove();
        reject(new Error("Google Maps could not load. Check your connection."));
      };

      document.head.append(script);
    });
  })();

  // Rejection must not poison later explicit retries. A failure never
  // fabricates an available map or silently switches the provider.
  return mapsPromise.catch((error: unknown) => {
    mapsPromise = undefined;
    throw error;
  });
}

const position = (c: Candidate): Position => ({
  lat: c.place!.latitude!,
  lng: c.place!.longitude!,
  altitude: 0,
});

export default function IgorSpatialCanvas({
  task,
  node,
  busy,
  mutate,
}: {
  task: Task;
  node: Extract<PresentationNode, { candidateIds: string[] }>;
  busy: boolean;
  mutate: (mutation: CanvasMutation) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapElement | null>(null);
  const flatMap = useRef<{ panTo: (p: Position) => void } | null>(null);
  const markers = useRef(new Map<string, {
    element?: HTMLElement;
    flat?: { setOpacity?: (value: number) => void; setZIndex?: (value: number) => void };
  }>());
  const mutationRef = useRef(mutate);
  const busyRef = useRef(busy);
  useEffect(() => {
    mutationRef.current = mutate;
    busyRef.current = busy;
  }, [mutate, busy]);
  const places = useMemo(
    () =>
      node.candidateIds
        .map((id) => task.candidates.find((c) => c.id === id))
        .filter(
          (c): c is Candidate =>
            !!c &&
            c.type === "place" &&
            c.freshness === "current" &&
            c.place?.latitude != null &&
            c.place?.longitude != null,
        ),
    [node.candidateIds, task.candidates],
  );
  const signature = places
    .map((c) => `${c.id}:${c.place!.latitude}:${c.place!.longitude}`)
    .join("|");
  const placesRef = useRef(places);
  useEffect(() => {
    placesRef.current = places;
  }, [places]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [twoD, setTwoD] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [retryKey, setRetryKey] = useState(0);
  const selectedId = task.canvas?.selectedCandidateId;
  const selected = places.find((c) => c.id === selectedId) || places[0];
  const itinerary = task.canvas?.itineraryIds || [];
  // Selection is owned by the versioned Task, not by map-local state.
  // Both map markers and the place list reflect the same persisted identity.
  useEffect(() => {
    for (const [id, marker] of markers.current) {
      const active = id === selected?.id;
      marker.element?.toggleAttribute("data-selected", active);
      marker.element?.setAttribute("aria-pressed", String(active));
      marker.element?.setAttribute("aria-label", active
        ? `${id} selected`
        : id);
      marker.flat?.setOpacity?.(active ? 1 : 0.72);
      marker.flat?.setZIndex?.(active ? 1000 : 1);
    }
  }, [selected?.id, state]);
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      // The element itself is responsive. On 2D, Google Maps requires an
      // explicit event-less pan after orientation or container size changes.
      if (viewMode === "map" && flatMap.current && selected?.place) {
        flatMap.current.panTo(position(selected));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, selected?.id]);
  const camera = useRef<{
    center: Position;
    range: number;
    tilt: number;
    heading: number;
  } | null>(null);
  useEffect(() => {
    if (!enabled || !signature) {
      return;
    }

    let active = true;
    const container = host.current;

    let cleanup = () => {};

    (async () => {
      await Promise.resolve();

      if (!active) {
        return;
      }

      setState("loading");
      setError("");
      const api = await loadMaps();

      if (!active || !container) {
        return;
      }

      if (twoD) {
        type FlatMap = { panTo: (p: Position) => void };
        const lib = (await api.importLibrary("maps")) as {
          Map: new (el: HTMLElement, options: unknown) => FlatMap;
        };
        const markers = (await api.importLibrary("marker")) as {
          Marker: new (options: unknown) => {
            addListener: (
              event: string,
              callback: () => void,
            ) => { remove: () => void };
            setMap: (map: null) => void;
            setOpacity?: (value: number) => void;
            setZIndex?: (value: number) => void;
          };
        };

        if (!active) {
          return;
        }

        const flat = new lib.Map(container, {
          center: position(placesRef.current[0]),
          zoom: 13,
          mapTypeControl: false,
        });
        flatMap.current = flat;
        const stops = placesRef.current.map((c) => {
          const marker = new markers.Marker({
            map: flat,
            position: position(c),
            title: c.name,
          });
          markersRefSet(c.id, { flat: marker });
          const listener = marker.addListener("click", () => {
            if (!busyRef.current) {
              mutationRef.current({
                operation: "select",
                nodeId: node.id,
                candidateId: c.id,
              });
            }
          });

          return () => {
            listener.remove();
            marker.setMap(null);
            markers.current.delete(c.id);
          };
        });

        cleanup = () => {
          flatMap.current = null;
          stops.forEach((stop) => stop());
          container.replaceChildren();
        };

        setState("ready");

        return;
      }

      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");

      if (!gl) {
        throw new Error("This device cannot display 3D Maps. Try the 2D map.");
      }

      gl.getExtension("WEBGL_lose_context")?.loseContext();
      const library = (await api.importLibrary("maps3d")) as Maps3DLibrary;

      if (!active) {
        return;
      }

      if (!library.Map3DElement || !library.Marker3DInteractiveElement) {
        throw new Error("3D Maps is unavailable. Try the 2D map.");
      }

      const all = placesRef.current;
      const bounds = all.reduce(
        (b, c) => ({
          minLat: Math.min(b.minLat, c.place!.latitude!),
          maxLat: Math.max(b.maxLat, c.place!.latitude!),
          minLng: Math.min(b.minLng, c.place!.longitude!),
          maxLng: Math.max(b.maxLng, c.place!.longitude!),
        }),
        { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 },
      );
      // View framing only, never a route or travel-time calculation.
      const span = Math.max(
        bounds.maxLat - bounds.minLat,
        bounds.maxLng - bounds.minLng,
      );
      const view = camera.current || {
        center: {
          lat: (bounds.minLat + bounds.maxLat) / 2,
          lng: (bounds.minLng + bounds.maxLng) / 2,
          altitude: 0,
        },
        range: Math.max(1800, Math.min(20000000, span * 150000)),
        tilt: 55,
        heading: 0,
      };
      const element = new library.Map3DElement({
        ...view,
        mode: "HYBRID",
        gestureHandling: "COOPERATIVE",
      });
      element.style.width = "100%";
      element.style.height = "100%";

      const updateCamera = () => {
        camera.current = {
          center: element.center,
          range: element.range,
          tilt: element.tilt,
          heading: element.heading,
        };
      };

      const fail = () => {
        if (active) {
          setError(
            "3D Maps could not render. Your selected places are saved. Try the 2D map.",
          );
          setState("error");
        }
      };

      const loaded = (event: Event) => {
        if (active && (event as Event & { isSteady?: boolean }).isSteady) {
          setState("ready");
        }
      };

      element.addEventListener("gmp-error", fail);
      element.addEventListener("gmp-centerchange", updateCamera);
      element.addEventListener("gmp-rangechange", updateCamera);
      element.addEventListener("gmp-steadychange", loaded);
      const listeners: (() => void)[] = [];

      for (const c of all) {
        const marker = new library.Marker3DInteractiveElement({
          position: position(c),
          label: c.name,
          altitudeMode: "CLAMP_TO_GROUND",
        });

        const select = () => {
          if (!busyRef.current) {
            mutationRef.current({
              operation: "select",
              nodeId: node.id,
              candidateId: c.id,
            });
          }
        };

        marker.addEventListener("gmp-click", select);
        // Browser and test-double markers also support keyboard selection.
        const keySelect = (event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select();
          }
        };
        marker.addEventListener("keydown", keySelect);
        marker.setAttribute("aria-label", c.name);
        marker.setAttribute("tabindex", "0");
        markersRefSet(c.id, { element: marker });
        element.append(marker);
        listeners.push(() => {
          marker.removeEventListener("gmp-click", select);
          marker.removeEventListener("keydown", keySelect);
          markers.current.delete(c.id);
        });
      }

      container.replaceChildren(element);
      map.current = element;
      const timeout = window.setTimeout(() => {
        if (active) {
          setState((current) => {
            if (current !== "loading") {
              return current;
            }

            setError(
              "The 3D scene has not finished loading. Try the 2D map or continue with the place list.",
            );

            return "error";
          });
        }
      }, 20000);

      cleanup = () => {
        clearTimeout(timeout);
        listeners.forEach((stop) => stop());
        element.removeEventListener("gmp-error", fail);
        element.removeEventListener("gmp-centerchange", updateCamera);
        element.removeEventListener("gmp-rangechange", updateCamera);
        element.removeEventListener("gmp-steadychange", loaded);
        element.stopCameraAnimation();
        element.remove();
        map.current = null;
      };
    })().catch((failure: unknown) => {
      if (active) {
        setError(
          failure instanceof Error
            ? failure.message
            : "The map is unavailable. Use the place links below.",
        );
        setState("error");
      }
    });

    return () => {
      active = false;
      cleanup();
    };
  }, [enabled, signature, twoD, node.id, retryKey]);
  const selectedLat = selected?.place?.latitude;
  const selectedLng = selected?.place?.longitude;
  useEffect(() => {
    if (selectedLat == null || selectedLng == null || state !== "ready") {
      return;
    }

    if (flatMap.current) {
      flatMap.current.panTo({ lat: selectedLat, lng: selectedLng });

      return;
    }

    if (!map.current) {
      return;
    }

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const endCamera = {
      center: { lat: selectedLat, lng: selectedLng, altitude: 0 },
      range: 1800,
      tilt: 55,
      heading: map.current.heading || 0,
    };

    if (reduced) {
      Object.assign(map.current, endCamera);
    } else {
      map.current.stopCameraAnimation();
      map.current.flyCameraTo({ endCamera, durationMillis: 1000 });
    }
  }, [selectedLat, selectedLng, state]);

  function markersRefSet(
    id: string,
    marker: {
      element?: HTMLElement;
      flat?: { setOpacity?: (value: number) => void; setZIndex?: (value: number) => void };
    },
  ) {
    markers.current.set(id, marker);
    const active = id === selectedId || (!selectedId && id === places[0]?.id);
    marker.element?.toggleAttribute("data-selected", active);
    marker.element?.setAttribute("aria-pressed", String(active));
    marker.flat?.setOpacity?.(active ? 1 : 0.72);
    marker.flat?.setZIndex?.(active ? 1000 : 1);
  }

  function updateItinerary(ids: string[]) {
    mutate({ operation: "itinerary", nodeId: node.id, candidateIds: ids });
  }

  if (!places.length) {
    return (
      <p className="ic-note">
        No current places with confirmed coordinates are available. Igor will
        keep coordinates unknown until a source supplies them.
      </p>
    );
  }

  return (
    <div className="ic-spatial">
      <div className="ic-map-stage">
        <div
          className="ic-map-host"
          ref={host}
          aria-label={twoD ? "Google 2D map" : "Google Photorealistic 3D map"}
        />
        {!enabled && (
          <div className="ic-map-start">
            <MapPin />
            <h4>Your places, in context.</h4>
            <p>
              Open the map when you want to explore. Your plan stays in this
              conversation.
            </p>
            <button onClick={() => setEnabled(true)}>
              Explore in 3D <ExternalLink />
            </button>
          </div>
        )}
        {enabled && state === "loading" && (
          <p className="ic-map-status" role="status">
            Loading Google Maps…
          </p>
        )}
        {enabled && state === "error" && (
          <div className="ic-map-status" role="status">
            <p>{error}</p>
            {!twoD && (
              <button
                onClick={() => {
                  setTwoD(true);
                }}
              >
                Use 2D map
              </button>
            )}
          </div>
        )}
      </div>
      <div className="ic-place-selector" aria-label="Choose a place">
        {places.map((c) => (
          <button
            key={c.id}
            disabled={busy}
            aria-pressed={selected?.id === c.id}
            onClick={() =>
              mutate({
                operation: "select",
                nodeId: node.id,
                candidateId: c.id,
              })
            }
          >
            {c.name}
          </button>
        ))}
      </div>
      {selected && (
        <article className="ic-place-preview">
          {selected.imageUrl && <img src={selected.imageUrl} alt="" />}
          <div>
            <small>{selected.place?.address}</small>
            <h4>{selected.name}</h4>
            <p>{selected.description}</p>
            <p className="ic-note">
              Opening hours, routes and availability are unconfirmed.
            </p>
            <div className="ic-place-actions">
              <button
                disabled={busy || itinerary.includes(selected.id)}
                onClick={() => updateItinerary([...itinerary, selected.id])}
              >
                {itinerary.includes(selected.id) ? <Check /> : <Plus />}
                {itinerary.includes(selected.id)
                  ? "Added to your plan"
                  : "Add to your plan"}
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${selected.place!.latitude},${selected.place!.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Open map <ExternalLink />
              </a>
            </div>
          </div>
        </article>
      )}
      {itinerary.length > 0 && (
        <div className="ic-map-plan">
          <h4>Your place order</h4>
          <ol>
            {itinerary.map((id, i) => {
              const c = task.candidates.find((p) => p.id === id);

              return (
                <li key={id}>
                  <span>{i + 1}</span>
                  <strong>
                    {c?.name || "Previously selected place"}
                    {c?.freshness !== "current" && <small> Needs review</small>}
                  </strong>
                  <button
                    disabled={busy || i === 0}
                    aria-label={`Move ${c?.name || "place"} earlier`}
                    onClick={() => {
                      const ids = [...itinerary];
                      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                      updateItinerary(ids);
                    }}
                  >
                    <ArrowUp />
                  </button>
                  <button
                    disabled={busy || i === itinerary.length - 1}
                    aria-label={`Move ${c?.name || "place"} later`}
                    onClick={() => {
                      const ids = [...itinerary];
                      [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                      updateItinerary(ids);
                    }}
                  >
                    <ArrowDown />
                  </button>
                  <button
                    disabled={busy}
                    aria-label={`Remove ${c?.name || "place"}`}
                    onClick={() =>
                      updateItinerary(itinerary.filter((key) => key !== id))
                    }
                  >
                    <Trash2 />
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="ic-note">
            This is an editable place order, with no inferred travel times.
          </p>
        </div>
      )}
    </div>
  );
}
