# ADR-0014 — Dependency policy and the eslint/typescript pins

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

Minimal, current dependencies are a security and maintenance posture. The agent
workspace proxy blocks npmjs.org, so versions are verified through the
`lockfile:generate` CI job (npm outdated + peer-dep report), not locally.

## Decision

- **Policy**: latest stable for everything; `package-lock.json` committed; `npm ci`
  always; every new *runtime* dependency requires an ADR; Renovate + scheduled
  `npm audit fix` keep things current; `lockfile:generate` refreshes the lockfile in
  CI (commit-message flag `[lockfile]`), and emits it via the job trace because
  workspace tokens cannot download artifacts.
- **Verified 2026-09-15** (CI report, pipeline `lockfile:generate`): next 16.3.5,
  react 19.3.0, mssql 12.7.2, zod 4.6.5 — all latest stable.
- **eslint stays ^9** (a ^10 unpin was attempted and reverted): eslint 10 removed
  the deprecated `context.getFilename()` API, and `eslint-plugin-react@7.37.5`
  (bundled by `eslint-config-next@16.3.5`, peer range `^3 || … || ^9.7`) still calls
  it — `npm run lint` crashes with `contextOrFilename.getFilename is not a function`
  (pipeline 2849688226, job 16503252966). Revisit when `eslint-config-next` ships an
  `eslint-plugin-react` release that declares eslint 10 support (Renovate will
  surface it).
- **typescript stays ^6.0.0**: `typescript-eslint` peer range is `>=4.8.4 <6.1.0` —
  TypeScript 7 (native port) is not yet supported by the lint toolchain. Revisit when
  typescript-eslint declares TS 7 support (Renovate will surface it).
- **Foundation additions** (this session): `@radix-ui/react-dialog` (runtime —
  ADR-0005), `@axe-core/playwright` + `@vitest/coverage-v8` (dev — ADR-0013).
- **Module #4 additions (auth-and-rbac)**:
  - `next-auth@^5` (runtime): Auth.js v5 credentials provider + JWT sessions
    (ADR-0017). `@auth/core` comes in transitively; not pinned separately.
  - `argon2@^0.44` (runtime): argon2id password hashing (OWASP-recommended
    params m=19456 KiB, t=2, p=1). Native module — ships prebuilt binaries via
    `prebuild-install` for linux-x64/glibc (the `node:22` CI image and the
    production image), so `npm ci` needs no compiler toolchain. If a target
    platform ever lacks a prebuild, the fallback is `@node-rs/argon2`
    (pure-prebuilt N-API); switching requires updating this row + ADR-0017,
    not a silent swap.

## Consequences

Version drift is visible in every lockfile job; pins carry their justification here
and get removed the moment upstream support lands.
