# ADR-0014 — Dependency policy and the eslint/typescript pins

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

Minimal, current dependencies are a security and maintenance posture. The agent
workspace proxy blocks npmjs.org, so versions are verified through the
`lockfile:generate` CI job (npm outdated + peer-dep report), not locally.

## Decision

- **Policy**: latest stable for everything; `package-lock.json` committed; `npm ci`
  always; every new *runtime* dependency requires an ADR; Renovate + scheduled
  `npm audit fix` keep things current (Dependabot since 2026-10-16, see SECURITY.md); `lockfile:generate` refreshes the lockfile in
  CI (commit-message flag `[lockfile]`), and emits it via the job trace because
  workspace tokens cannot download artifacts.
- **Verified 2026-09-15** (CI report, pipeline `lockfile:generate`): next 16.3.5,
  react 19.3.0, mssql 12.7.2, zod 4.6.5 — all latest stable.
- **2026-10-16**: next and eslint-config-next moved to 16.4.2 (advisories
  GHSA-vcvr-r3jv-pc5j and six more on 16.0.0–16.3.7: next/og image RCE, a
  pending `use cache` fill leaking Draft Mode content, and others), with the
  non-major transitive fixes for sharp and source-map-js. The security workflow
  fails on a high advisory in **production** dependencies and only reports the
  dev tool chain, because `braces` (eslint → @next/eslint-plugin-next →
  fast-glob → micromatch) carries a stack-exhaustion advisory with no fixed
  version to move to, and it never runs on a server or a client PC.
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
  - `next-auth@^5.0.0-beta.25` (runtime): Auth.js v5 credentials provider + JWT
    sessions (ADR-0017). v5 is distributed as `5.0.0-beta.x` — there is no
    stable `5.0.0` on the registry (lockfile:generate job 16519446243 rejected
    `^5.0.0` with ETARGET); the beta line is the version Auth.js documents for
    v5. `@auth/core` comes in transitively; not pinned separately.
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
