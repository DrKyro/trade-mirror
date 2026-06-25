# TradeMirror / 跟单镜像

[English](#english) | [中文](#中文)

---

## English

TradeMirror is a unified trader monitoring and follow-execution platform built on TanStack Start. It merges two legacy systems — **traderSpy** (trader position polling) and **FollowTraderManager** (trader follow-order execution) — into a single full-stack application with PostgreSQL persistence, multi-exchange support, and bilingual UI (zh-CN / en).

### Features

- **Multi-exchange trader monitoring** — OKX, Bitget, Binance, Binance Futures, Bybit, Huobi, TraderWagon
- **Follow execution engine** — dry-run and live modes with ratio/fixed order sizing, stop-loss, and risk controls
- **Strategy analytics board** — closed-trade reconstruction, performance curves, distribution charts (replaces legacy Streamlit iframe)
- **User strategy workspace** — per-user strategy lists backed by a shared global trader pool
- **Notification system** — Feishu / Telegram / Discord alerts with screenshot delivery support
- **Legacy compatibility** — WebSocket bridges for traderSpy (port 8011) and legacy messages (port 8001)
- **Admin panel** — user management, system logs, runtime health monitoring
- **Bilingual UI** — full zh-CN / en internationalization with language toggle
- **Dark / light / system theme** — theme toggle with system preference detection

### Tech Stack

- [React 19](https://react.dev) + [React Compiler](https://react.dev/learn/react-compiler)
- TanStack [Start](https://tanstack.com/start/latest) + [Router](https://tanstack.com/router/latest) + [Query](https://tanstack.com/query/latest)
- [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Base UI](https://base-ui.com/)
- [Vite 8](https://vite.dev) + [Nitro v3](https://nitro.build/)
- [Drizzle ORM](https://orm.drizzle.team/) + PostgreSQL
- [Better Auth](https://better-auth.com/) (admin plugin, OAuth, email/password)
- [CCXT](https://github.com/ccxt/ccxt) + platform-native APIs + Puppeteer (Bybit browser fallback)
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) + [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)

### Quick Start

```bash
pnpm install
cp .env.example .env          # configure DB & API keys
docker-compose up -d           # optional: local PostgreSQL
pnpm db generate && pnpm db migrate
pnpm dev                      # http://localhost:3000
```

### Project Structure

```
src/
├── components/          # Shared UI components
│   ├── trading/         # Trading-specific forms & page shell
│   └── ui/              # shadcn/ui primitives
├── lib/
│   ├── auth/            # Better Auth config, roles, admin
│   ├── db/              # Drizzle ORM schema & connection
│   ├── i18n.tsx         # Bilingual translation system
│   ├── messages/        # Legacy message bridge & persistence
│   ├── system/          # Notification service, log access
│   └── trading/
│       ├── adapters/        # Platform polling adapters
│       ├── execution/       # Follow execution & exchange adapters
│       ├── engine.ts        # Position change detection & risk checks
│       ├── runtime.ts       # Merged runtime (scheduler, ingest, refresh)
│       ├── store.ts         # PostgreSQL persistence layer
│       ├── strategy-analytics.ts  # Closed-trade reconstruction & metrics
│       └── types.ts         # Domain types
├── routes/
│   ├── __root.tsx           # Root layout (I18nProvider, ThemeProvider)
│   ├── _guest/              # Login, signup
│   ├── _auth/app/           # Protected app routes
│   └── api/trading/         # Ingest & refresh endpoints
└── scripts/             # Verification & utility scripts
```

### Key Scripts

| Command                   | Description                |
| ------------------------- | -------------------------- |
| `pnpm dev`                | Start dev server           |
| `pnpm build`              | Production build           |
| `pnpm lint`               | Oxlint with type checking  |
| `pnpm db generate`        | Generate Drizzle migration |
| `pnpm db migrate`         | Apply migration            |
| `pnpm db studio`          | Open Drizzle Studio        |
| `pnpm auth:generate`      | Regenerate auth schema     |
| `pnpm ui add <component>` | Add shadcn/ui component    |

### Environment Variables

See [`.env.example`](./.env.example) for the full list. Key categories:

- **Database** — `DATABASE_URL`
- **Auth** — `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`
- **Exchange credentials** — `BITGET_API_*`, `OKX_API_*`, `BINANCE_API_*`, `HUOBI_API_*`, `BYBIT_API_*`
- **Notifications** — `ALERT_FEISHU_*`, `ALERT_TELEGRAM_*`, `ALERT_DISCORD_*`
- **Legacy bridges** — `TRADER_SPY_WS_PORT` (8011), `LEGACY_MSG_WS_PORT` (8001)

### Documentation

- [PRD](./docs/prd.md) — Product requirements & system design (中文)
- [Migration Plan](./docs/migration-plan.md) — Legacy merge progress & verification

### Deployment

The [vite config](./vite.config.ts) uses Nitro by default, supporting [multiple deployment presets](https://nitro.build/deploy) (Netlify, Vercel, Node.js, etc.). See [TanStack Start hosting docs](https://tanstack.com/start/latest/docs/framework/react/guide/hosting) for details.

---

## 中文

TradeMirror（跟单镜像）是一个统一的交易员监控与跟单执行平台，基于 TanStack Start 构建。合并了两个遗留系统 — **traderSpy**（交易员仓位轮询）和 **FollowTraderManager**（交易员跟单执行）— 到一个全栈应用中，使用 PostgreSQL 持久化，支持多交易所和双语 UI（zh-CN / en）。

### 功能特性

- **多交易所交易员监控** — OKX、Bitget、Binance、Binance Futures、Bybit、Huobi、TraderWagon
- **跟单执行引擎** — 模拟/实盘模式，按比例或固定金额下单，支持止损和风控
- **策略分析看板** — 已平仓交易重建、收益曲线、分布图（替代旧版 Streamlit iframe）
- **用户策略工作区** — 每个用户独立的策略列表，基于共享交易员池
- **通知系统** — 飞书 / Telegram / Discord 告警，支持截图投递
- **遗留兼容** — WebSocket 桥接 traderSpy（端口 8011）和遗留消息（端口 8001）
- **管理后台** — 用户管理、系统日志、运行时健康监控
- **双语 UI** — 完整的 zh-CN / en 国际化，支持语言切换
- **暗色/亮色/系统主题** — 主题切换，自动检测系统偏好

### 技术栈

- [React 19](https://react.dev) + [React Compiler](https://react.dev/learn/react-compiler)
- TanStack [Start](https://tanstack.com/start/latest) + [Router](https://tanstack.com/router/latest) + [Query](https://tanstack.com/query/latest)
- [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Base UI](https://base-ui.com/)
- [Vite 8](https://vite.dev) + [Nitro v3](https://nitro.build/)
- [Drizzle ORM](https://orm.drizzle.team/) + PostgreSQL
- [Better Auth](https://better-auth.com/)（admin 插件、OAuth、邮箱/密码）
- [CCXT](https://github.com/ccxt/ccxt) + 平台原生 API + Puppeteer（Bybit 浏览器回退）
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) + [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)

### 快速开始

```bash
pnpm install
cp .env.example .env          # 配置数据库和 API 密钥
docker-compose up -d           # 可选：本地 PostgreSQL
pnpm db generate && pnpm db migrate
pnpm dev                      # http://localhost:3000
```

### 环境变量

见 [`.env.example`](./.env.example) 获取完整列表。主要类别：

- **数据库** — `DATABASE_URL`
- **认证** — `BETTER_AUTH_SECRET`、`GITHUB_CLIENT_ID/SECRET`、`GOOGLE_CLIENT_ID/SECRET`
- **交易所凭证** — `BITGET_API_*`、`OKX_API_*`、`BINANCE_API_*`、`HUOBI_API_*`、`BYBIT_API_*`
- **通知** — `ALERT_FEISHU_*`、`ALERT_TELEGRAM_*`、`ALERT_DISCORD_*`
- **遗留桥接** — `TRADER_SPY_WS_PORT`（8011）、`LEGACY_MSG_WS_PORT`（8001）

### 文档

- [PRD](./docs/prd.md) — 产品需求与系统设计
- [迁移计划](./docs/migration-plan.md) — 遗留合并进度与验证

### 部署

[vite 配置](./vite.config.ts) 默认使用 Nitro，支持[多种部署预设](https://nitro.build/deploy)（Netlify、Vercel、Node.js 等）。详见 [TanStack Start 部署文档](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)。

## License

[Unlicense](./LICENSE) — public domain.
