// Pure warehouse logic. No database, no HTTP: every function takes plain data
// and returns plain data, so the rules can be unit-tested and explained on their own.

const LOCATION_RE = /^A(\d+)-R(\d+)-S(\d+)$/i;

/** "A1-R2-S1" -> { aisle: 1, rack: 2, shelf: 1 }. Throws on an unknown format. */
export function parseLocation(code) {
  const m = LOCATION_RE.exec(String(code).trim());
  if (!m) throw new Error(`Unrecognised location code: ${code}`);
  return { aisle: Number(m[1]), rack: Number(m[2]), shelf: Number(m[3]) };
}

/** Walk order: aisle first (physical progression), then rack, then shelf. */
export function compareLocations(a, b) {
  const x = parseLocation(a);
  const y = parseLocation(b);
  return x.aisle - y.aisle || x.rack - y.rack || x.shelf - y.shelf;
}

/**
 * Part 1. One product with its stock rows -> the search result card.
 * stock: [{ location, cases }]
 */
export function summarizeProduct(product, stock) {
  const locations = stock
    .filter((s) => s.cases > 0)
    .map((s) => ({
      location: s.location,
      cases: s.cases,
      units: s.cases * product.unitsPerCase,
    }))
    .sort((a, b) => compareLocations(a.location, b.location));
  const totalCases = locations.reduce((n, l) => n + l.cases, 0);
  return {
    sku: product.sku,
    name: product.name,
    unitsPerCase: product.unitsPerCase,
    locations,
    totalCases,
    totalUnits: totalCases * product.unitsPerCase,
  };
}

function isWholeNumber(n) {
  return Number.isInteger(n) && n >= 0;
}

/**
 * Part 2. How many full cases to bring from storage to top up the open shelf.
 *
 * Storage only holds full cases, so the shelf gap rarely divides evenly:
 *  - fill option:   round UP  -> shelf is full, some loose units are left over
 *  - no-overflow:   round DOWN -> nothing left over, shelf stays a little short
 * We answer the question asked ("fill the shelf") with the fill option and show
 * the alternative so the employee or supervisor can choose.
 */
export function planReplenishment({ unitsPerCase, capacity, current, casesInStorage }) {
  const errors = [];
  if (!Number.isInteger(unitsPerCase) || unitsPerCase <= 0) errors.push("Units per case must be a whole number above 0.");
  if (!Number.isInteger(capacity) || capacity <= 0) errors.push("Shelf capacity must be a whole number above 0.");
  if (!isWholeNumber(current)) errors.push("Current shelf quantity must be a whole number, 0 or more.");
  if (errors.length) return { ok: false, errors };

  if (current > capacity) {
    return {
      ok: false,
      errors: [`The shelf shows ${current} units but only holds ${capacity}. Recount the shelf before pulling stock.`],
    };
  }

  const unitsNeeded = capacity - current;
  if (unitsNeeded === 0) {
    return { ok: true, unitsNeeded: 0, casesToPull: 0, status: "full", message: "The shelf is already full. Nothing to pull." };
  }

  const casesToFill = Math.ceil(unitsNeeded / unitsPerCase);
  const unitsPulled = casesToFill * unitsPerCase;
  const leftoverUnits = unitsPulled - unitsNeeded;
  const casesNoOverflow = Math.floor(unitsNeeded / unitsPerCase);
  const shortIfNoOverflow = unitsNeeded - casesNoOverflow * unitsPerCase;

  const result = {
    ok: true,
    unitsNeeded,
    casesToPull: casesToFill,
    unitsPulled,
    shelfAfter: capacity,
    leftoverUnits,
    alternative: leftoverUnits
      ? {
          casesToPull: casesNoOverflow,
          unitsPulled: casesNoOverflow * unitsPerCase,
          shelfAfter: current + casesNoOverflow * unitsPerCase,
          unitsShort: shortIfNoOverflow,
        }
      : null,
    storageShortfall: null,
  };

  if (Number.isInteger(casesInStorage) && casesInStorage < casesToFill) {
    // Storage cannot even cover the fill. Pull everything there is, and say so.
    const pulled = casesInStorage * unitsPerCase;
    result.storageShortfall = {
      casesAvailable: casesInStorage,
      casesMissing: casesToFill - casesInStorage,
      shelfAfter: current + pulled,
    };
  }

  result.status = result.storageShortfall ? "storage-short" : leftoverUnits ? "leftover" : "exact";
  return result;
}

/**
 * Split one SKU's requested cases across its storage locations.
 * Rule: fewest stops first (one location that covers the whole request, earliest
 * in the walk), otherwise take from locations in walk order until covered.
 */
function allocate(requested, locations) {
  const ordered = [...locations].filter((l) => l.cases > 0).sort((a, b) => compareLocations(a.location, b.location));
  const single = ordered.find((l) => l.cases >= requested);
  if (single) return [{ location: single.location, cases: requested }];

  const picks = [];
  let remaining = requested;
  for (const l of ordered) {
    if (remaining === 0) break;
    const take = Math.min(l.cases, remaining);
    picks.push({ location: l.location, cases: take });
    remaining -= take;
  }
  return picks;
}

/**
 * Part 3. Request lines -> a sequenced pick list.
 *
 * request:  [{ sku, cases }]
 * products: { [sku]: { sku, name, unitsPerCase, locations: [{ location, cases }] } }
 *
 * Never returns a list that pretends to be complete: any SKU that is unknown or
 * short is reported in `problems`, and `complete` is false.
 */
export function buildPickList(request, products) {
  const problems = [];
  const merged = new Map();

  for (const [i, line] of request.entries()) {
    const sku = String(line.sku ?? "").trim().toUpperCase();
    const cases = Number(line.cases);
    if (!sku) {
      problems.push({ type: "invalid", line: i + 1, message: `Line ${i + 1}: SKU is missing.` });
      continue;
    }
    if (!Number.isInteger(cases) || cases <= 0) {
      problems.push({ type: "invalid", line: i + 1, sku, message: `Line ${i + 1} (${sku}): cases must be a whole number above 0.` });
      continue;
    }
    if (!products[sku]) {
      problems.push({ type: "unknown-sku", line: i + 1, sku, message: `Line ${i + 1}: SKU ${sku} does not exist.` });
      continue;
    }
    merged.set(sku, (merged.get(sku) ?? 0) + cases);
  }

  const picks = [];
  const lines = [];
  for (const [sku, requested] of merged) {
    const p = products[sku];
    const available = p.locations.reduce((n, l) => n + l.cases, 0);
    const toPick = Math.min(requested, available);
    const allocation = toPick > 0 ? allocate(toPick, p.locations) : [];
    for (const a of allocation) {
      picks.push({ sku, name: p.name, location: a.location, cases: a.cases, units: a.cases * p.unitsPerCase });
    }
    const short = requested - toPick;
    lines.push({ sku, name: p.name, requested, available, picked: toPick, short });
    if (short > 0) {
      problems.push({
        type: "insufficient",
        sku,
        requested,
        available,
        short,
        message: `${sku} (${p.name}): ${requested} cases requested, only ${available} in storage. ${short} case${short === 1 ? "" : "s"} short.`,
      });
    }
  }

  picks.sort((a, b) => compareLocations(a.location, b.location) || a.sku.localeCompare(b.sku));
  picks.forEach((p, i) => (p.sequence = i + 1));

  return {
    complete: problems.length === 0,
    picks,
    lines,
    problems,
    totalCases: picks.reduce((n, p) => n + p.cases, 0),
    totalUnits: picks.reduce((n, p) => n + p.units, 0),
  };
}
