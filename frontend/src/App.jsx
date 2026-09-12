import { useMemo, useState } from 'react';

const FACTORS = {
  grid: { label: 'Grid electricity', unit: 'kWh', factor: 0.716, scope: 2, alt: 'Rooftop solar, VFDs, LED' },
  diesel: { label: 'Diesel generator', unit: 'L', factor: 2.68, scope: 1, alt: 'Battery storage' },
  coal: { label: 'Coal-fired boiler', unit: 't', factor: 2420, scope: 1, alt: 'Biomass pellets, heat recovery' },
  steel: { label: 'Steel (virgin)', unit: 't', factor: 1850, scope: 3, alt: 'Recycled steel (~600 kg factor)' },
  cement: { label: 'Cement', unit: 't', factor: 900, scope: 3, alt: 'Fly-ash / GGBS blend' },
  freight: { label: 'Road freight', unit: 't·km', factor: 0.105, scope: 3, alt: 'Load consolidation, rail' },
  waste: { label: 'Organic waste → landfill', unit: 't', factor: 580, scope: 3, alt: 'Biogas / compost (credit)' },
};

const PRESETS = {
  textile: { grid: 386000, diesel: 55000, coal: 441, steel: 70, cement: 0, freight: 1050000, waste: 191 },
  foundry: { grid: 210000, diesel: 12000, coal: 620, steel: 340, cement: 40, freight: 480000, waste: 25 },
  food: { grid: 480000, diesel: 8000, coal: 60, steel: 8, cement: 0, freight: 900000, waste: 410 },
};

const RULES = [
  {
    id: 'biomass_boiler',
    targets: 'coal',
    firesIf: (t) => t.coal.share >= 0.15,
    type: 'Substitute',
    title: 'Replace coal boiler with biomass pellet boiler',
    why: 'Swapping coal for compressed biomass pellets cuts the boiler\'s emission factor by roughly three quarters while reusing the existing furnace with minor retrofits.',
    capexL: 18.5,
    savedL: 9.2,
    co2Cut: 790,
    paybackMo: 24,
    confidence: 'High',
    source: 'MNRE Biomass Programme 2024',
  },
  {
    id: 'rooftop_solar',
    targets: 'grid',
    firesIf: (t) => t.grid.share >= 0.1,
    type: 'Substitute',
    title: 'Install 150 kWp rooftop solar',
    why: 'A rooftop array sized to daytime load offsets grid draw directly, with no process change needed on the shop floor.',
    capexL: 60,
    savedL: 11,
    co2Cut: 165,
    paybackMo: 65,
    confidence: 'High',
    source: 'CEA Grid Emission Factor 2024',
  },
  {
    id: 'water_reuse',
    targets: 'waste',
    firesIf: (t) => t.waste.qty > 0,
    type: 'Loop',
    title: 'Closed-loop water reuse system',
    why: 'Recycling process water back into the wash/dye cycle cuts fresh-water draw and the treatment load that generates fugitive emissions.',
    capexL: 3,
    savedL: 2.1,
    co2Cut: 92,
    paybackMo: 17,
    confidence: 'Medium',
    source: 'CII Water Stewardship Guide',
  },
  {
    id: 'recycled_steel',
    targets: 'steel',
    firesIf: (t) => t.steel.share >= 0.05,
    type: 'Substitute',
    title: 'Shift 50% of steel intake to recycled stock',
    why: 'Recycled steel carries roughly a third of the embodied-carbon factor of virgin steel, with no change to downstream processing.',
    capexL: 1.5,
    savedL: 1.4,
    co2Cut: 58,
    paybackMo: 13,
    confidence: 'Medium',
    source: 'IPCC Industrial Processes AR6',
  },
  {
    id: 'load_consolidation',
    targets: 'freight',
    firesIf: (t) => t.freight.share >= 0.04,
    type: 'Optimise',
    title: 'Consolidate outbound freight loads',
    why: 'Batching dispatches and improving truck fill-rate cuts empty-running kilometres without adding fleet.',
    capexL: 0.4,
    savedL: 1.1,
    co2Cut: 22,
    paybackMo: 4,
    confidence: 'High',
    source: 'DEFRA Freight Emission Factors 2024',
  },
];

