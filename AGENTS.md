# Agent Guidelines

## Project Overview

**TradeMirror** (跟单镜像) is a unified trader monitoring and follow-execution platform for cryptocurrency exchanges. It merges two legacy systems — **traderSpy** (position polling) and **FollowTraderManager** (follow-order execution) — into a single TanStack Start full-stack app with PostgreSQL persistence.

**Supported exchanges:** OKX, Bitget, Binance Futures, Bybit

### Core Modules

1. **Trader Monitoring** — Ingest position snapshots via HTTP (`POST /api/trading/ingest`) or legacy WebSocket bridge (port 8011). Detect open/close/change events by diffing snapshots.
2. **Follow-Execution** — Automatically mirror trader positions into teacher accounts. Modes: `dry-run` (default) and `live`. Sizing: `ratio` (proportional) or `fixed` (flat amount).
3. **Discover** — Crawl exchange rank lists (yield, PnL, AUM, followers, drawdown, win-rate) and surface traders for users to follow.
4. **Strategy Board** — Backtest analytics: equity curves, trade distributions, drawdown charts, time-of-day heatmaps.
5. **Admin** — User management, system status, API health probes, log browser.

---

## Tech Stack

| Layer         | Technology                                        |
| ------------- | ------------------------------------------------- |
| Framework     | TanStack Start (Vinxi/Nitro SSR)                  |
| Routing       | TanStack Router (file-based)                      |
| Data fetching | TanStack Query v5 + server functions              |
| UI            | React 19, shadcn/ui, Tailwind CSS, lucide-react   |
| ORM           | Drizzle ORM (PostgreSQL, snake_case)              |
| Auth          | Better Auth (GitHub/Google OAuth, email/password) |
| Exchange APIs | ccxt + custom adapters                            |
| Scraping      | Puppeteer (Bybit fallback)                        |
| Validation    | Zod 4                                             |
| i18n          | Custom inline dictionary (`useI18n()`)            |

---

## Directory Structure

```
src/
├── routes/
│   ├── _guest/           # Guest-only (login, signup) — redirects if authenticated
│   ├── _auth/            # Protected — requires auth via beforeLoad guard
│   │   └── app/          # Main application shell
│   │       ├── index.tsx           # Dashboard
│   │       ├── strategies.tsx      # User strategy workspace
│   │       ├── teachers.tsx        # Teacher (follow-account) management
│   │       ├── discover.tsx        # Trader discovery from exchange ranks
│   │       ├── strategy-board.tsx  # Backtest analytics
│   │       ├── system.tsx          # System status
│   │       ├── users.tsx           # Admin user management
│   │       ├── logs.tsx            # Admin log browser
│   │       └── api-health.tsx      # API health monitoring
│   └── api/
│       ├── auth/$.ts               # Better Auth API handler
│       └── trading/
│           ├── ingest.ts           # Snapshot ingestion endpoint
│           └── refresh.ts          # Live refresh trigger
├── components/
│   ├── ui/               # shadcn primitives (run `pnpm ui add <component>`)
│   └── trading/          # Domain components (forms, page-shell)
├── lib/
│   ├── auth/             # Better Auth config, hooks, middleware
│   ├── db/
│   │   ├── schema/       # Drizzle schemas (auth, trading, messages)
│   │   └── index.ts      # DB client
│   ├── trading/          # Core trading module (see below)
│   ├── messages/         # Legacy message bridge
│   ├── system/           # Notification & logging
│   └── i18n.tsx          # Internationalization provider
└── env/                  # Env validation (@t3-oss/env-core)
```

---

## Essentials

- Use shadcn CLI (`pnpm ui add <component>`) for adding new UI components & primitives.
- Use `lucide-react` for UI icons (use `Icon` suffix, e.g. `import { Loader2Icon } from "lucide-react"`); for brand icons use `@icons-pack/react-simple-icons` (e.g. `SiGithub`).
- Don't build after every little change. If `pnpm lint` passes; assume changes work.

---

## Trading Module Architecture

The trading module (`src/lib/trading/`) is the core domain. Key files:

### Platform Adapters (`adapters/`)

Strategy + Registry pattern. Each adapter implements `PlatformAdapter`:

```typescript
interface PlatformAdapter {
  platform: string;
  displayName: string;
  traderModel: string;
  fetchLiveSnapshot(traderId: string): Promise<Snapshot>;
  fetchRankList?(dimension: string, page: number): Promise<RankResult>;
  fetchDeepAnalysis?(traderId: string): Promise<DeepAnalysis>;
  createLiveOrder?(params: OrderParams): Promise<OrderResult>;
  closeLiveOrder?(params: CloseParams): Promise<void>;
  // ...
}
```

Registry: `registerAdapter()` / `getAdapter()` / `getAllAdapters()` in `adapters/registry.ts`.

Current adapters: `okx-adapter.ts`, `bitget-adapter.ts`, `binance-adapter.ts`, `bybit-adapter.ts`

### TradingRuntime (`runtime.ts`)

Singleton class stored on `globalThis.__traderPlatformRuntime`. Manages:

- Boot sequence, legacy WS bridges, refresh scheduler, discover crawler
- Trader/teacher CRUD, position ingestion, live refresh
- `previousPositions` Map for change detection

### Position Change Engine (`engine.ts`)

