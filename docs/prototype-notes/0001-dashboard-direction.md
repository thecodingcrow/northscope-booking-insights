# Dashboard direction — Variant B ("Triage Inbox") wins

**Question:** What visual and structural direction should the Booking Insights dashboard take?

**Decision:** **Variant B — Triage Inbox.** Three radically different dashboards were prototyped at `/prototype/dashboard?variant=A|B|C` and shown to the user.

## Why B won (user verbatim, paraphrased)

- **A (Analyst Console)** was rejected as "too convoluted and AI-sloppy" — the dense terminal aesthetic read as noise rather than signal.
- **C (Narrative Storyboard)** was rejected as "looks like a landing page" — too marketing, not enough working tool.
- **B (Triage Inbox)** matched: "simple and not too in-your-face". A working tool, not a billboard or a terminal.

## What we are keeping from B

The eventual real dashboard inherits these structural and visual choices from the prototype:

### Layout
- **Left sidebar nav, ~240px wide**, sectioned by Overview / Findings / Library
- **Section headers** in tiny uppercase tracking-wider stone-400
- **Nav items** with optional badges (counts) and severity-colored dots
- **Main column** with a sticky header (page title + sort/filter controls) and a max-width content area (`max-w-4xl`)

### Findings as cards
- The page body is a **stack of cards**, one per finding, with subtle ring borders that brighten on hover
- Each card: feature icon (left, monospace glyph in a soft grey square) → main column with severity badge + feature label + ID + headline + detail + doc list/confidence footer → hover-revealed action buttons on the right (Dismiss / Inspect)
- This pattern generalizes: any list view (documents, vendors, rule violations) uses the same card grammar

### KPI row
- 4 stat cards across the top of the main column
- One card may be accented (gradient ring) to draw the eye to the headline metric

### Palette — locked
- **Background**: `stone-50` (warm off-white) — *not* slate or zinc
- **Sidebar background**: `white`
- **Borders**: `stone-200` / `stone-300` on hover
- **Body text**: `stone-900` for headings, `stone-500/600` for secondary
- **Severity accents**:
  - high → `rose-*` palette (subtle bg, ring, text)
  - medium → `amber-*`
  - low → `slate-*`
- **Brand accent** (sidebar logo, optional accent KPI card): `indigo-500 → violet-600` gradient

### Typography — locked
- **Sans**: Geist Sans (already imported as the default font)
- **Mono**: Geist Mono — used only for IDs, doc numbers, codes (never for body)
- **Sizes**:
  - h1 page header: `text-2xl font-semibold tracking-tight`
  - card headline: `text-[15px] font-medium`
  - body/secondary: `text-sm text-stone-500`
  - meta (IDs, tags, kicker): `text-[11px]`, often uppercase tracking-wide for kickers

### Component grammar (extracts that all routes inherit)
- `Kpi` — small stat card with label, big tabular-nums value, sub
- `NavItem` / `NavSection` — sidebar primitives
- Card-as-row pattern with hover-revealed actions

## What we are *not* keeping

- The mock data file (`mock-data.ts`) — replaced by the real in-memory store
- The variant components themselves — written under prototype constraints (no tests, inline types, lots of repetition)
- The `PrototypeSwitcher` — production code never sees variant URLs

## How this gets used downstream

When we write the implementation plan, the dashboard task is **"implement per spec, following the visual grammar in this notes file"**. The agent doing that work reads this file and the spec, not the prototype code.

The prototype code itself was deleted to prevent rot.
