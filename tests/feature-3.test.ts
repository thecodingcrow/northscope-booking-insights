/**
 * Feature 3 — Booking Manual / Rule Mining
 *
 * Tests assert:
 *   1. mineRules() returns a Rule[] with the correct type shape.
 *   2. For each catalog entry C1–C5, a matching rule exists in the output.
 *   3. For each, the rule's violations array contains the expected doc_id.
 *
 * RED phase: written before the implementation exists — these tests must fail first.
 * GREEN phase: mineRules implementation in lib/heuristics/rule-mining.ts makes them pass.
 */

import { describe, it, expect } from "vitest";
import { mineRules } from "@/lib/heuristics/rule-mining";
import type { Rule, Atom } from "@/lib/heuristics/rule-mining";
import { documentViews } from "@/lib/data/views";
import { lines } from "@/lib/data/store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findMatchingRule(
  allRules: Rule[],
  antecedentMatch: (a: Atom) => boolean,
  consequentMatch: (a: Atom) => boolean
): Rule | undefined {
  return allRules.find(
    (r) => r.antecedent.some(antecedentMatch) && consequentMatch(r.consequent)
  );
}

// ---------------------------------------------------------------------------
// Fixtures — lazy singleton (rules computed once per test run)
// ---------------------------------------------------------------------------

let cachedRules: Rule[] | undefined;

