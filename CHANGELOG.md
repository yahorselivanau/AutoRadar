# Changelog

## 2026-07-29

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
