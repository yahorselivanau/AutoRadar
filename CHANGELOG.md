# Changelog

## 2026-07-29

- Replaced the one-shot extraction flow with an AI SDK `ToolLoopAgent` that
  keeps multi-turn context, uses explicit server tools and answers follow-up
  questions from persisted results without restarting search.
- Added addressable `/chat/[id]` conversations, validated `UIMessage`
  persistence, structured conversation state, prompt/model metadata and
  server-side completion after client disconnect.
- Added persisted `search_requests`, `search_jobs`, per-source statuses and
  normalized offers with deterministic idempotency and independent source
  failures.
- Added signed HttpOnly guest sessions and value-first rolling 24-hour limits:
  3 new conversations, 5 real searches and 30 assistant turns; existing
  history and results remain readable after the limit.
- Added Supabase magic-link authentication, automatic ownership transfer for
  guest conversations/searches and cloud garage synchronization after login.
- Added server-only AES-256-GCM encryption for cloud VIN storage and kept VIN
  values out of AI prompts, Gateway tags and application logs.
- Pinned the agent allowlist to `openai/gpt-5.4-nano`; model fallback and web
  search remain disabled.
- Replaced the former icon-plus-name logo with the Russian-only
  `Авто Радар` wordmark, tuned in Inter Variable for desktop and mobile.
- Self-hosted the official Inter 4.1 normal and italic variable fonts from
  `rsms/inter`, including Latin and Cyrillic, with optical sizing, kerning,
  ligatures and contextual alternates enabled.
- Updated user-facing product naming, metadata and the Radar Blue favicon with
  a white Cyrillic `А`; documented that no standalone logo icon is allowed.
- Refreshed the existing application UI around the v1.2 design system:
  quieter canvas, compact navigation, responsive brand header and a real
  collapsible desktop sidebar.
- Rebuilt the chat hierarchy with pill suggestions, softer messages and
  request cards, a two-level floating composer and clearer multi-source search
  progress.
- Added source-backed product images and a data-first hierarchy to offer
  cards, with price, source, condition and compatibility actions adapted for
  desktop and mobile.
- Restyled garage, vehicle editor, empty results and sign-in as consistent
  cards/dialogs/sheets, including a mobile account sheet and a single primary
  action in empty states.
- Replaced the oversized design-system specification with concise v1.2 rules
  synthesized from 28 owner-provided desktop/mobile references.
- Defined the quiet content-first shell, floating composer, adaptive
  activity/sources layer, mobile sheets, conversational refinement and
  data-first offer hierarchy for all future UI work.
- Refined the neutral palette and added shared layout, inverse surface,
  concentric radius, layered shadow-ring, composer, image-outline and motion
  tokens.
- Split the bright blue focus signal from the deeper primary-button blue and
  darkened muted copy so ordinary text meets WCAG AA contrast on white.
- Synchronized the repository reference tokens with the runtime tokens in
  `packages/ui`, and documented adopted/rejected reference patterns separately
  to keep the main design system lightweight.
- Added the Auto1.by HTTP/Cheerio adapter from owner-supplied offline HTML,
  JavaScript and robots captures without contacting the source during
  discovery.
- Added the observed `GET /Search?pattern=...` transport, strict Auto1 URL
  boundaries, request pacing, timeout, first-page result limit and typed
  blocked/rate-limit failures.
- Added Auto1 schema.org card parsing for BYN price, explicit new condition,
  availability, seller and location, plus conservative article/part relevance;
  original/analog and compatibility remain unknown.
- Connected Auto1 to the server route, federated Actor, AI chat fan-out,
  feature flag and opt-in live smoke command.
- Added evidence-preserving Auto1 success, empty/error contract and robots
  fixtures with offline discovery limitations documented explicitly.
- Re-verified Zap.by from the owner-supplied BMW category HTML and JavaScript:
  browser rendering expanded four SSR cards to six, but all were transmission
  filters/pans mislabeled as oil pumps by the category.
- Added Zap.by category/modification metadata, exact-engine plus model-family
  fallback, evidence-preserving enrichment and authoritative product-title
  checks so category-injected false positives are not returned.
- Added the verified mislabeled-category fixture and regression coverage, and
  upgraded AI extraction to versioned `part-request.v4` canonical part names.
- Recorded the conflict between the supplied robots capture and the live
  official `robots.txt`; prohibited query XHR/pagination remain disabled.
- Fixed the BMW 3 / 2016 hood relevance incident: Motorland now matches exact
  make, model, generation, category and generation year range from structured
  product URL segments instead of loose title substrings.
- Added safe per-source search diagnostics with query fingerprints, normalized
  constraints, durations, offer counts, clarifications and typed failures;
  raw queries and VIN values are not logged.
- Added Zap.by numeric series aliases (`BMW 3` → unique `3 Series`), strict
  requested-part identity checks and generation/body clarification instead of
  silently preferring a broad base variant.
- Added mixed-model/year adapter fixtures, live BMW 3 smoke verification and
  mobile/desktop E2E coverage for the generation clarification flow.
- Added the Motorland.by HTTP/Cheerio adapter for robots-allowed SSR text
  search of used parts, including strict URL boundaries, pacing, timeout,
  result limit and typed access errors.
- Added verified Motorland success/empty/error fixtures, conservative
  category/vehicle filtering, BYN prices, source article numbers, images,
  characteristics and reproducible `used` classification.
- Connected Motorland to the web search alongside Zap.by with independent
  failure handling, a server route, feature flag, Actor support and opt-in
  live smoke command.
