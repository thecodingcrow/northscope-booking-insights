# Take-Home Exercise (Engineer) — Northscope

> Source: <https://northscope.notion.site/Take-Home-Exercise-Full-Stack-Engineer-b809f224a792498483fc1bcbd4350334>
> Captured: 2026-05-19

---

> [!NOTE]
> The goal of this take-home is not "no-AI coding" but **AI-assisted shipping + product sense + engineering judgment**. Prompting is explicitly allowed. What matters is how you iterate, decide, and deliver quality.

**Short description:** Build a mini app that lets you analyze booking data to quickly spot and explain red flags, anomalies, and potentially incorrect postings.

## Framework

- **Time limit:** max 2–3 hours total
- **Important:** If you have to make assumptions, document them (short, but clear)
- **Submission:** GitHub repo link (or ZIP) + short notes (README) + optional short Loom/screen recording (max 3 min)
- **AI tools (encouraged):** Please actively use tools like Claude Code, Codex, Cursor (or similar). We evaluate output + approach, not "no-AI coding"

---

## Task 0 — Define & generate booking data (journal entries)

Build the app **exclusively** on booking data (journal entries). Please generate realistic sample data (as CSV or JSON) in the style of "SAP-like accounting postings" (Universal Journal / document + line items).

### Expected data model (minimum)

