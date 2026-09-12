/* ============================================================
   CarbonLens demo — client-side "calc engine" + "rule library"
   All numbers are illustrative, matching the HackOut'26 deck.
   ============================================================ */

// ---- Emission factors (cited: CEA · IPCC · DEFRA) ----
const FACTORS = {
  grid:    { label: "Grid electricity", unit: "kWh",  factor: 0.716, scope: 2, alt: "Rooftop solar, VFDs, LED" },
  diesel:  { label: "Diesel generator", unit: "L",    factor: 2.68,  scope: 1, alt: "Battery storage" },
  coal:    { label: "Coal-fired boiler",unit: "t",    factor: 2420,  scope: 1, alt: "Biomass pellets, heat recovery" },
  steel:   { label: "Steel (virgin)",   unit: "t",    factor: 1850,  scope: 3, alt: "Recycled steel (~600 kg factor)" },
  cement:  { label: "Cement",           unit: "t",    factor: 900,   scope: 3, alt: "Fly-ash / GGBS blend" },
  freight: { label: "Road freight",     unit: "t·km", factor: 0.105, scope: 3, alt: "Load consolidation, rail" },
  waste:   { label: "Organic waste → landfill", unit: "t", factor: 580, scope: 3, alt: "Biogas / compost (credit)" }
};

// ---- Presets (pre-fill so the demo never starts blank) ----
const PRESETS = {
  textile: { grid: 386000, diesel: 55000, coal: 441, steel: 70, cement: 0, freight: 1050000, waste: 191 },
  foundry: { grid: 210000, diesel: 12000, coal: 620, steel: 340, cement: 40, freight: 480000, waste: 25 },
  food:    { grid: 480000, diesel: 8000,  coal: 60,  steel: 8,   cement: 0,  freight: 900000, waste: 410 }
};

// ---- Rule library (a slice of the 12-rule starter library) ----
const RULES = [
  {
    id: "biomass_boiler",
    targets: "coal",
    firesIf: (t) => t.coal.share >= 0.15,
    type: "Substitute",
    title: "Replace coal boiler with biomass pellet boiler",
    why: "Swapping coal for compressed biomass pellets cuts the boiler's emission factor by roughly three quarters while reusing the existing furnace with minor retrofits.",
    capexL: 18.5, savedL: 9.2, co2Cut: 790, paybackMo: 24, confidence: "High",
    source: "MNRE Biomass Programme 2024"
  },
  {
    id: "rooftop_solar",
    targets: "grid",
    firesIf: (t) => t.grid.share >= 0.10,
    type: "Substitute",
    title: "Install 150 kWp rooftop solar",
    why: "A rooftop array sized to daytime load offsets grid draw directly, with no process change needed on the shop floor.",
    capexL: 60, savedL: 11, co2Cut: 165, paybackMo: 65, confidence: "High",
    source: "CEA Grid Emission Factor 2024"
  },
  {
    id: "water_reuse",
    targets: "waste",
    firesIf: (t) => t.waste.qty > 0,
    type: "Loop",
    title: "Closed-loop water reuse system",
    why: "Recycling process water back into the wash/dye cycle cuts fresh-water draw and the treatment load that generates fugitive emissions.",
    capexL: 3, savedL: 2.1, co2Cut: 92, paybackMo: 17, confidence: "Medium",
    source: "CII Water Stewardship Guide"
  },
  {
    id: "recycled_steel",
    targets: "steel",
    firesIf: (t) => t.steel.share >= 0.05,
    type: "Substitute",
    title: "Shift 50% of steel intake to recycled stock",
    why: "Recycled steel carries roughly a third of the embodied-carbon factor of virgin steel, with no change to downstream processing.",
    capexL: 1.5, savedL: 1.4, co2Cut: 58, paybackMo: 13, confidence: "Medium",
    source: "IPCC Industrial Processes AR6"
  },
  {
    id: "load_consolidation",
    targets: "freight",
    firesIf: (t) => t.freight.share >= 0.04,
    type: "Optimise",
    title: "Consolidate outbound freight loads",
    why: "Batching dispatches and improving truck fill-rate cuts empty-running kilometres without adding fleet.",
    capexL: 0.4, savedL: 1.1, co2Cut: 22, paybackMo: 4, confidence: "High",
    source: "DEFRA Freight Emission Factors 2024"
  }
];