function getRules(): Rule[] {
  if (!cachedRules) {
    cachedRules = mineRules(documentViews, lines);
  }
  return cachedRules;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("mineRules", () => {
  // ---- Structural / type shape ----

  it("returns an array", () => {
    expect(Array.isArray(getRules())).toBe(true);
  });

  it("returns between 5 and 10 rules (inclusive)", () => {
    const n = getRules().length;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(10);
  });

  it("every rule has required fields with correct types", () => {
    for (const rule of getRules()) {
      expect(typeof rule.id).toBe("string");
      expect(rule.id).toMatch(/^R-\d{3}$/);
      expect(Array.isArray(rule.antecedent)).toBe(true);
      expect(rule.antecedent.length).toBeGreaterThanOrEqual(1);
      expect(rule.antecedent.length).toBeLessThanOrEqual(2);
      expect(rule.consequent).toBeTruthy();
      expect(typeof rule.consequent.kind).toBe("string");
      expect(typeof rule.support).toBe("number");
      expect(rule.support).toBeGreaterThan(0);
      expect(typeof rule.confidence).toBe("number");
      expect(rule.confidence).toBeGreaterThan(0);
      expect(rule.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(rule.evidence)).toBe(true);
      expect(Array.isArray(rule.violations)).toBe(true);
      expect(typeof rule.description).toBe("string");
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });

  it("rules with violations appear before rules without violations", () => {
    const allRules = getRules();
    let seenNoViolation = false;
    for (const rule of allRules) {
      if (rule.violations.length === 0) {
        seenNoViolation = true;
      } else if (seenNoViolation) {
        // A rule with violations appeared after a rule without — violation of ordering
        expect(rule.violations.length, "Rule with violations found after a no-violation rule").toBe(0);
      }
    }
  });

  it("within each violation-group, rules are sorted by support desc, confidence desc", () => {
    const allRules = getRules();
    const withViolations = allRules.filter((r) => r.violations.length > 0);
    const withoutViolations = allRules.filter((r) => r.violations.length === 0);

    for (const group of [withViolations, withoutViolations]) {
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i];
        const b = group[i + 1];
        if (a.support === b.support) {
          expect(a.confidence).toBeGreaterThanOrEqual(b.confidence);
        } else {
          expect(a.support).toBeGreaterThanOrEqual(b.support);
        }
      }
    }
  });

  it("evidence list has 1–5 doc IDs per rule", () => {
    for (const rule of getRules()) {
      expect(rule.evidence.length).toBeGreaterThanOrEqual(1);
      expect(rule.evidence.length).toBeLessThanOrEqual(5);
    }
  });

  it("output is deterministic across two calls", () => {
    const first = mineRules(documentViews, lines);
    const second = mineRules(documentViews, lines);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  // ---- C1: vendor=V-042 → cost_center=IT ----
  // Violation: doc 1900000121 has cost_center changed to ADMIN

  it("C1: rule vendor=V-042 → cost_center=IT is discovered", () => {
    const rule = findMatchingRule(
      getRules(),
      (a) => a.kind === "vendor" && a.id === "V-042",
      (c) => c.kind === "cost_center" && c.cc === "IT"
    );
    expect(rule, "No rule found for vendor=V-042 → cost_center=IT").toBeDefined();
  });

  it("C1: violation doc 1900000121 appears in violations", () => {
    const rule = findMatchingRule(
      getRules(),
      (a) => a.kind === "vendor" && a.id === "V-042",
      (c) => c.kind === "cost_center" && c.cc === "IT"
    );
    expect(rule).toBeDefined();
    expect(rule!.violations).toContain("1900000121");
  });

  // ---- C2: template=officeSupplies → tax_code=V19 ----
  // Violation: doc 1900000130 has VAT line tax_code cleared to null

  it("C2: rule template=officeSupplies → tax_code=V19 is discovered", () => {
    const rule = findMatchingRule(
      getRules(),
      (a) => a.kind === "template" && a.name === "officeSupplies",
      (c) => c.kind === "tax_code" && c.code === "V19"
    );
    expect(rule, "No rule found for template=officeSupplies → tax_code=V19").toBeDefined();
  });

  it("C2: violation doc 1900000130 appears in violations", () => {
    const rule = findMatchingRule(
      getRules(),
      (a) => a.kind === "template" && a.name === "officeSupplies",
      (c) => c.kind === "tax_code" && c.code === "V19"
    );
    expect(rule).toBeDefined();
    expect(rule!.violations).toContain("1900000130");
  });

  // ---- C3: template=rent → cost_center=ADMIN ----
  // Violation: doc 1900000100 has cost_center changed to SALES

  it("C3: rule template=rent → cost_center=ADMIN is discovered", () => {
    const rule = findMatchingRule(
      getRules(),
      (a) => a.kind === "template" && a.name === "rent",
      (c) => c.kind === "cost_center" && c.cc === "ADMIN"
    );
    expect(rule, "No rule found for template=rent → cost_center=ADMIN").toBeDefined();
  });

  it("C3: violation doc 1900000100 appears in violations", () => {
    const rule = findMatchingRule(
      getRules(),
      (a) => a.kind === "template" && a.name === "rent",
      (c) => c.kind === "cost_center" && c.cc === "ADMIN"
    );
    expect(rule).toBeDefined();
    expect(rule!.violations).toContain("1900000100");
  });

  // ---- C4: gl_account_in_range=4xxx → debit_credit=C ----
  // Violation: doc 1900000141 has revenue line flipped to debit side

  it("C4: rule gl_account_in_range=4xxx → debit_credit=C is discovered", () => {
    const rule = findMatchingRule(
      getRules(),
      (a) => a.kind === "gl_account_in_range" && a.range === "4xxx",
      (c) => c.kind === "debit_credit" && c.side === "C"
    );
    expect(rule, "No rule found for gl_account_in_range=4xxx → debit_credit=C").toBeDefined();
  });

  it("C4: violation doc 1900000141 appears in violations", () => {
    const rule = findMatchingRule(
      getRules(),
      (a) => a.kind === "gl_account_in_range" && a.range === "4xxx",
      (c) => c.kind === "debit_credit" && c.side === "C"
    );
    expect(rule).toBeDefined();
    expect(rule!.violations).toContain("1900000141");
  });

  // ---- C5: template=payroll → cost_center IS NOT NULL ----
  // Consequent represented as { kind: "cost_center", cc: null } meaning IS NOT NULL existence check.
  // Violation: doc 1900000102 has payroll expense line cost_center cleared

  it("C5: rule template=payroll → cost_center IS NOT NULL is discovered", () => {
    const rule = findMatchingRule(
      getRules(),
      (a) => a.kind === "template" && a.name === "payroll",
      (c) => c.kind === "cost_center" && c.cc === null
    );
    expect(rule, "No rule found for template=payroll → cost_center IS NOT NULL").toBeDefined();
  });

  it("C5: violation doc 1900000102 appears in violations", () => {
    const rule = findMatchingRule(
      getRules(),
      (a) => a.kind === "template" && a.name === "payroll",
      (c) => c.kind === "cost_center" && c.cc === null
    );
    expect(rule).toBeDefined();
    expect(rule!.violations).toContain("1900000102");
  });
});
