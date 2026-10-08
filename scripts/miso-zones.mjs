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
//
// Generation-and-transmission cooperatives and joint-action agencies publish
// one zone price and have no retail polygon of their own. Those prices are
// drawn on each member distribution utility's HIFLD territory. Membership
// lists were taken from the agency (Great River Energy, Dairyland's 24
// Class A cooperatives, Big Rivers' three members, SIPC's seven cooperatives
// plus McLeansboro, Cooperative Energy's member systems, SMMPA, and LEPA's
// board). A member is omitted when HIFLD has no polygon for it.
//
// Left unmapped on purpose, even though the price file contains them:
// - AMMO.UA.AZ sits inside Union Electric, which is already AMMO.UE.AZ.
//   HIFLD has one polygon, and UA's congestion is much higher, so averaging
//   the two would repaint all of Ameren Missouri.
// - UPPC.ESC.AZ has no separate retail polygon. UPPC.AZ already covers
//   Upper Peninsula Power.
// - NSP.NCP.AZ, NSP.NU.AZ, NSP.NWEC.AZ, and NSP.WIMUNI.AZ are slices of
//   Northern States Power without a reviewed one-to-one territory. NSP.AZ
//   already covers the NSP retail polygons. Northwestern Wisconsin Electric
//   is DPC.NWEC.AZ, not NSP.NWEC.AZ.
// - MPW.AZ (Muscatine) has no HIFLD retail polygon in the MISO extract.
// - Coast Electric (a Cooperative Energy member) and Houma (a LEPA member)
//   have no matching HIFLD retail polygon. Spring Valley is left off SMMPA:
//   older rosters of 18 included it, and the agency now reports 17.

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

/** One HIFLD retail territory priced at a shared zone node. */
function member(node, hub, agency, territory, utility) {
  return {
    node,
    label: `${agency} (${utility})`,
    territories: [territory],
    hub,
  };
}

