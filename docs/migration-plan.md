# Migration Plan

This app is the TanStack Start rewrite target for:

- `traderSpy`
- `FollowTraderManager`

## Target merge shape

### Runtime services

- `src/lib/trading/engine.ts`
  shared domain logic for:
  - position change detection
  - teacher follow-order creation and close handling
  - mark-price refresh
  - stop-loss checks

- `src/lib/trading/runtime.ts`
  in-process merged runtime that replaces the old split between:
  - trader spy worker process
  - follow manager background runtime

### Route surface

- `/app/strategies`
  replacement target for the strategy list and strategy status pages

- `/app/teachers`
  replacement target for teacher / user follow-account operations

- `/app/system`
  replacement target for runtime health, websocket heartbeat, mongo status, and event logs

- `/app/strategy-board`
  replacement target for the legacy external strategy board entry that used to iframe the
  Streamlit backtest UI

## Legacy source mapping

### traderSpy

- `class/trader.mjs`
  source for trader polling and position change detection

- `class/api/wsClient.mjs`
  source for outbound trader event publishing

### FollowTraderManager

- `server/backend/class/teacher.mjs`
  source for follow execution, risk controls, and stop-loss handling

- `pages/strategy.vue`
  source for strategy dashboard requirements

- `pages/teacher.vue`
  source for teacher dashboard requirements

## Current status

- TanStack Start host app created
- protected app shell created
- shared trading types created
- merged runtime now persists traders, teachers, runtime status, and runtime events in PostgreSQL
- strategies / teachers / system routes created
- HTTP ingest route created at `/api/trading/ingest`
- ingest route accepts:
  - direct snapshot payloads from the new app side
  - legacy `traderSpy` websocket-style `topic=trader` / `type=positionChange` payloads
- legacy `traderSpy` websocket compatibility is now also available directly inside the merged runtime
  - the TanStack app can bind a local compatibility websocket on `TRADER_SPY_WS_PORT` (default `8011`)
  - old `traderSpy` clients that still send the original websocket payload shape can now be normalized and ingested without switching to HTTP first
  - first-message legacy payloads now create the trader record and immediately ingest the current position snapshot instead of leaving a newly created trader empty
- runtime status and event logs are now stored instead of staying in process memory only
- `traderSpy` development config now targets the new HTTP ingest route by default
- cross-project ingest was validated end-to-end:
  - `traderSpy` compatibility transport posted a legacy payload
  - `trader-platform` accepted it
  - the trader row and runtime events were persisted in PostgreSQL
- first live trader polling adapters are now wired inside `trader-platform`
  - `okx`
  - `bitget` (requires local Bitget credentials in env)
  - `binanceFutures` (request path implemented, but current network may still be region-blocked)
  - `bybit` API path with browser fallback support
- live refresh flow was validated for `okx`
  - `POST /api/trading/refresh`
  - runtime ingested the live snapshot
  - PostgreSQL trader state and runtime events were updated
- OKX trader metadata parity now rides on the same live refresh path instead of requiring a separate legacy worker
  - live refresh now updates trader `nickName`, `avatar`, `sign`, `balance`, `monthlyAveragePositionValue`, and `threeMonthMaxDrawdown` together with positions
  - `basic-info`, `trade-stat`, `yield-pnl`, and `position-history` are now queried from the merged app runtime and folded into one persisted trader snapshot
  - this closes the old gap where the TanStack rewrite only refreshed positions while the legacy Nuxt strategy page still depended on risk/display metadata from background jobs
  - trader records now also persist `historyPositions` as first-class data in PostgreSQL, seeded initially from the OKX `position-history` response instead of throwing that payload away after deriving monthly averages
  - this gives the merged runtime a durable home for the legacy `his_position` / historical trade input that old Streamlit backtests depended on, even though candle-backed backtest simulation is still not fully ported
- teacher records now carry execution configuration in the new schema
  - `executionMode`
  - `credentials`
- follow processing now routes through an execution service abstraction instead of assuming direct fill mutation inside the engine
  - current mode is still `dry-run` by default
  - Bitget / OKX / Binance live execution entry points are now wired in the service layer
  - actual live execution still depends on valid credentials being configured
  - unsupported or unconfigured platforms still fall back to dry-run behavior
  - trader `amountChange` signals are now executed as incremental add / reduce follow actions instead of being dropped as unsupported
  - dry-run execution now supports:
    - order-class platforms incrementally adding a second follow relation on size increase
    - order-class platforms partially reducing matched follow relations on size decrease
    - amount-class platforms incrementally resizing aggregate follow relations on size increase / decrease
  - live partial-reduce support is currently broader on Binance / OKX than on Bitget because the latter legacy API still operates primarily on whole tracked orders
