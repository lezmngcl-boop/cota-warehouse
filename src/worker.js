// HTTP layer: reads the database, hands plain data to logic.js, returns JSON.
// Static files (the UI) are served from ./public by the assets binding.

import { summarizeProduct, planReplenishment, buildPickList } from "./logic.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const badRequest = (message) => json({ error: message }, 400);

/** Load products (optionally filtered) with their stock rows, keyed by SKU. */
async function loadProducts(db, { query, skus } = {}) {
  let where = "";
  const params = [];
  if (query) {
    // Escape LIKE wildcards so a typed "%" or "_" is matched literally.
    where = "WHERE p.sku LIKE ?1 ESCAPE '!' OR p.name LIKE ?1 ESCAPE '!'";
    params.push(`%${query.replace(/[!%_]/g, (c) => "!" + c)}%`);
  } else if (skus) {
    where = `WHERE p.sku IN (${skus.map((_, i) => `?${i + 1}`).join(",")})`;
    params.push(...skus);
  }
  const { results } = await db
    .prepare(
      `SELECT p.sku, p.name, p.units_per_case, s.location, s.cases,
              o.capacity_units, o.current_units
         FROM products p
         LEFT JOIN stock s      ON s.sku = p.sku
         LEFT JOIN open_shelf o ON o.sku = p.sku
         ${where}
         ORDER BY p.sku`
    )
    .bind(...params)
    .all();

  const bySku = {};
  for (const r of results) {
    const p = (bySku[r.sku] ??= {
      sku: r.sku,
      name: r.name,
      unitsPerCase: r.units_per_case,
      openShelf: r.capacity_units == null ? null : { capacity: r.capacity_units, current: r.current_units },
      locations: [],
    });
    if (r.location) p.locations.push({ location: r.location, cases: r.cases });
  }
  return bySku;
}

// Accepts "17", rejects "", "1.5", "abc". Returns undefined when absent.
function intParam(value) {
  if (value == null || value === "") return undefined;
  return /^-?\d+$/.test(value.trim()) ? Number(value) : NaN;
}

async function search(url, env) {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length > 60) return badRequest("Search text is too long.");
  const products = await loadProducts(env.DB, { query: q || undefined });
  return json({
    query: q,
    results: Object.values(products).map((p) => ({ ...summarizeProduct(p, p.locations), openShelf: p.openShelf })),
  });
}

async function replenish(url, env) {
  const sku = (url.searchParams.get("sku") ?? "").trim().toUpperCase();
  if (!sku) return badRequest("Choose a SKU.");
  const p = (await loadProducts(env.DB, { skus: [sku] }))[sku];
  if (!p) return json({ error: `SKU ${sku} does not exist.` }, 404);

  // Figures typed on screen win; otherwise use what the database has for the shelf.
  const capacity = intParam(url.searchParams.get("capacity")) ?? p.openShelf?.capacity;
  const current = intParam(url.searchParams.get("current")) ?? p.openShelf?.current;
  if (capacity === undefined || current === undefined) {
    return badRequest(`No open-shelf figures are stored for ${sku}. Enter the shelf capacity and current units.`);
  }

  const summary = summarizeProduct(p, p.locations);
  const plan = planReplenishment({
    unitsPerCase: p.unitsPerCase,
    capacity,
    current,
    casesInStorage: summary.totalCases,
  });
  if (!plan.ok) return badRequest(plan.errors.join(" "));
  // Where to pull the cases from uses the same walk rule as the pick list.
  const pullFrom =
    plan.ok && plan.casesToPull > 0 && summary.totalCases > 0
      ? buildPickList([{ sku, cases: Math.min(plan.casesToPull, summary.totalCases) }], { [sku]: p }).picks
      : [];
  return json({ product: summary, input: { capacity, current }, plan, pullFrom });
}

async function pickList(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be JSON.");
  }
  const lines = Array.isArray(body?.lines) ? body.lines : null;
  if (!lines || lines.length === 0) return badRequest("Add at least one SKU and number of cases.");
  if (lines.length > 100) return badRequest("Too many lines in one request (max 100).");

  const skus = [...new Set(lines.map((l) => String(l?.sku ?? "").trim().toUpperCase()).filter(Boolean))];
  const products = skus.length ? await loadProducts(env.DB, { skus }) : {};
  return json(buildPickList(lines, products));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/products" && request.method === "GET") return await search(url, env);
      if (url.pathname === "/api/replenish" && request.method === "GET") return await replenish(url, env);
      if (url.pathname === "/api/picklist" && request.method === "POST") return await pickList(request, env);
      if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return json({ error: "Something went wrong on the server. Try again." }, 500);
    }
  },
};