const fieldDefinitions = [
  { key: 'grid', label: 'Grid electricity', sub: 'Scope 2 · billed units', unit: 'kWh / yr' },
  { key: 'diesel', label: 'Diesel generator', sub: 'Scope 1 · backup power', unit: 'litres / yr' },
  { key: 'coal', label: 'Coal-fired boiler', sub: 'Scope 1 · process heat', unit: 'tonnes / yr' },
  { key: 'steel', label: 'Steel (virgin)', sub: 'Scope 3 · purchased', unit: 'tonnes / yr' },
  { key: 'cement', label: 'Cement', sub: 'Scope 3 · purchased', unit: 'tonnes / yr' },
  { key: 'freight', label: 'Road freight', sub: 'Scope 3 · inbound + outbound', unit: 't·km / yr' },
  { key: 'waste', label: 'Organic waste → landfill', sub: 'Scope 3 · untreated', unit: 'tonnes / yr' },
];

const tabOrder = ['input', 'hotspots', 'actions', 'report'];

const getHotspotSummary = (currentInputs) => {
  const rows = Object.entries(FACTORS)
    .map(([key, value]) => {
      const qty = currentInputs[key] || 0;
      const t = (qty * value.factor) / 1000;
      return { key, label: value.label, unit: value.unit, scope: value.scope, qty, t };
    })
    .filter((row) => row.t > 0);

  const totalT = rows.reduce((sum, row) => sum + row.t, 0);
  const sources = rows
    .map((row) => ({ ...row, share: totalT > 0 ? row.t / totalT : 0 }))
    .sort((a, b) => b.t - a.t);

  return { totalT, sources };
};

const getFiredRules = (sources) => {
  const byKey = {};
  sources.forEach((source) => {
    byKey[source.key] = source;
  });

  Object.keys(FACTORS).forEach((key) => {
    if (!byKey[key]) {
      byKey[key] = { qty: 0, t: 0, share: 0 };
    }
  });

  return RULES.filter((rule) => rule.firesIf(byKey)).sort((a, b) => a.paybackMo - b.paybackMo);
};

