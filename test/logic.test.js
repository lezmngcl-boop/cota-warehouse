import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocation, compareLocations, summarizeProduct, planReplenishment, buildPickList } from "../src/logic.js";

// Same data as migrations/0001_init.sql
const PRODUCTS = {
  "TURTLE-01": { sku: "TURTLE-01", name: "Sea Turtle Plush", unitsPerCase: 12, locations: [{ location: "A4-R1-S2", cases: 7 }, { location: "A1-R2-S1", cases: 18 }] },
  "SHARK-02": { sku: "SHARK-02", name: "Shark Plush", unitsPerCase: 8, locations: [{ location: "A2-R3-S1", cases: 14 }] },
  "MOOSE-03": { sku: "MOOSE-03", name: "Moose Plush", unitsPerCase: 6, locations: [{ location: "A5-R1-S1", cases: 9 }] },
  "ALIEN-04": { sku: "ALIEN-04", name: "Alien Plush", unitsPerCase: 12, locations: [{ location: "A3-R4-S2", cases: 4 }] },
};

test("location codes parse and sort in walk order", () => {
  assert.deepEqual(parseLocation("A3-R4-S2"), { aisle: 3, rack: 4, shelf: 2 });
  assert.throws(() => parseLocation("B1-X"));
  const sorted = ["A5-R1-S1", "A1-R2-S1", "A10-R1-S1", "A1-R1-S3"].sort(compareLocations);
  assert.deepEqual(sorted, ["A1-R1-S3", "A1-R2-S1", "A5-R1-S1", "A10-R1-S1"]); // numeric, not text, order
});

test("Part 1: TURTLE-01 totals across both locations", () => {
  const p = PRODUCTS["TURTLE-01"];
  const s = summarizeProduct(p, p.locations);
  assert.equal(s.totalCases, 25);
  assert.equal(s.totalUnits, 300);
  assert.deepEqual(s.locations.map((l) => [l.location, l.cases, l.units]), [["A1-R2-S1", 18, 216], ["A4-R1-S2", 7, 84]]);
});

test("Part 2: TURTLE-01, capacity 60, current 17", () => {
  const r = planReplenishment({ unitsPerCase: 12, capacity: 60, current: 17, casesInStorage: 25 });
  assert.equal(r.unitsNeeded, 43);
  assert.equal(r.casesToPull, 4);
  assert.equal(r.unitsPulled, 48);
  assert.equal(r.leftoverUnits, 5);
  assert.equal(r.status, "leftover");
  assert.deepEqual(r.alternative, { casesToPull: 3, unitsPulled: 36, shelfAfter: 53, unitsShort: 7 });
});

test("Part 2: exact fit, full shelf, bad input, not enough storage", () => {
  const exact = planReplenishment({ unitsPerCase: 12, capacity: 60, current: 12, casesInStorage: 25 });
  assert.equal(exact.casesToPull, 4);
  assert.equal(exact.leftoverUnits, 0);
  assert.equal(exact.alternative, null);

  assert.equal(planReplenishment({ unitsPerCase: 12, capacity: 60, current: 60 }).casesToPull, 0);
  assert.equal(planReplenishment({ unitsPerCase: 12, capacity: 60, current: 61 }).ok, false);
  assert.equal(planReplenishment({ unitsPerCase: 12, capacity: 60, current: -1 }).ok, false);
  assert.equal(planReplenishment({ unitsPerCase: 12, capacity: 60, current: 1.5 }).ok, false);

  const short = planReplenishment({ unitsPerCase: 12, capacity: 60, current: 0, casesInStorage: 2 });
  assert.equal(short.status, "storage-short");
  assert.deepEqual(short.storageShortfall, { casesAvailable: 2, casesMissing: 3, shelfAfter: 24 });
});

test("Part 3: the example order walks A1 -> A2 -> A3", () => {
  const r = buildPickList([{ sku: "TURTLE-01", cases: 3 }, { sku: "SHARK-02", cases: 2 }, { sku: "ALIEN-04", cases: 1 }], PRODUCTS);
  assert.equal(r.complete, true);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.picks.map((p) => [p.sequence, p.sku, p.location, p.cases]), [
    [1, "TURTLE-01", "A1-R2-S1", 3],
    [2, "SHARK-02", "A2-R3-S1", 2],
    [3, "ALIEN-04", "A3-R4-S2", 1],
  ]);
  assert.equal(r.totalCases, 6);
  assert.equal(r.totalUnits, 3 * 12 + 2 * 8 + 12);
});

test("Part 3: a request larger than one location splits in walk order", () => {
  const r = buildPickList([{ sku: "TURTLE-01", cases: 20 }], PRODUCTS);
  assert.equal(r.complete, true);
  assert.deepEqual(r.picks.map((p) => [p.location, p.cases]), [["A1-R2-S1", 18], ["A4-R1-S2", 2]]);
});

test("Part 3: fewest stops wins when one location covers the request", () => {
  const products = { X: { sku: "X", name: "X", unitsPerCase: 1, locations: [{ location: "A1-R1-S1", cases: 2 }, { location: "A4-R1-S1", cases: 10 }] } };
  const r = buildPickList([{ sku: "X", cases: 3 }], products);
  assert.deepEqual(r.picks.map((p) => [p.location, p.cases]), [["A4-R1-S1", 3]]);
});

test("Part 3: insufficient stock is flagged, never silently picked", () => {
  const r = buildPickList([{ sku: "ALIEN-04", cases: 6 }, { sku: "SHARK-02", cases: 1 }], PRODUCTS);
  assert.equal(r.complete, false);
  const p = r.problems.find((x) => x.type === "insufficient");
  assert.deepEqual([p.sku, p.requested, p.available, p.short], ["ALIEN-04", 6, 4, 2]);
  // Picks never exceed what is in storage.
  assert.equal(r.picks.find((x) => x.sku === "ALIEN-04").cases, 4);
});

test("Part 3: unknown SKU, bad quantity, duplicate lines", () => {
  const r = buildPickList(
    [{ sku: "DRAGON-99", cases: 1 }, { sku: "SHARK-02", cases: 0 }, { sku: "shark-02", cases: 2 }, { sku: "SHARK-02", cases: 3 }],
    PRODUCTS
  );
  assert.equal(r.complete, false);
  assert.deepEqual(r.problems.map((p) => p.type), ["unknown-sku", "invalid"]);
  assert.deepEqual(r.picks.map((p) => [p.sku, p.cases]), [["SHARK-02", 5]]); // 2 + 3 merged
});