- `detectPositionChanges()` — diffs previous vs current positions
- `applyPositionChangeToTeacher()` — applies changes with risk checks
- Stop-loss checks, equity/position history recording

### Execution Service (`execution/execution-service.ts`)

- `executePositionChange()` / `executeTeacherChange()`
- Handles dry-run vs live execution
- Order-class vs amount-class platforms, partial close logic

### Refresh Scheduler (`refresh-scheduler.ts`)

Priority-based polling: `live`=1s, `active`=15s, `watch`=2min, `cold`=30min. Batch size 8, lock 30s.

### Persistence Layer (`store.ts`)

PostgreSQL via Drizzle. Key conventions:

- **Milli-scaled integers** for financial data: `SCALE=1000`, `RATIO_SCALE=10000`
- **JSONB columns** for complex nested types (positions, settings, history)
- Serialize/deserialize functions convert between DB rows and domain types

### Server Functions (`repository.ts`)

All use `createServerFn` with `$` prefix naming. Validated with Zod. Protected routes use `authMiddleware` or `freshAuthMiddleware`.

Key functions: `$getTraders`, `$getTeachers`, `$addTrader`, `$refreshTraderPositions`, `$addTeacher`, `$updateTeacherSettings`, `$ingestTraderSnapshot`, `$probeApiHealth`, etc.

### Queries (`queries.ts`)

TanStack Query `queryOptions` wrappers for server functions. Used in route loaders with `ensureQueryData` for SSR.

### Discover Crawler (`discover-crawler.ts`)

Crawls rank lists from OKX, Bitget, Binance. Sort dimensions: yieldRatio, pnl, aum, followers, maxDrawdown, winRate. Persists to `discoverRankCache` table.

---

## Database Schema

Three schema files in `src/lib/db/schema/`:

### `auth.schema.ts`

`user`, `session`, `account`, `verification` — standard Better Auth tables.

### `trading.schema.ts`

- **`trader`** — monitored trader profile (platform, link, avatar, balance, positions JSONB, historyPositions JSONB)
- **`teacher`** — follow-account with credentials JSONB, execution mode, equity/position tracking
- **`userTrader`** — user↔trader link (composite PK)
- **`traderSyncState`** — per-trader polling state (priority, enabled, nextFetchAt, failCount, lockedUntil)
- **`runtimeState`** — singleton with metadata JSONB
- **`runtimeEvent`** — audit log (scope, level, title, detail, payload)
- **`marketCandle`** — OHLCV data (composite PK: platform+symbol+interval+datetime)
- **`discoverRankCache`** — cached rank list data
- **`traderBacktestRun`** — backtest results (summary, timeline, trades JSONB)

### `messages.schema.ts`

`legacyMessage`, `legacyChainInfo`, `legacyUserAccountSetting` — backward-compat tables.

---

## Topic-specific Guidelines

- [TanStack patterns](.agents/tanstack-patterns.md) - Routing, data fetching, loaders, server functions, environment shaking
- [Auth patterns](.agents/auth.md) - Route guards, middleware, auth utilities
- [TypeScript conventions](.agents/typescript.md) - Casting rules, prefer type inference
- [Workflow](.agents/workflow.md) - Workflow commands, validation approach

---

## Skill Loading

<!-- intent-skills:start -->

Before substantial work:

- Skill check: run `pnpm intent list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `pnpm intent load <package>#<skill>` and follow the returned `SKILL.md`.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

---

## TanStack Docs

Use `pnpm tanstack` (aliased to `pnpm dlx @tanstack/cli@latest`) to look up TanStack documentation. Always pass `--json` for machine-readable output.

```bash
# List TanStack libraries (optionally filter by --group state|headlessUI|performance|tooling)
pnpm tanstack libraries --json

# Fetch a specific doc page
pnpm tanstack doc router framework/react/guide/data-loading --json
pnpm tanstack doc query framework/react/overview --docs-version v5 --json

# Search docs (optionally filter by --library, --framework, --limit)
pnpm tanstack search-docs "server functions" --library start --json
pnpm tanstack search-docs "loaders" --library router --framework react --json
```

---

## Environment Variables

Key env vars (validated in `src/env/server.ts`):

| Category      | Variables                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Database      | `DATABASE_URL`                                                                                                    |
| Auth          | `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`                                        |
| Exchange APIs | `OKX_API_KEY/SECRET/PASSWORD`, `BITGET_API_KEY/SECRET/PASSWORD`, `BINANCE_API_KEY/SECRET`, `BYBIT_API_KEY/SECRET` |
| Notifications | `FEISHU_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN/CHAT_ID`, `DISCORD_WEBHOOK_URL` + `ALERT_*_ENABLED` toggles             |
| Legacy WS     | `WS_TRADER_SPY_PORT` (8011), `WS_LEGACY_MESSAGES_PORT` (8001)                                                     |

---

## Key Conventions

- **Server function names** use `$` prefix: `$getTraders`, `$addTrader`, etc.
- **Financial values** are milli-scaled integers (×1000) in the DB; ratio values use ×10000.
- **JSONB columns** store complex nested data (positions, settings, history) — serialize/deserialize in `store.ts`.
- **Platform adapters** must be registered in `adapters/registry.ts` to be discovered by the runtime.
- **i18n** uses `useI18n()` hook in components and `translate()` in non-React contexts. Keys are in `src/lib/i18n.tsx`.
- **Path alias:** `#/*` maps to `./src/*`.
