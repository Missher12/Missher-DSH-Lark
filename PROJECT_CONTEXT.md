# Project Context

## Goal

`dsh-lark` is an independently installable Feishu/Lark remote-development Bundle for DeepSeek Harness. It is published from `Missher12/dsh-lark`, never from or as part of the DeepSeek Harness Desktop release repository.

## Architecture

- `src/` contains the Host transport, durable owner/binding/queue state, signed cards/actions, projection, App Registration, and injected Harness Settings client.
- `tests/` contains plugin behavior, package composition, Profile lifecycle, and migration coverage.
- `scripts/run-in-harness.mjs` materializes the source into the pinned Harness SDK commit declared by `.harness-base.json`.
- `.github/workflows/ci.yml` builds/tests on Linux, macOS, and Windows, creates one Linux canonical tarball, then verifies those same bytes on macOS and Windows.
- The public package is `@missher/dsh-lark@0.2.0`; runtime identity remains `id: lark` and Storage Domain `dsh_lark` schema 1.

## Current status

The 0.2.0 release candidate implements QR onboarding, manual fallback, scanner-constrained first-DM owner admission, project and title-only Session selection, a non-destructive project-picker cancel action, answer-first coalesced streaming cards, bounded tool facts, model/provider/reasoning/time/token facts, and exact-turn signed controls. Offline behavior, package build, Profile add/dump/remove, and staged migration are acceptance gates. Real Feishu/Lark acceptance still requires user-owned App credentials and is not performed by CI.

## Safety boundaries

Never commit credentials or identity values. Do not copy legacy OpenClaw/Hermes state. Do not modify Harness core, the live `web` Profile, `$DSH_HOME/lark`, or ordinary Session history during build and release validation.
