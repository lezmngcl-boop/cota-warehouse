# CoTa Warehouse

A small mobile-friendly warehouse app. Employees can search stock, work out an open-shelf refill, and build a sequenced pick list.

**Live:** https://cota.nexusautomation.cc

| Section | What it does |
|---|---|
| **Inventory** (Part 1) | Search by SKU or product name. Shows units per case, every storage location with its cases, and total cases and units. |
| **Shelf refill** (Part 2) | From the shelf capacity and current units, works out the units needed and the full cases to pull. It explains any leftover units to the employee, with the alternative. |
| **Pick list** (Part 3) | Enter an order (SKU and cases). Returns a numbered pick sequence that walks the aisles in one direction, and flags any shortage clearly. |

## Deliverables

| Deliverable | File |
|---|---|
| Working application | https://cota.nexusautomation.cc |
| Setup instructions | [below](#setup) |
| Database / schema description | [docs/database-schema.md](docs/database-schema.md) |
| Short architecture explanation | [docs/architecture.md](docs/architecture.md) |
| Part 4: shelf video design | [docs/part4-shelf-video.md](docs/part4-shelf-video.md) |
| Part 5: lost connectivity | [docs/part5-offline.md](docs/part5-offline.md) |
| Assumptions and known limitations | [docs/assumptions-and-limitations.md](docs/assumptions-and-limitations.md) |

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

## Tests

`npm test` runs 9 unit tests on the stock rules in `src/logic.js`: totals, the refill calculation and its edge cases, pick sequencing, splitting across locations, and shortages, unknown SKUs and bad quantities.
