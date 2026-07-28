# Changelog

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

### Changed

- Moved approved design tokens into the shared UI package.
- Disabled the account-wide Supabase MCP connection inside AutoRadar to avoid
  cross-project database operations; other repositories keep their global access.
- Configured the Vercel project root as `apps/web` with the Next.js framework
  preset.
- Removed fictional offers from the chat and search results UI; the product now
  shows an honest unavailable state until a real adapter is connected.

### Known limitations

- No real source adapter has been researched or connected yet.
- Search sources, auth and garage persistence remain demonstration-only.
- DeepSeek requests are configured but currently blocked by the Vercel account:
  paid AI Gateway credits or a DeepSeek BYOK credential are required.
