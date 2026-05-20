/**
 * gen-corrupt.ts — Pass 2: Apply Anomaly Catalog mutations to the clean dataset
 *
 * Reads:
 *   data/data.clean.json        — clean balanced Documents from gen-clean.ts
 *   data/template-manifest.json — maps templateName → [docId, ...] in order
 *   data/anomaly-catalog.ts     — 15 typed AnomalyEntry mutations
 *
 * Writes:
 *   data/data.json              — corrupted dataset (what the app loads)
 *
 * Also updates anomaly-catalog.ts in-place, writing back the resolved
 * `target_document_ids` and `expected_doc_ids` fields.
 *
 * Run with: pnpm gen:corrupt  (or: tsx scripts/gen-corrupt.ts)
 *
 * Determinism: no randomness in the corrupt pass. Same inputs → same outputs.
 */

import fs from "fs";
import path from "path";
import { anomalyCatalog, type AnomalyMutation } from "../data/anomaly-catalog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JournalLine = {
  document_id: string;
  company_code: "1000";
  posting_date: string;
  template: string | null;
  line_id: number;
  gl_account: string;
  cost_center: string | null;
  amount_cents: number;
  currency: "EUR";
  debit_credit: "D" | "C";
  booking_text: string;
  vendor_id: string | null;
  customer_id: string | null;
  tax_code: string | null;
};

type TemplateManifest = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

const dataDir = path.join(process.cwd(), "data");
const cleanPath = path.join(dataDir, "data.clean.json");
const manifestPath = path.join(dataDir, "template-manifest.json");

const cleanLines = JSON.parse(fs.readFileSync(cleanPath, "utf-8")) as JournalLine[];
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as TemplateManifest;

// Deep-clone lines so we can mutate freely
const lines: JournalLine[] = JSON.parse(JSON.stringify(cleanLines));

// ---------------------------------------------------------------------------
// Build helper indexes
// ---------------------------------------------------------------------------

/** docId → all lines for that document */
function buildDocIndex(lines: JournalLine[]): Map<string, JournalLine[]> {
  const m = new Map<string, JournalLine[]>();
  for (const l of lines) {
    const ex = m.get(l.document_id);
    if (ex) ex.push(l); else m.set(l.document_id, [l]);
  }
  return m;
}

/** lineId → index in lines array */
function lineIndex(lines: JournalLine[], docId: string): number[] {
  return lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.document_id === docId)
    .map(({ i }) => i);
}

