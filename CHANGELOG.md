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

### Changed

- Moved approved design tokens into the shared UI package.
- Disabled the account-wide Supabase MCP connection inside AutoRadar to avoid
  cross-project database operations; other repositories keep their global access.

### Known limitations

- No real source adapter has been researched or connected yet.
- Search, auth, garage persistence and AI remain demonstration-only.
