# Northscope Booking Insights — Context

A mini-app that analyzes SAP-style journal entries to surface red flags, near-duplicates, possible duplicate postings, and to mine "booking rules" from observed patterns. Built as a take-home for the Northscope full-stack interview.

## Language

**Convention:** code, field names, and UI labels are English. Data *content* (booking texts, account names, vendor names) is German — this is what real SAP data in a DACH-market company looks like, and it makes the text-similarity feature more interesting (umlauts, compound words, German typo patterns).

### Domain entities

**Document**:
A single balanced accounting event identified by a `document_id` (SAP-style 10-digit number). Contains 2+ lines whose signed amounts sum to zero.
_Avoid_: Beleg (German term — fine in UI tooltips, not in code), transaction, posting (ambiguous — see Posting), entry (ambiguous — see Journal Entry).

**Line**:
One side of an entry within a Document, identified by `(document_id, line_id)`. Carries one debit or one credit. Many lines per document; each line records the change to exactly one G/L account.
_Avoid_: Row (UI term only), Position (German term — fine in UI tooltips), Item.

**Journal Entry**:
Synonym for Document. The Notion brief uses "journal entry" and "Document" interchangeably. We prefer **Document** in code; "Journal Entry" appears only in user-facing copy and the README.

**Posting**:
The act of recording a Document. As a noun, **avoid** — too easily confused with Line. Use "Document was posted on <date>" (verb) only.

**G/L Account** (`gl_account`):
The chart-of-accounts code being debited or credited (e.g., `"6310"` = Rent expense). Each line touches exactly one G/L Account.
_Avoid_: Sachkonto (German term), Account (ambiguous — Vendor and Customer are also "accounts" in some uses).

**Cost Center** (`cost_center`):
Optional analytical dimension on an expense line indicating which internal unit bore the cost (e.g., `"ADMIN"`, `"SALES"`, `"IT"`).
_Avoid_: Kostenstelle, Department.

**Vendor** (`vendor_id`):
A supplier the company owes money to. Appears on the credit side of Accounts Payable lines and on the debit side of expense lines that originated from a vendor invoice. Mutually exclusive with Customer on the same Line.
_Avoid_: Kreditor, Supplier (used interchangeably in some industries — here always **Vendor**), Creditor.

**Customer** (`customer_id`):
A buyer who owes the company money. Appears on the debit side of Accounts Receivable lines. Mutually exclusive with Vendor on the same Line.
_Avoid_: Debitor, Client.

**Booking Text** (`booking_text`):
Free-text short description on each Line (typically German). Often identical across the Lines of one Document. The primary input to Feature 1 (text-similarity / typo detection).
_Avoid_: Buchungstext, Description, Memo, Narration.

**Tax Code** (`tax_code`):
Optional VAT classification on a Line (e.g., `"V19"` = input VAT 19%, `"V07"` = reduced VAT 7%). Drives how the line participates in VAT reporting.
_Avoid_: Steuerschlüssel, VAT code.

**Posting Date** (`posting_date`):
The accounting date on which the Document takes effect. All Lines of a Document share the same Posting Date.
_Avoid_: Buchungsdatum, Transaction Date, Document Date (these refer to different SAP fields we are *not* modeling).

### Derived concepts

**Document Amount**:
The total volume of an event: `sum of positive amounts in the document` (equivalently `sum of debits`, equivalently `abs(sum of credits)`). NOT the signed sum (which is always zero). Used by Feature 2 to compare document sizes.

**Anomaly**:
An irregularity in the data that one of the three features is designed to surface. May be deliberately planted (Anomaly Catalog) or naturally emergent.

**Anomaly Catalog**:
The curated list of deliberately planted irregularities in the generated dataset. Acts as the ground truth against which the heuristics are evaluated.

**Transaction Template**:
A parameterized recipe used by the data generator to produce one balanced Document (e.g., "vendor invoice with VAT", "rent payment", "customer payment"). Each template knows which G/L Accounts, Tax Codes, and Cost Centers are valid for its kind of event.

**Rule** (in the Booking Manual sense):
A discovered pattern of the form *antecedent → consequent* derived from the data, with **support** (how often it holds) and **confidence** (how often the consequent holds when the antecedent does). Example: *vendor V-042 → (gl_account=6815 ∧ tax_code=V19 ∧ cost_center=IT)*, support=18 Documents, confidence=1.00.

**Rule Violation**:
A Document or Line where the antecedent of a Rule applies but the consequent doesn't.

### Flagged ambiguities

**"Account" alone** is ambiguous — could mean G/L Account, Vendor, or Customer. Always qualify: "G/L Account", "Vendor account", "Customer account".

**"Entry"** is ambiguous (Document vs. Line). Never use bare "entry" in code; "journal entry" in user-facing text means **Document**.

### Example dialogue

> **Dev**: For Feature 2, when I cluster documents by "amount", I'm using the signed sum, right?
> **Domain**: No — that's always zero, the book is balanced. You want the **Document Amount**: the sum of positive line amounts, or equivalently the total debits. That's the size of the event.
>
> **Dev**: OK. And for the text feature, if I find that doc 123 and doc 456 both have a line with booking text "Cloud hosting Apr", that's a duplicate?
> **Domain**: Not necessarily. The same booking text often appears on every Line of one Document — that's normal because the text describes the *event*, not the line. So before clustering you de-dupe by `(document_id, normalized_text)`. The interesting signal is two *different* Documents whose texts are suspiciously similar.
>
> **Dev**: And if I see two Documents from the same Vendor for the same Document Amount on the same day, that's a duplicate booking?
> **Domain**: Probably — but check the booking text and the offset accounts before flagging. Monthly rent from the same Vendor for the same Amount 30 days apart is *legitimate*, not a duplicate. The heuristic has to distinguish.
