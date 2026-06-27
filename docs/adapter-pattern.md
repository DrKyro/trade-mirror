# 平台适配器架构规范

> 目标：统一各平台（OKX / Bitget / Binance / Bybit）的 API 调用模式，消除重复代码，使 API 健康监控与业务调用共享同一套 endpoint 定义。

---

## 1. 现状问题

| 问题             | 具体表现                                                                               |
| ---------------- | -------------------------------------------------------------------------------------- |
| Headers 重复     | `buildOkxHeaders` 在 3 个文件中各定义一份                                              |
| Fetch 模式不一致 | OKX 用 `fetchOkxPayload`，Bitget 直接 `fetch` + 手动检查，Binance 又是另一种           |
| Switch-case 分散 | `fetchTraderLiveSnapshot`、`fetchTraderRankList`、`inferTraderProfile` 各有一个 switch |
| 健康探针脱节     | `api-health.ts` 硬编码 endpoints，不引用实际 adapter                                   |
| 错误处理不统一   | 有的 throw、有的返回 null、有的 catch 后返回空数组                                     |

---

## 2. 设计模式：Strategy + Registry

### 2.1 核心接口

```typescript
// src/lib/trading/adapters/platform-adapter.ts

export interface PlatformAdapter {
  /** 平台标识 */
  readonly platform: TraderPlatform;

  /** 人类可读的平台名 */
  readonly displayName: string;

  /** 默认请求 headers */
  readonly headers: Record<string, string>;

  /** API 成功码判断 */
  isSuccessCode(payload: { code?: string; retCode?: number; success?: boolean }): boolean;

  /** 声明此平台所有 API endpoints（用于健康监控 + 业务调用） */
  readonly endpoints: EndpointDefinition[];

  // ── 业务方法 ──

  /** 获取交易员实时快照（持仓 + 元数据 + 历史） */
  fetchLiveSnapshot(trader: TraderRecord): Promise<TraderLiveSnapshot>;

  /** 获取排行榜 */
  fetchRankList?(query: TraderRankQuery): Promise<TraderRankResult>;

  /** 推断交易员档案（添加交易员时） */
  inferProfile?(traderId: string): Promise<TraderProfileInference | null>;
}
```

### 2.2 Endpoint 定义

每个 endpoint 同时服务于 **业务调用** 和 **健康监控**：

```typescript
export interface EndpointDefinition {
  /** 唯一 ID，用于健康监控页面 */
  id: string;

  /** 人类可读名称（中英文） */
  name: string;

  /** HTTP 方法 */
  method: "GET" | "POST";

  /** 构建 URL（可接受 traderId 等参数） */
  buildUrl: (params: Record<string, string | number>) => string;

  /** 额外 headers（与 adapter.headers 合并） */
  extraHeaders?: Record<string, string>;

  /** POST body 构建器 */
  buildBody?: (params: Record<string, string | number>) => unknown;

  /** 从响应中提取数据条数（用于健康监控） */
  extractCount: (data: unknown) => number | null;

  /** 是否需要认证（私有 API） */
  requiresAuth?: boolean;

  /** 是否已集成到业务代码 */
  integrated: boolean;
}
```

### 2.3 统一 Fetch 工具

```typescript
// src/lib/trading/adapters/fetch-utils.ts

export interface FetchResult<T> {
  data: T;
  latencyMs: number;
  responseSizeBytes: number;
  httpStatus: number;
}

export async function fetchJson<T>(
  url: string,
  options: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: unknown;
    isSuccessCode: (payload: unknown) => boolean;
  },
): Promise<FetchResult<T>> {
  const start = performance.now();
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const latencyMs = Math.round(performance.now() - start);
  const text = await response.text();

  if (!response.ok) {
    throw new FetchError(response.status, latencyMs, text.length, `HTTP ${response.status}`);
  }

  const parsed = JSON.parse(text) as T;
  if (!options.isSuccessCode(parsed)) {
    throw new FetchError(
      response.status,
      latencyMs,
      text.length,
      `API code error: ${text.slice(0, 200)}`,
    );
  }

  return { data: parsed, latencyMs, responseSizeBytes: text.length, httpStatus: response.status };
}

export class FetchError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly latencyMs: number,
    readonly responseSizeBytes: number,
    message: string,
  ) {
    super(message);
  }
}
```

### 2.4 Registry

