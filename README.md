# TradeMirror / 跟单镜像

TradeMirror（跟单镜像）是一个统一的交易员监控与跟单执行平台，基于 TanStack Start 构建。合并了两个遗留系统 — **traderSpy**（交易员仓位轮询）和 **FollowTraderManager**（交易员跟单执行）— 到一个全栈应用中，使用 PostgreSQL 持久化，支持多交易所和双语 UI（zh-CN / en）。

## Features

- **Multi-exchange trader monitoring** — OKX, Bitget, Binance, Binance Futures, Bybit, Huobi, TraderWagon
- **Follow execution engine** — dry-run and live modes with ratio/fixed order sizing, stop-loss, and risk controls
- **Strategy analytics board** — closed-trade reconstruction, performance curves, distribution charts (replaces legacy Streamlit iframe)
- **User strategy workspace** — per-user strategy lists backed by a shared global trader pool
- **Notification system** — Feishu / Telegram / Discord alerts with screenshot delivery support
- **Legacy compatibility** — WebSocket bridges for traderSpy (port 8011) and legacy messages (port 8001)
- **Admin panel** — user management, system logs, runtime health monitoring
- **Bilingual UI** — full zh-CN / en internationalization with language toggle
- **Dark / light / system theme** — theme toggle with system preference detection

## Tech Stack

- [React 19](https://react.dev) + [React Compiler](https://react.dev/learn/react-compiler)
- TanStack [Start](https://tanstack.com/start/latest) + [Router](https://tanstack.com/router/latest) + [Query](https://tanstack.com/query/latest)
- [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Base UI](https://base-ui.com/)
- [Vite 8](https://vite.dev) + [Nitro v3](https://nitro.build/)
- [Drizzle ORM](https://orm.drizzle.team/) + PostgreSQL
- [Better Auth](https://better-auth.com/) (admin plugin, OAuth, email/password)
- [CCXT](https://github.com/ccxt/ccxt) + platform-native APIs + Puppeteer (Bybit browser fallback)
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) + [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 15+

### Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a `.env` file based on [`.env.example`](./.env.example):

   ```bash
   cp .env.example .env
   ```

3. (Optional) Start a local PostgreSQL via Docker Compose:

   ```bash
   docker-compose up -d
   ```

4. Generate and apply database migrations:

   ```sh
   pnpm db generate
   pnpm db migrate
   ```

   https://orm.drizzle.team/docs/migrations

5. Run the development server:

   ```bash
   pnpm dev
   ```

   The app runs at `http://localhost:3000` (or next available port).

## Project Structure

```
src/
├── components/          # Shared UI components
│   ├── trading/         # Trading-specific forms & page shell
│   └── ui/              # shadcn/ui primitives
├── lib/
│   ├── auth/            # Better Auth config, roles, middleware, admin
│   ├── db/              # Drizzle ORM schema & connection
│   ├── i18n.tsx         # Bilingual translation system
│   ├── messages/        # Legacy message bridge & persistence
│   ├── system/          # Notification service, log access
│   └── trading/
│       ├── adapters/        # Platform polling adapters (OKX, Bitget, Bybit, ...)
│       ├── execution/       # Follow execution service & exchange adapters
│       ├── engine.ts        # Position change detection & risk checks
│       ├── runtime.ts       # Merged in-process runtime (scheduler, ingest, refresh)
│       ├── store.ts         # PostgreSQL persistence layer
│       ├── strategy-analytics.ts  # Closed-trade reconstruction & metrics
│       ├── types.ts         # Domain types
│       └── ...
├── routes/
│   ├── __root.tsx           # Root layout (I18nProvider, ThemeProvider)
│   ├── index.tsx            # Landing page
│   ├── about.tsx            # About page
│   ├── _guest/              # Login, signup
│   ├── _auth/app/           # Protected app routes
│   │   ├── index.tsx        # Dashboard
│   │   ├── strategies.tsx   # Strategy workspace
│   │   ├── strategy-board.tsx  # Analytics board
│   │   ├── teachers.tsx     # Trader management
│   │   ├── system.tsx       # System monitoring
│   │   ├── messages.tsx     # Legacy message browser
│   │   ├── users.tsx        # Admin: user management
│   │   └── logs.tsx         # Admin: system logs
│   └── api/
│       ├── auth/            # Better Auth API
│       └── trading/         # Ingest & refresh endpoints
└── scripts/             # Verification & utility scripts (37 files)
```

## Key Scripts

| Command                   | Description                |
| ------------------------- | -------------------------- |
| `pnpm dev`                | Start dev server           |
| `pnpm build`              | Production build           |
| `pnpm start`              | Run production server      |
| `pnpm lint`               | Oxlint with type checking  |
| `pnpm format`             | Oxfmt format               |
| `pnpm check`              | Format + lint              |
| `pnpm db generate`        | Generate Drizzle migration |
| `pnpm db migrate`         | Apply migration            |
| `pnpm db studio`          | Open Drizzle Studio        |
| `pnpm auth:generate`      | Regenerate auth schema     |
| `pnpm auth:migrate`       | Generate schema + migrate  |
| `pnpm ui add <component>` | Add shadcn/ui component    |

## Environment Variables

See [`.env.example`](./.env.example) for the full list. Key categories:

- **Database** — `DATABASE_URL`
- **Auth** — `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`
- **Exchange credentials** — `BITGET_API_*`, `OKX_API_*`, `BINANCE_API_*`, `HUOBI_API_*`, `BYBIT_API_*`
- **Notifications** — `ALERT_FEISHU_*`, `ALERT_TELEGRAM_*`, `ALERT_DISCORD_*`
- **Legacy bridges** — `TRADER_SPY_WS_PORT` (8011), `LEGACY_MSG_WS_PORT` (8001)

## Documentation

- [PRD](./docs/prd.md) — 产品需求与系统设计
- [迁移计划](./docs/migration-plan.md) — 遗留合并进度与验证

## Deploying to production

The [vite config](./vite.config.ts) is configured to use Nitro by default, which supports many [deployment presets](https://nitro.build/deploy) like Netlify, Vercel, Node.js, and more.

Refer to the [TanStack Start hosting docs](https://tanstack.com/start/latest/docs/framework/react/guide/hosting) for more information.

## License

[Unlicense](./LICENSE) — public domain.