Make sure your data includes at least these fields (naming doesn't matter; content does):

- `company_code` (e.g. `"1000"`)
- `posting_date` (date)
- `document_id` (document number)
- `line_id` (line item number)
- `gl_account` (G/L account)
- `cost_center` (optional, but recommended)
- `amount` (signed amount, or split into debit/credit)
- `currency`
- `debit_credit` (`"D"`/`"C"` or `"S"`/`"H"`)
- `booking_text` (posting text / short text)
- `vendor_id` **or** `customer_id` (optional)
- `tax_code` (optional)

### Constraints (to make it feel "real")

- Each `document_id` has multiple lines (at least 2)
- A document is (simplified) balanced: sum of lines per document = 0
- Data volume: **~200–800 lines across ~2 months**
- At least **20–40 different G/L accounts** and a few recurring texts/patterns
- Intentionally include some suspicious cases (for Task 2), e.g.:
  - very similar booking texts (typos / near-duplicates)
  - possible duplicate postings (similar documents within a short time window)
  - "unusual" combinations (e.g. rare account + frequent text)

### Important

- Please do **not** compute cash flow and do **not** invent "business KPIs" that cannot be derived from postings
- If you make assumptions about account logic (e.g. revenue account ranges), document them

---

## Task 1 — Build the mini app (UI/UX + full stack)

Build a small web app (**Next.js preferred**) that simulates a "Booking Insights" interface based on the booking data.

**Focus:** clean structure, good UX, clear components, pragmatic implementation.

### Output

- Repo + README (setup + architecture decisions + assumptions)

---

## Task 2 — Ship 3 features (AI-assisted, but with real logic)

Implement 3 features that require real logic/heuristics. Briefly document how you approach them.

### Feature 1 — Anomaly / typo / near-duplicate check

- Find suspicious booking texts (very similar, typos, unusual patterns)
- Show a hit list with a short explanation why each hit is suspicious

### Feature 2 — Duplicate booking detection

- Heuristic-based: e.g. same amounts + similar text + short time gap + same counter-accounts (as best as you can)
- Show potential pairs/clusters + confidence/criteria

### Feature 3 — Booking manual / rule suggestions (MVP)

- Create a small "booking manual" from the existing transaction data
- **What is a booking manual?** A compact set of booking rules and heuristics describing how typical cases should be posted (e.g. which account / tax code / cost center combinations are common) and which patterns are suspicious
- Generate **5–10 rule suggestions**, e.g. frequent account/tax-code combos, recurring postings, typical cost-center assignments
- Present rules as **checks** and show **evidence per check** as example postings (including a short explanation of why these examples support the rule)

### Optional alternative to one of the above

- **Branded presentation export:** Export selected insights/charts as PDF (mock is fine) or generate a "deck" as JSON/Markdown

### Workflow (part of Task 2)

- Please ship **each feature in a separate PR** (or at least clearly separated commits)
- Do a short **self-review** of your AI-generated changes:
  - Identify **5 concrete improvements** (e.g. performance, DX, security, testing, architecture, UI)
  - Implement **at least 2** of them as follow-up commits/PRs

### Output

- Short list: which 3 features you chose
- Per feature: 2–4 bullet points "what / why / trade-off"
- List of the 5 review findings
- PR/commit(s) with the 2 fixes

---

## Task 3 — Research: context engineering / knowledge graph (short, practical)

**Goal:** We don't just want to show numbers, but also be able to answer context questions like:

- "Why was this discount granted?"
- "Why is this KPI calculated this way?"

### Task

Sketch (1 page) how you would implement context engineering for us:

- Which **context sources** would you connect (policies, SOPs, CRM notes, emails, data dictionary)?
- Which **entities / relations** do you need (KPI ↔ definition ↔ owner ↔ query/transformation ↔ approval ↔ document)?
- How would you do **retrieval** (vector + graph, evidence-first)?
- 2 risks + mitigation

### Output

- 1-page Notion/doc, **or** 6–8 bullet points in the README

---

## Evaluation focus

- **Speed + pragmatism** (take the 2–3h timebox seriously)
- **Code quality** (structure, readability, separation)
- **Product sense** (UX, defaults, sensible empty states)
- **Engineering judgment** (trade-offs, what you intentionally don't do)
- **Deployment & operability** (reproducible, minimal documentation)

---

## Original German source (verbatim)

<details>
<summary>German original — click to expand</summary>

### Rahmen

- Zeitlimit: max. 2–3 Stunden total
- Wichtig: Wenn du Annahmen treffen musst, dokumentiere sie (kurz, aber klar).
- Abgabe: GitHub Repo-Link (oder ZIP) + kurze Notizen (README) + optional kurze Loom/Screen-Recording (max. 3 Min)
- AI-Tools (gewünscht): Bitte nutze aktiv Tools wie Claude Code, Codex, Cursor (oder vergleichbare). Wir evaluieren Output + Vorgehen, nicht „no-AI coding".

### Aufgabe 0 — Buchungsdaten (Journal Entries) definieren & generieren

Du baust die App ausschließlich auf Basis von Buchungsdaten (Journal Entries). Bitte generiere dir dafür realistisch wirkende Beispieldaten (als CSV oder JSON) im Stil von „SAP-artigen Buchungsdaten" (Universal Journal / Beleg + Positionen).

Erwartetes Datenmodell (Minimum):
- company_code (z. B. "1000")
- posting_date (Datum)
- document_id (Belegnummer)
- line_id (Positionsnummer)
- gl_account (Sachkonto)
- cost_center (optional, aber empfohlen)
- amount (Vorzeichen oder getrennt über Soll/Haben)
- currency
- debit_credit ("D"/"C" oder "S"/"H")
- booking_text (Buchungstext / Kurztext)
- vendor_id oder customer_id (optional)
- tax_code (optional)

Constraints:
- Pro document_id gibt es mehrere Zeilen (mindestens 2).
- Ein Beleg ist (vereinfacht) ausgeglichen: Summe der Zeilen je Beleg = 0.
- Datenumfang: ca. 200–800 Zeilen über ca. 2 Monate.
- Mindestens 20–40 verschiedene Sachkonten und ein paar wiederkehrende Texte/Patterns.
- Baue absichtlich einige auffällige Fälle ein (für Aufgabe 2):
  - sehr ähnliche Buchungstexte (Tippfehler / near-duplicates)
  - mögliche Doppelbuchungen (ähnliche Belege in kurzem Abstand)
  - „ungewöhnliche" Kombinationen (z. B. seltenes Konto + häufiger Text)

Wichtig:
- Bitte berechne keinen Cashflow und erfinde keine „Business KPIs", die nicht aus Buchungen ableitbar sind.
- Wenn du Annahmen über Kontenlogik triffst (z. B. Umsatzkonten-Range), dokumentiere sie.

### Aufgabe 1 — Mini-App bauen (UI/UX + Full Stack)

Baue eine kleine Web-App (Next.js bevorzugt), die eine „Booking Insights" Oberfläche auf Basis der Buchungsdaten simuliert.
Fokus: saubere Struktur, gute UX, klare Komponenten, pragmatische Implementierung.

### Aufgabe 2 — 3 Features shippen (AI-assisted, aber mit Logik)

1. Anomaly / Typo / Near-Duplicate Check
   - Finde verdächtige Buchungstexte (sehr ähnlich, Tippfehler, ungewöhnliche Muster)
   - Zeige eine Trefferliste mit kurzer Erklärung, warum der Treffer verdächtig ist
2. Duplicate Booking Detection (Doppelbuchungen)
   - Heuristik-basiert: z. B. gleiche Beträge + ähnlicher Text + kurzer Zeitabstand + gleiche Gegenkonten
   - Zeige mögliche Paare/Cluster + Confidence / Kriterien
3. Booking Manual / Rule Suggestions (MVP)
   - Erstelle aus den bestehenden Transaktionsdaten ein kleines „Booking Manual"
   - Generiere 5–10 Regelvorschläge, z. B. häufige Konto/Taxcode-Kombos, wiederkehrende Buchungen, typische Cost-Center-Zuweisungen
   - Stelle die Regeln als „Checks" dar und zeige pro Check Evidence in Form von Beispielbuchungen

Optional als Alternative zu einem der obigen:
- Branded Presentation Export: PDF (Mock reicht) oder Deck als JSON/Markdown

Workflow:
- Bitte shippe jedes Feature in einem separaten PR
- Mache ein kurzes Self-Review deiner AI-generated Änderungen:
  - Identifiziere 5 konkrete Verbesserungen (Performance, DX, Security, Testing, Architektur, UI)
  - Implementiere mindestens 2 davon als Follow-up-Commits/PRs

### Aufgabe 3 — Research: Context Engineering / Knowledge Graph

Ziel: Wir wollen nicht nur Zahlen zeigen, sondern auch Kontext beantworten können wie:
- „Warum wurde dieser Rabatt gewährt?"
- „Warum ist diese Kennzahl so berechnet?"

Skizziere (1 Seite):
- Welche Kontextquellen würdest du anbinden (Policies, SOPs, CRM Notes, E-Mails, Data Dictionary)?
- Welche Entities/Relations brauchst du (KPI ↔ Definition ↔ Owner ↔ Query/Transformation ↔ Approval ↔ Dokument)?
- Wie würdest du Retrieval machen (Vector + Graph, evidence-first)?
- 2 Risiken + Mitigation

### Bewertungsfokus

- Speed + Pragmatismus (2–3h Timebox ernst nehmen)
- Codequalität (Struktur, Lesbarkeit, Separation)
- Produktgefühl (UX, Defaults, sensible Empty States)
- Engineering Judgment (Trade-offs, was du bewusst nicht machst)
- Deployment & Operability (reproduzierbar, minimale Doku)

</details>
