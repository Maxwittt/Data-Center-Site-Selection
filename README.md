# Data Center Site Selection Evaluator (MISO)

A map for screening data center sites in the MISO region. Drop a pin anywhere and see what a large load would face there: how close high-voltage transmission and substations are, how close an interstate gas pipeline is, how busy the local generator queue is, how congested the utility zone is, and how a utility power ramp compares with building on-site gas.

Land is cheap; power is the constraint. This tool is the screening step that comes before a utility study, an option on land, or a consultant's report. It is not a replacement for any of them.

## What it does

- **Transmission and substations.** HIFLD lines at 138 kV and above, colored by voltage, and substations at 230 kV and above. The pin card shows the nearest line overall and per voltage, and the nearest substation.
- **Gas supply.** EIA interstate natural gas pipelines (toggle in Map Options) and the distance from the pin.
- **Generator queue backlog.** Active MISO generator interconnection requests within 50 miles, flagged as heavy in the busiest quarter of MISO counties.
- **Congestion.** MISO utility territories shaded by 30-day average day-ahead congestion cost or share of congested hours, with the zone's numbers on the pin card.
- **Interconnection screening.** A utility ramp (partial power, then full power) against on-site gas, in years from today, with a warning when partial utility power leaves part of the load unserved. Defaults come from the site and can be edited.
- **Energy cost.** Utility $/MWh (an editable rate plus the zone's congestion) against on-site gas $/MWh (gas price × heat rate plus O&M and capital).
- **Compare, share, export.** Save up to three sites to a side-by-side table, copy a link that reopens the same pin, sites, and inputs, and download the comparison as CSV.
- **Search.** A city or address, or coordinates like `41.6, -93.6`.

## Methodology and assumptions

Everything below is a screening default. Distances are straight-line, not routed.

### Utility power timeline

The utility connects the load either at an existing substation of 230 kV or more, or at a new switching station cut into the nearest line. The tool uses whichever gives the earlier date.

| Piece | Default |
| --- | --- |
| Base years to full power by connection voltage | 500 kV+: 4, 345 kV: 5, 230 kV: 6, 138–161 kV: 7, nothing loaded: 8 |
| New switching station on a line | +1 year |
| Distance to the connection | +1 year per 10 miles past the first mile, at most +3 |
| Heavy generator queue within 50 miles | +1 year |
| Partial power | 2 years before full (never sooner than 1 year), at 40% of the request |

There is no public dataset of months-to-connect by utility, so these are rules of thumb meant to rank sites against each other, not to predict a date.

### On-site gas timeline

Two years to serve the full request when an interstate pipeline is within 5 miles. Each further 15 miles of lateral adds a year, up to +2. No interstate pipeline in the loaded data counts as +2.

### Power gap

All years count from today. A gap is flagged only when partial utility power has arrived and neither on-site gas nor full utility power is online yet. Gas that is ready by the partial step covers the load for the rest of the ramp.

### Generator queue backlog

Active requests from MISO's public queue are summed by county and placed at the county's Census centroid. The pin card adds up everything within 50 miles. "Heavy" is the 75th percentile of that sum across all counties in the loaded area, currently about 3,100 MW. A busy generator queue means the local network is already being studied for upgrades, which tends to slow new large loads. It is not the data center's own queue position. About 20% of active MW has no county in MISO's data and is left out.

### Congestion

The 30-day average of MISO day-ahead ex-post prices per zone, joined to HIFLD retail service territories. "Congestion cost" is the marginal congestion component (MCC). A negative value means congestion lowers the local price on average. See [SPEC.md](SPEC.md) for how zones and price nodes were matched.

### Energy cost

| Input | Default |
| --- | --- |
| Utility all-in rate, before congestion | $70/MWh |
| Gas price | $3.50/MMBtu |
| Heat rate | 8.5 MMBtu/MWh |
| Gas O&M and capital recovery | $30/MWh |
| Load factor (for the annual difference) | 90% |

Utility = rate + zone average congestion. Gas = gas price × heat rate + adder. Gas has no regional basis adjustment, and the utility side does not model demand charges or tariff structure.

### Data edge

Every dataset is clipped to MISO plus a 50-mile margin. When the pin is close enough to that edge that a nearer asset could exist outside it, the distance is marked with `*` and the card shows an info note.

## Data sources

All data is built offline into `public/data/` and served as static files; there are no runtime API calls except place search. Map Options lists the date each dataset was built.

| Dataset | Source | Rebuild |
| --- | --- | --- |
| Transmission lines | HIFLD Electric Power Transmission Lines | `npm run build:transmission` |
| Substations | HIFLD Electric Substations (source last updated 2021) | `npm run build:substations` |
| Gas pipelines | EIA Natural Gas Interstate and Intrastate Pipelines (interstate, operating) | `npm run build:gas` |
| Generator queue | [MISO GI queue](https://www.misoenergy.org/planning/resource-utilization/GI_Queue/) and Census 2023 county Gazetteer | `npm run build:queue` |
| Congestion | MISO day-ahead ex-post LMP daily reports, HIFLD retail service territories | `npm run build:congestion` |
| Place search | [OpenStreetMap Nominatim](https://nominatim.org/) | runtime, one request per search |

Run `build:transmission` first: the other builds clip to the coverage mask it writes. Raw downloads are cached in `.cache/` (gitignored).

Out of scope for now: fiber, water, flood zones, PJM and other markets, and live prices.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests for lib/
npm run lint
```

Built with Next.js, React, TypeScript, Tailwind CSS, and MapLibre GL JS. Map logic lives in `lib/map/`, pure calculations in `lib/geo/` and `lib/grid/` (all tested), and UI in `components/map/`.

## Deploying

The app prerenders as a static page, so it deploys to [Vercel](https://vercel.com) with no configuration. `npm run build` copies the MapLibre worker into `public/` automatically.

From this folder:

```bash
npx vercel          # log in when prompted, accept the detected Next.js settings
npx vercel --prod   # publish the production URL
```

Vercel's dashboard import (**Add New → Project**) also works if the repository is mirrored to GitHub, GitLab, or Bitbucket.
