"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import CongestionLegend from "@/components/map/CongestionLegend";
import type { ZoneContext } from "@/components/map/CongestionSection";
import LayersCard from "@/components/map/LayersCard";
import PinCard from "@/components/map/PinCard";
import TransmissionLegend from "@/components/map/TransmissionLegend";
import ZoneTooltip from "@/components/map/ZoneTooltip";
import {
  fetchTransmissionLines,
  type Position,
  type TransmissionLineFeature,
} from "@/lib/data/hifld";
import {
  fetchGasPipelines,
  fetchQueue,
  fetchSubstations,
  type GasPipelineFeature,
  type QueueData,
  type SubstationFeature,
} from "@/lib/data/sites";
import { createCoverage, type Coverage } from "@/lib/geo/coverage";
import { findZonesAt } from "@/lib/geo/pointInPolygon";
import { analyzePin, type PinAnalysis } from "@/lib/geo/proximity";
import { analyzeSite, type SiteContext, type SiteData } from "@/lib/geo/site";
import {
  decodeShare,
  defaultInputs,
  encodeShare,
  forNewSite,
  type CalculatorInputs,
  type LngLat,
} from "@/lib/grid/calculator";
import { screenSite } from "@/lib/grid/screening";
import { SITE_LABELS, summarizeSite, type ZoneSummary } from "@/lib/grid/summary";
import ComparePanel from "@/components/map/ComparePanel";
import SearchBox from "@/components/map/SearchBox";
import {
  addGasLayer,
  addSubstationLayer,
  GAS_LAYER,
  setLayerVisible,
  SUBSTATION_LAYER,
} from "@/lib/map/sites";
import {
  addCongestionLayers,
  CONGESTION_FILL_LAYER,
  fetchCongestion,
  setCongestionHover,
  setCongestionMetric,
  setCongestionVisible,
  type CongestionCollection,
  type CongestionMetric,
  type CongestionProperties,
} from "@/lib/map/congestion";
import {
  DARK_BASEMAP_STYLE,
  MAPLIBRE_WORKER_URL,
  MISO_CENTER,
  MISO_DEFAULT_ZOOM,
} from "@/lib/map/region";
import {
  addPinConnectorLayer,
  clearPinConnector,
  clearPinPadding,
  createPinMarker,
  createSiteMarker,
  pinCardPadding,
  revealPin,
  PIN_MARKER_CLASS,
  setPinConnector,
} from "@/lib/map/pin";
import {
  addTransmissionLayer,
  TRANSMISSION_CASING_LAYER,
  TRANSMISSION_LAYER,
  TRANSMISSION_SOURCE,
} from "@/lib/map/transmission";

type LoadStatus = "loading" | "ready" | "error";

interface HoverState {
  x: number;
  y: number;
  zone: CongestionProperties;
}

const DEFAULT_METRIC: CongestionMetric = "avgMcc";

const DATASET_LABELS = [
  "Transmission lines",
  "Substations",
  "Gas pipelines",
  "Generator queue",
  "Congestion",
] as const;
type DatasetLabel = (typeof DATASET_LABELS)[number];

