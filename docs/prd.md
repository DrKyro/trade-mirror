# PRD — TradeMirror / 跟单镜像

## 1. 产品概述

TradeMirror（跟单镜像）是一个统一的交易员监控与跟单执行系统，合并了两个遗留项目 — **traderSpy**（交易员仓位轮询与变更检测）和 **FollowTraderManager**（交易员跟单执行与风控）— 到一个基于 TanStack Start 的全栈应用中，使用 PostgreSQL 持久化。

### 目标用户

- **交易员 / 分析师** — 跨交易所监控被跟单的交易员，查看策略分析
- **跟单账户操作者** — 管理跟单执行、风控参数和止损设置
- **管理员** — 管理用户、监控系统健康状态、查看日志

### 支持的交易所

OKX、Bitget、Binance、Binance Futures、Bybit

---

## 2. 核心模块

### 2.1 交易员监控

- **仓位接入** — 通过 HTTP（`POST /api/trading/ingest`）或遗留 WebSocket 桥接（端口 8011）接收仓位快照
- **实时刷新** — 通过平台适配器按需轮询交易员仓位（`POST /api/trading/refresh`）
- **定时刷新** — 后台调度器每 15 秒轮询支持的交易所
- **仓位变更检测** — 对比前一次与当前快照，检测开仓、平仓和仓位变化
- **交易员元数据** — 从交易所 API 自动填充 `nickName`、`avatar`、`sign`、`balance`、`monthlyAveragePositionValue`、`threeMonthMaxDrawdown`
- **历史持久化** — 将 `historyPositions` 作为一等数据存储，用于回测/分析输入

### 2.2 交易员跟单执行

- **跟单模式** — `dry-run`（默认，不下真实订单）和 `live`（真实交易所执行）
- **下单模式** — `ratio`（按交易员仓位比例）或 `fixed`（固定金额）
- **风控参数** — `accountMaxRiskRate`、`safeMarginRate`、`limitRiskRatio`、按策略配置的 `stopLossUsdt` 和 `stopLossPositionValueRate`
- **增量执行** — 仓位增加时追加下单，仓位减少时部分平仓
- **平台执行适配器** — Bitget、OKX、Binance（实盘）；其他交易所回退到 dry-run
- **跟单关系追踪** — 将本地订单映射到交易员订单，支持重映射和清除
- **权益历史** — 按分钟/小时/天粒度记录权益快照
- **持仓历史** — 持久化开仓/平仓事件，包含盈亏和拒绝原因

### 2.3 策略分析看板

用内部分析页面替代遗留的 Streamlit iframe：

- 按交易员组合选择策略
- 从持久化历史中重建已平仓交易（优先使用交易员历史，回退到交易员跟单历史）
- 绩效指标：胜率、已实现收益、盈亏因子、最大回撤、平均持仓时长
- 累计收益与收益率曲线（SVG 折线图）
- 单笔已实现收益柱状图
- 开仓小时 / 星期 / 持仓时长分布
- 策略配置面板（资金、模式、比例、止损）
- 交易员实时持仓表
- 运行时交易员跟单历史表（含订单详情）

### 2.4 策略工作区

- **用户级工作区** — 每个用户有自己的策略列表，关联到全局交易员池
- **全局交易员池** — 所有用户共享的交易员记录
- **策略设置** — 显示名称、状态（跟随/观察/停用）、风险系数
- **跟单配置** — 将交易员关联到跟单账户，配置下单模式、资金、止损
- **交易员 CRUD** — 最少输入添加（自动推断平台链接和资料），从工作区移除，全局删除

### 2.5 通知系统

- **渠道** — 飞书（webhook + 应用）、Telegram（bot）、Discord（webhook）
- **类别** — `trader-change`、`runtime-warning`、`startup`、`bybit-attention`
- **路由** — 基于环境变量的默认路由 + 运行时可编辑覆盖
- **富消息投递** — Bybit 浏览器回退告警的截图附件（Discord multipart、Telegram sendPhoto、飞书图片上传）
- **开关** — 在 `/app/system` 按类别启用/禁用

### 2.6 遗留消息桥接

- 接收遗留 WebSocket 消息（端口 8001），使用中文 JSON 键
- 持久化消息、链上信息和用户账户设置
- 在 `/app/messages` 浏览消息

### 2.7 系统监控

- 运行时健康：trader spy 连接、跟单引擎状态、心跳
- 行情订阅可视化：活跃平台、交易对、交易员数量、关系数量
- Bybit 浏览器回退状态：模式、状态、截图、尝试/成功时间戳
- 通知 sink 就绪状态和路由配置
- 运行时事件日志（支持范围/级别过滤）
- 系统日志文件浏览器（仅管理员）

### 2.8 管理与用户管理

- Better Auth，支持 `admin` 和 `user` 角色
- 邮箱/密码 + OAuth（GitHub、Google）
- 管理员可在 `/app/users` 管理用户
- 仅管理员可访问 `/app/logs` 系统日志

### 2.9 国际化

