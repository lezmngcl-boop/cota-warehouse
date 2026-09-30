# Database schema

Defined in [`migrations/0001_init.sql`](../migrations/0001_init.sql), which also loads the sample data from the brief.

| Table | Columns | Notes |
|---|---|---|
| `products` | `sku` PK, `name`, `units_per_case` | One row per SKU. `units_per_case > 0`. |
| `locations` | `code` PK, `aisle`, `rack`, `shelf` | Code format `A<aisle>-R<rack>-S<shelf>`. The parts are stored as numbers so the walk order can be sorted. |
| `stock` | `sku` FK, `location` FK, `cases` | Primary key `(sku, location)`. Full cases only, `cases >= 0`. One SKU can be in several locations. |
| `open_shelf` | `sku` PK/FK, `capacity_units`, `current_units` | Loose units on the pick-face shelf. Seeded for TURTLE-01 (60 / 17). |
