# EasyViaTraj — Convertisseur d'ordonnance pour ViaTrajectoire

> **Written for:** a future Claude Code session onboarding to this project (and the project owner, r-trimbour, as reference). Read this file first before writing any code.

---

## 1. Context & problem

The owner (**r-trimbour**) is a health professional who orients patients toward
rehabilitation (rééducation) after events such as fractures / prosthesis surgery,
using the French **ViaTrajectoire** platform.

ViaTrajectoire requires the current medication list to be typed into a **free-text
area**. Doing this by hand, drug by drug with doses and time slots, is tedious and
error-prone.

**Goal:** a small web app that lets the professional build the medication list
quickly (searchable drug database + per-slot dosing), produces correctly formatted
text, and lets them **copy it in one click** to paste into ViaTrajectoire. The
output stays **fully editable** so the user can add free-text details.

---

## 2. Feasibility verdict — ✅ Yes, cleanly

This maps perfectly to a **static client-side website hosted on GitHub Pages**:

- **No backend, no database server, no build step required** (can be plain
  HTML/CSS/JS). The drug list ships as a static JSON file in the repo.
- **Everything runs in the browser.** This is a decisive advantage for
  **patient-data privacy / RGPD**: no prescription or patient information is ever
  transmitted anywhere. The owner must be able to state this plainly.
- Searchable dropdown over thousands of drugs, one-click copy
  (`navigator.clipboard`), editable output area — all standard browser features.
- Works offline once loaded; can be installed as a PWA later if wanted.

**Conclusion:** the intended workflow is fully achievable, and a static GitHub
Pages site is the right architecture.

---

## 3. Drug database — source

France has an authoritative open-data source:

- **BDPM — Base de Données Publique des Médicaments** (ANSM/HAS),
  `base-donnees-publique.medicaments.gouv.fr`, downloadable tab-delimited files
  (`CIS_bdpm.txt` etc.): ~15 000 marketed specialties with name, form, and dosage.
  AP-HP prescribes from these same marketed drugs, so BDPM covers AP-HP needs.

**Plan:**
1. Download BDPM, parse to a compact `drugs.json` (name, dosage, form, unit, ATC class).
2. Pre-filter to classes relevant to post-fracture / prosthesis + common
   comorbidities, so the dropdown stays useful, but keep full search as fallback:
   - **Antalgiques / douleur:** paracétamol, tramadol, codéine assoc., AINS, opioïdes
   - **Anticoagulants / thromboprophylaxie:** énoxaparine (Lovenox), tinzaparine,
     apixaban (Eliquis), rivaroxaban (Xarelto), HBPM, AVK
   - **Gastro:** IPP (oméprazole…), laxatifs, antiémétiques
   - **Diabète:** metformine, insulines, sulfamides, iDPP4, aGLP1
   - **Cardio:** antihypertenseurs, bêtabloquants, statines, antiarythmiques, diurétiques
   - **Psy / sujet âgé:** anxiolytiques, antidépresseurs, neuroleptiques, hypnotiques
   - **Divers:** supplémentation (vit D, calcium, fer), corticoïdes
3. **Confirm with owner** whether an AP-HP-specific livret thérapeutique exists and
   can be shared; if so, layer it on top as a "favourites" shortlist.
4. Search must be accent- and case-insensitive, match on partial strings, debounced.

> Units to support per drug: `mg`, `g`, `ml`, `UI`, `µg`, `mg/mL`, `mg/mg` (combos),
> `%`, `gouttes`, `sachet`, `cp`, etc. Derive the default unit from the BDPM entry
> where possible; always let the user override.

---

## 4. Core UX specification (from owner's requirements)

### 4.1 Layout (two zones, big & clear text — this is a clinical tool)
1. **Builder zone** (top): drug search + the list of medication rows being built.
2. **Output zone** (bottom): the editable free-text area + a small **Copier** button.

