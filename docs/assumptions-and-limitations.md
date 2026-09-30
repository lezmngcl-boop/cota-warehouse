# Assumptions and known limitations

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
