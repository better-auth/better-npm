# better-npm

Every npm package release, vetted before it reaches your `node_modules`.

## Quick start

```bash
npx @better-npm/cli
```

That's it. One line in `.npmrc` and every `npm install` routes through better-npm. Safe packages are served instantly; flagged ones are held until vetted.

## What gets checked

| Check | How |
| --- | --- |
| **Malicious code** | Static pattern detection + AI analysis of source diffs |
| **Typosquatting** | Blocklist of known typosquats — blocks packages that impersonate popular ones |
| **Supply chain attacks** | Dependency diffing, maintainer change detection, rapid-publish flagging |

Every new version published to npm is picked up, analyzed, and assigned a risk score. Low-risk versions are auto-approved; high-risk ones are held for further review.

## How it works

```
npm install ──▶ better-npm registry ──▶ npmjs.org
                       │
                 vetting pipeline
              (static + AI analysis)
```

Your npm client talks to `registry.better-npm.dev` instead of `registry.npmjs.org`. The registry proxies to upstream npm, but every new version goes through a vetting pipeline before it can be installed.

## Project structure

| Package | Description |
| --- | --- |
| `apps/registry` | Cloudflare Worker — registry proxy and vetting pipeline |
| `apps/web` | Next.js dashboard — auth, install activity, admin tools |
| `packages/cli` | CLI to configure `.npmrc` and sign in |

### Tech stack

- **Registry**: [Hono](https://hono.dev) on Cloudflare Workers, D1, R2, KV
- **AI analysis**: [Vercel AI SDK](https://sdk.vercel.ai) + [OpenRouter](https://openrouter.ai)
- **Web**: Next.js, Tailwind CSS, [Better Auth](https://better-auth.com), Turso
- **CLI**: tsup, [@clack/prompts](https://github.com/bombshell-dev/clack)

## Development

```bash
git clone https://github.com/better-auth/better-npm.git
cd better-npm
pnpm install
pnpm dev
```

See the environment variable setup below before running.

### Environment variables

**Registry** (`apps/registry/.dev.vars`):

```
OPENROUTER_API_KEY=your-openrouter-key
INTERNAL_SECRET=a-shared-secret
```

**Web** (`apps/web/.env`):

```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-token
GITHUB_CLIENT_ID=your-github-oauth-id
GITHUB_CLIENT_SECRET=your-github-oauth-secret
BETTER_AUTH_SECRET=your-auth-secret
REGISTRY_URL=http://localhost:8787
INTERNAL_SECRET=same-shared-secret
```

### Publishing & login

better-npm is a read-only registry — it only handles installs. To publish packages or log in to npmjs.org, pass `--registry` directly:

```bash
npm login --registry https://registry.npmjs.org
npm publish --registry https://registry.npmjs.org
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