Accessibility: large fonts, high contrast, generous touch targets, keyboard-friendly.
UI language: **French**.

### 4.2 Adding a drug
- A search field: type a few letters → scrollable autocomplete list → select.
- On selection, a **new row** is added to the builder AND a corresponding line is
  appended to the output text area.

### 4.3 Per-row controls (one row = one drug = one output line)
On the same row as the drug name:

- **Time-slot toggles:** `Matin` · `Midi` · `Soir` · `Autre heure`.
- For each **active** slot, a **dose control**: value with `+` / `−` buttons AND
  direct edit; step is `0.5` (supports 0.5, 1, 2, …). Default new dose = `1`.
- **`Autre heure`**: picks a specific time, **pre-set to `08h00`**, adjustable with
  `+`/`−` (and/or direct edit), plus its own dose. A **Valider** action confirms the
  custom time → `Autre heure` becomes available again so a second custom time can be
  added to the same drug if needed (a drug can have several custom-time doses).
- **Dose unit** selector/field per drug (see §3).
- **Remove row** button.

### 4.4 Optional conditions per drug (both optional, not required)
- **`si` (condition):** free text, with a **default suggestion** `si EVA > 3`
  (pain). User can accept, edit, or clear it.
- **`jusqu'au` (until):** a date picker. Optional.

### 4.5 Output area behaviour
- Auto-generated from the rows, but it is a **plain editable text area** — the user
  can freely modify, add lines, add details by hand.
- **Design decision to confirm (see §9):** how edits + regeneration interact.
  Recommended: generate into the textarea; once the user manually edits, stop
  auto-overwriting (or offer a "Régénérer" button) to never lose manual edits.
- **Copier** button: small, always visible, copies the whole area; show a brief
  "Copié ✓" confirmation.

---

## 5. Output format specification

One **line per drug**. General shape:

```
<Nom du médicament> <dose><unité> : <doses...> [si <condition>] [jusqu'au <date>]
```

### 5.1 Matin / Midi / Soir only → slots are implicit (not labelled)
List the doses in order, comma-separated:
```
Paracétamol 1000 mg : 1, 1, 1
Apixaban 5 mg : 1, 0, 1
```
(3 values = matin, midi, soir. **Confirm** how to represent an inactive slot:
`0` vs omission — see §9.)

### 5.2 Custom time ("Autre heure") → label the time explicitly
```
Énoxaparine 4000 UI : 1 dose à 18h00
```
Multiple custom times on one drug:
```
Insuline rapide 100 UI/mL : 6 dose à 12h00, 4 dose à 19h00
```

### 5.3 Mixed slots (standard + custom) — **confirm desired rendering (§9)**
Proposed:
```
Paracétamol 1000 mg : 1, 1, 1, 1 dose à 22h00
```

### 5.4 With optional conditions
```
Paracétamol 1000 mg : 1, 1, 1 si EVA > 3 jusqu'au 15/11/2026
```

> Date format to confirm: `JJ/MM/AAAA` assumed (French). Units render exactly as the
> user set them (`mg`, `UI`, `mg/mL`, `mg/mg`, …).

---

## 6. Suggested data model (in-memory per row)

```js
{
  id: "uuid",
  name: "Paracétamol",
  strength: "1000",          // dosage printed after name
  unit: "mg",
  slots: {                    // standard slots
    matin: { active: true, dose: 1 },
    midi:  { active: true, dose: 1 },
    soir:  { active: true, dose: 1 },
  },
  customTimes: [              // "Autre heure" entries (0..n)
    { time: "18h00", dose: 1 }
  ],
  condition: "EVA > 3" | null, // rendered as "si ..."
  until: "2026-11-15" | null,  // rendered as "jusqu'au JJ/MM/AAAA"
}
```
A pure `renderLine(row)` function turns one row into one output string. The output
area = `rows.map(renderLine).join("\n")` until the user takes manual control.

---

## 7. Tech stack (recommended — keep it simple)

