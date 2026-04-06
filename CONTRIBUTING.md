# Contributing to better-npm

Thanks for your interest in contributing! This guide will help you get started.

## Getting started

1. Fork the repository and clone your fork
2. Install dependencies: `pnpm install`
3. Create a branch for your change: `git checkout -b my-change`

## Development workflow

```bash
# Start all services
pnpm dev

# Or run individually
pnpm dev:registry   # Cloudflare Worker on :8787
pnpm dev:web        # Next.js on :3001
```

See [README.md](README.md) for full environment variable setup.

## Project structure

```
apps/
  registry/    Cloudflare Worker — registry proxy + vetting pipeline
  web/         Next.js — dashboard and auth
packages/
  cli/         @better-npm/cli — .npmrc configuration tool
```

## Making changes

- Keep PRs focused on a single change
- Follow existing code style and patterns
- Add/update types — the codebase is fully TypeScript
- Test your changes locally against the registry dev server

## Commit messages

Use clear, descriptive commit messages. There's no strict convention enforced, but prefer the format:

```
area: short description

Optional longer explanation of what and why.
```

For example:

```
registry: add rate limiting to tarball endpoint
cli: fix .npmrc path resolution on Windows
web: add package search to admin dashboard
```

## Reporting issues

Open an issue on GitHub with:

- A clear description of the problem or suggestion
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment info (OS, Node version, npm version)

## Security

If you discover a security vulnerability, please report it responsibly by emailing the maintainers directly rather than opening a public issue.