// Next doc ID counter for inserted documents (start at 9000 to avoid collision with clean IDs)
let insertCounter = 9000;
function nextInsertDocId(): string {
  return `190000${String(insertCounter++).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Apply a single mutation to the lines array
// Returns the doc IDs that were actually affected/created.
// ---------------------------------------------------------------------------

function applyMutation(
  mutation: AnomalyMutation,
  targetDocId: string,
): string[] {
  if (mutation.kind === "multi") {
    const affected: string[] = [];
    for (const step of mutation.steps) {
      affected.push(...applyMutation(step, targetDocId));
    }
    return affected;
  }

  if (mutation.kind === "set-field") {
    if (mutation.field.startsWith("_")) {
      // Marker-only mutation (B4, B5, C4 markers) — no actual field change
      return [targetDocId];
    }
    const idxs = lineIndex(lines, targetDocId);
    for (const idx of idxs) {
      const line = lines[idx];
      if (mutation.line_id === null || line.line_id === mutation.line_id) {
        (line as Record<string, unknown>)[mutation.field] = mutation.value;
      }
    }
    return [targetDocId];
  }

  if (mutation.kind === "insert-document") {
    // Clone the target document with a new ID and offset date
    const srcLines = lines.filter((l) => l.document_id === targetDocId);
    if (srcLines.length === 0) {
      console.error(`insert-document: source doc ${targetDocId} not found`);
      return [];
    }
    const newDocId = nextInsertDocId();
    const srcDate = srcLines[0].posting_date;
    const newDate = offsetDate(srcDate, mutation.date_offset_days);

    for (const srcLine of srcLines) {
      const newLine: JournalLine = {
        ...srcLine,
        document_id: newDocId,
        posting_date: newDate,
        booking_text: mutation.booking_text_override ?? srcLine.booking_text,
      };
      lines.push(newLine);
    }
    return [targetDocId, newDocId];
  }

  return [];
}

function offsetDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Resolve which document IDs map to which catalog entries
//
// Resolution strategy:
//   - "template:<name>:<0-based-index>"  → manifest[name][index]
//   - Specific document IDs are already resolved
//
// We define which clean doc corresponds to each catalog entry here,
// using the manifest order.
// ---------------------------------------------------------------------------

type CatalogResolution = {
  entryId: string;
  targetDocIds: string[];
};

function resolveTargets(): CatalogResolution[] {
  const resolutions: CatalogResolution[] = [];

  // --- A1: V-042 IT services #0 → "Cloud hosting Apr" → mutate to "Clud hosting Apr" ---
  resolutions.push({ entryId: "A1", targetDocIds: [manifest.itServicesV042[0]] });

  // --- A2: Staples office supplies #0, #1, #2 — umlaut + whitespace variants ---
  // Target two additional Staples docs (index 1 and 2); index 0 keeps "Büromaterial Staples" as anchor
  resolutions.push({ entryId: "A2", targetDocIds: [manifest.officeSupplies[1], manifest.officeSupplies[2]] });

  // --- A3: V-042 IT services #2 → "AWS Hosting März" → mutate to "AWS Hostng März" ---
  resolutions.push({ entryId: "A3", targetDocIds: [manifest.itServicesV042[2]] });

  // --- A4: vendorInvoiceWithVAT Bürowelt #0 — uppercase the booking text ---
  // index 0 = "Rechnung 4471" (first Bürowelt invoice)
  resolutions.push({ entryId: "A4", targetDocIds: [manifest.vendorInvoiceWithVAT[0]] });

  // --- A5: vendorInvoiceNoVAT Lufthansa #0 → "Lufthansa Flug Berlin" → "Lufhansa Flug Berlin" ---
  resolutions.push({ entryId: "A5", targetDocIds: [manifest.vendorInvoiceNoVAT[0]] });

  // --- B1: vendorInvoiceWithVAT Bürowelt #5 — duplicate 1 day later ---
  resolutions.push({ entryId: "B1", targetDocIds: [manifest.vendorInvoiceWithVAT[5]] });

  // --- B2: itServicesV042 #10 — duplicate 3 days later ---
  resolutions.push({ entryId: "B2", targetDocIds: [manifest.itServicesV042[10]] });

  // --- B3: vendorInvoiceWithVAT Microsoft #3 — same vendor+amount, reworded text, 5 days later ---
  resolutions.push({ entryId: "B3", targetDocIds: [manifest.vendorInvoiceWithVAT[12]] });

  // --- B4: storno negative case — use customerInvoice #2 and #3 as the "resplit" scenario ---
  resolutions.push({ entryId: "B4", targetDocIds: [manifest.customerInvoice[2]] });

  // --- B5: rent — both rent docs are the negative case ---
  resolutions.push({ entryId: "B5", targetDocIds: [manifest.rent[0], manifest.rent[1]] });

  // --- C1: itServicesV042 #15 — change cost_center IT → ADMIN ---
  resolutions.push({ entryId: "C1", targetDocIds: [manifest.itServicesV042[15]] });

  // --- C2: officeSupplies #6 — change tax_code on line 2 to null ---
  resolutions.push({ entryId: "C2", targetDocIds: [manifest.officeSupplies[6]] });

  // --- C3: rent #0 — change cost_center ADMIN → SALES ---
  resolutions.push({ entryId: "C3", targetDocIds: [manifest.rent[0]] });

  // --- C4: customerInvoice #5 — flip revenue line to debit ---
  resolutions.push({ entryId: "C4", targetDocIds: [manifest.customerInvoice[5]] });

  // --- C5: payroll #0 — set cost_center to null ---
  resolutions.push({ entryId: "C5", targetDocIds: [manifest.payroll[0]] });

  return resolutions;
}

// ---------------------------------------------------------------------------
// Special mutation handlers for complex cases
// ---------------------------------------------------------------------------

/** B4: storno-and-resplit negative case.
 * Creates a correction posting and two re-split documents.
 * These should NOT be flagged as duplicates because the reversal pattern distinguishes them.
 *
 * Implementation: Option B (correction posting via transit account 1900).
 * Instead of a true SAP storno (which would flip 4xxx revenue to debit side and
 * create a phantom C4 violation), we post a 2-line clearing entry that parks the
 * original AR receivable into Verrechnungskonto 1900.  4xxx accounts remain on
 * the credit side throughout, so no phantom C4 is introduced.
 *
 * Posting shape:
 *   Reversal (clearing):   Dr 1900 (+gross)  / Cr 1400 (-gross)
 *   Resplit 1 (new inv):   Dr 1400 (+half)   / Cr 4xxx (-halfNet) / Cr 3806 (-halfVat)
 *   Resplit 2 (new inv):   Dr 1400 (+rest)   / Cr 4xxx (-restNet) / Cr 3806 (-restVat)
 *
 * All lines satisfy the invariant: debit_credit=D ↔ amount_cents > 0.
 */
function applyB4Storno(sourceDocId: string): string[] {
  const srcLines = lines.filter((l) => l.document_id === sourceDocId);
  if (srcLines.length === 0) return [];

  const srcDate = srcLines[0].posting_date;
  const srcText = srcLines[0].booking_text;

  // Locate the key lines from the source customer invoice
  const arLine = srcLines.find((l) => l.gl_account === "1400" && l.amount_cents > 0);
  const revLine = srcLines.find((l) => l.gl_account.startsWith("4") && l.amount_cents < 0);
  const vatLine = srcLines.find((l) => l.gl_account === "3806" && l.amount_cents < 0);

  if (!arLine || !revLine || !vatLine) {
    console.error(`B4: could not locate AR/revenue/VAT lines in ${sourceDocId}`);
    return [sourceDocId];
  }

  const grossAmount = arLine.amount_cents; // positive (debit)

  // --- Reversal (clearing) document: parks AR into transit account 1900 ---
  // Dr 1900 Verrechnungskonto (+gross) / Cr 1400 AR (-gross)
  // No 4xxx account appears → no phantom C4 violation.
  const reversalId = nextInsertDocId();
  const reversalDate = offsetDate(srcDate, 3);
  lines.push({
    ...arLine,
    document_id: reversalId, posting_date: reversalDate,
    gl_account: "1900", debit_credit: "D", amount_cents: grossAmount,
    booking_text: `Umbuchung Verrechnungskonto: ${srcText}`,
    template: null,
  });
  lines.push({
    ...arLine,
    document_id: reversalId, posting_date: reversalDate,
    gl_account: "1400", debit_credit: "C", amount_cents: -grossAmount,
    booking_text: `Umbuchung Verrechnungskonto: ${srcText}`,
    template: null,
  });

  // --- Resplit documents: two normal customer invoices each at ~half the gross ---
  const resplitDate = offsetDate(srcDate, 5);
  const halfGross = Math.floor(grossAmount / 2);
  const restGross = grossAmount - halfGross;

  function makeResplitDoc(gross: number, label: string): string {
    const resplitId = nextInsertDocId();
    const net = Math.floor(gross / 1.19);
    const vat = gross - net;
    lines.push({
      ...arLine!, document_id: resplitId, posting_date: resplitDate,
      gl_account: "1400", debit_credit: "D", amount_cents: gross,
      booking_text: `${label}: ${srcText}`, template: "customerInvoice",
    });
    lines.push({
      ...revLine!, document_id: resplitId, posting_date: resplitDate,
      gl_account: revLine!.gl_account, debit_credit: "C", amount_cents: -net,
      booking_text: `${label}: ${srcText}`, template: "customerInvoice",
    });
    lines.push({
      ...vatLine!, document_id: resplitId, posting_date: resplitDate,
      gl_account: "3806", debit_credit: "C", amount_cents: -vat,
      booking_text: `${label}: ${srcText}`, template: "customerInvoice",
    });
    return resplitId;
  }

  const resplit1Id = makeResplitDoc(halfGross, "Umgliederung Teil 1");
  const resplit2Id = makeResplitDoc(restGross, "Umgliederung Teil 2");

  return [sourceDocId, reversalId, resplit1Id, resplit2Id];
}

/** C4: Flip a revenue line (4xxx) to debit side, then compensate on the AR line to keep balance. */
function applyC4RevenueFlip(docId: string): string[] {
  const docLines = lines.filter((l) => l.document_id === docId);
  const revLineIdx = lines.findIndex((l) => l.document_id === docId && l.gl_account.startsWith("4") && l.amount_cents < 0);
  const arLineIdx = lines.findIndex((l) => l.document_id === docId && l.gl_account === "1400" && l.amount_cents > 0);
  if (revLineIdx === -1 || arLineIdx === -1) {
    console.warn(`C4: could not find revenue/AR lines in ${docId}`);
    return [docId];
  }
  // Flip revenue line amount and D/C
  const oldRevAmt = lines[revLineIdx].amount_cents; // negative
  lines[revLineIdx].amount_cents = -oldRevAmt; // now positive (debit)
  lines[revLineIdx].debit_credit = "D";

  // Compensate: increase AR line so the doc stays balanced
  // New doc sum would be: AR + revFlipped + vat = AR + (-oldRev)*(-1) + vat
  // We need AR + (-oldRev) + vat = 0 → AR = oldRev - vat  (which is the gross AR)
  // After flip: new sum = AR + (-oldRev) + vat + 2*(-oldRev) = AR + (-3*oldRev) + vat
  // Actually just recompute: after flip, total = (oldAR) + (-oldRev) + vatLine
  // oldAR + oldRev(negated, now positive) + vat = 0 was original
  // After flip: oldAR + (-oldRev) + vat ≠ 0
  // So adjust AR to restore balance
  const sum = docLines.reduce((s, l) => {
    if (l === lines[revLineIdx]) return s + (-oldRevAmt); // flipped value
    return s + l.amount_cents;
  }, 0);
  // sum should be 0 after balance; instead it's off by 2*oldRevAmt
  // Compensate: adjust AR line by -sum
  lines[arLineIdx].amount_cents -= sum;
  if (lines[arLineIdx].amount_cents < 0) {
    lines[arLineIdx].debit_credit = "C";
  }

  return [docId];
}

// ---------------------------------------------------------------------------
// Main corrupt pass
// ---------------------------------------------------------------------------

const resolutions = resolveTargets();
const resolvedCatalog: typeof anomalyCatalog = JSON.parse(JSON.stringify(anomalyCatalog));

// Build a resolution map for quick lookup
const resolutionMap = new Map(resolutions.map((r) => [r.entryId, r.targetDocIds]));

// Validate all manifest references exist
for (const [entryId, docIds] of resolutionMap) {
  for (const docId of docIds) {
    if (!cleanLines.find((l) => l.document_id === docId)) {
      console.error(`ERROR: Catalog entry ${entryId} references non-existent docId ${docId}`);
      process.exit(1);
    }
  }
}

// Apply mutations in order
for (const entry of resolvedCatalog) {
  const targetDocIds = resolutionMap.get(entry.id) ?? [];
  entry.target_document_ids = [...targetDocIds];

  if (entry.id === "A1") {
    // Single-char delete typo in "Cloud hosting Apr" → "Clud hosting Apr"
    applyMutation({ kind: "set-field", field: "booking_text", value: "Clud hosting Apr", line_id: null }, targetDocIds[0]);
    entry.expected_doc_ids = [...targetDocIds];
  } else if (entry.id === "A2") {
    // Two Staples docs get variant texts; the third (index 0) stays as-is
    // All 3 (including the anchor) are in expected_doc_ids
    applyMutation({ kind: "set-field", field: "booking_text", value: "Bueromaterial Staples", line_id: null }, targetDocIds[0]);
    applyMutation({ kind: "set-field", field: "booking_text", value: "Büromaterial  Staples", line_id: null }, targetDocIds[1]);
    // Add the anchor doc (officeSupplies[0]) to expected as well — it's part of the cluster
    entry.expected_doc_ids = [manifest.officeSupplies[0], ...targetDocIds];
  } else if (entry.id === "A3") {
    applyMutation({ kind: "set-field", field: "booking_text", value: "AWS Hostng März", line_id: null }, targetDocIds[0]);
    // Expected: both the source "AWS Hosting März" doc and the mutated one
    // The source doc that has the correct "AWS Hosting März" is itServicesV042[3]
    entry.expected_doc_ids = [manifest.itServicesV042[3], ...targetDocIds];
  } else if (entry.id === "A4") {
    applyMutation({ kind: "set-field", field: "booking_text", value: "RECHNUNG 4471", line_id: null }, targetDocIds[0]);
    // Expected: this doc + the other Bürowelt "Rechnung 4471" if any (index 6 also has "Rechnung 4471")
    // vendorInvoiceWithVAT[0] is mutated; vendorInvoiceWithVAT[6] has "Rechnung 4471" still
    const anchor = manifest.vendorInvoiceWithVAT[6] ?? manifest.vendorInvoiceWithVAT[1];
    entry.expected_doc_ids = [anchor, ...targetDocIds];
  } else if (entry.id === "A5") {
    applyMutation({ kind: "set-field", field: "booking_text", value: "Lufhansa Flug Berlin", line_id: null }, targetDocIds[0]);
    // Expected: this doc + the other "Lufthansa Flug Berlin" docs (lufthansa[3] has same base text)
    entry.expected_doc_ids = [manifest.vendorInvoiceNoVAT[3] ?? targetDocIds[0], ...targetDocIds];
  } else if (entry.id === "B1") {
    // Clone V-007 invoice 1 day later
    const affected = applyMutation({
      kind: "insert-document",
      source_document_id: targetDocIds[0],
      date_offset_days: 1,
      booking_text_override: null,
    }, targetDocIds[0]);
    entry.target_document_ids = [...affected];
    entry.expected_doc_ids = [...affected];
  } else if (entry.id === "B2") {
    // Clone V-042 IT invoice 3 days later
    const affected = applyMutation({
      kind: "insert-document",
      source_document_id: targetDocIds[0],
      date_offset_days: 3,
      booking_text_override: null,
    }, targetDocIds[0]);
    entry.target_document_ids = [...affected];
    entry.expected_doc_ids = [...affected];
  } else if (entry.id === "B3") {
    // Clone Microsoft invoice 5 days later with reworded text
    const srcLines = cleanLines.filter((l) => l.document_id === targetDocIds[0]);
    const originalText = srcLines[0]?.booking_text ?? "Lizenzgebühr Microsoft 365";
    const rewordedText = originalText.includes("März") ? "Lizenzgebühr Microsoft 365 Apr" : "Lizenz Microsoft Office Apr";
    const affected = applyMutation({
      kind: "insert-document",
      source_document_id: targetDocIds[0],
      date_offset_days: 5,
      booking_text_override: rewordedText,
    }, targetDocIds[0]);
    entry.target_document_ids = [...affected];
    entry.expected_doc_ids = [...affected];
  } else if (entry.id === "B4") {
    // Storno negative case — create reversal + resplit, must NOT be flagged
    const inserted = applyB4Storno(targetDocIds[0]);
    entry.target_document_ids = inserted;
    entry.expected_doc_ids = inserted; // these are the docs that must NOT appear in dup output
  } else if (entry.id === "B5") {
    // Rent recurring negative case — no mutation, just record the doc IDs
    // The two rent docs appear ~30 days apart and must NOT be flagged
    entry.expected_doc_ids = [...targetDocIds]; // must NOT appear in dup output
  } else if (entry.id === "C1") {
    // V-042 invoice: cost_center IT → ADMIN on the expense line (line_id=1)
    applyMutation({ kind: "set-field", field: "cost_center", value: "ADMIN", line_id: 1 }, targetDocIds[0]);
    entry.expected_doc_ids = [...targetDocIds];
  } else if (entry.id === "C2") {
    // officeSupplies: tax_code on VAT line (line_id=2) → null
    applyMutation({ kind: "set-field", field: "tax_code", value: null, line_id: 2 }, targetDocIds[0]);
    entry.expected_doc_ids = [...targetDocIds];
  } else if (entry.id === "C3") {
    // rent: cost_center ADMIN → SALES on expense line (line_id=1)
    applyMutation({ kind: "set-field", field: "cost_center", value: "SALES", line_id: 1 }, targetDocIds[0]);
    entry.expected_doc_ids = [...targetDocIds];
  } else if (entry.id === "C4") {
    // customerInvoice: flip revenue line to debit
    const affected = applyC4RevenueFlip(targetDocIds[0]);
    entry.target_document_ids = affected;
    entry.expected_doc_ids = affected;
  } else if (entry.id === "C5") {
    // payroll: cost_center → null on expense line (line_id=1)
    applyMutation({ kind: "set-field", field: "cost_center", value: null, line_id: 1 }, targetDocIds[0]);
    entry.expected_doc_ids = [...targetDocIds];
  }

  console.log(`Applied ${entry.id}: targets=${entry.target_document_ids.join(",")}, expected=${entry.expected_doc_ids.join(",")}`);
}

// ---------------------------------------------------------------------------
// Verify all documents still balance (except C4 which intentionally breaks balance on the corrupt side)
// ---------------------------------------------------------------------------

// The C4 mutation may leave the doc unbalanced (revenue line flipped to debit).
// Re-balance by adjusting the AR line before the final check.
const c4DocId = resolvedCatalog.find((e) => e.id === "C4")?.target_document_ids[0];
if (c4DocId) {
  const c4Lines = lines.filter((l) => l.document_id === c4DocId);
  const c4Sum = c4Lines.reduce((s, l) => s + l.amount_cents, 0);
  if (c4Sum !== 0) {
    const arIdx = lines.findIndex((l) => l.document_id === c4DocId && l.gl_account === "1400");
    if (arIdx !== -1) {
      lines[arIdx].amount_cents -= c4Sum;
      lines[arIdx].debit_credit = lines[arIdx].amount_cents >= 0 ? "D" : "C";
      console.log(`C4 rebalanced: AR line adjusted by ${-c4Sum}`);
    }
  }
}

// Final balance check
let finalUnbalanced = 0;
const finalByDoc = buildDocIndex(lines);
for (const [docId, docLines] of finalByDoc) {
  const sum = docLines.reduce((s, l) => s + l.amount_cents, 0);
  if (sum !== 0) {
    console.error(`FINAL UNBALANCED: ${docId} sum=${sum}`);
    finalUnbalanced++;
  }
}
if (finalUnbalanced > 0) {
  console.error(`${finalUnbalanced} unbalanced document(s) in output!`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const outPath = path.join(dataDir, "data.json");
fs.writeFileSync(outPath, JSON.stringify(lines, null, 2));
console.log(`\nWritten ${outPath} (${finalByDoc.size} documents, ${lines.length} lines)`);

// Write back the updated catalog with resolved doc IDs.
// We serialize it as a TypeScript file (same structure as the original).
const catalogPath = path.join(dataDir, "anomaly-catalog.ts");
let catalogSrc = fs.readFileSync(catalogPath, "utf-8");

// Update each entry's target_document_ids and expected_doc_ids in the source
for (const entry of resolvedCatalog) {
  // Replace target_document_ids: []
  catalogSrc = catalogSrc.replace(
    new RegExp(`(id:\\s*"${entry.id}",[^}]*?)target_document_ids:\\s*\\[\\]`, "s"),
    `$1target_document_ids: ${JSON.stringify(entry.target_document_ids)}`
  );
  // Replace expected_doc_ids: []
  catalogSrc = catalogSrc.replace(
    new RegExp(`(id:\\s*"${entry.id}",[^}]*?)expected_doc_ids:\\s*\\[\\]`, "s"),
    `$1expected_doc_ids: ${JSON.stringify(entry.expected_doc_ids)}`
  );
}

fs.writeFileSync(catalogPath, catalogSrc);
console.log(`Updated ${catalogPath} with resolved document IDs`);

console.log(`\nSummary:`);
for (const e of resolvedCatalog) {
  console.log(`  ${e.id} (${e.kind}): targets=[${e.target_document_ids.join(",")}], expected=[${e.expected_doc_ids.join(",")}]`);
}
