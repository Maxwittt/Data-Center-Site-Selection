// Reviewed mapping from MISO zone price nodes to HIFLD retail service
// territories. Used only by scripts/build-miso-congestion.mjs; the app reads the
// pre-joined output. Every `territories` string was checked to match a HIFLD
// `NAME` exactly (Electric_Retail_Service_Territories_HIFLD).
//
// `hub` is the reference hub used for "basis vs hub". Rule of thumb:
//   - MISO North region (MN, WI, IA, Dakotas)  -> MINN.HUB
//   - Central region: IL/MO -> ILLINOIS.HUB, IN/KY -> INDIANA.HUB, MI -> MICHIGAN.HUB
//   - South region: AR -> ARKANSAS.HUB, LA -> LOUISIANA.HUB
// It is a reference choice, not an official assignment; change it here freely.
//
// Several zones can share one territory (Ameren Illinois has three price zones
// but HIFLD has one polygon); the build averages their stats.

export const HUBS = [
  "INDIANA.HUB",
  "ILLINOIS.HUB",
  "MICHIGAN.HUB",
  "MINN.HUB",
  "ARKANSAS.HUB",
  "LOUISIANA.HUB",
  "MS.HUB",
  "TEXAS.HUB",
];

/**
 * Entergy's operating companies don't publish a `*.AZ` zone node. Their
 * load-weighted price is the `…LD` node instead (e.g. EAI.EAILD), verified by
 * comparing 30 days of prices against the matching hub: each tracks its hub
 * within a few $/MWh and correlates above 0.999. The smaller `…LD` nodes
 * (municipal loads such as North Little Rock or West Memphis) are not mapped,
 * because HIFLD's polygons for them are tiny or missing.
 */
export const LOAD_NODES = [
  "EAI.EAILD",
  "EES.ELILD",
  "EES.NOPLD",
  "EMBA.EMILD",
  "EES.ETILD",
];

export const ZONES = [
  { node: "ALTE.AZ", label: "Alliant East (Wisconsin Power & Light)", territories: ["WISCONSIN POWER & LIGHT CO"], hub: "MINN.HUB" },
  { node: "ALTW.AZ", label: "Alliant West (Interstate Power and Light)", territories: ["INTERSTATE POWER AND LIGHT CO"], hub: "MINN.HUB" },
  { node: "AMIL.CILC.AZ", label: "Ameren Illinois (CILCO zone)", territories: ["AMEREN ILLINOIS COMPANY"], hub: "ILLINOIS.HUB" },
  { node: "AMIL.CIPS.AZ", label: "Ameren Illinois (CIPS zone)", territories: ["AMEREN ILLINOIS COMPANY"], hub: "ILLINOIS.HUB" },
  { node: "AMIL.IP.AZ", label: "Ameren Illinois (IP zone)", territories: ["AMEREN ILLINOIS COMPANY"], hub: "ILLINOIS.HUB" },
  { node: "AMMO.UE.AZ", label: "Ameren Missouri (Union Electric)", territories: ["UNION ELECTRIC CO - (MO)"], hub: "ILLINOIS.HUB" },
  { node: "CIN.DEI.AZ", label: "Duke Energy Indiana", territories: ["DUKE ENERGY INDIANA, LLC"], hub: "INDIANA.HUB" },
  { node: "CONS.AZ", label: "Consumers Energy", territories: ["CONSUMERS ENERGY CO"], hub: "MICHIGAN.HUB" },
  { node: "CWLD.AZ", label: "Columbia Water & Light (MO)", territories: ["CITY OF COLUMBIA - (MO)"], hub: "ILLINOIS.HUB" },
  { node: "CWLP.AZ", label: "Springfield City Water, Light & Power (IL)", territories: ["CITY OF SPRINGFIELD - (IL)"], hub: "ILLINOIS.HUB" },
  { node: "DECO.AZ", label: "DTE Electric", territories: ["DTE ELECTRIC COMPANY"], hub: "MICHIGAN.HUB" },
  { node: "IPL.AZ", label: "AES Indiana (Indianapolis Power & Light)", territories: ["INDIANAPOLIS POWER & LIGHT CO"], hub: "INDIANA.HUB" },
  { node: "LAFA.AZ", label: "Lafayette Utilities System (LA)", territories: ["CITY OF LAFAYETTE - (LA)"], hub: "LOUISIANA.HUB" },
  { node: "EAI.EAILD", label: "Entergy Arkansas", territories: ["ENTERGY ARKANSAS LLC"], hub: "ARKANSAS.HUB" },
  { node: "EES.ELILD", label: "Entergy Louisiana", territories: ["ENTERGY LOUISIANA LLC"], hub: "LOUISIANA.HUB" },
  { node: "EES.NOPLD", label: "Entergy New Orleans", territories: ["ENTERGY NEW ORLEANS, LLC"], hub: "LOUISIANA.HUB" },
  { node: "EMBA.EMILD", label: "Entergy Mississippi", territories: ["ENTERGY MISSISSIPPI LLC"], hub: "MS.HUB" },
  { node: "EES.ETILD", label: "Entergy Texas", territories: ["ENTERGY TEXAS INC."], hub: "TEXAS.HUB" },
  { node: "MDU.AZ", label: "Montana-Dakota Utilities", territories: ["MONTANA-DAKOTA UTILITIES CO"], hub: "MINN.HUB" },
  { node: "MEC.AZ", label: "MidAmerican Energy", territories: ["MIDAMERICAN ENERGY CO"], hub: "MINN.HUB" },
  { node: "MGE.AZ", label: "Madison Gas & Electric", territories: ["MADISON GAS & ELECTRIC CO"], hub: "MINN.HUB" },
  { node: "MP.AZ", label: "Minnesota Power (ALLETE)", territories: ["ALLETE, INC."], hub: "MINN.HUB" },
  { node: "NIPS.AZ", label: "NIPSCO (Northern Indiana Public Service)", territories: ["NORTHERN INDIANA PUB SERV CO"], hub: "INDIANA.HUB" },
  { node: "NSP.AZ", label: "Xcel Energy (Northern States Power)", territories: ["NORTHERN STATES POWER CO", "NORTHERN STATES POWER CO - MINNESOTA"], hub: "MINN.HUB" },
  { node: "OTP.AZ", label: "Otter Tail Power", territories: ["OTTER TAIL POWER CO"], hub: "MINN.HUB" },
  { node: "SIGE.AZ", label: "CenterPoint Energy Indiana (SIGECO)", territories: ["SOUTHERN INDIANA GAS & ELEC CO"], hub: "INDIANA.HUB" },
  { node: "UPPC.AZ", label: "Upper Peninsula Power Co", territories: ["UPPER PENINSULA POWER COMPANY"], hub: "MICHIGAN.HUB" },
  { node: "WEC.AZ", label: "We Energies (Wisconsin Electric)", territories: ["WISCONSIN ELECTRIC POWER CO"], hub: "MINN.HUB" },
  { node: "WPS.AZ", label: "Wisconsin Public Service", territories: ["WISCONSIN PUBLIC SERVICE CORP"], hub: "MINN.HUB" },
];