function LandingPage({ onOpenDemo }) {
  return (
    <>
      <nav className="topnav">
        <div className="wrap">
          <div className="brand">
            <span className="dot"></span> CarbonLens
          </div>
          <div className="navlinks">
            <a href="#problem">Problem</a>
            <a href="#solution">Solution</a>
            <a href="#how">How it works</a>
            <a href="#impact">Impact</a>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onOpenDemo}>Try the demo →</button>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap">
          <div className="eyebrow">HackOut'26 · Circular Carbon Ecosystem · Team Nebula Nuke</div>
          <h1 className="hero-title">
            Find where a factory&apos;s <span>carbon leaks.</span>
            <br />
            Fix it for less than it costs.
          </h1>
          <p className="hero-sub">
            CarbonLens is an industrial emission leak-point detector and circular alternative recommender — built for MSMEs with no ESG team, no measured data, and no budget for consultants.
          </p>
          <div className="hero-ctas">
            <button className="btn btn-primary" onClick={onOpenDemo}>Launch interactive demo →</button>
            <a className="btn btn-ghost" href="#solution">See how it works</a>
          </div>
          <div className="hero-strip">
            <div className="metric-pill">
              <b>3 screens</b>
              <span>input → hotspots → actions</span>
            </div>
            <div className="metric-pill">
              <b>2 numbers</b>
              <span>₹ saved + tCO₂e cut per fix</span>
            </div>
            <div className="metric-pill">
              <b>0 black boxes</b>
              <span>cited factors, explainable rules</span>
            </div>
          </div>
        </div>
      </header>

      <section id="problem">
        <div className="wrap">
          <div className="section-head">
            <div className="section-tag">01 · Problem &amp; users</div>
            <h2>Small factories can&apos;t see their own carbon.</h2>
            <p className="section-desc">
              Buyers, banks and regulators now ask MSMEs for a carbon number. Emissions stay invisible, and circular options are never evaluated because nobody can put a cost on them.
            </p>
          </div>
          <div className="grid-3">
            <div className="card">
              <h3>6.3 Cr</h3>
              <p>MSMEs in India; over 90% have never measured emissions.</p>
            </div>
            <div className="card">
              <h3>Scope 3</h3>
              <p>Large buyers must now report supplier emissions under BRSR.</p>
            </div>
            <div className="card">
              <h3>₹0</h3>
              <p>Typical SME budget for sustainability consulting.</p>
            </div>
          </div>
          <div className="grid-3" style={{ marginTop: '18px' }}>
            <div className="card">
              <span className="tag">SMEs &amp; operators</span>
              <h3>Get a footprint fast</h3>
              <p>A footprint number and a 3-action plan in 10 minutes — plain language, ₹ lakh units, works on a phone.</p>
            </div>
            <div className="card">
              <span className="tag">Consultants</span>
              <h3>Serve 10× more clients</h3>
              <p>Export a methodology-backed report per site instead of building one from scratch.</p>
            </div>
            <div className="card">
              <span className="tag">Regulators &amp; buyers</span>
              <h3>Onboard a supplier base</h3>
              <p>GHG-Protocol-aligned, auditable numbers for Scope 3 reporting.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="solution">
        <div className="wrap">
          <div className="section-head">
            <div className="section-tag">02 · Solution</div>
            <h2>Three steps. Two numbers. One plan.</h2>
            <p className="section-desc">Input what you burn, buy and throw away → detect the leak point → fix it with costed circular interventions.</p>
          </div>
          <div className="grid-3">
            <div className="card">
              <span className="tag">1 · Input</span>
              <h3>What you burn, buy, throw away</h3>
              <p>3 short screens with presets for textile, foundry and food, so the demo never starts blank.</p>
            </div>
            <div className="card">
              <span className="tag">2 · Detect</span>
              <h3>Every source ranked</h3>
              <p>Sources ranked by tCO₂e. One chart makes the leak point obvious — usually a single boiler or grid power.</p>
            </div>
            <div className="card">
              <span className="tag">3 · Fix</span>
              <h3>Costed circular interventions</h3>
              <p>Sorted by payback. Add to plan for a before/after footprint, ₹ total, and an exportable report.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how">
        <div className="wrap">
          <div className="section-head">
            <div className="section-tag">03 · How it works</div>
            <h2>Rules for the numbers, AI for the words.</h2>
            <p className="section-desc">Rules compute every ₹ and tCO₂e figure, so numbers stay auditable and explainable to a regulator. The LLM only writes the plain-language &quot;why it works&quot; notes.</p>
          </div>
          <div className="pipeline">
            <div className="pipe-step">
              <div className="n">Input</div>
              <h4>Guided form + presets</h4>
              <p>Optional CSV upload for real bills and ledgers.</p>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-step">
              <div className="n">Calc engine</div>
              <h4>Quantity × emission factor</h4>
              <p>Scope 1/2/3 split, Pareto ranked.</p>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-step">
              <div className="n">Recommender</div>
              <h4>Rule library fires per source</h4>
              <p>Cost, savings and payback per fix.</p>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-step">
              <div className="n">Report</div>
              <h4>Plan builder</h4>
              <p>Before/after, compliance badge, PDF export.</p>
            </div>
          </div>

          <h3 style={{ marginTop: '40px', fontSize: '18px' }}>Emission factors (cited: CEA · IPCC · DEFRA)</h3>
          <table className="factors">
            <thead>
              <tr>
                <th>Source</th>
                <th>Unit</th>
                <th>kgCO₂e / unit</th>
                <th>Scope</th>
                <th>Circular alternative</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Grid electricity (India)</td>
                <td>kWh</td>
                <td className="num">0.716</td>
                <td><span className="scope-pill">Scope 2</span></td>
                <td>Rooftop solar, VFDs, LED</td>
              </tr>
              <tr>
                <td>Coal (boiler)</td>
                <td>tonne</td>
                <td className="num">2,420</td>
                <td><span className="scope-pill">Scope 1</span></td>
                <td>Biomass pellets, heat recovery</td>
              </tr>
              <tr>
                <td>Diesel (genset)</td>
                <td>litre</td>
                <td className="num">2.68</td>
                <td><span className="scope-pill">Scope 1</span></td>
                <td>Battery storage</td>
              </tr>
              <tr>
                <td>Steel (virgin)</td>
                <td>tonne</td>
                <td className="num">1,850</td>
                <td><span className="scope-pill">Scope 3</span></td>
                <td>Recycled steel (~600)</td>
              </tr>
              <tr>
                <td>Road freight</td>
                <td>t-km</td>
                <td className="num">0.105</td>
                <td><span className="scope-pill">Scope 3</span></td>
                <td>Load consolidation, rail</td>
              </tr>
              <tr>
                <td>Organic waste → landfill</td>
                <td>tonne</td>
                <td className="num">580</td>
                <td><span className="scope-pill">Scope 3</span></td>
                <td>Biogas / compost (credit)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="impact">
        <div className="wrap">
          <div className="section-head">
            <div className="section-tag">04 · Impact &amp; roadmap</div>
            <h2>Demo factory: Ambica Textiles, Surat</h2>
          </div>
          <div className="grid-3">
            <div className="card">
              <h3 style={{ color: 'var(--green)' }}>−57%</h3>
              <p>Footprint after 3 actions (1,842 → 795 tCO₂e/yr).</p>
            </div>
            <div className="card">
              <h3 style={{ color: 'var(--green)' }}>₹22.3 L</h3>
              <p>Operating cost saved every year.</p>
            </div>
            <div className="card">
              <h3 style={{ color: 'var(--green)' }}>24 mo</h3>
              <p>Payback on the biggest fix — the biomass boiler.</p>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: '44px' }}>
            <button className="btn btn-primary" onClick={onOpenDemo}>Run this factory through CarbonLens →</button>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div>CarbonLens · Team Nebula Nuke · HackOut&apos;26 · Circular Carbon Ecosystem</div>
          <div>Kunal Ramanuja · Zeel Nakum · Yash Chauhan · Akshat Govindiya</div>
        </div>
      </footer>
    </>
  );
}

