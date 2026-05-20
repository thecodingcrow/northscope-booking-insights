# 11 — Task 3: Context Engineering / Knowledge Graph research write-up

**Status:** ready-for-agent

## Parent

`.scratch/booking-insights/PRD.md`

## What to build

Fill the README §Research (Task 3) section with a focused, opinionated write-up answering the four questions Northscope explicitly asked:

1. Which **context sources** would you connect (policies, SOPs, CRM notes, emails, data dictionary)?
2. Which **entities and relations** do you need (KPI ↔ definition ↔ owner ↔ query/transformation ↔ approval ↔ document)?
3. How would you do **retrieval** (vector + graph, evidence-first)?
4. **2 risks + mitigations.**

The Assignment says **6–8 bullets in the README** or a 1-page Notion doc — the README option is locked. Bullets must be specific and grounded in Northscope's actual product context (a German financial-data product analyzing SAP-style postings), not generic LLM-RAG boilerplate.

Tone is the same as the rest of the README: pragmatic, opinionated, short. Avoid academic survey language. Avoid hand-waving like "we'd build a knowledge graph" without specifics.

The "evidence-first" phrasing in the assignment is intentional — the write-up should explicitly address how retrieved context is *anchored to source documents* (so a generated answer can be traced back to the policy or note it came from), not just retrieved.

Reference the planted Anomaly Catalog as a concrete example of "context anchoring": *"In this submission, every finding ties back to specific Document IDs, so a reviewer can trace any flag to its source. The same principle applies one layer up: context-engineered answers should tie back to source policies/SOPs."*

## Acceptance criteria

- [ ] README §Research (Task 3) section exists
- [ ] Contains 6–8 bullet points (not fewer, not more)
- [ ] All four assignment questions are addressed (context sources / entities & relations / retrieval / 2 risks + mitigations)
- [ ] Context sources are named specifically (e.g., "SOP markdown in Confluence", "CRM notes via Salesforce/HubSpot API", "data dictionary as YAML in repo") not vague ("various sources")
- [ ] Entities/relations sketch includes at least these nodes: KPI, Definition, Owner, Query/Transformation, Approval, SourceDocument. Edges named.
- [ ] Retrieval section addresses both vector and graph layers and explains why both (vectors for fuzzy semantic recall, graph for typed relations and traversal)
- [ ] "Evidence-first" is addressed explicitly — how generated answers cite/anchor to source documents
- [ ] 2 risks named with 1-line mitigations each (e.g., "Stale context vs source-of-truth drift → freshness SLOs + change-event invalidation")
- [ ] Tone is opinionated and pragmatic, not academic
- [ ] No filler like "this is a complex problem" or "many solutions exist"
- [ ] Conventional Commits: `docs: Task 3 research write-up`

## Blocked by

- `.scratch/booking-insights/issues/07-vercel-deploy-and-readme.md`
