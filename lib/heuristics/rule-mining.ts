/**
 * Feature 3 — Booking Manual / Rule Mining
 *
 * Pure function: mineRules(documents, lines): Rule[]
 *
 * Enumerates exactly 8 candidate (antecedent, consequent) shapes and surfaces
 * rules with high support and confidence. Each rule includes evidence Documents
 * (that satisfy the rule) and violations (Documents where the antecedent holds
 * but the consequent doesn't).
 *
 * Atom grammar and Rule type are defined here and exported for consumers.
 *
 * See Issue 06 and docs/adr for full spec.
 */

import type { DocumentView, JournalLine } from "@/lib/types";
import { vendorById } from "@/lib/data/store";

// ---------------------------------------------------------------------------
// Atom grammar — locked (spec §06)
// ---------------------------------------------------------------------------

export type Atom =
  | { kind: "vendor"; id: string }
  | { kind: "customer"; id: string }
  | { kind: "template"; name: string }
  | { kind: "gl_account_equals"; account: string }
  | { kind: "gl_account_in_range"; range: "4xxx" | "6xxx" }
  | { kind: "cost_center"; cc: string | null } // null = IS NOT NULL (existence check)
  | { kind: "tax_code"; code: string | null }
  | { kind: "debit_credit"; side: "D" | "C" };

// ---------------------------------------------------------------------------
// Rule type
// ---------------------------------------------------------------------------

export type Rule = {
  /** Stable sequential ID, e.g. "R-001" */
  id: string;
  /** One or two antecedent atoms (conjunction) */
  antecedent: Atom[];
  consequent: Atom;
  /** Count of Documents (or Lines for gl_account_in_range rules) where antecedent holds */
  support: number;
  /** P(consequent | antecedent), in [0, 1] */
  confidence: number;
  /** 1–5 supporting doc_ids (antecedent AND consequent both hold) */
  evidence: string[];
  /** doc_ids where antecedent holds but consequent doesn't */
  violations: string[];
  /** Plain-language description with resolved names */
  description: string;
};

// ---------------------------------------------------------------------------
// Internal candidate type (before ID assignment)
// ---------------------------------------------------------------------------

type RuleCandidate = Omit<Rule, "id">;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group lines by document_id using a plain Map (Map.groupBy not in Node 21 TS types). */
function groupLinesByDocument(lines: JournalLine[]): Map<string, JournalLine[]> {
  const map = new Map<string, JournalLine[]>();
  for (const line of lines) {
    const bucket = map.get(line.document_id);
    if (bucket) {
      bucket.push(line);
    } else {
      map.set(line.document_id, [line]);
    }
  }
  return map;
}

/** Returns sorted unique values of an array. */
function sortedUnique<T>(arr: T[], compare?: (a: T, b: T) => number): T[] {
  return [...new Set(arr)].sort(compare);
}

/** Pick up to `n` elements from an array. */
function take<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

/**
 * Resolve vendor name for descriptions.
 * Format: "V-042 (V&C Cloud GmbH)" if name known, else just "V-042".
 */
function vendorLabel(vendorId: string): string {
  const vendor = vendorById.get(vendorId);
  return vendor ? `${vendorId} (${vendor.name_de})` : vendorId;
}

// ---------------------------------------------------------------------------
// Shape 1: vendor=X → gl_account=Y
// Antecedent holds for a document if: vendor_id = X AND document has expense debit lines
// Expense debit lines = debit lines with gl_account starting with 4, 5, or 6
// Consequent holds: all expense debit lines use gl_account = Y
// ---------------------------------------------------------------------------

