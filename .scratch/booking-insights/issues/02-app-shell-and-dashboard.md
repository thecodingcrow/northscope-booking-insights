# 02 — App shell + Dashboard with real KPIs

**Status:** ready-for-agent

## Parent

`.scratch/booking-insights/PRD.md`

## What to build

Stand up the Next.js app shell and the Dashboard route (`/`), powered by real data from the in-memory store. After this issue, opening the deployed URL shows the locked visual grammar (Variant B — Triage Inbox) with real numbers from the generated data: Document count, Line count, total debit volume in EUR, and a placeholder Findings tile that subsequent feature issues will populate.

Visual grammar is locked by `docs/prototype-notes/0001-dashboard-direction.md`. Palette is `stone-50` background, `white` sidebar, `stone-200` borders, severity colors `rose|amber|slate`, brand accent `indigo→violet` gradient. Type: Geist Sans for body, Geist Mono only for IDs. Layout: 240px left sidebar with sectioned nav (Overview / Findings / Library) + main column with `max-w-4xl` content.

shadcn/ui is initialized and themed to match the locked palette. Primitives `Button`, `Card`, `Badge`, `Dialog`, `DropdownMenu` are installed; only the ones we need now should be wired up.

The in-memory data layer uses module-level `import` of the committed JSON files (Next.js bundles them). ES module caching gives module-singleton behavior automatically. `lib/data/store.ts` returns a typed `{ lines, documents, accounts, vendors, customers, costCenters }` aggregate. `lib/data/views.ts` computes the derived views: a per-Document rollup (total debit cents, vendor_id if uniform across lines, accounts touched, tax codes, line count, template tag) and a denormalized `lines` view.

Money formatting lives in `lib/format/money.ts` — `formatEUR(cents)` returns the German-locale string `"2.500,00 EUR"`. Dates in `lib/format/dates.ts` — `formatDate(iso)` returns `"15.03.2026"`.

The Dashboard's 4 KPI tiles must be ready to receive real "findings" counts from subsequent feature issues — leave a typed seam so issues 04/05/06 can wire their counts in without reshuffling the Dashboard layout.

## Acceptance criteria

- [ ] shadcn/ui initialized; primitives Button, Card, Badge, Dialog, DropdownMenu added; theme matches the locked palette
- [ ] `lucide-react` installed; icons sourced from there (not hand-drawn SVG)
- [ ] `lib/data/store.ts` exports a typed singleton store loaded from `data/data.json` plus master data files
- [ ] `lib/data/views.ts` provides `documents` (per-doc rollup) and `lines` (denormalized) views
- [ ] `lib/format/money.ts#formatEUR(250000)` returns `"2.500,00 EUR"`; `lib/format/dates.ts#formatDate("2026-03-15")` returns `"15.03.2026"`
- [ ] `app/layout.tsx` renders the sidebar (sections: Overview / Findings / Library) + main column shell on every route
- [ ] `/` Dashboard shows 4 KPI tiles powered by real data: Documents (count), Lines (count), Debit volume (€), Findings (placeholder showing `—` until features land)
- [ ] Palette + typography match `docs/prototype-notes/0001-dashboard-direction.md`
- [ ] Page renders with no browser console errors
- [ ] `pnpm lint` is clean; `npx tsc --noEmit` is clean
- [ ] Sidebar nav has placeholder routes for `/documents`, `/anomalies/text`, `/anomalies/duplicates`, `/booking-manual` even though those pages are stubs at this stage
- [ ] Conventional Commits on `main` (structure-phase, no PR)

## Blocked by

- `.scratch/booking-insights/issues/01-anomaly-catalog-and-generator.md`
