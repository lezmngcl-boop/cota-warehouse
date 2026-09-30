// Screen logic only. All stock rules live on the server (src/logic.js).

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

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

const errorBox = (message) => `<div class="note bad" role="alert"><strong>${esc(message)}</strong></div>`;

// ---------- tabs ----------
const tabs = ["search", "refill", "pick"];
function showTab(name) {
  for (const t of tabs) {
    $(`#tab-${t}`).setAttribute("aria-selected", String(t === name));
    $(`#panel-${t}`).hidden = t !== name;
  }
  try { localStorage.setItem("cota-tab", name); } catch {}
}
for (const t of tabs) $(`#tab-${t}`).addEventListener("click", () => showTab(t));

// ---------- product list (shared by Refill + Pick) ----------
let products = [];
async function loadProducts() {
  products = (await api("/api/products")).results;
  const options = products.map((p) => `<option value="${esc(p.sku)}">${esc(p.sku)} · ${esc(p.name)}</option>`).join("");
  $("#refill-sku").innerHTML = options;
  // Open on a product that already has shelf figures stored, if there is one.
  const withShelf = products.find((p) => p.openShelf);
  if (withShelf) $("#refill-sku").value = withShelf.sku;
  fillShelfDefaults();
}

// ---------- Part 1: search ----------
function productCard(p) {
  const rows = p.locations
    .map((l) => `<tr><td class="loc">${esc(l.location)}</td><td class="num">${l.cases}</td><td class="num">${l.units}</td></tr>`)
    .join("");
  return `
    <article class="card">
      <div class="card-head">
        <div><h2>${esc(p.sku)}</h2><p class="sub">${esc(p.name)}</p></div>
        <span class="tag">${p.unitsPerCase} units / case</span>
      </div>
      ${p.locations.length ? `
      <table>
        <thead><tr><th>Location</th><th class="num">Cases</th><th class="num">Units</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${p.totalCases}</td><td class="num">${p.totalUnits}</td></tr></tfoot>
      </table>` : `<div class="note warn"><strong>No cases in storage.</strong></div>`}
    </article>`;
}

let searchTimer;
async function runSearch() {
  const q = $("#q").value.trim();
  const out = $("#search-results");
  try {
    const data = await api(`/api/products?q=${encodeURIComponent(q)}`);
    out.innerHTML = data.results.length
      ? data.results.map(productCard).join("")
      : `<p class="empty">No product matches “${esc(q)}”. Check the SKU or try part of the name.</p>`;
  } catch (e) {
    out.innerHTML = errorBox(e.message);
  }
}
$("#search-form").addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(searchTimer); runSearch(); });
$("#q").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); });

// ---------- Part 2: refill ----------
function fillShelfDefaults() {
  const p = products.find((x) => x.sku === $("#refill-sku").value);
  $("#capacity").value = p?.openShelf?.capacity ?? "";
  $("#current").value = p?.openShelf?.current ?? "";
  $("#refill-result").innerHTML = "";
}
$("#refill-sku").addEventListener("change", fillShelfDefaults);

function pullFromList(pullFrom) {
  if (!pullFrom.length) return "";
  return `<p class="from">Take them from ${pullFrom.map((p) => `<span class="loc">${esc(p.location)}</span> (${plural(p.cases, "case")})`).join(", then ")}.</p>`;
}

function renderRefill(d) {
  const { plan, product, input, pullFrom } = d;
  const upc = product.unitsPerCase;
  if (!plan.ok) return errorBox(plan.errors.join(" "));
  if (plan.casesToPull === 0) return `<div class="card"><p class="big">Shelf is full</p><p class="sub">${input.current} of ${input.capacity} units on the shelf. Nothing to pull.</p></div>`;

  const facts = `
    <div class="facts">
      <div class="fact"><b>${plan.unitsNeeded}</b><span>units needed</span></div>
      <div class="fact"><b>${plan.casesToPull}</b><span>full cases</span></div>
      <div class="fact"><b>${plan.unitsPulled}</b><span>units pulled</span></div>
    </div>`;

  if (plan.storageShortfall) {
    const s = plan.storageShortfall;
    return `<div class="card">
      <p class="big">Pull ${plural(s.casesAvailable, "case")}: all that storage has</p>
      <div class="facts">
        <div class="fact"><b>${plan.unitsNeeded}</b><span>units needed</span></div>
        <div class="fact"><b>${s.casesAvailable}</b><span>cases in storage</span></div>
        <div class="fact"><b>${s.casesAvailable * upc}</b><span>units pulled</span></div>
      </div>
      <div class="note bad">
        <strong>Not enough ${esc(product.sku)} in storage to fill the shelf.</strong>
        <p>Filling needs ${plural(plan.casesToPull, "case")}; storage has ${s.casesAvailable}. The shelf will reach ${s.shelfAfter} of ${input.capacity} units.
        Tell your supervisor so a restock can be ordered.</p>
      </div>
      ${pullFromList(pullFrom)}
    </div>`;
  }

  let consequence = `<div class="note ok"><strong>Exact fit.</strong><p>${plural(plan.casesToPull, "case")} × ${upc} = ${plan.unitsPulled} units fills the shelf to ${input.capacity} with nothing left over.</p></div>`;
  if (plan.leftoverUnits) {
    const alt = plan.alternative;
    consequence = `
      <div class="note warn">
        <strong>${plural(plan.leftoverUnits, "unit")} will not fit on the shelf.</strong>
        <p>Storage only moves full cases of ${upc}. ${plural(plan.casesToPull, "case")} = ${plan.unitsPulled} units, but the shelf only has room for ${plan.unitsNeeded}.
        The last case is opened and ${plural(plan.leftoverUnits, "unit")} stay in it.</p>
        <p>That open case cannot go back into storage as a full case. Put it in the overflow spot next to the shelf, label it
        “${esc(product.sku)} · ${plan.leftoverUnits} units”, and use it first at the next refill, so the stock count stays right.</p>
      </div>
      ${alt.casesToPull > 0 ? `<div class="note">
        <strong>If an open case is not allowed:</strong>
        <p>Pull ${plural(alt.casesToPull, "case")} (${alt.unitsPulled} units) instead. The shelf reaches ${alt.shelfAfter} of ${input.capacity}, ${plural(alt.unitsShort, "unit")} short, and nothing is left over.</p>
      </div>` : ""}`;
  }

  return `<div class="card">
    <p class="big">Pull ${plural(plan.casesToPull, "case")} of ${esc(product.sku)}</p>
    <p class="sub">${esc(product.name)} · shelf ${input.current} of ${input.capacity} units now</p>
    ${facts}
    ${pullFromList(pullFrom)}
    ${consequence}
  </div>`;
}