function mineVendorToGlAccount(
  docsByVendor: Map<string, DocumentView[]>,
  linesByDoc: Map<string, JournalLine[]>
): RuleCandidate[] {
  const candidates: RuleCandidate[] = [];

  for (const [vendorId, vendorDocs] of docsByVendor) {
    // Filter to docs with expense debit lines
    const docsWithExpense = vendorDocs.filter((doc) => {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      return docLines.some(
        (l) => l.debit_credit === "D" && /^[456]/.test(l.gl_account)
      );
    });
    if (docsWithExpense.length < 5) continue;

    // Count dominant GL among expense debit lines
    const glCounts = new Map<string, number>();
    for (const doc of docsWithExpense) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      for (const l of docLines) {
        if (l.debit_credit === "D" && /^[456]/.test(l.gl_account)) {
          glCounts.set(l.gl_account, (glCounts.get(l.gl_account) ?? 0) + 1);
        }
      }
    }
    if (glCounts.size === 0) continue;
    const [domGL] = [...glCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    let conHolds = 0;
    const evidence: string[] = [];
    const violations: string[] = [];

    for (const doc of docsWithExpense) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      const expenseLines = docLines.filter(
        (l) => l.debit_credit === "D" && /^[456]/.test(l.gl_account)
      );
      if (expenseLines.every((l) => l.gl_account === domGL[0])) {
        conHolds++;
        if (evidence.length < 5) evidence.push(doc.document_id);
      } else {
        violations.push(doc.document_id);
      }
    }

    const confidence = conHolds / docsWithExpense.length;
    if (confidence < 0.85) continue;

    candidates.push({
      antecedent: [{ kind: "vendor", id: vendorId }],
      consequent: { kind: "gl_account_equals", account: domGL[0] },
      support: docsWithExpense.length,
      confidence,
      evidence: take(evidence, 3),
      violations,
      description: `Vendor ${vendorLabel(vendorId)} → G/L account ${domGL[0]}`,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Shape 2: vendor=X → cost_center=Y
// Antecedent holds: doc has vendor_id=X AND has at least one non-null cost_center
// Consequent holds: all non-null cost_centers in doc equal Y
// ---------------------------------------------------------------------------

function mineVendorToCostCenter(
  docsByVendor: Map<string, DocumentView[]>,
  linesByDoc: Map<string, JournalLine[]>
): RuleCandidate[] {
  const candidates: RuleCandidate[] = [];

  for (const [vendorId, vendorDocs] of docsByVendor) {
    // Only docs with at least one non-null cost_center
    const docsWithCC = vendorDocs.filter((doc) => {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      return docLines.some((l) => l.cost_center !== null);
    });
    if (docsWithCC.length < 5) continue;

    // Count dominant cost_center
    const ccCounts = new Map<string, number>();
    for (const doc of docsWithCC) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      for (const l of docLines) {
        if (l.cost_center !== null) {
          ccCounts.set(l.cost_center, (ccCounts.get(l.cost_center) ?? 0) + 1);
        }
      }
    }
    if (ccCounts.size === 0) continue;
    // Tie-break: alphabetical ascending
    const [domCC] = [...ccCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

    let conHolds = 0;
    const evidence: string[] = [];
    const violations: string[] = [];

    for (const doc of docsWithCC) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      const ccValues = [...new Set(docLines.map((l) => l.cost_center).filter((c): c is string => c !== null))];
      if (ccValues.every((cc) => cc === domCC[0])) {
        conHolds++;
        if (evidence.length < 5) evidence.push(doc.document_id);
      } else {
        violations.push(doc.document_id);
      }
    }

    const confidence = conHolds / docsWithCC.length;
    if (confidence < 0.85) continue;

    candidates.push({
      antecedent: [{ kind: "vendor", id: vendorId }],
      consequent: { kind: "cost_center", cc: domCC[0] },
      support: docsWithCC.length,
      confidence,
      evidence: take(evidence, 3),
      violations,
      description: `Vendor ${vendorLabel(vendorId)} → Cost Center ${domCC[0]}`,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Shape 3: vendor=X → tax_code=Y
// Antecedent: doc has vendor_id=X AND has debit lines with non-null tax_code
// Consequent: all such debit lines have tax_code=Y
// ---------------------------------------------------------------------------

function mineVendorToTaxCode(
  docsByVendor: Map<string, DocumentView[]>,
  linesByDoc: Map<string, JournalLine[]>
): RuleCandidate[] {
  const candidates: RuleCandidate[] = [];

  for (const [vendorId, vendorDocs] of docsByVendor) {
    // Only docs with debit lines that have non-null tax_code
    const docsWithTax = vendorDocs.filter((doc) => {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      return docLines.some((l) => l.debit_credit === "D" && l.tax_code !== null);
    });
    if (docsWithTax.length < 5) continue;

    // Count dominant tax_code
    const tcCounts = new Map<string, number>();
    for (const doc of docsWithTax) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      for (const l of docLines) {
        if (l.debit_credit === "D" && l.tax_code !== null) {
          tcCounts.set(l.tax_code, (tcCounts.get(l.tax_code) ?? 0) + 1);
        }
      }
    }
    if (tcCounts.size === 0) continue;
    const [domTC] = [...tcCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

    let conHolds = 0;
    const evidence: string[] = [];
    const violations: string[] = [];

    for (const doc of docsWithTax) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      const debitTaxLines = docLines.filter((l) => l.debit_credit === "D" && l.tax_code !== null);
      if (debitTaxLines.every((l) => l.tax_code === domTC[0])) {
        conHolds++;
        if (evidence.length < 5) evidence.push(doc.document_id);
      } else {
        violations.push(doc.document_id);
      }
    }

    const confidence = conHolds / docsWithTax.length;
    if (confidence < 0.85) continue;

    candidates.push({
      antecedent: [{ kind: "vendor", id: vendorId }],
      consequent: { kind: "tax_code", code: domTC[0] },
      support: docsWithTax.length,
      confidence,
      evidence: take(evidence, 3),
      violations,
      description: `Vendor ${vendorLabel(vendorId)} → Tax Code ${domTC[0]}`,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Shape 4: template=T → cost_center=Y
// For large templates (≥5 docs): require support≥5 and confidence≥0.85
// For small templates (<5 docs): require support≥2 and any violations (prescriptive rule)
// ---------------------------------------------------------------------------

function mineTemplateToCostCenter(
  docsByTemplate: Map<string, DocumentView[]>,
  linesByDoc: Map<string, JournalLine[]>
): RuleCandidate[] {
  const candidates: RuleCandidate[] = [];

  for (const [templateName, tmplDocs] of docsByTemplate) {
    const isSmallTemplate = tmplDocs.length < 5;

    // Docs with at least one non-null cost_center
    const docsWithCC = tmplDocs.filter((doc) => {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      return docLines.some((l) => l.cost_center !== null);
    });

    const effectiveSupport = docsWithCC.length;
    if (effectiveSupport < 2) continue;
    if (!isSmallTemplate && effectiveSupport < 5) continue;

    // Count dominant cost_center (tie-break alphabetically ascending)
    const ccCounts = new Map<string, number>();
    for (const doc of docsWithCC) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      for (const l of docLines) {
        if (l.cost_center !== null) {
          ccCounts.set(l.cost_center, (ccCounts.get(l.cost_center) ?? 0) + 1);
        }
      }
    }
    if (ccCounts.size === 0) continue;
    const [domCC] = [...ccCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

    let conHolds = 0;
    const evidence: string[] = [];
    const violations: string[] = [];

    for (const doc of docsWithCC) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      const ccValues = [
        ...new Set(docLines.map((l) => l.cost_center).filter((c): c is string => c !== null)),
      ];
      if (ccValues.every((cc) => cc === domCC[0])) {
        conHolds++;
        if (evidence.length < 5) evidence.push(doc.document_id);
      } else {
        violations.push(doc.document_id);
      }
    }

    const confidence = conHolds / effectiveSupport;
    // Large templates: require confidence ≥ 0.85
    if (!isSmallTemplate && confidence < 0.85) continue;
    // Small templates: must have at least one violation AND at least one compliant doc
    if (isSmallTemplate && violations.length === 0) continue;
    if (isSmallTemplate && evidence.length === 0) continue;

    candidates.push({
      antecedent: [{ kind: "template", name: templateName }],
      consequent: { kind: "cost_center", cc: domCC[0] },
      support: effectiveSupport,
      confidence,
      evidence: take(evidence, 3),
      violations,
      description: `Template ${templateName} → Cost Center ${domCC[0]}`,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Shape 5: template=T → tax_code=Y
// Consequent: all debit lines of the document have tax_code=Y
// ---------------------------------------------------------------------------

function mineTemplateToTaxCode(
  docsByTemplate: Map<string, DocumentView[]>,
  linesByDoc: Map<string, JournalLine[]>
): RuleCandidate[] {
  const candidates: RuleCandidate[] = [];

  for (const [templateName, tmplDocs] of docsByTemplate) {
    const isSmallTemplate = tmplDocs.length < 5;
    if (!isSmallTemplate && tmplDocs.length < 5) continue;
    if (isSmallTemplate && tmplDocs.length < 2) continue;

    // Find dominant tax_code from all debit lines
    const tcCounts = new Map<string, number>();
    for (const doc of tmplDocs) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      for (const l of docLines) {
        if (l.debit_credit === "D" && l.tax_code !== null) {
          tcCounts.set(l.tax_code, (tcCounts.get(l.tax_code) ?? 0) + 1);
        }
      }
    }
    if (tcCounts.size === 0) continue;
    const [domTC] = [...tcCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

    let conHolds = 0;
    const evidence: string[] = [];
    const violations: string[] = [];

    for (const doc of tmplDocs) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      const debitLines = docLines.filter((l) => l.debit_credit === "D");
      if (debitLines.length === 0) continue;
      if (debitLines.every((l) => l.tax_code === domTC[0])) {
        conHolds++;
        if (evidence.length < 5) evidence.push(doc.document_id);
      } else {
        violations.push(doc.document_id);
      }
    }

    const confidence = conHolds / tmplDocs.length;
    if (!isSmallTemplate && confidence < 0.85) continue;
    // Small templates: must have at least one violation AND at least one compliant doc
    if (isSmallTemplate && violations.length === 0) continue;
    if (isSmallTemplate && evidence.length === 0) continue;

    candidates.push({
      antecedent: [{ kind: "template", name: templateName }],
      consequent: { kind: "tax_code", code: domTC[0] },
      support: tmplDocs.length,
      confidence,
      evidence: take(evidence, 3),
      violations,
      description: `Template ${templateName} → Tax Code ${domTC[0]}`,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Shape 6: template=T → cost_center IS NOT NULL (existence check)
// Consequent: the document has at least one line with a non-null cost_center
// Represented as { kind: "cost_center", cc: null } meaning "IS NOT NULL"
// ---------------------------------------------------------------------------

function mineTemplateToHasCostCenter(
  docsByTemplate: Map<string, DocumentView[]>,
  linesByDoc: Map<string, JournalLine[]>
): RuleCandidate[] {
  const candidates: RuleCandidate[] = [];

  for (const [templateName, tmplDocs] of docsByTemplate) {
    const isSmallTemplate = tmplDocs.length < 5;
    if (!isSmallTemplate && tmplDocs.length < 5) continue;
    if (isSmallTemplate && tmplDocs.length < 2) continue;

    let conHolds = 0;
    const evidence: string[] = [];
    const violations: string[] = [];

    for (const doc of tmplDocs) {
      const docLines = linesByDoc.get(doc.document_id) ?? [];
      const hasCC = docLines.some((l) => l.cost_center !== null);
      if (hasCC) {
        conHolds++;
        if (evidence.length < 5) evidence.push(doc.document_id);
      } else {
        violations.push(doc.document_id);
      }
    }

    const confidence = conHolds / tmplDocs.length;
    if (!isSmallTemplate && confidence < 0.85) continue;
    // Small template: must have at least one violation AND at least one compliant doc (evidence)
    if (isSmallTemplate && violations.length === 0) continue;
    if (isSmallTemplate && evidence.length === 0) continue;

    candidates.push({
      antecedent: [{ kind: "template", name: templateName }],
      consequent: { kind: "cost_center", cc: null }, // null = IS NOT NULL existence check
      support: tmplDocs.length,
      confidence,
      evidence: take(evidence, 3),
      violations,
      description: `Template ${templateName} → Cost Center is not null`,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Shape 7: gl_account_in_range=4xxx → debit_credit=C
// PER-LINE rule: revenue lines (4xxx) should be on the credit side
// Support = count of lines with gl_account starting with '4'
// Violations = docs that have a 4xxx debit line
// ---------------------------------------------------------------------------

function mine4xxxToCredit(lines: JournalLine[]): RuleCandidate[] {
  const fourXLines = lines.filter((l) => l.gl_account.startsWith("4"));
  const support = fourXLines.length;
  if (support < 5) return [];

  const creditLines = fourXLines.filter((l) => l.debit_credit === "C");
  const confidence = creditLines.length / support;
  if (confidence < 0.85) return [];

  // Evidence = doc_ids from credit lines (compliant)
  const evidenceDocs = sortedUnique(creditLines.map((l) => l.document_id));
  const violationLines = fourXLines.filter((l) => l.debit_credit !== "C");
  const violationDocs = sortedUnique(violationLines.map((l) => l.document_id));

  return [
    {
      antecedent: [{ kind: "gl_account_in_range", range: "4xxx" }],
      consequent: { kind: "debit_credit", side: "C" },
      support,
      confidence,
      evidence: take(evidenceDocs, 3),
      violations: violationDocs,
      description: "G/L accounts 4xxx → posted to credit side",
    },
  ];
}

// ---------------------------------------------------------------------------
// Shape 8: gl_account_in_range=6xxx → cost_center IS NOT NULL
// PER-LINE rule: expense lines (6xxx) should have a cost_center
// ---------------------------------------------------------------------------

function mine6xxxToHasCostCenter(lines: JournalLine[]): RuleCandidate[] {
  const sixXLines = lines.filter((l) => l.gl_account.startsWith("6"));
  const support = sixXLines.length;
  if (support < 5) return [];

  const withCCLines = sixXLines.filter((l) => l.cost_center !== null);
  const confidence = withCCLines.length / support;
  if (confidence < 0.85) return [];

  const evidenceDocs = sortedUnique(withCCLines.map((l) => l.document_id));
  const violationLines = sixXLines.filter((l) => l.cost_center === null);
  const violationDocs = sortedUnique(violationLines.map((l) => l.document_id));

  return [
    {
      antecedent: [{ kind: "gl_account_in_range", range: "6xxx" }],
      consequent: { kind: "cost_center", cc: null },
      support,
      confidence,
      evidence: take(evidenceDocs, 3),
      violations: violationDocs,
      description: "G/L accounts 6xxx → Cost Center is not null",
    },
  ];
}

// ---------------------------------------------------------------------------
// Dominance filter
// If a vendor-based rule and a template-based rule share the same consequent value,
// prefer the one with higher support (and drop the other if confidence is within 0.05).
// ---------------------------------------------------------------------------

function applyDominance(candidates: RuleCandidate[]): RuleCandidate[] {
  const result: RuleCandidate[] = [];
  const dropped = new Set<number>();

  for (let i = 0; i < candidates.length; i++) {
    if (dropped.has(i)) continue;
    const a = candidates[i];

    for (let j = i + 1; j < candidates.length; j++) {
      if (dropped.has(j)) continue;
      const b = candidates[j];

      // Same consequent?
      if (JSON.stringify(a.consequent) !== JSON.stringify(b.consequent)) continue;

      // Both single-atom antecedents with different kind (vendor vs template)
      if (a.antecedent.length === 1 && b.antecedent.length === 1) {
        // If confidence difference <= 0.05, keep the one with higher support
        if (Math.abs(a.confidence - b.confidence) <= 0.05) {
          if (a.support >= b.support) {
            dropped.add(j);
          } else {
            dropped.add(i);
            break;
          }
        }
      }
    }

    if (!dropped.has(i)) {
      result.push(a);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main export: mineRules
// ---------------------------------------------------------------------------

export function mineRules(
  documents: DocumentView[],
  lines: JournalLine[]
): Rule[] {
  // Build line index by document_id
  const linesByDoc = groupLinesByDocument(lines);

  // Build document indexes
  const docsByVendor = new Map<string, DocumentView[]>();
  const docsByTemplate = new Map<string, DocumentView[]>();

  for (const doc of documents) {
    if (doc.vendor_id) {
      const bucket = docsByVendor.get(doc.vendor_id);
      if (bucket) bucket.push(doc);
      else docsByVendor.set(doc.vendor_id, [doc]);
    }
    if (doc.template) {
      const bucket = docsByTemplate.get(doc.template);
      if (bucket) bucket.push(doc);
      else docsByTemplate.set(doc.template, [doc]);
    }
  }

  // Enumerate all 8 candidate shapes
  const all: RuleCandidate[] = [
    ...mineVendorToGlAccount(docsByVendor, linesByDoc),   // Shape 1
    ...mineVendorToCostCenter(docsByVendor, linesByDoc),  // Shape 2
    ...mineVendorToTaxCode(docsByVendor, linesByDoc),     // Shape 3
    ...mineTemplateToCostCenter(docsByTemplate, linesByDoc), // Shape 4
    ...mineTemplateToTaxCode(docsByTemplate, linesByDoc),    // Shape 5
    ...mineTemplateToHasCostCenter(docsByTemplate, linesByDoc), // Shape 6
    ...mine4xxxToCredit(lines),                           // Shape 7
    ...mine6xxxToHasCostCenter(lines),                    // Shape 8
  ];

  // Apply dominance filter
  const dominated = applyDominance(all);

  // Sort strategy:
  // 1. Rules WITH violations come before rules with no violations (diagnostic value first)
  // 2. Within each group: support desc, confidence desc
  // 3. Tie-break on antecedent serialization for stability
  dominated.sort((a, b) => {
    const aHasViolations = a.violations.length > 0 ? 1 : 0;
    const bHasViolations = b.violations.length > 0 ? 1 : 0;
    if (bHasViolations !== aHasViolations) return bHasViolations - aHasViolations;
    if (b.support !== a.support) return b.support - a.support;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return JSON.stringify(a.antecedent).localeCompare(JSON.stringify(b.antecedent));
  });

  // Cap at 10 rules (spec: 5–10)
  const top = dominated.slice(0, 10);

  // Assign stable IDs
  const rules: Rule[] = top.map((candidate, idx) => ({
    ...candidate,
    id: `R-${String(idx + 1).padStart(3, "0")}`,
  }));

  return rules;
}
