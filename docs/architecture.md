# Architecture

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

## Business rules

**Shelf refill.** `units needed = capacity − current`. Storage only releases full cases, so:
- **To fill the shelf, round up:** `ceil(43 / 12) = 4 cases = 48 units`, which leaves **5 units that will not fit**. The app tells the employee the last case is opened, cannot go back into storage as a full case, and should be labelled and used first at the next refill.
- **The alternative, rounded down,** is also shown: `3 cases = 36 units`. The shelf reaches 53 of 60, 7 short, with nothing left over.
- It also covers an exact fit, a full shelf, a shelf count above capacity (asks for a recount) and too little stock in storage.

**Pick sequencing.** Aisle numbers are the walk order, so picks are sorted by aisle, then rack, then shelf, and the picker walks one way with no backtracking. When a SKU sits in several locations, the app first uses a single location that covers the whole request (fewest stops). Otherwise it takes from locations in walk order. The example order gives A1-R2-S1 → A2-R3-S1 → A3-R4-S2.

**Insufficient stock.** The list is marked **not complete**. Each short SKU shows requested vs available ("4 of 6 cases"), and the employee is told not to ship it as complete. Unknown SKUs and invalid quantities are reported the same way. Repeated SKUs are merged.