function members(node, hub, agency, rows) {
  return rows.map(([territory, utility]) => member(node, hub, agency, territory, utility));
}

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
  ...members("GRE.AZ", "MINN.HUB", "Great River Energy", [
    ["AGRALITE ELECTRIC COOP", "Agralite Electric Cooperative"],
    ["ARROWHEAD ELECTRIC COOP, INC", "Arrowhead Cooperative"],
    ["BENCO ELECTRIC COOPERATIVE", "BENCO Electric Cooperative"],
    ["BROWN COUNTY RURAL ELEC ASSN", "Brown County Rural Electric"],
    ["COOPERATIVE L&P ASSN LAKE COUNTY", "Cooperative Light & Power"],
    ["DAKOTA ELECTRIC ASSOCIATION", "Dakota Electric"],
    ["EAST CENTRAL ENERGY", "East Central Energy"],
    ["FEDERATED RURAL ELECTRIC ASSN", "Federated Rural Electric"],
    ["GOODHUE COUNTY COOP ELEC ASSN", "Goodhue County Cooperative"],
    ["ITASCA-MANTRAP CO-OP ELECTRICAL ASSN", "Itasca-Mantrap Cooperative"],
    ["KANDIYOHI POWER COOP", "Kandiyohi Power Cooperative"],
    ["LAKE COUNTRY POWER", "Lake Country Power"],
    ["LAKE REGION ELECTRIC COOPERATIVE - (MN)", "Lake Region Electric Cooperative"],
    ["MCLEOD COOPERATIVE POWER ASSN", "McLeod Cooperative Power"],
    ["MEEKER COOP LIGHT & POWER ASSN", "Meeker Cooperative"],
    ["MILLE LACS ENERGY COOPERATIVE", "Mille Lacs Energy Cooperative"],
    ["MINNESOTA VALLEY ELECTRIC COOP", "Minnesota Valley Electric Cooperative"],
    ["NOBLES COOPERATIVE ELECTRIC", "Nobles Cooperative Electric"],
    ["NORTH ITASCA ELECTRIC COOP INC", "North Itasca Electric Cooperative"],
    ["REDWOOD ELECTRIC COOP", "Redwood Electric Cooperative"],
    ["RUNESTONE ELECTRIC ASSN", "Runestone Electric"],
    ["SOUTH CENTRAL ELECTRIC ASSN", "South Central Electric"],
    ["STEARNS COOPERATIVE ELEC ASSN", "Stearns Electric"],
    ["STEELE-WASECA COOPERATIVE ELECTRIC", "Steele-Waseca Cooperative Electric"],
    ["TODD-WADENA ELECTRIC COOP", "Todd-Wadena Electric Cooperative"],
    ["WRIGHT-HENNEPIN COOP ELEC ASSN", "Wright-Hennepin Cooperative"],
  ]),
  ...members("DPC.AZ", "MINN.HUB", "Dairyland Power", [
    ["ALLAMAKEE-CLAYTON EL COOP, INC", "Allamakee-Clayton Electric Cooperative"],
    ["BARRON ELECTRIC COOP", "Barron Electric Cooperative"],
    ["BAYFIELD ELECTRIC COOP, INC", "Bayfield Electric Cooperative"],
    ["CHIPPEWA VALLEY ELECTRIC COOP", "Chippewa Valley Electric Cooperative"],
    ["CLARK ELECTRIC COOP - (WI)", "Clark Electric Cooperative"],
    ["DUNN COUNTY ELECTRIC COOP", "Dunn Energy Cooperative"],
    ["EAU CLAIRE ELECTRIC COOP", "Eau Claire Energy Cooperative"],
    ["FREEBORN MOWER ELECTRIC COOPERATIVE", "Freeborn-Mower Electric Cooperative"],
    ["HEARTLAND POWER COOP", "Heartland Power Cooperative"],
    ["JACKSON ELECTRIC COOP, INC - (WI)", "Jackson Electric Cooperative"],
    ["JO-CARROLL ENERGY, INC", "Jo-Carroll Energy"],
    ["JUMP RIVER ELECTRIC COOP INC", "Jump River Electric Cooperative"],
    ["MIENERGY COOPERATIVE", "MiEnergy Cooperative"],
    ["OAKDALE ELECTRIC COOP", "Oakdale Electric Cooperative"],
    ["PEOPLE'S COOPERATIVE SERVICES", "People's Energy Cooperative"],
    ["PIERCE-PEPIN COOP SERVICES", "Pierce Pepin Cooperative Services"],
    ["POLK-BURNETT ELECTRIC COOP", "Polk-Burnett Electric Cooperative"],
    ["PRICE ELECTRIC COOP INC", "Price Electric Cooperative"],
    ["RICHLAND ELECTRIC COOP", "Richland Electric Cooperative"],
    ["RIVERLAND ENERGY COOPERATIVE", "Riverland Energy Cooperative"],
    ["ST CROIX ELECTRIC COOP", "St. Croix Electric Cooperative"],
    ["SCENIC RIVERS ENERGY COOP", "Scenic Rivers Energy Cooperative"],
    ["TAYLOR ELECTRIC COOP - (WI)", "Taylor Electric Cooperative"],
    ["VERNON ELECTRIC COOP", "Vernon Electric Cooperative"],
  ]),
  member("DPC.NWEC.AZ", "MINN.HUB", "Dairyland Power", "NORTHWESTERN WISCONSIN ELEC CO", "Northwestern Wisconsin Electric"),
  ...members("BREC.AZ", "INDIANA.HUB", "Big Rivers Electric", [
    ["JACKSON PURCHASE ENERGY CORPORATION", "Jackson Purchase Energy"],
    ["KENERGY CORP", "Kenergy"],
    ["MEADE COUNTY RURAL E C C", "Meade County Rural Electric"],
  ]),
  ...members("SIPC.AZ", "ILLINOIS.HUB", "Southern Illinois Power Cooperative", [
    ["CLAY ELECTRIC COOP INC", "Clay Electric Cooperative"],
    ["CLINTON COUNTY ELEC COOP, INC", "Clinton County Electric Cooperative"],
    ["EGYPTIAN ELECTRIC COOP ASSN", "Egyptian Electric Cooperative"],
    ["MONROE COUNTY ELEC COOP, INC", "Monroe County Electric Cooperative"],
    ["SOUTHEASTERN IL ELEC COOP, INC", "SouthEastern Illinois Electric Cooperative"],
    ["SOUTHERN ILLINOIS ELEC COOP", "Southern Illinois Electric Cooperative"],
    ["TRI-COUNTY ELECTRIC COOP, INC (IL)", "Tri-County Electric Cooperative"],
    ["CITY OF MCLEANSBORO - (IL)", "City of McLeansboro"],
  ]),
  // SME.AZ is Cooperative Energy, formerly South Mississippi Electric.
  ...members("SME.AZ", "MS.HUB", "Cooperative Energy", [
    ["COAHOMA ELECTRIC POWER ASSN", "Coahoma Electric"],
    ["DELTA ELECTRIC POWER ASSN", "Delta Electric"],
    ["DIXIE ELECTRIC POWER ASSN", "Dixie Electric Power Association"],
    ["MAGNOLIA ELECTRIC POWER ASSN", "Magnolia Electric"],
    ["PEARL RIVER VALLEY EL PWR ASSN", "Pearl River Valley Electric"],
    ["SINGING RIVER ELEC COOPERATIVE", "Singing River Electric"],
    ["SOUTHERN PINE ELECTRIC COOPERATIVE", "Southern Pine Electric"],
    ["SOUTHWEST MISSISSIPPI E P A", "Southwest Mississippi Electric"],
    ["TWIN COUNTY ELECTRIC PWR ASSN", "Twin County Electric"],
    ["YAZOO VALLEY ELEC POWER ASSN", "Yazoo Valley Electric"],
  ]),
  member("LAGN.DEMCO1.AZ", "LOUISIANA.HUB", "DEMCO", "DIXIE ELECTRIC MEMBERSHIP CORP", "Dixie Electric Membership"),
  member("EAI.CWAYLD1.AZ", "ARKANSAS.HUB", "Entergy Arkansas", "CONWAY CORPORATION", "Conway Corporation"),
  member("EES.KRBYVLE.AZ", "TEXAS.HUB", "Entergy Texas", "KIRBYVILLE LIGHT & POWER CO", "Kirbyville Light & Power"),
  member("EES.NEWTON1.AZ", "TEXAS.HUB", "Entergy Texas", "CITY OF NEWTON - (TX)", "City of Newton"),
  ...members("SMP.AZ", "MINN.HUB", "SMMPA", [
    ["CITY OF AUSTIN - (MN)", "Austin Utilities"],
    ["CITY OF BLOOMING PRAIRIE - (MN)", "Blooming Prairie"],
    ["FAIRMONT PUBLIC UTILITIES COMM", "Fairmont Public Utilities"],
    ["CITY OF GRAND MARAIS - (MN)", "Grand Marais"],
    ["CITY OF LAKE CITY - (MN)", "Lake City Utilities"],
    ["LITCHFIELD PUBLIC UTILITIES", "Litchfield Public Utilities"],
    ["CITY OF MORA - (MN)", "Mora Municipal Utilities"],
    ["NEW PRAGUE UTILITIES COMM", "New Prague Utilities"],
    ["NORTH BRANCH WATER & LIGHT COMM", "North Branch Water & Light"],
    ["CITY OF OWATONNA - (MN)", "Owatonna Public Utilities"],
    ["PRESTON PUBLIC UTILITIES COMM", "Preston Public Utilities"],
    ["PRINCETON PUBLIC UTILS COMM", "Princeton Public Utilities"],
    ["REDWOOD FALLS PUBLIC UTIL COMM", "Redwood Falls Public Utilities"],
    ["ROCHESTER PUBLIC UTILITIES", "Rochester Public Utilities"],
    ["CITY OF SAINT PETER", "Saint Peter Municipal Utilities"],
    ["CITY OF WASECA - (MN)", "Waseca Utilities"],
    ["CITY OF WELLS - (MN)", "Wells Public Utilities"],
  ]),
  ...members("LEPA.AZ", "LOUISIANA.HUB", "LEPA", [
    ["CITY OF ABBEVILLE - (LA)", "Abbeville"],
    ["CITY OF ALEXANDRIA - (LA)", "Alexandria"],
    ["CITY OF ERATH - (LA)", "Erath"],
    ["TOWN OF GUEYDAN", "Gueydan"],
    ["CITY OF JONESVILLE - (LA)", "Jonesville"],
    ["CITY OF KAPLAN - (LA)", "Kaplan"],
    ["CITY OF MINDEN - (LA)", "Minden"],
    ["MORGAN CITY - (LA)", "Morgan City"],
    ["CITY OF NATCHITOCHES", "Natchitoches"],
    ["CITY OF NEW ROADS - (LA)", "New Roads"],
    ["CITY OF PLAQUEMINE - (LA)", "Plaquemine"],
    ["CITY OF RAYNE - (LA)", "Rayne"],
    ["CITY OF RUSTON - (LA)", "Ruston"],
    ["CITY OF ST MARTINVILLE - (LA)", "St. Martinville"],
    ["TOWN OF VIDALIA - (LA)", "Vidalia"],
    ["VINTON PUBLIC POWER AUTHORITY", "Vinton Public Power Authority"],
    ["TOWN OF VINTON - (LA)", "Vinton"],
    ["TOWN OF WELSH - (LA)", "Welsh"],
    ["CITY OF WINNFIELD - (LA)", "Winnfield"],
  ]),
];
