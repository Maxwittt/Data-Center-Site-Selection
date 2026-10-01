import { Marker, type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import type { Position } from "@/lib/data/hifld";

const CONNECTOR_SOURCE = "pin-connector";
const CONNECTOR_LAYER = "pin-connector-layer";

/** Adds an empty source/layer for the pin → nearest-line connector. */
export function addPinConnectorLayer(map: MapLibreMap) {
  map.addSource(CONNECTOR_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: CONNECTOR_LAYER,
    type: "line",
    source: CONNECTOR_SOURCE,
    layout: { "line-cap": "round" },
    paint: {
      "line-color": "#f4f4f5",
      "line-width": 1.5,
      "line-opacity": 0.9,
      "line-dasharray": [2, 2],
    },
  });
}

/** Draws a dashed line from the pin to a point on the nearest line, or clears it. */
export function setPinConnector(
  map: MapLibreMap,
  from: Position,
  to: Position | null,
) {
  const source = map.getSource<GeoJSONSource>(CONNECTOR_SOURCE);
  source?.setData({
    type: "FeatureCollection",
    features: to
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [from, to] },
          },
        ]
      : [],
  });
}

export function clearPinConnector(map: MapLibreMap) {
  map.getSource<GeoJSONSource>(CONNECTOR_SOURCE)?.setData({
    type: "FeatureCollection",
    features: [],
  });
}

/** Class on the marker element, used to ignore map clicks that land on the pin. */
export const PIN_MARKER_CLASS = "site-pin-marker";

/** A draggable pin marker. Add it to a map with `.setLngLat(...).addTo(map)`. */
export function createPinMarker(): Marker {
  const element = document.createElement("div");
  element.className = PIN_MARKER_CLASS;
  element.style.cssText = [
    "width:18px",
    "height:18px",
    "border-radius:9999px",
    "background:#22d3ee",
    "border:3px solid #ffffff",
    "box-shadow:0 0 0 2px rgba(9,9,11,0.6),0 0 14px 2px rgba(34,211,238,0.7)",
    "cursor:grab",
  ].join(";");

  return new Marker({ element, draggable: true });
}