- **Plain HTML + CSS + vanilla JS**, no framework needed for v1. (A light setup like
  Vite + a tiny framework is acceptable if the agent prefers, but it must still
  deploy as static files to GitHub Pages.)
- No external runtime dependencies for core logic; data in `drugs.json`.
- Mobile-friendly responsive layout (likely used on various devices).

---

## 8. Repo structure & milestones

### Proposed structure
```
EasyViaTraj/
├── index.html
├── css/style.css
├── js/
│   ├── app.js          # UI wiring
│   ├── render.js       # renderLine() + output generation (unit-testable)
│   └── search.js       # drug autocomplete
├── data/
│   ├── drugs.json      # processed drug database
│   └── scripts/parse_bdpm.(py|js)   # one-off BDPM → drugs.json
├── PLAN.md             # this file
└── README.md
```

### Milestones
- **M0 — Setup:** `git init`, repo on GitHub, GitHub Pages enabled, skeleton page.
- **M1 — Core loop (no DB):** hardcode ~10 common drugs; row builder + slots + doses
  + `renderLine` + editable output + Copier. Prove the full workflow end-to-end.
- **M2 — Format polish:** custom times / Valider flow, `si` + `jusqu'au`, all format
  rules from §5, unit handling.
- **M3 — Real database:** BDPM parse → `drugs.json`, searchable autocomplete.
- **M4 — UX & a11y:** large clear UI, responsive, "Copié ✓", edge cases, empty state.
- **M5 — Docs & deploy:** README (what it is, privacy statement, how to use), final
  GitHub Pages deploy; optional PWA/offline.

---

## 9. Format decisions — LOCKED (owner, 2026-11-07)

1. **Inactive slot:** always render the 3 standard positions; inactive = `0`.
   → `Paracétamol, 1000 mg (cp) : 1, 0, 1`
2. **Galenic form stated once, in the label:** `Nom, dosage (forme)`; doses are bare
   numbers. (Revised 2026-11-07 — replaces "count + unit per slot".)
3. **`jusqu'au` date = `JJ/MM/AAAA`.** → `jusqu'au 15/11/2026`
4. **Mixed standard + custom time:** triplet then custom, comma-joined.
   → `Paracétamol, 1000 mg (cp) : 1, 1, 1, 1 à 22h00`
5. **Custom time rendering:** `<n> à <HHhMM>` → `1 à 18h00`
6. **Decimals use a dot** (`0.5`) to avoid clashing with the comma slot separator.
7. **Output-area edit behaviour:** auto-sync until the user types in the area; then
   lock full rewrite and preserve manual text. Row controls still update *their own
   line in place* (matched via a stored anchor). A **Régénérer** button rebuilds all
   lines from the rows on demand (with confirmation, since it discards manual edits).

### UI decisions (owner feedback, 2026-11-07)
- Sober, professional look: full page width, square corners, no playful styling.
- Dense **table**: one compact row per drug; columns Médicament | Matin | Midi | Soir |
  Autre heure | si | jusqu'au. Slots **unticked by default**: tick, then set the dose.
- Drug label is an editable cell; **free-text entry** for drugs missing from the base.
- Small **"Fréquents"** panel on the right (paracétamol, néfopam, énoxaparine,
  apixaban, insulines, statines) for one-click add.

### Still open (non-blocking)
- **AP-HP livret thérapeutique:** can a curated shortlist be shared? Else filtered BDPM.
- **Condition presets:** `si EVA > 3` is the default; add more presets if wanted.

---

## 10. Hard constraints (do not violate)

- **Commits:** author/attribution **r-trimbour only**. **No "Claude Code" / Claude /
  Anthropic attribution** in commit messages or PR bodies.
- **Privacy:** no patient/prescription data leaves the browser. No analytics that
  capture input. State this in the README.
- **Clinical clarity:** large, legible UI; French language; unambiguous output.
- Must deploy as **static files on GitHub Pages**.
