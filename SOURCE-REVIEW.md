# Source review

This archive contains readable implementation and tests, not an installable Decky package.

- src/: React/TypeScript UI, audio ownership, notifications, themes.
- backend/src/: Cast receiver, HTTP/WebSocket service, extraction and playback synchronization.
- main.py: Decky RPC, Firefox authentication, library, queue and local playback.
- py_modules/: bundled Python dependencies and Firefox import helper.
- backend/tests/ and tests/: regression tests.
- rollup.config.js, tsconfig.json, package.json and lockfile: build configuration.

Install Node dependencies with the provided lockfile (pnpm install --frozen-lockfile), then run npm run build and npm run build:backend. Run npm test, npm run test:python, and npx vitest run backend/tests.

The installer archive also includes Linux executables and compiled bundles; those are intentionally omitted here. No browser cookies or account credentials are included.

Review priorities: background work while Steam throttles UI timers, Cast state reporting, cancellation during track changes, and receiver volume events. Likes act on the Firefox-authenticated plugin account. Steam owns the outer notification overlay layout.
