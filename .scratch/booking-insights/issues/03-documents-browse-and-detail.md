# 03 — Documents browse + detail

**Status:** ready-for-agent

## Parent

`.scratch/booking-insights/PRD.md`

## What to build

Two routes that let a user inspect any Document in the dataset:

- `/documents` — a sortable, filterable table over all Documents. The header row supports column sort; a filter bar above the table provides date-range, vendor, G/L Account, amount-range, and free-text search on `booking_text`. Clicking a row navigates to the Document's detail page.
- `/documents/[id]` — full Document detail. Header shows the Document ID (Geist Mono), posting date (formatted via `formatDate`), Document Amount (formatted via `formatEUR`), Vendor or Customer name (resolved from the master data), and the recognized template if present. Below the header, all Lines render as a table: line number, G/L Account (code + name), Cost Center, Debit/Credit indicator, amount (positive cents formatted), booking text, tax code.

The detail page also reserves a "Flags on this Document" section (placeholder until issues 04, 05, 06 land). The placeholder must be designed so feature issues can populate it without restructuring the page.

TanStack Table (`@tanstack/react-table`) drives the browse table. It's headless, so styling stays in the locked card-grammar of the project.

Document Amount = sum of positive Line amounts per Document (= total debits = abs(sum of credits)). NOT the signed sum (which is always zero). See CONTEXT.md "Document Amount" entry.

## Acceptance criteria

- [ ] `@tanstack/react-table` installed and used as the table primitive on `/documents`
- [ ] `/documents` renders every Document in the store with the columns: Document ID, posting date, Document Amount (EUR), Vendor or Customer name, Line count, template (if any)
- [ ] Column-header click toggles ascending/descending sort
- [ ] Filter bar provides: date-range (two date inputs), vendor (DropdownMenu), G/L Account (DropdownMenu showing account code + name), amount-range (min/max inputs in EUR), free-text search on booking_text
- [ ] Filter state is reflected in URL search params so the view is shareable / reload-stable
- [ ] Row click navigates to `/documents/[id]`
- [ ] `/documents/[id]` shows the header (ID, date, Document Amount, Vendor/Customer name, template) and all Lines as a table
- [ ] Line table columns: line_id, gl_account (`6310 — Miete`), cost_center (or `—`), Debit/Credit indicator badge, amount (Geist Mono, German locale), booking_text, tax_code (or `—`)
- [ ] Document IDs are rendered in Geist Mono throughout
- [ ] Empty state for `/documents` when filters return no rows is sensible ("No documents match these filters. Reset filters.")
- [ ] "Flags on this Document" placeholder section exists on the detail page
- [ ] Sidebar `Documents` nav item is active on both routes
- [ ] `pnpm lint` is clean; `npx tsc --noEmit` is clean
- [ ] Conventional Commits on `main` (structure-phase, no PR)

## Blocked by

- `.scratch/booking-insights/issues/02-app-shell-and-dashboard.md`