// ---- App state ----
let inputs = { ...PRESETS.textile };
let sources = [];      // computed per-source tCO2e, sorted desc
let totalT = 0;
let firedRules = [];   // rules that fired for current sources
let selectedRuleIds = new Set(["biomass_boiler", "rooftop_solar", "water_reuse"]); // pre-ticked, matches deck example

// ---------------- Tab handling ----------------
const tabOrder = ["input", "hotspots", "actions", "report"];
function showTab(name) {
  tabOrder.forEach(t => {
    document.getElementById("tab-" + t).style.display = (t === name) ? "block" : "none";
  });
  document.querySelectorAll("#tabbar button").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.getElementById("tabbar").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  showTab(btn.dataset.tab);
});
document.querySelectorAll("[data-goto]").forEach(el => {
  el.addEventListener("click", () => showTab(el.dataset.goto));
});

// ---------------- Input screen ----------------
const fieldIds = { grid: "in_grid", diesel: "in_diesel", coal: "in_coal", steel: "in_steel", cement: "in_cement", freight: "in_freight", waste: "in_waste" };

function loadInputsToForm() {
  Object.keys(fieldIds).forEach(k => {
    document.getElementById(fieldIds[k]).value = inputs[k];
  });
}
function readFormToInputs() {
  Object.keys(fieldIds).forEach(k => {
    const v = parseFloat(document.getElementById(fieldIds[k]).value);
    inputs[k] = isNaN(v) ? 0 : v;
  });
}

document.getElementById("presetRow").addEventListener("click", (e) => {
  const chip = e.target.closest(".preset-chip");
  if (!chip) return;
  document.querySelectorAll(".preset-chip").forEach(c => c.classList.remove("active"));
  chip.classList.add("active");
  inputs = { ...PRESETS[chip.dataset.preset] };
  loadInputsToForm();
});

document.getElementById("btnDetect").addEventListener("click", () => {
  readFormToInputs();
  computeHotspots();
  renderHotspots();
  showTab("hotspots");
});

// ---------------- Calc engine ----------------
function computeHotspots() {
  const rows = Object.keys(FACTORS).map(key => {
    const qty = inputs[key] || 0;
    const t = (qty * FACTORS[key].factor) / 1000; // kg -> tonnes
    return { key, label: FACTORS[key].label, unit: FACTORS[key].unit, scope: FACTORS[key].scope, qty, t };
  }).filter(r => r.t > 0);

  totalT = rows.reduce((s, r) => s + r.t, 0);
  rows.forEach(r => r.share = totalT > 0 ? r.t / totalT : 0);
  rows.sort((a, b) => b.t - a.t);
  sources = rows;
}

