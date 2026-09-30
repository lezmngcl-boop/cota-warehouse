// Screen logic only. All stock rules live on the server (src/logic.js).

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const icon = (id) => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;

async function api(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error("No connection to the server. Check the network and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error (${res.status}).`);
  return data;
}

const errorNote = (message) => `<div class="note bad" role="alert"><strong>${esc(message)}</strong></div>`;
const emptyState = (title, text) => `<div class="empty"><b>${esc(title)}</b>${esc(text)}</div>`;

// ---------- routing ----------
const VIEWS = {
  inventory: { title: "Inventory", sub: "Search stock by SKU or product name" },
  refill: { title: "Shelf refill", sub: "How many full cases to bring to the open shelf" },
  picklist: { title: "Pick list", sub: "Enter an order, get the walk sequence" },
};

function route() {
  const name = location.hash.replace(/^#\//, "");
  const view = VIEWS[name] ? name : "inventory";
  for (const s of $$("section.view")) s.hidden = s.dataset.view !== view;
  for (const a of $$(".nav a, .tabbar a")) {
    const on = a.dataset.view === view;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  $("#page-title").textContent = VIEWS[view].title;
  $("#page-sub").textContent = VIEWS[view].sub;
  document.title = `${VIEWS[view].title} · CoTa Warehouse`;
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

// ---------- connection indicator ----------
function showConnection() {
  for (const c of $$(".conn")) c.classList.toggle("off", !navigator.onLine);
  const label = $(".conn-label");
  if (label) label.textContent = navigator.onLine ? "Online" : "Offline";
}
window.addEventListener("online", showConnection);
window.addEventListener("offline", showConnection);

// ---------- products (shared by Refill + Pick list) ----------
let products = [];
const bySku = (sku) => products.find((p) => p.sku === sku);

// ================= Part 1: inventory =================
function renderInventory(results, q) {
  const cases = results.reduce((n, p) => n + p.totalCases, 0);
  const units = results.reduce((n, p) => n + p.totalUnits, 0);
  const locs = new Set(results.flatMap((p) => p.locations.map((l) => l.location))).size;
  $("#inv-stats").innerHTML = [
    ["Products", results.length],
    ["Storage locations", locs],
    ["Cases in storage", cases],
    ["Units in storage", units],
  ]
    .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v.toLocaleString()}</b></div>`)
    .join("");
  $("#inv-count").textContent = q ? `${plural(results.length, "match")} for “${q}”` : `${plural(results.length, "product")}`;

  if (!results.length) {
    $("#inv-table").innerHTML = emptyState("No matching product", "Check the SKU or try part of the product name.");
    return;
  }
  const rows = results
    .map((p) => {
      const chips = p.locations.length
        ? p.locations
            .map((l) => `<span class="chip"><span class="loc">${esc(l.location)}</span><b>${plural(l.cases, "case")}</b><small>${l.units} u</small></span>`)
            .join("")
        : `<span class="muted">No cases in storage</span>`;
      return `<tr>
        <td class="cell-sku mono">${esc(p.sku)}</td>
        <td class="cell-name product-name">${esc(p.name)}</td>
        <td class="cell-upc num" data-label="Units/case">${p.unitsPerCase}</td>
        <td class="cell-locs"><div class="chips">${chips}</div></td>
        <td class="num strong" data-label="Total cases">${p.totalCases}</td>
        <td class="num strong" data-label="Total units">${p.totalUnits}</td>
      </tr>`;
    })
    .join("");
  $("#inv-table").innerHTML = `<table class="table">
    <thead><tr><th>SKU</th><th>Product</th><th class="num">Units / case</th><th>Locations (cases)</th><th class="num">Total cases</th><th class="num">Total units</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

let searchTimer;
async function runSearch() {
  const q = $("#q").value.trim();
  try {
    const data = await api(`/api/products?q=${encodeURIComponent(q)}`);
    renderInventory(data.results, q);
  } catch (e) {
    $("#inv-table").innerHTML = `<div class="panel-body">${errorNote(e.message)}</div>`;
  }
}
$("#search-form").addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(searchTimer); runSearch(); });
$("#q").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 200); });

// ================= Part 2: shelf refill =================
function showStorageFor(p) {
  $("#refill-storage").innerHTML = p
    ? `<h3>In storage</h3><div class="chips">${
        p.locations.map((l) => `<span class="chip"><span class="loc">${esc(l.location)}</span><b>${plural(l.cases, "case")}</b></span>`).join("") ||
        `<span class="muted">No cases in storage</span>`
      }</div><p class="muted" style="margin:8px 0 0">${p.unitsPerCase} units per case</p>`
    : "";
}

function selectRefillProduct() {
  const p = bySku($("#refill-sku").value);
  $("#capacity").value = p?.openShelf?.capacity ?? "";
  $("#current").value = p?.openShelf?.current ?? "";
  showStorageFor(p);
  calculateRefill();
}