- Documented Motorland's live robots/terms checks, observed form fields,
  selectors, public URLs and unsupported OEM/VIN claims.
- Removed all prefilled UI data: the hard-coded Peugeot/Golf garage, mobile
  vehicle label, sample conversations and default window-regulator scenario.
- Added a free-form contextual chat flow. Follow-up messages now update the
  current Zod-validated request, and every extracted vehicle/part field can
  also be corrected manually before launching Zap.by.
- Added real search loading, empty, clarification, error and offer states with
  one direct `Искать` action.
- Added a persistent guest garage with create, edit, activate and delete
  actions for vehicle name, VIN, make, model, year, generation/version, body,
  engine, transmission, doors and notes.
- Added deterministic VIN extraction in chat. Full VIN values are validated
  and kept out of the AI prompt; lists display only a masked value.
- Added shared garage state for the desktop vehicle switcher, mobile header
  and chat request context.
- Upgraded structured extraction to the AI SDK 6 `generateText` +
  `Output.object` API and added the versioned `part-request.v3` prompt.
- Added mobile/desktop E2E coverage for real-search rendering, empty garage,
  persistent vehicle creation, masked VIN and VIN handoff from chat.
- Rebuilt Zap.by search around structured vehicle and part constraints,
  generation/engine picker resolution, product-page characteristics and
  applicability.
- Added deterministic conflict filtering, `confirmed`/`possible` match
  evidence and structured clarification for ambiguous variants such as
  three-door versus five-door parts.
- Added persisted active-vehicle and per-vehicle/per-part clarification context
  in the chat, validated with Zod and reused automatically on later searches.
- Added product-card fixtures for Peugeot 308 front-left 3D/5D window
  regulators and configurable candidate enrichment through
  `ZAP_ENRICH_LIMIT`.
- Added conservative Zap.by side/position filtering for Russian, English and
  Polish labels; the verified Peugeot 308 fixture now narrows six mixed
  window-regulator offers to the two explicitly front-left offers.
- Switched the chat search flow to Zap.by only and disabled Remzona in the
  example environment without removing its adapter.
- Added owner-authorized private-MVP `/carparts/search/{query}` support behind
  `ZAP_EXPERIMENTAL_SEARCH_ENABLED`; it must be disabled before public
  production and replaced with the planned Zap.by feed.
- Added the Zap.by HTTP/Cheerio adapter for robots-allowed SSR vehicle
  catalogue pages, with strict URL boundaries.
- Added Zap.by make/model/category resolution, normalized BYN offers, source
  route, feature flag, live smoke, verified fixtures and unit tests.
- Documented that Zap.by VIN, exact generation/engine picker and pagination
  remain disabled.
- Added headed Remzona Playwright discovery with trace, network capture,
  storage state (including IndexedDB), final HTML and screenshot artifacts.
- Remzona now resolves a public category/product path, loads SSR catalog HTML,
  parses BYN prices, availability, delivery and absolute product/image URLs.
- Added deterministic price-source reporting and typed diagnostics:
  `HTTP_BLOCKED`, `EMPTY_RESPONSE`, `PRICE_NOT_FOUND`, `DOM_CHANGED`,
  `TIMEOUT`.
- Added an opt-in Playwright fallback and a live smoke disabled by default.
- Added an automated discovery mode and direct verified
  `/steklopodiemnik` lookup that avoids one network request.
- Discovery now preserves trace/network/storage/screenshot artifacts even when
  initial navigation times out.
- Added verified Remzona catalog/search fixtures and minimal HTTP/fallback
  tests.

## 2026-07-28

### Added

- pnpm/Turborepo workspace and strict TypeScript configuration.
- Next.js mobile-first application shell and first product screens.
- Interactive mock search flow, garage, results filtering and auth placeholder.
- Shared Zod domain schemas and deterministic mock source adapter.
- Initial Supabase schema/RLS migration.
- Project-scoped Supabase MCP configuration for the AutoRadar hosted project.
- Unit tests, browser smoke tests and project handoff documentation.
- GitHub repository publication on the `main` production branch.
- Vercel project and verified production deployment at
  `https://autoradar.vercel.app`.
- Server-side AI request extraction through Vercel AI Gateway and DeepSeek.
- Versioned `part-request.v1` prompt with Zod-validated structured output.
- Remzona public-XHR discovery report with verified success, empty and 429
  fixtures.
- Shared Remzona HTTP/Cheerio adapter with typed errors, serialized pacing,
  feature flag, fixture tests and a live smoke command.
- Direct `POST /api/search/remzona` route and real Remzona product cards in the
  chat flow.
- Mocked Remzona chat E2E coverage on mobile and desktop.

### Changed

- Moved approved design tokens into the shared UI package.
- Disabled the account-wide Supabase MCP connection inside AutoRadar to avoid
  cross-project database operations; other repositories keep their global access.
- Configured the Vercel project root as `apps/web` with the Next.js framework
  preset.
- Removed fictional offers from the chat and connected the first real source.
- Switched the AI Gateway model to `openai/gpt-5.4-nano` and removed
  provider-specific DeepSeek copy from the chat.
- Extended normalized offers with descriptions, OEM arrays, seller ratings and
  SHA-256 raw payload hashes.
- Removed the stalled Bamper/Firecrawl implementation, route, commands and
  runtime configuration; Bamper no longer blocks the MVP.
- Restored source-access rules: respect public access boundaries, never bypass
  CAPTCHA/paywalls and never disable TLS verification.
- Aligned the Playwright dev-server URL with `localhost` so Next.js 16 hydrates
  correctly during E2E tests.