function renderHotspots() {
  document.getElementById("hsTotal").textContent = totalT.toFixed(0);
  const top = sources[0];
  document.getElementById("hsTopShare").textContent = top ? Math.round(top.share * 100) + "%" : "—";

  const scopeTotals = { 1: 0, 2: 0, 3: 0 };
  sources.forEach(r => scopeTotals[r.scope] += r.t);
  const pct = s => totalT > 0 ? Math.round((scopeTotals[s] / totalT) * 100) : 0;
  document.getElementById("hsScopeSplit").textContent = `${pct(1)}% / ${pct(2)}% / ${pct(3)}%`;

  const barList = document.getElementById("barList");
  barList.innerHTML = "";
  const maxT = sources.length ? sources[0].t : 1;
  sources.forEach(r => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-head">
        <span>${r.label}</span>
        <span class="val">${r.t.toFixed(0)} tCO₂e · ${Math.round(r.share * 100)}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${(r.t / maxT) * 100}%"></div></div>
    `;
    barList.appendChild(row);
  });

  const leak = document.getElementById("leakCallout");
  const leakText = document.getElementById("leakText");
  if (top) {
    leak.style.display = "flex";
    const alt = FACTORS[top.key].alt;
    leakText.innerHTML = `<b>${top.label}</b> = ${top.t.toFixed(0)} tCO₂e (${Math.round(top.share * 100)}% of footprint). ${alt} can cut this source significantly — see the Actions tab.`;
  } else {
    leak.style.display = "none";
  }
}

document.getElementById("btnRecommend").addEventListener("click", () => {
  computeRules();
  renderActions();
  showTab("actions");
});

// ---------------- Recommender ----------------
function computeRules() {
  const byKey = {};
  sources.forEach(r => byKey[r.key] = r);
  // ensure every factor key exists (t=0/share=0 if absent) so firesIf() is safe
  Object.keys(FACTORS).forEach(k => {
    if (!byKey[k]) byKey[k] = { qty: 0, t: 0, share: 0 };
  });

  firedRules = RULES.filter(rule => rule.firesIf(byKey))
                     .sort((a, b) => a.paybackMo - b.paybackMo);
}

function renderActions() {
  const list = document.getElementById("actionList");
  list.innerHTML = "";

  if (firedRules.length === 0) {
    list.innerHTML = `<div class="plan-empty">No rules fired — try raising a source above its threshold on the Input tab (e.g. coal ≥ 15% of footprint).</div>`;
    return;
  }

  firedRules.forEach(rule => {
    const card = document.createElement("div");
    card.className = "action-card";
    const checked = selectedRuleIds.has(rule.id) ? "checked" : "";
    card.innerHTML = `
      <div class="left">
        <span class="type-tag ${rule.type}">${rule.type}</span>
        <h4>${rule.title}</h4>
        <p class="why">${rule.why}</p>
        <div class="stat-grid">
          <div><b>₹${rule.capexL} L</b><span>Capex</span></div>
          <div><b>₹${rule.savedL} L</b><span>Saved / yr</span></div>
          <div><b>−${rule.co2Cut} t</b><span>CO₂e / yr</span></div>
          <div><b>${rule.paybackMo} mo</b><span>Payback</span></div>
        </div>
      </div>
      <div class="toggle-col">
        <input type="checkbox" data-rule="${rule.id}" ${checked}>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedRuleIds.add(cb.dataset.rule);
      else selectedRuleIds.delete(cb.dataset.rule);
    });
  });
}

document.getElementById("btnReport").addEventListener("click", () => {
  renderReport();
  showTab("report");
});

// ---------------- Report ----------------
function renderReport() {
  const chosen = firedRules.filter(r => selectedRuleIds.has(r.id));
  const co2Cut = chosen.reduce((s, r) => s + r.co2Cut, 0);
  const savedL = chosen.reduce((s, r) => s + r.savedL, 0);
  const after = Math.max(totalT - co2Cut, 0);
  const pctCut = totalT > 0 ? Math.round((co2Cut / totalT) * 100) : 0;

  document.getElementById("planCount").textContent = `${chosen.length} fix${chosen.length === 1 ? "" : "es"} selected`;
  document.getElementById("rTco2").textContent = "−" + co2Cut.toFixed(0);
  document.getElementById("rSaved").textContent = "₹" + savedL.toFixed(1) + " L";
  document.getElementById("rPct").textContent = pctCut + "%";

  const maxScale = Math.max(totalT, 1);
  document.getElementById("baBefore").style.width = "100%";
  document.getElementById("baBefore").textContent = totalT.toFixed(0) + " tCO₂e";
  const afterBar = document.getElementById("baAfter");
  afterBar.style.width = Math.max((after / maxScale) * 100, 8) + "%";
  afterBar.textContent = after.toFixed(0) + " tCO₂e";

  const planLines = document.getElementById("planLines");
  if (chosen.length === 0) {
    planLines.innerHTML = `<div class="plan-empty">No fixes selected yet — go back to Actions and tick a few.</div>`;
  } else {
    planLines.innerHTML = chosen.map(r => `
      <div class="plan-line">
        <span>${r.title}</span>
        <span>₹${r.capexL} L capex · ₹${r.savedL} L/yr saved · −${r.co2Cut} t/yr</span>
      </div>
    `).join("");
  }
}

document.getElementById("btnExport").addEventListener("click", () => {
  window.print();
});

// ---------------- Init ----------------
loadInputsToForm();
computeHotspots();
renderHotspots();
computeRules();
renderActions();
renderReport();