$("#refill-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const params = new URLSearchParams({
    sku: $("#refill-sku").value,
    capacity: $("#capacity").value,
    current: $("#current").value,
  });
  try {
    $("#refill-result").innerHTML = renderRefill(await api(`/api/replenish?${params}`));
  } catch (err) {
    $("#refill-result").innerHTML = errorBox(err.message);
  }
});

// ---------- Part 3: pick list ----------
function addLine(sku = "", cases = "") {
  const div = document.createElement("div");
  div.className = "pick-line";
  div.innerHTML = `
    <select aria-label="Product" required>
      <option value="">Choose…</option>
      ${products.map((p) => `<option value="${esc(p.sku)}"${p.sku === sku ? " selected" : ""}>${esc(p.sku)}</option>`).join("")}
    </select>
    <input type="number" aria-label="Cases" inputmode="numeric" min="1" step="1" required value="${esc(cases)}">
    <button type="button" class="icon" aria-label="Remove line"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>`;
  div.querySelector("button").addEventListener("click", () => {
    div.remove();
    if (!$("#pick-lines").children.length) addLine();
  });
  $("#pick-lines").append(div);
}
$("#add-line").addEventListener("click", () => addLine());
$("#load-example").addEventListener("click", () => {
  $("#pick-lines").innerHTML = "";
  addLine("TURTLE-01", 3);
  addLine("SHARK-02", 2);
  addLine("ALIEN-04", 1);
  $("#pick-result").innerHTML = "";
});

function renderPickList(d) {
  const status = d.complete
    ? `<div class="note ok"><strong>Ready to pick: ${plural(d.totalCases, "case")}, ${d.totalUnits} units.</strong></div>`
    : `<div class="note bad" role="alert">
        <strong>This order cannot be filled in full. Do not ship it as complete.</strong>
        <ul>${d.problems.map((p) => `<li>${esc(p.message)}</li>`).join("")}</ul>
        ${d.picks.length ? "<p>The list below picks what is in stock. Check with your supervisor before sending a partial order.</p>" : ""}
      </div>`;
  if (!d.picks.length) return `<div class="card">${status}</div>`;

  const shortBySku = Object.fromEntries(d.lines.filter((l) => l.short > 0).map((l) => [l.sku, l]));
  const items = d.picks
    .map((p) => `
      <li class="${shortBySku[p.sku] ? "short" : ""}">
        <span class="seq">${p.sequence}</span>
        <span class="what"><span class="loc">${esc(p.location)}</span><span class="name">${esc(p.sku)} · ${esc(p.name)}</span></span>
        <span class="qty">${shortBySku[p.sku] ? `${p.cases} of ${shortBySku[p.sku].requested} cases` : plural(p.cases, "case")}<small>${p.units} units</small></span>
      </li>`)
    .join("");
  const route = [...new Set(d.picks.map((p) => p.location.split("-")[0]))].join(" → ");
  return `<div class="card">
    ${status}
    <ol class="picks">${items}</ol>
    <p class="route">Walk: ${esc(route)}, one way, no backtracking.</p>
  </div>`;
}

$("#pick-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const lines = [...document.querySelectorAll(".pick-line")].map((row) => ({
    sku: row.querySelector("select").value,
    cases: Number(row.querySelector("input").value),
  }));
  try {
    $("#pick-result").innerHTML = renderPickList(
      await api("/api/picklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines }) })
    );
  } catch (err) {
    $("#pick-result").innerHTML = errorBox(err.message);
  }
});

// ---------- start ----------
(async () => {
  let saved;
  try { saved = localStorage.getItem("cota-tab"); } catch {}
  showTab(tabs.includes(saved) ? saved : "search");
  try {
    await loadProducts();
    addLine();
    runSearch();
  } catch (e) {
    $("#search-results").innerHTML = errorBox(e.message);
  }
})();
