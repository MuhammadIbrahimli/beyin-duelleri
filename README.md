# Beyin Duelleri

Beyin Duelleri is an Azerbaijani-first brain-experiment PWA. A player completes a short interactive test, gets a result card, challenges a friend, and can compare results through group and city rankings. The interface is available in Azerbaijani and Russian.

The project uses TypeScript, Vite, Cloudflare Workers with Hono, and Cloudflare D1. The original product concept is documented in [SPEC.md](SPEC.md); the current test inventory and limitations are in [docs/tests-catalog.md](docs/tests-catalog.md).

## Run locally

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run db:migrate:local
npm run dev
```

Open [http://localhost:8787](http://localhost:8787). The development command builds the frontend, prepares local `.dev.vars` values, and runs the Worker against a local D1 database.

The local admin page is [http://localhost:8787/admin](http://localhost:8787/admin). The admin token is in `.dev.vars` under `ADMIN_TOKEN`.

## Common commands

| Task | Command |
| --- | --- |
| Run tests | `npm test` |
| Check types | `npm run typecheck` |
| Run the frontend dev server separately | `npm run dev:web` |
| Seed sample players | `npm run db:seed` |
| Remove sample players | `npm run db:unseed` |
| Recalculate percentiles | `npm run db:cron` |
| List `TODO(verify)` markers | `npm run todo` |

A source tag can be tested with a URL such as `http://localhost:8787/?s=video3`.

## Deploy to Cloudflare

First-time setup provisions D1, runs migrations, builds and deploys the app, and configures secrets:

```bash
npx wrangler login
npm run setup
```

Save the generated admin token when it is shown. For subsequent releases:

```bash
npm run deploy
```

For Web Push reminders, configure a VAPID subject after setup:

```bash
npx wrangler secret put VAPID_SUBJECT
```

Use a `mailto:` contact or a site URL. Reminders are disabled if neither a subject nor a site origin is available. The hourly cron sends reminders during the configured evening window in Baku. It processes up to 40 subscriptions per run.

One Worker serves the static frontend from `dist/` and the API under `/api/*`. Configure a custom domain in Cloudflare and update `config/brand.ts` if the result cards should use it.

## Product features

- **55 short experiments** across memory, attention, speed, perception, and reasoning. See the [test catalog](docs/tests-catalog.md).
- **Beyin balı** score from 0 to 100, based on each player's best result per test.
- **Profiles and rankings:** optional name, city, and email; live player and city rankings.
- **Groups:** share a group code and compare scores, up to 50 people per group and five groups per player.
- **Challenges:** invite friends with a link and compare results.
- **Languages:** Azerbaijani and Russian, with the preferred language remembered on the device.
- **Recovery code:** restore an account on another device using a code whose hash is stored in the database.
- **Result cards and streak reminders:** shareable summaries and optional Web Push notifications.
- **Rate limiting:** requests are limited by a daily-rotating salted IP hash; raw IP addresses are not stored.

Email is stored only after separate consent. The app is a set of short behavioral games, not a diagnostic, IQ test, or medical tool.

## Documentation

- [Product concept and MVP specification](SPEC.md)
- [Experiment catalog and known limitations](docs/tests-catalog.md)
- [Growth plan for Azerbaijan](docs/growth-az.md)
- [Advertiser notes](docs/advertisers.md)

## License

See [LICENSE](LICENSE).

## Beyin duellisi 2.0

Competitive layer: a five-discipline match (reaction, memory, math, attention, logic), a shared matchmaking queue with rating-based pairing, training bots (Asan, Orta, Çətin, Ekspert), Elo rating with leagues, XP, Qızıl currency, quests, achievements, a cosmetic shop, Marafon, leaderboards, friends, teams, team challenges, city battles, seasons, streaks and shareable result cards. The interface is available in Azerbaijani (AZ) and Russian (RU); the switch is on every screen.

- Everything that affects a result or a reward is computed on the server. The client sends only moves and choices.
- Settings live in `config/`: `match.ts`, `matchmaking.ts`, `rating.ts`, `economy.ts`, `quests.ts`, `achievements.ts`, `shop.ts`, `marafon.ts`, `seasons.ts`, `season-rewards.ts`, `streak.ts`, `city-battles.ts`, `universities.ts` (official names from the Ministry of Science and Education pages, see the comment in the file) and `ads.ts`.
- Migrations `0019`–`0023` only add tables and one nullable column per change; existing data is not touched.
- Durable Object `Queue` (shared matchmaking queue) requires migration `v2` in `wrangler.toml`.
- Payments and ads are switched off in `config/ads.ts`: nothing is charged or shown without a provider. `/api/shop/order` and `/api/ads/reward` answer 503 until then.

```bash
npm run db:migrate:local
npm run dev
npm test
npm run typecheck
npx vite build
```

Owner analytics: `GET /api/admin/duel-stats` with the `x-admin-token` header, or the `/admin-duel` page.

Status and known limitations: `IMPLEMENTATION_PROGRESS.md`.