function DemoApp({ onBack }) {
  const [inputs, setInputs] = useState({ ...PRESETS.textile });
  const [selectedRuleIds, setSelectedRuleIds] = useState(new Set(['biomass_boiler', 'rooftop_solar', 'water_reuse']));
  const [activeTab, setActiveTab] = useState('input');

  const hotspotSummary = useMemo(() => getHotspotSummary(inputs), [inputs]);
  const firedRules = useMemo(() => getFiredRules(hotspotSummary.sources), [hotspotSummary.sources]);
  const chosenRules = useMemo(
    () => firedRules.filter((rule) => selectedRuleIds.has(rule.id)),
    [firedRules, selectedRuleIds]
  );

  const topSource = hotspotSummary.sources[0] || null;
  const scopeTotals = { 1: 0, 2: 0, 3: 0 };
  hotspotSummary.sources.forEach((row) => {
    scopeTotals[row.scope] += row.t;
  });

  const scopeSplit = `${Math.round((scopeTotals[1] / Math.max(hotspotSummary.totalT, 1)) * 100)}% / ${Math.round((scopeTotals[2] / Math.max(hotspotSummary.totalT, 1)) * 100)}% / ${Math.round((scopeTotals[3] / Math.max(hotspotSummary.totalT, 1)) * 100)}%`;

  const co2Cut = chosenRules.reduce((sum, rule) => sum + rule.co2Cut, 0);
  const savedL = chosenRules.reduce((sum, rule) => sum + rule.savedL, 0);
  const after = Math.max(hotspotSummary.totalT - co2Cut, 0);
  const pctCut = hotspotSummary.totalT > 0 ? Math.round((co2Cut / hotspotSummary.totalT) * 100) : 0;
  const afterWidth = Math.max((after / Math.max(hotspotSummary.totalT, 1)) * 100, 8);

  const handleInputChange = (key, rawValue) => {
    const value = Number.parseFloat(rawValue);
    setInputs((prev) => ({
      ...prev,
      [key]: Number.isFinite(value) ? value : 0,
    }));
  };

  const handlePresetChange = (presetKey) => {
    setInputs({ ...PRESETS[presetKey] });
    setActiveTab('input');
  };

  const toggleRule = (ruleId) => {
    setSelectedRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  const showTab = (tabName) => {
    setActiveTab(tabName);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <nav className="topnav no-print">
        <div className="wrap">
          <button className="brand reset-btn" onClick={onBack} style={{ textDecoration: 'none' }}>
            <span className="dot"></span> CarbonLens
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back to landing page</button>
        </div>
      </nav>

      <div className="app-shell">
        <div className="app-header">
          <div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Step 1–4 · Ambica Textiles Pvt Ltd (demo data)</div>
          </div>
          <div className="tabbar">
            {tabOrder.map((tab) => (
              <button
                key={tab}
                data-tab={tab}
                className={activeTab === tab ? 'active' : ''}
                onClick={() => showTab(tab)}
              >
                {tab === 'input' ? 'Input' : tab === 'hotspots' ? 'Hotspots' : tab === 'actions' ? 'Actions' : 'Report'}
              </button>
            ))}
          </div>
        </div>

        <div className="panel tab-panel" style={{ display: activeTab === 'input' ? 'block' : 'none' }}>
          <div className="panel-title">
            <h2>Tell us what you burn, buy &amp; throw away</h2>
            <span className="hint">Presets pre-fill realistic numbers so this never starts blank</span>
          </div>

          <div className="preset-row">
            {Object.keys(PRESETS).map((presetKey) => (
              <button
                key={presetKey}
                className={`preset-chip ${inputs.grid === PRESETS[presetKey].grid ? 'active' : ''}`}
                onClick={() => handlePresetChange(presetKey)}
              >
                {presetKey === 'textile' ? 'Textile' : presetKey === 'foundry' ? 'Foundry' : 'Food processing'}
              </button>
            ))}
          </div>

          <div className="field-group">
            <h4>Energy</h4>
            {fieldDefinitions.slice(0, 3).map(({ key, label, sub, unit }) => (
              <div className="field-row" key={key}>
                <label>
                  {label}
                  <span className="sub">{sub}</span>
                </label>
                <input type="number" min="0" value={inputs[key]} onChange={(e) => handleInputChange(key, e.target.value)} />
                <span className="unit-badge">{unit}</span>
              </div>
            ))}
          </div>

          <div className="field-group">
            <h4>Materials</h4>
            {fieldDefinitions.slice(3, 5).map(({ key, label, sub, unit }) => (
              <div className="field-row" key={key}>
                <label>
                  {label}
                  <span className="sub">{sub}</span>
                </label>
                <input type="number" min="0" value={inputs[key]} onChange={(e) => handleInputChange(key, e.target.value)} />
                <span className="unit-badge">{unit}</span>
              </div>
            ))}
          </div>

          <div className="field-group">
            <h4>Waste &amp; logistics</h4>
            {fieldDefinitions.slice(5).map(({ key, label, sub, unit }) => (
              <div className="field-row" key={key}>
                <label>
                  {label}
                  <span className="sub">{sub}</span>
                </label>
                <input type="number" min="0" value={inputs[key]} onChange={(e) => handleInputChange(key, e.target.value)} />
                <span className="unit-badge">{unit}</span>
              </div>
            ))}
          </div>

          <div className="actions-row">
            <span className="hint" style={{ alignSelf: 'center' }}>3 short screens · works on a phone</span>
            <button className="btn btn-primary" onClick={() => showTab('hotspots')}>Detect hotspots →</button>
          </div>
        </div>

        <div className="panel tab-panel" style={{ display: activeTab === 'hotspots' ? 'block' : 'none' }}>
          <div className="panel-title">
            <h2>Your emission hotspots</h2>
            <span className="hint">Ranked by tCO₂e/yr, highest first</span>
          </div>

          <div className="hotspot-total">
            <div>
              <div className="big">{hotspotSummary.totalT.toFixed(0)}</div>
              <div className="lbl">Total tCO₂e / yr</div>
            </div>
            <div>
              <div className="big">{topSource ? `${Math.round(topSource.share * 100)}%` : '—'}</div>
              <div className="lbl">Top source share of footprint</div>
            </div>
            <div>
              <div className="big">{scopeSplit}</div>
              <div className="lbl">Scope 1 / 2 / 3 split</div>
            </div>
          </div>

          <div>
            {hotspotSummary.sources.length === 0 ? (
              <div className="plan-empty">No data available yet.</div>
            ) : (
              (() => {
                const maxT = hotspotSummary.sources[0].t || 1;
                return hotspotSummary.sources.map((source) => (
                  <div className="bar-row" key={source.key}>
                    <div className="bar-head">
                      <span>{source.label}</span>
                      <span className="val">{source.t.toFixed(0)} tCO₂e · {Math.round(source.share * 100)}%</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(source.t / maxT) * 100}%` }}></div>
                    </div>
                  </div>
                ));
              })()
            )}
          </div>

          <div className="leak-callout" style={{ display: topSource ? 'flex' : 'none' }}>
            <span className="badge">LEAK POINT #1</span>
            <p>
              <b>{topSource ? topSource.label : ''}</b> = {topSource ? `${topSource.t.toFixed(0)} tCO₂e (${Math.round(topSource.share * 100)}% of footprint).` : ''}{' '}
              {topSource ? FACTORS[topSource.key].alt : ''} can cut this source significantly — see the Actions tab.
            </p>
          </div>

          <div className="actions-row">
            <button className="btn btn-ghost" onClick={() => showTab('input')}>← Edit inputs</button>
            <button className="btn btn-primary" onClick={() => showTab('actions')}>See fixes →</button>
          </div>
        </div>

        <div className="panel tab-panel" style={{ display: activeTab === 'actions' ? 'block' : 'none' }}>
          <div className="panel-title">
            <h2>Recommended fixes</h2>
            <span className="hint">Sorted by payback · tick to add to your plan</span>
          </div>

          <div>
            {firedRules.length === 0 ? (
              <div className="plan-empty">No rules fired — try raising a source above its threshold on the Input tab (e.g. coal ≥ 15% of footprint).</div>
            ) : (
              firedRules.map((rule) => (
                <div className="action-card" key={rule.id}>
                  <div className="left">
                    <span className={`type-tag ${rule.type}`}>{rule.type}</span>
                    <h4>{rule.title}</h4>
                    <p className="why">{rule.why}</p>
                    <div className="stat-grid">
                      <div>
                        <b>₹{rule.capexL} L</b>
                        <span>Capex</span>
                      </div>
                      <div>
                        <b>₹{rule.savedL} L</b>
                        <span>Saved / yr</span>
                      </div>
                      <div>
                        <b>−{rule.co2Cut} t</b>
                        <span>CO₂e / yr</span>
                      </div>
                      <div>
                        <b>{rule.paybackMo} mo</b>
                        <span>Payback</span>
                      </div>
                    </div>
                  </div>
                  <div className="toggle-col">
                    <input
                      type="checkbox"
                      checked={selectedRuleIds.has(rule.id)}
                      onChange={() => toggleRule(rule.id)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="actions-row">
            <button className="btn btn-ghost" onClick={() => showTab('hotspots')}>← Back to hotspots</button>
            <button className="btn btn-primary" onClick={() => showTab('report')}>Build my plan →</button>
          </div>
        </div>

        <div className="panel tab-panel" style={{ display: activeTab === 'report' ? 'block' : 'none' }}>
          <div className="panel-title">
            <h2>Your circular plan · Ambica Textiles Pvt Ltd</h2>
            <span className="hint">{chosenRules.length} fix{chosenRules.length === 1 ? '' : 'es'} selected</span>
          </div>

          <div className="report-hero">
            <div className="report-stat">
              <b>−{co2Cut.toFixed(0)}</b>
              <span>tCO₂e cut / yr</span>
            </div>
            <div className="report-stat">
              <b>₹{savedL.toFixed(1)} L</b>
              <span>₹ cost saved / yr</span>
            </div>
            <div className="report-stat">
              <b>{pctCut}%</b>
              <span>Footprint cut</span>
            </div>
          </div>

          <div className="before-after">
            <div className="ba-col">
              <div className="lbl">Before</div>
              <div className="ba-bar before" style={{ width: '100%' }}>{hotspotSummary.totalT.toFixed(0)} tCO₂e</div>
            </div>
            <div className="ba-arrow">→</div>
            <div className="ba-col">
              <div className="lbl">After</div>
              <div className="ba-bar after" style={{ width: `${afterWidth}%` }}>{after.toFixed(0)} tCO₂e</div>
            </div>
          </div>

          <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', margin: '0 0 10px' }}>Selected fixes</h4>
          <div>
            {chosenRules.length === 0 ? (
              <div className="plan-empty">No fixes selected yet — go back to Actions and tick a few.</div>
            ) : (
              chosenRules.map((rule) => (
                <div className="plan-line" key={rule.id}>
                  <span>{rule.title}</span>
                  <span>₹{rule.capexL} L capex · ₹{rule.savedL} L/yr saved · −{rule.co2Cut} t/yr</span>
                </div>
              ))
            )}
          </div>

          <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', margin: '26px 0 10px' }}>Compliance readiness</h4>
          <ul className="compliance-list">
            <li>GHG Protocol Scope 1 &amp; 2 aligned</li>
            <li>BRSR-ready summary for buyers</li>
            <li>Every factor cited (CEA · IPCC · DEFRA)</li>
            <li>Methodology page + audit trail</li>
          </ul>

          <div className="actions-row">
            <button className="btn btn-ghost" onClick={() => showTab('actions')}>← Back to actions</button>
            <button className="btn btn-primary" onClick={() => window.print()}>Export PDF report ↓</button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [view, setView] = useState('landing');

  if (view === 'landing') {
    return <LandingPage onOpenDemo={() => setView('demo')} />;
  }

  return <DemoApp onBack={() => setView('landing')} />;
}
