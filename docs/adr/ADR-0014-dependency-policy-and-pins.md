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
- **eslint unpinned to ^10** (was ^9): `typescript-eslint` now declares
  `eslint ^8.57 || ^9 || ^10` and `eslint-config-next` `>=9`, so the original reason
  for the pin is gone. Verified green in CI on the standards branch.
- **typescript stays ^6.0.0**: `typescript-eslint` peer range is `>=4.8.4 <6.1.0` —
  TypeScript 7 (native port) is not yet supported by the lint toolchain. Revisit when
  typescript-eslint declares TS 7 support (Renovate will surface it).
- **Foundation additions** (this session): `@radix-ui/react-dialog` (runtime —
  ADR-0005), `@axe-core/playwright` + `@vitest/coverage-v8` (dev — ADR-0013).

## Consequences

Version drift is visible in every lockfile job; pins carry their justification here
and get removed the moment upstream support lands.
