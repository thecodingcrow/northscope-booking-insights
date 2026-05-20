# Money is stored as integer cents end-to-end

Amounts are represented as signed integers in minor units (cents) everywhere: in the generated JSON data file, in the in-memory store, in all heuristic computations, and in the API/server boundary. A line debiting EUR 2,500.00 is stored as `250000`; a credit of EUR 1,190.00 is stored as `-119000`. The signed convention follows the data model (positive = debit, negative = credit, signs sum to zero per document).

## Why

Floating-point is never acceptable for money. Decimal strings are safe but invite accidental string concatenation, require parse/serialize on every arithmetic operation, and add a per-operation cost for no benefit at this scale. A decimal library (Big.js, decimal.js) is production-grade overkill for a synthetic 200–800-row dataset where every value already fits comfortably in `Number.MAX_SAFE_INTEGER` (up to ~90 trillion EUR). Integer cents is the standard hygienic answer for application-layer money handling and signals correct instincts without ceremony.

## Consequences

- Display layer is the sole formatter: `formatMoney(amount_cents, locale)` produces strings like `"2.500,00 EUR"` (German locale by default).
- Anyone opening the raw `data.json` will see `250000` rather than `2500.00`. This is intentionally unconventional for a *data* artifact, and is called out in the README so a reviewer understands the choice.
- Conversion to other currencies (out of scope for this project — see README "Deliberately didn't do") would still work in cents if added later, since FX rates are themselves rationals expressible as integer scaling factors.