- 完整的 zh-CN / en 双语 UI
- `I18nProvider` 在根组件，`useI18n()` hook 提供 `t(key, values)` 函数
- 按路由的 `use*Text()` 辅助函数用于复杂本地化字符串
- `translate()` 导出用于非 React 上下文（如 `head()` meta）
- 语言切换在顶部导航栏和游客页面

---

## 3. 路由表

| 路由                            | 描述                                 | 访问权限     |
| ------------------------------- | ------------------------------------ | ------------ |
| `/`                             | 落地页                               | 公开         |
| `/about`                        | 关于页                               | 公开         |
| `/login`                        | 登录                                 | 仅游客       |
| `/signup`                       | 注册                                 | 仅游客       |
| `/app`                          | 仪表盘导航卡片                       | 已认证       |
| `/app/strategies`               | 用户策略工作区 + 全局交易员池        | 已认证       |
| `/app/strategy-board`           | 策略分析看板                         | 已认证       |
| `/app/teachers`                 | 交易员管理、跟单关系、持仓、权益历史 | 已认证       |
| `/app/teachers/:teacherId/logs` | 交易员专属日志查看                   | 已认证       |
| `/app/messages`                 | 遗留消息浏览器                       | 已认证       |
| `/app/system`                   | 系统状态、通知配置、运行时事件       | 已认证       |
| `/app/users`                    | 用户管理                             | 仅管理员     |
| `/app/logs`                     | 系统日志文件浏览器                   | 仅管理员     |
| `/api/trading/ingest`           | HTTP 仓位接入端点                    | 公开（内部） |
| `/api/trading/refresh`          | 实时交易员刷新端点                   | 公开（内部） |
| `/api/auth/*`                   | Better Auth API 路由                 | 公开         |

---

## 4. 数据模型

### 交易 Schema

| 表名                    | 用途                                       |
| ----------------------- | ------------------------------------------ |
| `trader`                | 全局交易员记录，含仓位、元数据、历史       |
| `teacher`               | 交易员跟单账户，含跟单配置、持仓、权益历史 |
| `user_trader`           | 用户与交易员的关联（工作区成员）           |
| `user_trader_workspace` | 用户工作区初始化                           |
| `runtime_state`         | 单例运行时健康与元数据                     |
| `runtime_event`         | 只追加事件日志（info/warn）                |
| `market_candle`         | OHLCV K 线存储，用于回测输入               |

### 消息 Schema

| 表名                          | 用途                           |
| ----------------------------- | ------------------------------ |
| `legacy_message`              | 接收的遗留消息，含完整 payload |
| `legacy_chain_info`           | 区块链交易元数据               |
| `legacy_user_account_setting` | 用户级 Binance API 凭证        |

### 认证 Schema

Better Auth 管理的表：`user`、`session`、`account`、`verification`。

---

## 5. API 端点

### `POST /api/trading/ingest`

接受两种 payload 格式：

- **快照** — `{ traderId, positions[] }`，直接更新仓位
- **遗留格式** — `{ topic: "trader", data: { type: "positionChange", trader, changes[] } }`，兼容 traderSpy 的 payload

### `POST /api/trading/refresh`

- `{ traderId }` — 通过平台适配器触发实时仓位刷新

---

## 6. 环境配置

见 `.env.example` 获取完整选项：

- **数据库** — `DATABASE_URL`
- **认证** — `BETTER_AUTH_SECRET`、OAuth 凭证
- **交易所凭证** — 各交易所 API key，用于实盘执行和刷新
- **Bybit 浏览器** — Puppeteer 配置，用于浏览器回退
- **通知** — 飞书、Telegram、Discord webhook URL 和 token
- **遗留桥接** — `TRADER_SPY_WS_PORT`（8011）、`LEGACY_MSG_WS_PORT`（8001）

---

## 7. 技术栈

| 层级       | 技术                                            |
| ---------- | ----------------------------------------------- |
| 框架       | TanStack Start（React 19 + React Compiler）     |
| 路由       | TanStack Router（基于文件）                     |
| 数据获取   | TanStack Query                                  |
| 样式       | Tailwind CSS 4 + shadcn/ui + Base UI            |
| 构建       | Vite 8 + Nitro v3                               |
| 数据库     | PostgreSQL + Drizzle ORM                        |
| 认证       | Better Auth（admin 插件、OAuth、邮箱/密码）     |
| 交易所对接 | CCXT、平台原生 HTTP/WS、Puppeteer（Bybit 回退） |
| 代码检查   | Oxlint + Oxfmt                                  |
| 国际化     | 自定义 zh-CN/en 词典系统                        |

---

## 8. 未来路线图

1. 迁移遗留 `traderSpy` 中剩余的交易员轮询适配器
2. 完善 Bybit 实盘执行适配器
3. K 线驱动的回测层（收益 vs 最大回撤、止损曲线、模拟余额仿真）
4. 增强实盘 vs 模拟执行决策的审计日志
5. 基于数据库的通知路由（不再仅依赖环境变量）
6. 替换剩余的遗留 Mongo/WS 命名语义