```typescript
// src/lib/trading/adapters/registry.ts

const adapters = new Map<TraderPlatform, PlatformAdapter>();

export function registerAdapter(adapter: PlatformAdapter) {
  adapters.set(adapter.platform, adapter);
}

export function getAdapter(platform: TraderPlatform): PlatformAdapter {
  const adapter = adapters.get(platform);
  if (!adapter) throw new Error(`No adapter registered for platform ${platform}`);
  return adapter;
}

export function getAllAdapters(): PlatformAdapter[] {
  return Array.from(adapters.values());
}

/** 从所有 adapter 收集 endpoints（用于健康监控页面） */
export function getAllEndpoints(): Array<EndpointDefinition & { platform: TraderPlatform }> {
  return getAllAdapters().flatMap((adapter) =>
    adapter.endpoints.map((ep) => ({ ...ep, platform: adapter.platform })),
  );
}
```

### 2.5 替代 switch-case

```typescript
// 之前
export async function fetchTraderLiveSnapshot(trader: TraderRecord) {
  switch (trader.platform) {
    case "okx":
      return fetchOkxSnapshot(trader);
    case "bitget":
      return fetchBitgetSnapshot(trader);
    // ...
  }
}

// 之后
export async function fetchTraderLiveSnapshot(trader: TraderRecord) {
  return getAdapter(trader.platform).fetchLiveSnapshot(trader);
}
```

---

## 3. 文件结构

```
src/lib/trading/adapters/
├── platform-adapter.ts       # 接口定义
├── fetch-utils.ts            # 统一 fetch 工具
├── registry.ts               # 适配器注册表
├── okx-adapter.ts            # OKX 平台适配器（整合 position/rank/profile/health）
├── bitget-adapter.ts         # Bitget 平台适配器
├── binance-adapter.ts        # Binance 平台适配器
├── bybit-adapter.ts          # Bybit 平台适配器
├── bybit-browser-fallback.ts # 保留（Bybit 浏览器回退）
└── bybit-runtime.ts          # 保留（Bybit 运行时错误）
```

**迁移后的旧文件**：

- `trader-position-adapters.ts` → 内容拆分到各 `*-adapter.ts`，导出 `fetchTraderLiveSnapshot` 改为从 registry 获取
- `trader-rank-adapters.ts` → 同上，`fetchTraderRankList` 改为从 registry 获取
- `trader-profile-inference.ts` → 同上，`inferTraderProfile` 改为从 registry 获取
- `api-health.ts` → 改为从 `getAllEndpoints()` 动态读取，不再硬编码

---

## 4. 迁移步骤

### Step 1: 基础设施

- 创建 `platform-adapter.ts`（接口定义）
- 创建 `fetch-utils.ts`（统一 fetch 工具）
- 创建 `registry.ts`（注册表）
- 创建 `index.ts`（导入所有 adapter 触发注册）

### Step 2: OKX 适配器

- 将 `trader-position-adapters.ts` 中 OKX 相关函数迁移到 `okx-adapter.ts`
- 将 `trader-rank-adapters.ts` 中 OKX 排行榜迁移
- 将 `trader-profile-inference.ts` 中 OKX profile 迁移
- 声明 OKX endpoints（11 个）
- 实现 `PlatformAdapter` 接口并注册

### Step 3: Bitget 适配器

- 同上，迁移 Bitget 相关代码
- 声明 Bitget endpoints（3 个）

### Step 4: Binance 适配器

- 同上，迁移 Binance 相关代码
- 声明 Binance endpoints（10 个，含新增 7 个）

### Step 5: Bybit 适配器

- 同上，迁移 Bybit 相关代码
- 声明 Bybit endpoints（2 个）
- 保留浏览器回退逻辑

### Step 6: API Health 重构

- `api-health.ts` 改为从 `getAllEndpoints()` 读取
- 删除硬编码的 `PROBES` 数组
- 健康探针使用 `fetchJson` 工具，与业务代码共享同一套 URL/headers

### Step 7: 清理

- 删除旧文件中的重复 headers
- 删除旧文件中的 switch-case
- 确保所有导入路径更新
- 运行 `pnpm lint` 验证

---

## 5. 设计约束

- **不改变外部 API**：`fetchTraderLiveSnapshot`、`fetchTraderRankList`、`inferTraderProfile` 的签名和返回值不变
- **不改变数据库 schema**
- **不改变路由结构**
- **逐步迁移**：每完成一个平台 adapter 就可以 lint 验证，不需要一次性全部完成
- **server-only**：所有 adapter 文件保持 `import "@tanstack/react-start/server-only"`
- **健康探针测试参数**：每个 endpoint 的 `buildUrl` 接收一个通用的 test params（如 `{ traderId: "test" }`），用于健康监控页面调用
