# CoTa Warehouse

A small mobile-friendly warehouse app. Employees can search stock, work out an open-shelf refill, and build a sequenced pick list.

**Live:** https://cota.nexusautomation.cc

| Section | What it does |
|---|---|
| **Inventory** (Part 1) | Search by SKU or product name. Shows units per case, every storage location with its cases, and total cases and units. |
| **Shelf refill** (Part 2) | From the shelf capacity and current units, works out the units needed and the full cases to pull. It explains any leftover units to the employee, with the alternative. |
| **Pick list** (Part 3) | Enter an order (SKU and cases). Returns a numbered pick sequence that walks the aisles in one direction, and flags any shortage clearly. |

Written responses: [Part 4: shelf video](docs/part4-shelf-video.md) · [Part 5: lost connectivity](docs/part5-offline.md)

---

## Setup

Requirements: Node.js 20 or newer, and npm.

```bash
npm install
npm run dev      # creates the local database with the sample data, then serves http://localhost:8787
npm test         # unit tests for the stock rules
```

`npm run dev` runs a local copy of the database on your machine, so no cloud account is needed to try it.

### Deploying your own copy (Cloudflare)

```bash
npx wrangler login
npx wrangler d1 create cota-warehouse     # copy the database_id it prints into wrangler.jsonc
npm run deploy                            # applies migrations to the cloud database, then deploys
```

Remove the `routes` entry in `wrangler.jsonc` (or change it to your own domain) to deploy on a `*.workers.dev` address instead.

---

## Architecture

```
Phone / browser                 Cloudflare Worker                     Database (D1 / SQLite)
public/index.html   ──HTTP──►   src/worker.js   ── SQL ──►            products, locations,
public/app.js       ◄──JSON──   (routes, input checks)                stock, open_shelf
public/styles.css                    │
                                     ▼
                                src/logic.js
                                (pure stock rules, unit-tested)
```

- **`src/logic.js`** holds every business rule: totals, the refill calculation, how cases are split across locations, pick sequencing and shortage detection. These are pure functions with no database and no HTTP, so they can be tested and read on their own (`test/logic.test.js`).
- **`src/worker.js`** is a thin HTTP layer. It validates input, loads rows with parameterized SQL, calls `logic.js` and returns JSON.
- **`public/`** is the UI: plain HTML, CSS and JavaScript, with no framework and no build step. It only displays what the server returns, so the rules exist in one place.
- **Hosting:** Cloudflare Workers serves the static UI and the API from one deployment, with D1 (SQLite) as the database. It runs independently of any local machine.

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/products?q=turtle` | Search by SKU or name; returns locations and totals. An empty `q` lists everything. |
| GET | `/api/replenish?sku=TURTLE-01&capacity=60&current=17` | Refill plan. `capacity` and `current` are optional and default to the stored open-shelf figures. |
| POST | `/api/picklist` with `{"lines":[{"sku":"TURTLE-01","cases":3}]}` | Sequenced pick list, with any problems listed. |

Bad input returns HTTP 400 with a plain-language `error` message.

---

## Database schema

Defined in [`migrations/0001_init.sql`](migrations/0001_init.sql), which also loads the sample data from the brief.

| Table | Columns | Notes |
|---|---|---|
| `products` | `sku` PK, `name`, `units_per_case` | One row per SKU. `units_per_case > 0`. |
| `locations` | `code` PK, `aisle`, `rack`, `shelf` | Code format `A<aisle>-R<rack>-S<shelf>`. The parts are stored as numbers so the walk order can be sorted. |
| `stock` | `sku` FK, `location` FK, `cases` | Primary key `(sku, location)`. Full cases only, `cases >= 0`. One SKU can be in several locations. |
| `open_shelf` | `sku` PK/FK, `capacity_units`, `current_units` | Loose units on the pick-face shelf. Seeded for TURTLE-01 (60 / 17). |

---

## Business rules

**Shelf refill.** `units needed = capacity − current`. Storage only releases full cases, so:
- **To fill the shelf, round up:** `ceil(43 / 12) = 4 cases = 48 units`, which leaves **5 units that will not fit**. The app tells the employee the last case is opened, cannot go back into storage as a full case, and should be labelled and used first at the next refill.
- **The alternative, rounded down,** is also shown: `3 cases = 36 units`. The shelf reaches 53 of 60, 7 short, with nothing left over.
- It also covers an exact fit, a full shelf, a shelf count above capacity (asks for a recount) and too little stock in storage.

**Pick sequencing.** Aisle numbers are the walk order, so picks are sorted by aisle, then rack, then shelf, and the picker walks one way with no backtracking. When a SKU sits in several locations, the app first uses a single location that covers the whole request (fewest stops). Otherwise it takes from locations in walk order. The example order gives A1-R2-S1 → A2-R3-S1 → A3-R4-S2.

**Insufficient stock.** The list is marked **not complete**. Each short SKU shows requested vs available ("4 of 6 cases"), and the employee is told not to ship it as complete. Unknown SKUs and invalid quantities are reported the same way. Repeated SKUs are merged.

---

## Assumptions

- Storage holds full cases only; loose units exist only on the open shelf.
- Aisle number is the physical walk order; rack and shelf only break ties within an aisle.
- Open-shelf figures were given only for TURTLE-01. For other SKUs the employee enters them on screen, and they are not saved.
- The overflow spot for an opened case is an operational convention, suggested in the app's wording rather than tracked as stock.
- Calculations are read-only. Building a pick list or refill plan does not change stock.
- No login; this is a single-warehouse internal tool for the exercise.

## Known limitations

- Stock is not deducted when a pick or refill is done. There is no "confirm" step yet, so there is no offline queue either (see Part 5 for how that would work).
- No authentication, roles or audit log.
- The walk order is a simple one-way aisle sort; it doesn't model a serpentine route or two-sided aisles.
- The opened-case leftover is explained but not recorded as stock.
- Search is a simple substring match on SKU and name.

## What I would improve next

1. A **confirm step** for picks and refills that writes stock changes as events, with the offline queue and idempotency keys from Part 5.
2. **Login plus an audit log** (who changed what, and when).
3. **Editable open-shelf settings** for every SKU.
4. **Track opened cases** as their own stock record.
5. A **real walk path** once the warehouse layout is known.
6. The **one-aisle video pilot** from Part 4.
