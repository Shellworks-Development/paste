# paste

A small pastebin for code and markdown. Paste, share a link, done — markdown renders by
default, and raw source is always one request away.

- **Markdown by default** — pastes render with sanitized markdown and syntax-highlighted
  fences; switch to raw whenever you need the source.
- **Lots of languages** — ~190 highlight.js languages, loaded lazily so the editor stays light.
- **Size tiers** — 1 MiB anonymously, 5 MiB with an API key.
- **API keys on demand** — generate one from the account page; issuance is rate limited and
  cooled down per IP.
- **End-to-end encryption** — opt in per paste; the body is encrypted in your browser and the
  viewer prompts for the key.
- **Unsafe mode** — opt in per paste to allow custom CSS (scoped to the preview, still sanitized)
  for demos, games and visual experiments.
- **Expiry and burn-after-read** — from 10 minutes to a year, or never, with scheduled cleanup.
- **Public or unlisted** — unlisted by default, public pastes show up in a recent list.

## Stack

- Vue 3 + `vue-router`, built with Vite+ (`vp`)
- Hono API running on the edge
- D1 for paste metadata and API keys, R2 for paste bodies
- `marked` + `highlight.js` + `DOMPurify` for rendering
- Vitest (Workers pool) for API tests, Oxlint/Oxfmt for lint and format

## Quick start

```bash
pnpm install
cp .dev.vars.example .dev.vars   # local admin token for key management
pnpm db:migrate                  # create local D1 tables
pnpm dev                         # http://localhost:5173
```

The dev server emulates D1, R2 and the rate limiters locally, so no account is needed.

## Commands

| Command                                      | What it does                                                 |
| -------------------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                                   | Start the dev server                                         |
| `pnpm build`                                 | Type-check and build for production                          |
| `pnpm preview`                               | Preview the production build locally                         |
| `pnpm deploy`                                | Build and deploy                                             |
| `pnpm check`                                 | Format, lint and type-check (`vp check`)                     |
| `pnpm typecheck`                             | Vue + Worker type-check only                                 |
| `pnpm test`                                  | Run the API test suite                                       |
| `pnpm typegen`                               | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |
| `pnpm db:migrate` / `pnpm db:migrate:remote` | Apply D1 migrations locally / remotely                       |
| `pnpm db:create` / `pnpm r2:create`          | Create the D1 database / R2 bucket                           |

## API

Base URL is the site itself. Full interactive reference is at [`/api`](https://paste.shellworks.dev/api).

```bash
# create (markdown by default)
curl -X POST https://paste.shellworks.dev/api/pastes \
  -H 'Content-Type: application/json' \
  -d '{"content": "# hello", "title": "greeting", "expires_in": "1w"}'

# read
curl https://paste.shellworks.dev/api/pastes/<id>        # JSON with content
curl https://paste.shellworks.dev/api/pastes/<id>/meta   # metadata only
curl https://paste.shellworks.dev/raw/<id>               # text/plain
curl -o file.txt https://paste.shellworks.dev/dl/<id>    # download

# keys (self-service)
curl -X POST https://paste.shellworks.dev/api/tokens -d '{"name": "laptop"}'
```

Options: `language` (any highlight.js id), `visibility` (`unlisted` | `public` | `encrypted`),
`expires_in` (`10m`, `1h`, `1d`, `1w`, `2w`, `1m`, `6m`, `1y`, `never`, or seconds),
`burn_after_read`, `unsafe` (scoped custom CSS), `title`. Send `Authorization: Bearer psk_…` to
use a key.

## Encryption

Set `visibility` to `encrypted` and the body is encrypted in the browser before upload:

- AES-GCM with a key derived from your passphrase via PBKDF2-SHA256 (210,000 iterations)
- stored as `paste-encrypted:v1:<iterations>:<salt>:<iv>:<ciphertext>`
- share with `?key=…` (or a `#key=…` fragment) and the viewer unlocks automatically
- without a key, the viewer shows _"This document is encrypted, enter the encryption key to view it."_
- a wrong key fails the AES-GCM authentication check, so tampered ciphertext never decrypts

The server only ever stores the envelope, so it cannot read the contents.

## Deploy

```bash
pnpm db:create        # note the database_id
# paste the id into wrangler.jsonc
pnpm r2:create
pnpm db:migrate:remote
pnpm exec wrangler secret put ADMIN_TOKEN   # optional, for admin key management
pnpm deploy
```

The Worker name, bindings, custom domain and cron schedule all live in `wrangler.jsonc`.
`not_found_handling` is `single-page-application`, so the SPA is served for free while
`/api/*`, `/raw/*`, `/dl/*` and `/p/*/raw` run the Worker first.

## Privacy

Pastes are stored on Cloudflare's network in the operator's own account: metadata and API key
hashes in a D1 SQLite database, paste bodies in an R2 bucket. Nothing is sent anywhere else —
no analytics, no third-party fonts or CDNs.

- **Encrypted pastes** are encrypted with AES-GCM before upload. The key never leaves your
  browser and is not stored server-side; without it, the body is unreadable even to the operator.
- **API keys** are stored only as SHA-256 hashes, prefixed with `psk_` for identification.
  They are shown once when generated and cannot be recovered.
- **IP addresses** are used transiently to enforce rate limits, and a per-IP key-issuance
  record is kept to throttle key generation and pruned after 24 hours.
- **Your browser** stores your API key and theme preference in `localStorage`, nothing else
  beyond standard cookies used by the platform for security.
- **Deletion** happens automatically when a paste expires (checked every 15 minutes) or after
  a burn-after-read fetch, or manually by the key that created it.

## License

MIT © Shellworks Development
