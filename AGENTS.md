# PQC v2 Backend — Agent Guide

> 🚧 **Status: in design, not yet implemented.** This is the fresh, search-driven rebuild of the
> PQC backend. Full reference: `.claude/CONTEXT.md`. Spec + implementation plan live in `docs/plans/`.

## What changed vs v1
v1 searched a **curated list of stores** (Daraz, PriceOye, Telemart…), each with its own scraper.
v2 replaces that with a **hybrid search-driven** model: a web **search API** discovers product pages
across *any* Pakistani store, plus a few **direct sources** (Daraz API, PriceOye) as a quota-independent
safety net. This fixes v1's core weakness — products only one shop stocks (or older models) returned 0.

## The 4 locked design decisions
1. **Hybrid search** — search API for discovery + 2–3 direct scrapers for reliability.
2. **Express 5 + MongoDB** (CommonJS) — same stack as v1.
3. **Port the proven v1 logic** — NLP, relevance filter, comparison/clustering, review decay, Gemini
   client, Mongo models are copied in. Only the **scraping/search layer is rebuilt**.
4. **Structured-data-first extraction** — read free JSON-LD/OpenGraph from each page; call **Gemini
   only when structured data is missing** (respects the free Gemini quota).

## Search flow (target)
```
GET /api/v1/search?query=&city=&lang=&description=
 NLP → LRU cache → DISCOVERY (search API + direct sources, parallel) → url guard (SSRF + denylist)
   → FETCH+EXTRACT (JSON-LD/OG, Gemini fallback, per-URL 8s timeout, Promise.allSettled)
   → relevance filter → normalize → comparison (cheapest + savings) → reviews (page + blog lane)
   → group A/B/C/D → cache → respond → background Mongo upsert
```

## Constraints
- **Only paid service = Gemini** (free tier — quota is the binding constraint; extraction is
  structured-data-first to protect it). **Search API = SerpApi** (only for now — Serper fallback deferred, pluggable), real Google links.
- No Apify / paid Redis / paid queue / Google Maps. MongoDB Atlas free tier. Default city: Islamabad.
- **SSRF guard:** https-only; never private IPs/localhost; a tiny non-store denylist. **No store allowlist** — the product gate is extraction.

## Frontend
Unchanged — v2 emits the **same response shape** as v1 (`{ results:{A,B,C,D}, primary, storeResults, meta }`),
so the existing Next.js frontend in `pqc-app/frontend` works as-is. Gemini classifies each source into A/B/C/D.

## Layout (planned)
```
src/
  discovery/   searchApi/ (SerpApi; Serper deferred) · directSources.js (Daraz+PriceOye) · index.js (merge/dedupe)
  extract/     fetchPage.js · structured.js (JSON-LD/OG, pure) · geminiExtract.js (fallback) · index.js
  extract/urlGuard.js  SSRF guard + tiny non-store denylist (no store allowlist)
  nlp/ services/ models/ scrapers/utils/   ← ported from v1
docs/
  plans/       spec + implementation plan
  resources/   FYP statement, survey, reference docs
```

## Docs
- `.claude/CONTEXT.md` — full design/architecture reference.
- `docs/plans/` — the design spec and step-by-step implementation plan (written before any code).
- `docs/resources/` — FYP problem statement, survey findings, and reference material.