- strategy workspace now has a user-scoped layer on top of the shared trader pool
  - trader ingest and refresh still operate on global trader records
  - `/app/strategies` now reads and mutates the current user workspace instead of the full global list
  - global trader deletion now also clears dependent teacher trace/follow references
  - trader creation now accepts the legacy minimal input shape (`id`, `name`, `platform`, `link`) and fills default avatar / strategy fields server-side, matching the old add-strategy workflow more closely
  - trader creation can now also infer platform-specific default links when `link` is omitted (`okx`, `bitget`, `bybit`, `binanceFutures`, `binance`)
  - Binance link inference now preserves the old split between:
    - `binance` copy-trading portfolio detail pages (`portfolioId`)
    - `binanceFutures` leaderboard trader pages (`encryptedUid`)
  - OKX trader creation now also performs best-effort profile inference from the platform `basic-info` endpoint, allowing `name`, `nickName`, `avatar`, `sign`, and `strategyName` to be upgraded before the first live refresh
  - Binance / Binance Futures trader creation now also performs best-effort profile inference from the legacy public `lead-portfolio/detail` endpoint, allowing `name`, `nickName`, `avatar`, `sign`, and `strategyName` to be upgraded before the first live refresh
  - newly created traders on live-refresh-supported platforms are now hydrated immediately after creation on a best-effort basis, so strategy cards can pick up live metadata/positions without waiting for a manual refresh
- market subscription visibility from the old `marketChild` flow is now recreated in persisted runtime metadata
  - `/app/system` now shows active subscription platforms, symbols, teacher ids, relation counts, and latest mark/trader activity timestamps
  - subscription state is derived from live teacher follow relations and refreshed whenever teacher/trader state changes
- legacy notification delivery now has a first merged runtime version
  - Feishu / Telegram / Discord webhooks can be configured from env on the new app
  - trader position-change alerts and runtime warn events can now leave the app instead of only being stored in runtime events
  - `/app/system` now shows notification sink readiness and alert toggles
  - notification routing now supports category-specific provider fanout (`trader-change`, `runtime-warning`, `startup`, `bybit-attention`) instead of a single global sink set
  - bybit-attention notifications now support screenshot-aware rich delivery on routed providers that accept attachments (currently Discord multipart; Feishu image upload path is available when app credentials are configured and the route includes Feishu)
  - Telegram screenshot delivery is now also supported for local-image attachments through Bot API `sendPhoto`, so browser-fallback/login-required alerts are no longer text-only on Telegram routes
  - notification route overrides can now be persisted in runtime metadata and edited from `/app/system`, so route changes no longer require env edits only
- bybit browser fallback now has persisted operational state
  - runtime records last mode, last status, trader id, detail, attempt/success timestamps, and screenshot path when available
  - `/app/system` now surfaces login-required / access-denied / browser-launch-failed visibility instead of hiding it inside exception text only
  - bybit fallback failures now also emit `warn` runtime events, so the new notification sinks can push operator attention outward
- `/app/teachers` now separates teacher account positions from teacher follow positions
  - restores the old Nuxt page distinction between exchange account holdings and copied follow-order holdings
  - follow positions now show mapped trader order ids and linked strategy names directly in the TanStack route
- `/app/strategy-board` no longer depends on the external Streamlit iframe
  - the route now renders an internal strategy analytics board using persisted teacher
    `positionHistory`, live trader positions, follow relations, and trace-trader settings
  - strategy history reconstruction and summary logic now lives in
    `src/lib/trading/strategy-analytics.ts` instead of being route-local only, so future
    backtest/runtime surfaces can reuse the same closed-trade derivation
  - when persisted trader `historyPositions` exist, the board now prefers trader-centric
    historical trades over teacher execution history, which is closer to the legacy
    `TraderBackTest` / `trader_spy` flow than the earlier teacher-only reconstruction
  - the first internal cut covers:
    - strategy selection by teacher + trader
    - closed-trade realized PnL summaries
    - cumulative realized profit and profit-rate curves
    - per-trade realized profit bars
    - reconstructed closed-trade details with open/close time, prices, amount, PnL, and holding duration
    - open-hour distribution, open-weekday distribution, and holding-duration bars derived from reconstructed trades
    - strategy configuration and live trader position visibility
    - strategy order detail table for persisted fills
  - the remaining parity gap is the old candle-driven backtest layer from `TraderBackTest`
    (`profit vs mdd`, `stop-loss curves`, weekday/hour distributions, and synthetic balance
    simulation), because the merged TanStarter runtime does not yet persist the full trade-history
    plus candle inputs that the Streamlit tool consumed
  - market candle persistence now has a first-class home in PostgreSQL via `market_candle`
    so the backtest layer can move off the legacy SQLite cache and into the merged app
  - the new candle store is available through `src/lib/trading/market-history.ts` and has a
    dedicated verification script, which makes it a reusable backtest input instead of a hidden
    one-off helper
