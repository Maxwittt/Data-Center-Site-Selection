import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
} from "maplibre-gl";
import type { GasPipelineCollection, SubstationCollection } from "@/lib/data/sites";
import { VOLTAGE_TIERS } from "@/lib/grid/voltage";
import { TRANSMISSION_CASING_LAYER } from "@/lib/map/transmission";

export const SUBSTATION_SOURCE = "substations";
export const SUBSTATION_LAYER = "substations-layer";
export const GAS_SOURCE = "gas-pipelines";
export const GAS_LAYER = "gas-pipelines-layer";

export const GAS_COLOR = "#a3e635";

const kv: ExpressionSpecification = ["to-number", ["get", "kv"], 0];

const substationColor = [
  "step",
  kv,
  VOLTAGE_TIERS[0].color,
  ...VOLTAGE_TIERS.slice(1).flatMap((tier) => [tier.minKv, tier.color]),
] as ExpressionSpecification;

/** Gas lines sit under the transmission lines; substations sit on top. */
export function addGasLayer(map: MapLibreMap, data: GasPipelineCollection) {
  map.addSource(GAS_SOURCE, {
    type: "geojson",
    data: data as Parameters<GeoJSONSource["setData"]>[0],
  });
  map.addLayer(
    {
      id: GAS_LAYER,
      type: "line",
      source: GAS_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": GAS_COLOR,
        "line-opacity": 0.75,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 10, 2],
        "line-dasharray": [3, 1.5],
      },
    },
    map.getLayer(TRANSMISSION_CASING_LAYER) ? TRANSMISSION_CASING_LAYER : undefined,
  );
}

export function addSubstationLayer(map: MapLibreMap, data: SubstationCollection) {
  map.addSource(SUBSTATION_SOURCE, {
    type: "geojson",
    data: data as Parameters<GeoJSONSource["setData"]>[0],
  });
  map.addLayer({
    id: SUBSTATION_LAYER,
    type: "circle",
    source: SUBSTATION_SOURCE,
    minzoom: 5,
    paint: {
      "circle-color": "#09090b",
      "circle-stroke-color": substationColor,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 10, 2],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 10, 5],
    },
  });
}

export function setLayerVisible(map: MapLibreMap, id: string, visible: boolean) {
  if (map.getLayer(id)) {
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}
