# HACKOUT'26 · THEME: CIRCULAR CARBON ECOSYSTEM

## CarbonLens
**Find where a factory's carbon leaks.**  
**Fix it for less than it costs.**

Industrial Emission Leak-Point Detector & Circular Alternative Recommender

- 3 screens: input → hotspots → actions
- 2 numbers: ₹ saved + tCO₂e cut per fix
- 0 black boxes: cited factors, explainable rules

September 2026

**TEAM NEBULA NUKE**
- Kunal Ramanuja · Team Lead
- Zeel Nakum · Backend
- Yash Chauhan · Frontend
- Akshat Govindiya · AI/ML Engineer

---

# 01 · PROBLEM & USERS

Small factories can't see their own carbon.

Buyers, banks and regulators now ask MSMEs for a carbon number. A typical 100-person factory has no ESG team, no measured data, and no budget for consultants. Emissions stay invisible, and circular options – alternative materials, recycling loops, process changes – are never evaluated because nobody can put a cost on them.

## Key Facts
- 6.3 Cr MSMEs in India; >90% have never measured emissions
- Scope 3 reporting increasingly required under BRSR
- Typical SME sustainability consulting budget: ₹0

## Who It's For
### SMEs & Factory Operators
Get a footprint number and a 3-action plan in 10 minutes.

### Sustainability Consultants
Serve 10× more clients and export methodology-backed reports.

### Industry Regulators & Large Buyers
Onboard supplier bases with auditable emissions numbers.

---

# 02 · SOLUTION

## Three steps. Two numbers. One plan.

### 1. Input
What you burn, buy and throw away.

### 2. Detect
Every source ranked by tCO₂e.

### 3. Fix
Costed circular interventions sorted by payback.

### Example Hotspots
- Coal boiler: 57%
- Grid power: 15%
- Diesel: 8%
- Steel: 7%
- Transport: 6%
- Waste: 6%

### Recommended Fixes
| Fix | Capex | Savings/Year | CO₂ Reduction |
|------|--------|-------------|---------------|
| Biomass pellet boiler | ₹18.5 L | ₹9.2 L | 790 tCO₂e |
| Rooftop solar 150 kWp | ₹60 L | ₹11 L | 165 tCO₂e |
| Closed-loop water reuse | ₹3 L | ₹2.1 L | 92 tCO₂e |

---

# 03 · HOW IT WORKS

## Workflow
1. Input (guided form + presets)
2. Calculation engine
3. Recommender
4. Report generation

## Emission Factors

| Source | Unit | kgCO₂e/unit | Scope | Circular Alternative |
|---------|------|------------|--------|---------------------|
| Grid electricity | kWh | 0.716 | 2 | Rooftop solar |
| Coal (boiler) | tonne | 2420 | 1 | Biomass pellets |
| Diesel (genset) | litre | 2.68 | 1 | Battery storage |
| Steel (virgin) | tonne | 1850 | 3 | Recycled steel |
| Plastic (virgin) | tonne | 2500 | 3 | rPET |
| Cement | tonne | 900 | 3 | Fly-ash blend |

## AI Usage
- Rules compute all ₹ and tCO₂e values.
- LLM generates explanations and extra ideas.
- Numbers remain auditable and explainable.

Tech Stack: Next.js, Tailwind, shadcn/ui, Recharts, REST APIs, Vercel.

---

# 04 · IMPACT & ROADMAP

## Demo Factory: Ambica Textiles, Surat
- Footprint reduction: 57%
- Emissions: 1,842 → 795 tCO₂e/year
- Cost savings: ₹22.3 L/year
- Payback: 24 months

## Roadmap
### Hackathon (24h)
- 3 industries
- 13 factors
- 12 rules
- PDF export
- Live on Vercel

### Month 1–3
- Electricity bill imports
- Tally integration
- 20 industries
- Multi-client consultant view

### Month 4–12
- Smart meter APIs
- Buyer portal for Scope 3
- Carbon-credit registry integration

## Business Model
- Free for SMEs
- Paid consultant workspace
- Paid corporate buyer onboarding

## Team
- Kunal Ramanuja — Product, pitch, demo flow
- Zeel Nakum — Calc engine, rule library, REST routes
- Yash Chauhan — Frontend, charts, PDF export
- Akshat Govindiya — Factor data, recommender, LLM layer

> Circular economy scales when the fix is cheaper than the problem. CarbonLens proves it is – one factory at a time.