function gauge(capacity, current, added) {
  const pct = (n) => `${Math.max(0, Math.min(100, (n / capacity) * 100))}%`;
  return `<div class="gauge">
    <div class="gauge-bar"><i style="width:${pct(current + added)}" class="add"></i><i style="width:${pct(current)}"></i></div>
    <div class="gauge-legend"><span class="key">On shelf ${current}</span><span class="key add">Added ${added}</span><span>Capacity ${capacity}</span></div>
  </div>`;
}

function pullFromText(pullFrom) {
  if (!pullFrom.length) return "";
  return `<p class="from">Take ${pullFrom.length > 1 ? "them" : "all"} from ${pullFrom
    .map((p) => `<span class="loc">${esc(p.location)}</span> (${plural(p.cases, "case")})`)
    .join(", then ")}.</p>`;
}

function renderRefill({ plan, product, input, pullFrom }) {
  const upc = product.unitsPerCase;
  const { capacity, current } = input;

  if (plan.casesToPull === 0) {
    return `<p class="headline">Shelf is full</p><p class="muted">${current} of ${capacity} units. Nothing to pull.</p>${gauge(capacity, current, 0)}`;
  }

  if (plan.storageShortfall) {
    const s = plan.storageShortfall;
    return `
      <p class="headline">Pull ${plural(s.casesAvailable, "case")}: all that is in storage</p>
      <p class="muted">${esc(product.sku)} · ${esc(product.name)}</p>
      <div class="facts">
        <div class="fact"><b>${plan.unitsNeeded}</b><span>units needed</span></div>
        <div class="fact"><b>${s.casesAvailable}</b><span>cases in storage</span></div>
        <div class="fact"><b>${s.casesAvailable * upc}</b><span>units pulled</span></div>
      </div>
      ${gauge(capacity, current, s.casesAvailable * upc)}
      ${pullFromText(pullFrom)}
      <div class="note bad"><strong>Not enough stock to fill the shelf.</strong>
        <p>Filling needs ${plural(plan.casesToPull, "case")}; storage has ${s.casesAvailable}. The shelf will reach ${s.shelfAfter} of ${capacity} units. Tell your supervisor so a restock can be ordered.</p>
      </div>`;
  }

  let consequence = `<div class="note ok"><strong>Exact fit.</strong><p>${plural(plan.casesToPull, "case")} × ${upc} = ${plan.unitsPulled} units fills the shelf to ${capacity}. Nothing left over.</p></div>`;
  if (plan.leftoverUnits) {
    const alt = plan.alternative;
    consequence = `
      <div class="note warn">
        <strong>${plural(plan.leftoverUnits, "unit")} will not fit on the shelf</strong>
        <p>Storage only moves full cases of ${upc}. ${plural(plan.casesToPull, "case")} = ${plan.unitsPulled} units, but the shelf only has room for ${plan.unitsNeeded}, so the last case is opened and ${plural(plan.leftoverUnits, "unit")} stay in it.</p>
        <p>An open case cannot go back into storage as a full case. Put it in the overflow spot by the shelf, label it “${esc(product.sku)} · ${plan.leftoverUnits} units”, and use it first at the next refill so the stock count stays right.</p>
      </div>
      ${alt.casesToPull > 0 ? `<div class="note"><strong>If an open case is not allowed</strong>
        <p>Pull ${plural(alt.casesToPull, "case")} (${alt.unitsPulled} units) instead. The shelf reaches ${alt.shelfAfter} of ${capacity}, ${plural(alt.unitsShort, "unit")} short, with nothing left over.</p>
      </div>` : ""}`;
  }

  return `
    <p class="headline">Pull ${plural(plan.casesToPull, "case")} of ${esc(product.sku)}</p>
    <p class="muted">${esc(product.name)} · ${current} of ${capacity} units on the shelf now</p>
    <div class="facts">
      <div class="fact"><b>${plan.unitsNeeded}</b><span>units needed</span></div>
      <div class="fact"><b>${plan.casesToPull}</b><span>full cases</span></div>
      <div class="fact"><b>${plan.unitsPulled}</b><span>units pulled</span></div>
    </div>
    ${gauge(capacity, current, plan.unitsNeeded)}
    ${pullFromText(pullFrom)}
    ${consequence}`;
}