export default function SiteMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PinAnalysis | null>(null);

  // Congestion layer state. `congestion` is null until the data has loaded and
  // its layers exist on the map.
  const [congestion, setCongestion] = useState<CongestionCollection | null>(null);
  const congestionMeta = congestion?.meta ?? null;
  const [congestionError, setCongestionError] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [metric, setMetric] = useState<CongestionMetric>(DEFAULT_METRIC);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [showSubstations, setShowSubstations] = useState(true);
  const [showGas, setShowGas] = useState(false);

  const [substations, setSubstations] = useState<SubstationFeature[] | null>(null);
  const [pipelines, setPipelines] = useState<GasPipelineFeature[] | null>(null);
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [siteFailed, setSiteFailed] = useState<SiteData["failed"]>({});
  const [layersReady, setLayersReady] = useState(0);
  const [inputs, setInputs] = useState<CalculatorInputs>(() =>
    defaultInputs(new Date().getFullYear()),
  );
  const [savedSites, setSavedSites] = useState<LngLat[]>([]);
  const [grid, setGrid] = useState<{
    lines: TransmissionLineFeature[];
    coverage: Coverage;
  } | null>(null);
  // Set once the shared link (if any) has been applied, so the URL isn't
  // overwritten with defaults while the data is still loading.
  const [urlReady, setUrlReady] = useState(false);
  const [builtAt, setBuiltAt] = useState<Partial<Record<DatasetLabel, string>>>({});

  // The effect below owns the map; these let UI handlers and other effects
  // reach into it.
  const mapRef = useRef<MapLibreMap | null>(null);
  const metricRef = useRef(metric);
  const setPinRef = useRef<(point: Position | null) => void>(() => {});
  const flyToRef = useRef<(point: Position) => void>(() => {});

  useEffect(() => {
    metricRef.current = metric;
  }, [metric]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const abort = new AbortController();
    let lines: TransmissionLineFeature[] | null = null;
    let coverage: Coverage | null = null;
    let marker: Marker | null = null;

    // Must run before the first map is created. Serve the worker from our own
    // origin (copied into /public by scripts/copy-maplibre-worker.mjs) because
    // Turbopack breaks maplibre's default import.meta.url-based lookup.
    setWorkerUrl(MAPLIBRE_WORKER_URL);

    const map = new MapLibreMap({
      container,
      style: DARK_BASEMAP_STYLE,
      center: MISO_CENTER,
      zoom: MISO_DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

    /** Drops (or moves) the pin and recomputes; `null` removes it. */
    function setPin(point: Position | null, opts?: { reveal?: boolean }) {
      if (!point) {
        marker?.remove();
        marker = null;
        clearPinConnector(map);
        clearPinPadding(map);
        setAnalysis(null);
        return;
      }
      if (!lines || !coverage) {
        return;
      }

      const result = analyzePin(point, lines, coverage);
      setAnalysis(result);
      setInputs(forNewSite);
      setPinConnector(map, point, result.nearest?.closestPoint ?? null);

      if (!marker) {
        marker = createPinMarker();
        marker.on("dragend", () => {
          const { lng, lat } = marker!.getLngLat();
          setPin([lng, lat]);
        });
        marker.setLngLat(point).addTo(map);
      } else {
        marker.setLngLat(point);
      }
      if (opts?.reveal !== false) revealPin(map, point);
    }
    setPinRef.current = setPin;
    flyToRef.current = (point) => {
      const { width } = map.getContainer().getBoundingClientRect();
      map.flyTo({
        center: point,
        zoom: Math.max(map.getZoom(), 8),
        padding: pinCardPadding(width),
      });
      setPin(point, { reveal: false });
    };
    const shared = decodeShare(window.location.search, new Date().getFullYear());
    const built = (label: DatasetLabel, date: string) =>
      setBuiltAt((dates) => ({ ...dates, [label]: date }));

    map.on("error", (event) => {
      console.error("MapLibre error:", event.error);
      if (!map.isStyleLoaded()) {
        setStatus("error");
        setError("Basemap style failed to load. Check your network connection.");
      }
    });

    map.on("click", (event) => {
      const target = event.originalEvent.target as Element | null;
      // Clicking the pin itself shouldn't relocate it.
      if (target?.closest(`.${PIN_MARKER_CLASS}`)) {
        return;
      }
      setPin([event.lngLat.lng, event.lngLat.lat]);
    });

    // Zone hover: highlight the territory and show its numbers. When territories
    // overlap, the topmost (smallest) one is returned first.
    // Look the typed record up in the collection we loaded (keyed by territory,
    // which is unique) rather than trusting rendered-feature property types.
    const zonesByTerritory = new Map<string, CongestionProperties>();
    let hoveredName: string | null = null;
    map.on("mousemove", (event) => {
      if (!map.getLayer(CONGESTION_FILL_LAYER)) {
        return;
      }
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [CONGESTION_FILL_LAYER],
      })[0];
      if (!feature) {
        if (hoveredName !== null) {
          hoveredName = null;
          setCongestionHover(map, null);
          setHover(null);
        }
        return;
      }
      const zone = zonesByTerritory.get(String(feature.properties.territory));
      if (!zone) {
        return;
      }
      if (zone.name !== hoveredName) {
        hoveredName = zone.name;
        setCongestionHover(map, zone.name);
      }
      setHover({ x: event.point.x, y: event.point.y, zone });
    });
    map.on("mouseout", () => {
      hoveredName = null;
      setCongestionHover(map, null);
      setHover(null);
    });

    const resize = new ResizeObserver(() => {
      map.resize();
    });
    resize.observe(container);

    map.once("load", () => {
      map.resize();
      addTransmissionLayer(map);
      addPinConnectorLayer(map);

      // Congestion zones load independently: a failure here must not block the
      // transmission lines (or vice versa).
      fetchCongestion(abort.signal)
        .then((collection) => {
          for (const feature of collection.features) {
            zonesByTerritory.set(feature.properties.territory, feature.properties);
          }
          addCongestionLayers(map, collection, metricRef.current);
          setCongestion(collection);
          built("Congestion", collection.meta.generatedAt);
        })
        .catch((err: unknown) => {
          if (abort.signal.aborted) {
            return;
          }
          console.error(err);
          setCongestionError(
            err instanceof Error ? err.message : "Failed to load congestion data.",
          );
        });

      const markFailed = (key: keyof SiteData["failed"]) => (err: unknown) => {
        if (abort.signal.aborted) {
          return;
        }
        console.error(err);
        setSiteFailed((failed) => ({ ...failed, [key]: true }));
      };
      fetchGasPipelines(abort.signal)
        .then((collection) => {
          addGasLayer(map, collection);
          setPipelines(collection.features);
          built("Gas pipelines", collection.meta.generatedAt);
          setLayersReady((n) => n + 1);
        })
        .catch(markFailed("pipelines"));
      fetchSubstations(abort.signal)
        .then((collection) => {
          addSubstationLayer(map, collection);
          setSubstations(collection.features);
          built("Substations", collection.meta.generatedAt);
          setLayersReady((n) => n + 1);
        })
        .catch(markFailed("substations"));
      fetchQueue(abort.signal)
        .then((data) => {
          setQueue(data);
          built("Generator queue", data.meta.generatedAt);
        })
        .catch(markFailed("queue"));

      fetchTransmissionLines(abort.signal)
        .then((collection) => {
          lines = collection.features;
          coverage = createCoverage(collection.meta.coverage);
          const source = map.getSource<GeoJSONSource>(TRANSMISSION_SOURCE);
          source?.setData(collection as Parameters<GeoJSONSource["setData"]>[0]);
          map.getCanvas().style.cursor = "crosshair";
          setGrid({ lines: collection.features, coverage: createCoverage(collection.meta.coverage) });
          built("Transmission lines", collection.meta.generatedAt);
          setStatus("ready");

          setSavedSites(shared.sites);
          if (shared.pin) {
            const { width } = map.getContainer().getBoundingClientRect();
            map.jumpTo({
              center: shared.pin,
              zoom: Math.max(map.getZoom(), 7),
              padding: pinCardPadding(width),
            });
            setPin(shared.pin, { reveal: false });
          }
          // After setPin, so its reset of the year overrides doesn't win.
          setInputs(shared.inputs);
          setUrlReady(true);
        })
        .catch((err: unknown) => {
          if (abort.signal.aborted) {
            return;
          }
          console.error(err);
          setStatus("error");
          setError(
            err instanceof Error ? err.message : "Failed to load transmission data.",
          );
        });
    });

    return () => {
      abort.abort();
      resize.disconnect();
      setPinRef.current = () => {};
      flyToRef.current = () => {};
      marker?.remove();
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Keep map layers in sync with the controls. Each guards against the layer
  // not existing yet; `congestionMeta` re-triggers them once it does.
  useEffect(() => {
    const map = mapRef.current;
    if (map && congestionMeta) {
      setCongestionMetric(map, metric, congestionMeta);
    }
  }, [metric, congestionMeta]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && congestionMeta) {
      setCongestionVisible(map, showZones);
      if (!showZones) {
        setCongestionHover(map, null);
      }
    }
  }, [showZones, congestionMeta]);

  useEffect(() => {
    const map = mapRef.current;
    for (const id of [TRANSMISSION_CASING_LAYER, TRANSMISSION_LAYER]) {
      if (map?.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showLines ? "visible" : "none");
      }
    }
  }, [showLines, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      setLayerVisible(map, SUBSTATION_LAYER, showSubstations);
      setLayerVisible(map, GAS_LAYER, showGas);
    }
  }, [showSubstations, showGas, layersReady]);

  const zonesVisible = showZones && congestionMeta !== null;

  // Derived like the congestion context, so late-loading datasets fill in.
  const siteContext = useMemo<SiteContext | null>(
    () =>
      analysis
        ? analyzeSite(analysis.point, analysis.coverageMarginMiles, {
            substations,
            pipelines,
            queue,
            failed: siteFailed,
          })
        : null,
    [analysis, substations, pipelines, queue, siteFailed],
  );

  const screening = useMemo(
    () => (analysis && siteContext ? screenSite(analysis.nearest, siteContext) : null),
    [analysis, siteContext],
  );

  // Lettered markers for saved sites; clicking one moves the pin there.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = savedSites.map((point, i) =>
      createSiteMarker(SITE_LABELS[i], () => setPinRef.current(point)).setLngLat(point).addTo(map),
    );
    return () => markers.forEach((marker) => marker.remove());
  }, [savedSites]);

  const summaries = useMemo(() => {
    if (!grid) return [];
    const nowYear = new Date().getFullYear();
    const siteData: SiteData = { substations, pipelines, queue, failed: siteFailed };
    return savedSites.map((point) => {
      const pin = analyzePin(point, grid.lines, grid.coverage);
      const top = congestion ? findZonesAt(point, congestion.features)[0] : undefined;
      const zone: ZoneSummary | null = top
        ? { name: top.properties.name, avgMcc: top.properties.avgMcc }
        : null;
      return summarizeSite(
        pin,
        analyzeSite(point, pin.coverageMarginMiles, siteData),
        zone,
        inputs,
        nowYear,
      );
    });
  }, [grid, savedSites, substations, pipelines, queue, siteFailed, congestion, inputs]);

  const pinPoint = analysis?.point ?? null;
  useEffect(() => {
    if (!urlReady) return;
    const query = encodeShare(
      { pin: pinPoint ? [pinPoint[0], pinPoint[1]] : null, sites: savedSites, inputs },
      new Date().getFullYear(),
    );
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [urlReady, pinPoint, savedSites, inputs]);

  const samePoint = (a: LngLat, b: Position) =>
    Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5;
  const pinSaved = pinPoint ? savedSites.some((site) => samePoint(site, pinPoint)) : false;

  // Congestion at the pin. Derived, so a pin dropped before the data finishes
  // loading fills in by itself, and it still works with the layer toggled off.
  const zoneContext = useMemo<ZoneContext>(() => {
    if (!congestion) {
      return { status: congestionError ? "unavailable" : "loading" };
    }
    if (!analysis) {
      return { status: "outside" };
    }
    const hits = findZonesAt(analysis.point, congestion.features);
    if (hits.length === 0) {
      return { status: "outside" };
    }
    const [top, ...rest] = hits;
    const overlapping = [
      ...new Set(
        rest.map((hit) => hit.properties.name).filter((name) => name !== top.properties.name),
      ),
    ];
    return {
      status: "inside",
      zone: top.properties,
      overlapping,
      meta: congestion.meta,
    };
  }, [analysis, congestion, congestionError]);

  return (
    <div className={analysis ? "absolute inset-0 map-has-pin" : "absolute inset-0"}>
      <div ref={containerRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute top-24 left-4 z-10 flex items-start gap-2">
        <LayersCard
          showLines={showLines}
          onShowLinesChange={setShowLines}
          showZones={showZones}
          onShowZonesChange={setShowZones}
          metric={metric}
          onMetricChange={setMetric}
          meta={congestionMeta}
          showSubstations={showSubstations}
          onShowSubstationsChange={setShowSubstations}
          showGas={showGas}
          onShowGasChange={setShowGas}
          dataDates={DATASET_LABELS.flatMap((label) =>
            builtAt[label] ? [{ label, date: builtAt[label] }] : [],
          )}
        />
        {status === "ready" && <SearchBox onResult={(point) => flyToRef.current(point)} />}
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-3">
        {/* The pin card covers congestion and voltage, so hide those legends then. */}
        {zonesVisible && !analysis && (
          <CongestionLegend metric={metric} meta={congestionMeta} />
        )}
        {!analysis && (showLines || showSubstations || showGas) && (
          <TransmissionLegend
            showLines={showLines}
            showSubstations={showSubstations}
            showGas={showGas}
          />
        )}
      </div>

      {hover && zonesVisible && (
        <ZoneTooltip x={hover.x} y={hover.y} zone={hover.zone} />
      )}

      {analysis && siteContext && screening && (
        <PinCard
          analysis={analysis}
          site={siteContext}
          screening={screening}
          congestion={zoneContext}
          inputs={inputs}
          onInputsChange={setInputs}
          saveState={pinSaved ? "saved" : savedSites.length >= 3 ? "full" : "available"}
          onSave={() => {
            if (!pinPoint) return;
            if (pinSaved) {
              setSavedSites((sites) => sites.filter((site) => !samePoint(site, pinPoint)));
            } else if (savedSites.length < 3) {
              setSavedSites((sites) => [...sites, [pinPoint[0], pinPoint[1]]]);
            }
          }}
          onClear={() => setPinRef.current(null)}
        />
      )}

      <ComparePanel
        summaries={summaries}
        inputs={inputs}
        onShow={(i) => flyToRef.current(savedSites[i])}
        onRemove={(i) => setSavedSites((sites) => sites.filter((_, j) => j !== i))}
        onClear={() => setSavedSites([])}
      />

      {status === "loading" && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-300">
          Loading transmission lines…
        </div>
      )}
      {status === "error" && error && (
        <div className="absolute bottom-4 left-1/2 z-10 max-w-sm -translate-x-1/2 rounded-lg border border-red-500/40 bg-zinc-950/90 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {congestionError && (
        <div className="absolute bottom-16 left-1/2 z-10 max-w-sm -translate-x-1/2 rounded-lg border border-amber-500/40 bg-zinc-950/90 px-3 py-2 text-xs text-amber-300">
          Congestion layer unavailable: {congestionError}
        </div>
      )}
    </div>
  );
}
