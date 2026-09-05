# Releasing

This repository uses GitHub Actions and release-it for automated versioning and publishing.

## Workflow Overview

1. CI runs on PRs and pushes to `main`.
2. When CI succeeds on `main`, the Release workflow runs.
3. Release automation bumps the version, updates `CHANGELOG.md`, creates a tag, and creates a GitHub Release.
4. Tag push triggers npm publishing with provenance.

## CI Workflow

File: `.github/workflows/ci.yml`

- Installs dependencies with `npm ci`
- Runs `npm run lint`
- Runs `npm run build`

## Release Workflow

File: `.github/workflows/release.yml`

- Triggered by successful CI workflow runs on `main`
- Executes `npm run release -- --ci`
- Uses release-it and conventional changelog tooling
- Pushes release commit and tag

## Publish Workflow

File: `.github/workflows/publish.yml`

- Triggered on semantic version tags (`*.*.*`)
- Runs `npm publish --provenance --access public`
- Uses OIDC (`id-token: write`) and may use `NPM_TOKEN` fallback

## Local Release Command

```bash
npm run release
```

Use local release only when needed and only with maintainers' approval.

## Important Notes

- Do not manually edit `CHANGELOG.md`.
- Keep release-related changes in dedicated PRs when possible.
- Conventional Commit messages are preferred for cleaner automated versioning.
