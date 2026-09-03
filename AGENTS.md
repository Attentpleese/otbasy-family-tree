# Repository Guidelines

## Project Structure & Module Organization

This repository is a Vite + React family-tree application backed by Supabase.

- `src/domain/`: person and relationship models plus graph operations.
- `src/tree/`: FamilyUnit construction, layout, connection routing, gestures, and tree UI.
- `src/editor/`: authenticated editing, login, drafts, and photo tools.
- `src/services/`: Supabase persistence and photo storage adapters.
- `src/locales/`: Russian and Kazakh translations.
- `supabase/`: schema, storage policies, and incremental SQL migrations.
- `screenshots/`: visual verification artifacts; do not commit temporary captures unless they document a requested change.

Tests are colocated with source modules as `*.test.js`.

## Build, Test, and Development Commands

- `npm install`: install locked dependencies.
- `npm run dev`: start Vite at `http://localhost:5173/`.
- `npm run dev:lan`: expose the development server on the local network.
- `npm test`: run the Vitest suite once.
- `npm run build`: create the production bundle in `dist/`.
- `npm run preview`: serve the built bundle locally.

Run tests and a production build before submitting changes.

## Coding Style & Naming Conventions

Use ES modules, two-space indentation, semicolons, and single quotes. Prefer small pure functions for graph and layout calculations. Use `camelCase` for variables/functions, `PascalCase` for React components, and uppercase names for shared constants such as `FAMILY_GAP`.

Keep UI strings in `src/locales/ru.json` and `src/locales/kz.json`. No formatter or linter is configured, so match surrounding code and use `git diff --check` before committing.

## Testing Guidelines

Vitest covers graph mutations, FamilyUnits, layout, routing, gestures, editor drafts, and localization. Add regression tests for every layout bug. Preserve the six-step reference scenario in `src/tree/layoutGroundTruth.test.js`; verify exact centers/gaps and row-overlap invariants rather than relying only on snapshots.

Name tests after observable behavior, for example: `keeps every spouse adjacent inside a sibling group`.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects consistent with history, such as `Fix family-side layout anchoring`. Keep unrelated refactors and generated screenshots out of commits.

Pull requests should include a concise behavior summary, test/build results, related issue links, migration instructions when applicable, and before/after screenshots for visual changes.

## Security & Configuration

Copy `.env.example` to `.env`; never commit credentials. Only public Supabase anon keys belong in client configuration. Put schema and policy changes in `supabase/` and document the required SQL execution order.