let refillTimer;
async function calculateRefill() {
  const out = $("#refill-result");
  const cap = $("#capacity").value.trim();
  const cur = $("#current").value.trim();
  if (!cap || !cur) {
    out.innerHTML = emptyState("Enter the shelf figures", "Shelf capacity and units on the shelf now.");
    return;
  }
  const params = new URLSearchParams({ sku: $("#refill-sku").value, capacity: cap, current: cur });
  try {
    out.innerHTML = renderRefill(await api(`/api/replenish?${params}`));
  } catch (err) {
    out.innerHTML = errorNote(err.message);
  }
}
$("#refill-sku").addEventListener("change", selectRefillProduct);
$("#refill-form").addEventListener("input", (e) => {
  if (e.target.id === "refill-sku") return;
  clearTimeout(refillTimer);
  refillTimer = setTimeout(calculateRefill, 250);
});
$("#refill-form").addEventListener("submit", (e) => { e.preventDefault(); calculateRefill(); });

// ================= Part 3: pick list =================
function addLine(sku = "", cases = "") {
  const div = document.createElement("div");
  div.className = "pick-line";
  div.innerHTML = `
    <select aria-label="SKU" required>
      <option value="">Choose SKU</option>
      ${products.map((p) => `<option value="${esc(p.sku)}"${p.sku === sku ? " selected" : ""}>${esc(p.sku)}</option>`).join("")}
    </select>
    <input type="number" aria-label="Cases" inputmode="numeric" min="1" step="1" required value="${esc(cases)}" placeholder="0">
    <button type="button" class="btn icon" aria-label="Remove line">${icon("x")}</button>`;
  div.querySelector("button").addEventListener("click", () => {
    div.remove();
    if (!$("#pick-lines").children.length) addLine();
  });
  $("#pick-lines").append(div);
}

function resetPickResult() {
  $("#pick-result").innerHTML = emptyState("No pick list yet", "Add the order lines and press Build pick list.");
  $("#print").hidden = true;
}

$("#add-line").addEventListener("click", () => addLine());
$("#load-example").addEventListener("click", () => {
  $("#pick-lines").innerHTML = "";
  addLine("TURTLE-01", 3);
  addLine("SHARK-02", 2);
  addLine("ALIEN-04", 1);
  resetPickResult();
});
$("#print").addEventListener("click", () => window.print());

function renderPickList(d) {
  const status = d.complete
    ? `<div class="note ok"><strong>Ready to pick</strong><p>${plural(d.totalCases, "case")} · ${d.totalUnits} units · ${plural(d.picks.length, "stop")}</p></div>`
    : `<div class="note bad" role="alert">
        <strong>This order cannot be filled in full</strong>
        <ul>${d.problems.map((p) => `<li>${esc(p.message)}</li>`).join("")}</ul>
        ${d.picks.length ? "<p>The route below picks what is in stock. Do not ship the order as complete; check with your supervisor first.</p>" : ""}
      </div>`;
  if (!d.picks.length) return status;

  const short = Object.fromEntries(d.lines.filter((l) => l.short > 0).map((l) => [l.sku, l]));
  const items = d.picks
    .map((p) => `
      <li class="${short[p.sku] ? "short" : ""}">
        <span class="seq">${p.sequence}</span>
        <span class="what"><span class="loc">${esc(p.location)}</span><span class="name">${esc(p.sku)} · ${esc(p.name)}</span></span>
        <span class="qty">${short[p.sku] ? `${p.cases} of ${short[p.sku].requested} cases` : plural(p.cases, "case")}<small>${p.units} units</small></span>
      </li>`)
    .join("");
  const aisles = [...new Set(d.picks.map((p) => p.location.split("-")[0]))].join(" → ");
  return `${status}
    <ol class="route-list">${items}</ol>
    <div class="route-foot"><span>Walk <b>${esc(aisles)}</b>, one way, no backtracking</span><span><b>${d.totalCases}</b> cases · <b>${d.totalUnits}</b> units</span></div>`;
}

$("#pick-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const lines = $$(".pick-line").map((row) => ({
    sku: row.querySelector("select").value,
    cases: Number(row.querySelector("input").value),
  }));
  try {
    const d = await api("/api/picklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines }) });
    $("#pick-result").innerHTML = renderPickList(d);
    $("#print").hidden = !d.picks.length;
    if (matchMedia("(max-width: 900px)").matches) $("#pick-result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    $("#pick-result").innerHTML = errorNote(err.message);
    $("#print").hidden = true;
  }
});

// ---------- start ----------
(async () => {
  route();
  showConnection();
  resetPickResult();
  try {
    products = (await api("/api/products")).results;
    renderInventory(products, "");
    $("#refill-sku").innerHTML = products.map((p) => `<option value="${esc(p.sku)}">${esc(p.sku)} · ${esc(p.name)}</option>`).join("");
    // Open on a product that already has shelf figures stored, if there is one.
    const withShelf = products.find((p) => p.openShelf);
    if (withShelf) $("#refill-sku").value = withShelf.sku;
    selectRefillProduct();
    addLine();
  } catch (e) {
    $("#inv-table").innerHTML = `<div class="panel-body">${errorNote(e.message)}</div>`;
  }
})();