- admin user management is now being migrated onto the unified Better Auth store
  - legacy Mongo user CRUD is no longer the target shape
  - the new route surface is `/app/users`
  - admin/user role semantics are being mapped into Better Auth roles

## Recent verification

- `pnpm exec tsc --noEmit`
- `set -a; source .env; set +a; pnpm tsx scripts/verify-trader-metadata-refresh.ts`
  - verified OKX refresh persisted:
    - `nickName`
    - `avatar`
    - `sign`
    - `balance`
    - `monthlyAveragePositionValue`
    - `threeMonthMaxDrawdown`
    - refreshed positions
    - persisted historical position rows in `historyPositions`
- `set -a; source .env; set +a; pnpm tsx scripts/verify-bulk-trader-refresh.ts`
  - confirmed bulk refresh still updates OKX traders after the metadata-aware refresh change
- `set -a; source .env; set +a; pnpm tsx scripts/verify-minimal-add-trader.ts`
  - confirmed minimal trader creation now derives:
    - platform-specific default `link` when omitted
    - `strategyName` from trader name
    - `strategyStatus` default `watch`
    - `strategyRiskRate` default `0.1`
    - generated avatar URL
- `pnpm tsx scripts/verify-platform-link-inference.ts`
  - confirmed platform-aware link inference for:
    - `okx`
    - `bitget`
    - `bybit`
    - `binanceFutures`
    - `binance`
- `pnpm tsx scripts/verify-okx-trader-draft-preparation.ts`
  - confirmed OKX draft preparation upgrades:
    - `name`
    - `nickName`
    - `avatar`
    - `sign`
    - `strategyName`
    - inferred `link`
- `pnpm tsx scripts/verify-binance-profile-inference.ts`
  - confirmed Binance profile inference upgrades:
    - `name`
    - `nickName`
    - `avatar`
    - `sign`
- `pnpm tsx scripts/verify-binance-trader-draft-preparation.ts`
  - confirmed Binance draft preparation upgrades:
    - `name`
    - `nickName`
    - `avatar`
    - `sign`
    - `strategyName`
    - inferred `link`
- `set -a; source .env; set +a; pnpm tsx scripts/verify-add-trader-auto-hydration.ts`
  - confirmed newly created OKX traders now auto-hydrate on creation with:
    - live `nickName`
    - live `avatar`
    - live `sign`
    - live `balance`
    - live `monthlyAveragePositionValue`
    - live positions
- `set -a; source .env; set +a; pnpm tsx scripts/verify-amount-change-follow-execution.ts`
  - confirmed incremental follow execution now handles:
    - initial open
    - size increase as an additional follow fill
    - size decrease as a partial close
    - persisted follow relations and position history updates after each step
- `pnpm tsx scripts/verify-notification-service.ts`
  - confirmed notification routing and attachment behavior for:
    - Feishu text delivery
    - Telegram text delivery
    - Discord multipart screenshot delivery
    - Telegram multipart screenshot delivery via `sendPhoto`
- `pnpm tsx scripts/verify-strategy-analytics.ts`
  - confirmed reconstructed strategy analytics now derive from persisted follow history:
    - trader-history preference when available
    - closed trade count
    - realized profit
    - cumulative profit / profit-rate
    - open-hour and weekday distribution
    - holding duration summary
- `pnpm tsx scripts/verify-market-history.ts`
  - confirmed candle rows can be persisted and queried back from PostgreSQL:
    - `market_candle` insert
    - range query by platform/symbol/interval
    - ordered readback of stored K-line rows

## Next migration slices

1. Continue porting remaining trader polling adapters from `traderSpy/spy/*.mjs` (`bybit` and any puppeteer-only fallbacks)
2. Add safer validation / audit logs that surface live-vs-dry-run execution decisions in runtime events
3. Expand notification parity beyond the first sink layer
   - legacy image attachments / richer post bodies
   - source/database-driven routing instead of env-only routing
   - operational alerts for browser-fallback/login-required flows
4. Continue replacing leftover legacy naming and status semantics from the old Mongo/WS architecture
