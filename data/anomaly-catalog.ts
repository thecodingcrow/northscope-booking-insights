/**
 * Anomaly Catalog — 15 planted irregularities (A1–A5, B1–B5, C1–C5).
 *
 * This is the single source of truth consumed by:
 *   - scripts/gen-corrupt.ts  (applies each mutation)
 *   - tests/feature-*.test.ts (asserts heuristics surface expected doc IDs)
 *
 * The heuristics themselves do NOT import this file.
 *
 * `target_document_ids` is populated by the generator (written back by gen-corrupt.ts).
 * `expected_doc_ids`    is the subset of document IDs the heuristic should surface.
 *
 * Money convention: positive = debit, negative = credit (signed integer cents).
 */

// ---------------------------------------------------------------------------
// Mutation shape
// ---------------------------------------------------------------------------

export type MutationSetField = {
  kind: "set-field";
  /** JSON path into the Line object, e.g. "booking_text", "cost_center" */
  field: string;
  value: string | number | null;
  /** Which line within the document to mutate (1-based line_id). null = all lines */
  line_id: number | null;
};

export type MutationInsertDocument = {
  kind: "insert-document";
  /** Source document ID to clone */
  source_document_id: string;
  /** Days to offset from the source document's posting_date */
  date_offset_days: number;
  /** Override booking_text if provided (null = keep same as source) */
  booking_text_override: string | null;
};

export type MutationMutation = MutationSetField | MutationInsertDocument;

export type AnomalyMutation =
  | MutationSetField
  | MutationInsertDocument
  | { kind: "multi"; steps: AnomalyMutation[] };

// ---------------------------------------------------------------------------
// Entry shape
// ---------------------------------------------------------------------------

export type AnomalyKind =
  | "typo"
  | "duplicate-doc"
  | "rule-violation"
  | "negative-case";

export type AnomalyEntry = {
  id: string;
  kind: AnomalyKind;
  /** Document IDs that the corrupt pass will mutate or clone. Filled in by gen-corrupt.ts */
  target_document_ids: string[];
  /**
   * For positive anomalies: doc IDs the heuristic should surface.
   * For negative-case entries: doc IDs that must NOT appear in heuristic output.
   * Filled in by gen-corrupt.ts.
   */
  expected_doc_ids: string[];
  expected_severity?: "high" | "medium" | "low";
  description: string;
  mutation: AnomalyMutation;
};

// ---------------------------------------------------------------------------
// Catalog — 15 entries
// ---------------------------------------------------------------------------

/**
 * Template selector tokens used in mutations. The generator resolves these to
 * concrete document IDs based on the clean dataset ordering.
 *
 * Format: "template:<templateName>:<0-based-instance-index>"
 * The corrupt pass resolves these to actual document IDs before applying.
 */

export const anomalyCatalog: AnomalyEntry[] = [
  // =========================================================================
  // A — Feature 1 targets: text similarity / typo detection
  // =========================================================================

  {
    id: "A1",
    kind: "typo",
    target_document_ids: ["1900000106"], // filled by gen-corrupt.ts
    expected_doc_ids: ["1900000106"], // filled by gen-corrupt.ts
    expected_severity: "high",
    description:
      'V-042 IT services booking text "Cloud hosting Apr" mutated to "Clud hosting Apr" (single-char delete). Same vendor, edit-distance 1.',
    mutation: {
      kind: "set-field",
      field: "booking_text",
      value: "Clud hosting Apr",
      line_id: null, // all lines of the document
    },
  },

  {
    id: "A2",
    kind: "typo",
    target_document_ids: ["1900000125","1900000126"],
    expected_doc_ids: ["1900000124","1900000125","1900000126"],
    expected_severity: "low",
    description:
      'Three Staples office-supplies documents: "Büromaterial Staples", "Bueromaterial Staples", "Büromaterial  Staples" (double space). Umlaut variant + whitespace variant.',
    mutation: {
      kind: "multi",
      steps: [
        {
          kind: "set-field",
          field: "booking_text",
          value: "Bueromaterial Staples",
          line_id: null,
        },
        {
          kind: "set-field",
          field: "booking_text",
          value: "Büromaterial  Staples",
          line_id: null,
        },
      ],
    },
  },

  {
    id: "A3",
    kind: "typo",
    target_document_ids: ["1900000108"],
    expected_doc_ids: ["1900000109","1900000108"],
    expected_severity: "high",
    description:
      'V-042 IT services: "AWS Hosting März" → "AWS Hostng März" (missing i). Single-char delete, same vendor.',
    mutation: {
      kind: "set-field",
      field: "booking_text",
      value: "AWS Hostng März",
      line_id: null,
    },
  },

  {
    id: "A4",
    kind: "typo",
    target_document_ids: ["1900000168"],
    expected_doc_ids: ["1900000174","1900000168"],
    expected_severity: "low",
    description:
      'Bürowelt GmbH vendor invoice: booking text uppercased to "RECHNUNG 4471". After case-fold normalization this clusters with "Rechnung 4571" on another document (vendorInvoiceWithVAT index 6) — edit-distance 1, likely a fat-finger on the digit (4471 vs 4571). The pair is discovered by the case-fold + Levenshtein heuristic, not by exact casing match.',
    mutation: {
      kind: "set-field",
      field: "booking_text",
      value: "RECHNUNG 4471",
      line_id: null,
    },
  },

  {
    id: "A5",
    kind: "typo",
    target_document_ids: ["1900000188"],
    expected_doc_ids: ["1900000191","1900000188"],
    expected_severity: "medium",
    description:
      'Lufthansa AG travel: "Lufthansa Flug Berlin" → "Lufhansa Flug Berlin" (missing t). Single-char delete; medium severity because different from the non-mutated Lufthansa doc.',
    mutation: {
      kind: "set-field",
      field: "booking_text",
      value: "Lufhansa Flug Berlin",
      line_id: null,
    },
  },

  // =========================================================================
  // B — Feature 2 targets: duplicate document detection
  // =========================================================================

  {
    id: "B1",
    kind: "duplicate-doc",
    target_document_ids: ["1900000173","1900009000"],
    expected_doc_ids: ["1900000173","1900009000"],
    expected_severity: "high",
    description:
      "V-007 (Bürowelt GmbH) vendor invoice duplicated 1 day later with identical text and amount. High-confidence duplicate.",
    mutation: {
      kind: "insert-document",
      source_document_id: "", // resolved by gen-corrupt.ts
      date_offset_days: 1,
      booking_text_override: null,
    },
  },

  {
    id: "B2",
    kind: "duplicate-doc",
    target_document_ids: ["1900000116","1900009001"],
    expected_doc_ids: ["1900000116","1900009001"],
    expected_severity: "high",
    description:
      "V-042 IT services invoice duplicated 3 days later with identical text and amount. High-confidence duplicate.",
    mutation: {
      kind: "insert-document",
      source_document_id: "",
      date_offset_days: 3,
      booking_text_override: null,
    },
  },

  {
    id: "B3",
    kind: "duplicate-doc",
    target_document_ids: ["1900000180","1900009002"],
    expected_doc_ids: ["1900000180","1900009002"],
    expected_severity: "medium",
    description:
      "Same vendor (V-061, Microsoft) and same amount, but booking text reworded slightly, 5 days apart. Medium-confidence duplicate.",
    mutation: {
      kind: "insert-document",
      source_document_id: "",
      date_offset_days: 5,
      booking_text_override: "Lizenzgebühr Microsoft 365 Apr",
    },
  },

  {
    id: "B4",
    kind: "negative-case",
    target_document_ids: ["1900000138","1900009003","1900009004","1900009005"],
    expected_doc_ids: ["1900000138","1900009003","1900009004","1900009005"],
    expected_severity: undefined,
    description:
      "Storno-and-resplit: original 1190 EUR invoice reversed, then re-posted as two 595 EUR documents. Must NOT be flagged as duplicate — reversal pattern distinguishes it.",
    mutation: {
      kind: "multi",
      steps: [
        // The three documents (original, reversal, two resplits) are inserted by gen-corrupt
        // using the insert-document mechanism with amount overrides handled in gen-corrupt.ts
        {
          kind: "set-field",
          field: "_storno_marker",
          value: "B4",
          line_id: null,
        },
      ],
    },
  },

  {
    id: "B5",
    kind: "negative-case",
    target_document_ids: ["1900000100","1900000101"],
    expected_doc_ids: ["1900000100","1900000101"],
    expected_severity: undefined,
    description:
      "Monthly rent (V-001) — same vendor + same amount + same accounts, ~30 days apart. Must NOT be flagged as duplicate — recurring-pattern filter excludes it.",
    mutation: {
      // B5 uses no mutation: the two rent documents generated by the clean pass
      // are themselves the negative case. gen-corrupt.ts records the doc IDs.
      kind: "set-field",
      field: "_negative_case_marker",
      value: "B5",
      line_id: null,
    },
  },

  // =========================================================================
  // C — Feature 3 targets: rule violations (booking manual)
  // =========================================================================

  {
    id: "C1",
    kind: "rule-violation",
    target_document_ids: ["1900000121"],
    expected_doc_ids: ["1900000121"],
    expected_severity: "medium",
    description:
      "Rule: vendor=V-042 → cost_center=IT. One V-042 invoice has cost_center changed to ADMIN. Violation.",
    mutation: {
      kind: "set-field",
      field: "cost_center",
      value: "ADMIN",
      line_id: 1, // the expense line (line 1 = Dr 6815)
    },
  },

  {
    id: "C2",
    kind: "rule-violation",
    target_document_ids: ["1900000130"],
    expected_doc_ids: ["1900000130"],
    expected_severity: "medium",
    description:
      "Rule: template=officeSupplies → tax_code=V19. One office-supplies document has tax_code set to null on the VAT line.",
    mutation: {
      kind: "set-field",
      field: "tax_code",
      value: null,
      line_id: 2, // the VAT line
    },
  },

  {
    id: "C3",
    kind: "rule-violation",
    target_document_ids: ["1900000100"],
    expected_doc_ids: ["1900000100"],
    expected_severity: "low",
    description:
      "Rule: template=rent → cost_center=ADMIN. One rent document has cost_center changed to SALES.",
    mutation: {
      kind: "set-field",
      field: "cost_center",
      value: "SALES",
      line_id: 1, // the expense line (line 1 = Dr 6310)
    },
  },

  {
    id: "C4",
    kind: "rule-violation",
    target_document_ids: ["1900000141"],
    expected_doc_ids: ["1900000141"],
    expected_severity: "high",
    description:
      "Rule: gl_account in range 4xxx → debit_credit=C. One revenue line flipped to debit side (amount_cents sign flipped, debit_credit changed to D). Breaks the double-entry balance — gen-corrupt compensates on the AR line.",
    mutation: {
      kind: "multi",
      steps: [
        // Flip revenue line to debit: negate its amount and change D/C indicator
        // gen-corrupt.ts handles the compensation on the AR line to keep balance
        {
          kind: "set-field",
          field: "_revenue_flip_marker",
          value: "C4",
          line_id: null,
        },
      ],
    },
  },

  {
    id: "C5",
    kind: "rule-violation",
    target_document_ids: ["1900000102"],
    expected_doc_ids: ["1900000102"],
    expected_severity: "low",
    description:
      "Rule: template=payroll → cost_center IS NOT NULL. One payroll document has cost_center set to null on the expense line.",
    mutation: {
      kind: "set-field",
      field: "cost_center",
      value: null,
      line_id: 1, // the payroll expense line
    },
  },
];
