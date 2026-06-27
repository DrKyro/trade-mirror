# 各平台跟单交易 API 接口表

> 维护说明：每次新增或修改接口时，同步更新此文档。

---

## 1. OKX

### 1.1 交易员排行榜

| 接口     | `GET /priapi/v5/ecotrade/public/follow-rank`                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 用途     | 获取跟单交易员排行榜列表                                                                                                                |
| 认证     | 无（公开 API）                                                                                                                          |
| 代码位置 | `src/lib/trading/adapters/trader-rank-adapters.ts`                                                                                      |
| 参数     | `rankType`, `pageNo`, `pageSize`, `t`（时间戳）                                                                                         |
| 响应结构 | `data: [{ ranks: [{ uniqueName, nickName, portrait, sign, pnl, yieldRatio, maxDrawdown, winRatio, totalLeadInstNum }], total, pages }]` |
| 映射字段 | `uniqueName` → traderId, `pnl` → pnl, `yieldRatio` → 收益率, `maxDrawdown` → 最大回撤, `winRatio` → 胜率                                |

### 1.2 交易员基本信息

| 接口     | `GET /priapi/v5/ecotrade/public/basic-info`                                               |
| -------- | ----------------------------------------------------------------------------------------- |
| 用途     | 获取交易员昵称、头像、签名                                                                |
| 认证     | 无（公开 API）                                                                            |
| 代码位置 | `trader-position-adapters.ts` + `trader-rank-adapters.ts` + `trader-profile-inference.ts` |
| 参数     | `uniqueName`（交易员 ID）                                                                 |
| 响应结构 | `data: [{ nickName, portrait, sign, uniqueName }]`                                        |
| 映射字段 | `nickName` → nickName, `portrait` → avatar, `sign` → sign                                 |

### 1.3 交易员收益统计

| 接口     | `GET /priapi/v5/ecotrade/public/trade-stat`                            |
| -------- | ---------------------------------------------------------------------- |
| 用途     | 获取交易员累计 PnL 和收益率                                            |
| 认证     | 无（公开 API）                                                         |
| 代码位置 | `trader-position-adapters.ts` + `trader-rank-adapters.ts`              |
| 参数     | `uniqueName`, `latestNum=0`                                            |
| 响应结构 | `data: { pnl, yieldRatio }`                                            |
| 映射字段 | `pnl` + `yieldRatio` → 推算 balance（equity = pnl / yieldRatio + pnl） |

### 1.4 交易员每日收益曲线

| 接口     | `GET /priapi/v5/ecotrade/public/yield-pnl`                        |
| -------- | ----------------------------------------------------------------- |
| 用途     | 获取每日 PnL 和收益率时间序列，用于推算 balance 和最大回撤        |
| 认证     | 无（公开 API）                                                    |
| 代码位置 | `trader-position-adapters.ts` + `trader-rank-adapters.ts`         |
| 参数     | `uniqueName`, `latestNum=0`                                       |
| 响应结构 | `data: [{ pnl, ratio, statTime }]`（每日一个点）                  |
| 映射字段 | 最新点 `pnl`/`ratio` → 推算 balance；全序列 → 计算 3 个月最大回撤 |

### 1.5 交易员当前持仓（position-detail）

| 接口     | `GET /priapi/v5/ecotrade/public/position-detail`                                                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用途     | 获取交易员当前持仓列表（**主用**）                                                                                                                                                                                                                                           |
| 认证     | 无（公开 API）                                                                                                                                                                                                                                                               |
| 代码位置 | `trader-position-adapters.ts`                                                                                                                                                                                                                                                |
| 参数     | `uniqueName`                                                                                                                                                                                                                                                                 |
| 响应结构 | `data: [{ tradeItemId, instId, openAvgPx, markPx, margin, lever, openTime, closeTime, mgnMode, pnl, pnlRatio, posSide, availSubPos }]`                                                                                                                                       |
| 映射字段 | `tradeItemId` → id, `instId` → symbol（去横线）, `openAvgPx` → entryPrice, `markPx` → markPrice, `lever` → leverage, `margin` → margin, `mgnMode` → marginMode, `pnl` → pnl, `pnlRatio` → pnlRatio, `posSide` → positionSide, `availSubPos` → amount（net 模式正负判断方向） |
| 注意     | **交易员开启策略保护时返回空数组**，需回退到 1.6                                                                                                                                                                                                                             |

### 1.6 交易员当前持仓（community 回退）

| 接口     | `GET /priapi/v5/ecotrade/public/community/user/position-current`                                                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用途     | 获取交易员实际持仓（**策略保护时回退使用**）                                                                                                                                                                                                             |
| 认证     | 无（公开 API，但需要登录态 headers）                                                                                                                                                                                                                     |
| 代码位置 | `trader-position-adapters.ts` → `fetchOkxPositionsFromCommunity`                                                                                                                                                                                         |
| 参数     | `uniqueName`                                                                                                                                                                                                                                             |
| 响应结构 | `data: [{ posData: [{ posId, instId, instType, posSide, pos, posCcy, avgPx, markPx, last, lever, margin, marginCcy, mgnMode, cTime, upl, uplRatio, notionalUsd, fee, fundingFee, realizedPnl, pnl }], longLever, shortLever }]`                          |
| 映射字段 | `posId` → id, `instId` → symbol, `avgPx` → entryPrice, `markPx` → markPrice, `pos` → amount（取绝对值）, `lever` → leverage, `margin` → margin, `mgnMode` → marginMode, `upl` → pnl, `uplRatio` → pnlRatio, `posSide` → positionSide, `cTime` → openTime |
| 触发条件 | `position-detail` 返回空时自动回退                                                                                                                                                                                                                       |

### 1.7 交易员历史持仓

| 接口     | `GET /priapi/v5/ecotrade/public/position-history`                                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用途     | 获取已平仓位历史，用于计算月均仓位价值和历史持仓记录                                                                                                                                                                                            |
| 认证     | 无（公开 API）                                                                                                                                                                                                                                  |
| 代码位置 | `trader-position-adapters.ts` + `trader-rank-adapters.ts`                                                                                                                                                                                       |
| 参数     | `uniqueName`, `size=200`, `after`（分页游标，上一页最后一条的 id）                                                                                                                                                                              |
| 响应结构 | `data: [{ id, instId, contractVal, subPos, openAvgPx, closeAvgPx, openTime, uTime, pnl, pnlRatio, posSide, lever }]`                                                                                                                            |
| 映射字段 | `id` → id, `instId` → symbol, `openAvgPx` → entryPrice, `closeAvgPx` → closePrice, `subPos` × `contractVal` → amount, `lever` → leverage, `openTime` → openTime, `uTime` → closeTime, `pnl` → profit, `pnlRatio` → profitRate, `posSide` → side |
| 分页策略 | 每页 200 条，用 `after` 游标翻页，直到不足 200 条或超过 90 天截止时间                                                                                                                                                                           |

### 1.8 交易员带单仓位汇总（未集成）

| 接口     | `GET /priapi/v5/ecotrade/public/trader/position-summary`                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 用途     | 获取交易员带单仓位汇总（含 PnL、保证金、名义价值）                                                                                                                                                           |
| 认证     | 无（公开 API）                                                                                                                                                                                               |
| 代码位置 | 暂未集成                                                                                                                                                                                                     |
| 参数     | `instType=SWAP`, `uniqueName`                                                                                                                                                                                |
| 响应结构 | `data: [{ availSubPos, ccy, closePnl, fee, fundingFee, imr, instId, lever, margin, markPx, maxSellableAmount, mgnMode, notionalUsd, openAvgPx, openTime, pnl, pnlRatio, posSide, side, uTime, uniqueName }]` |
| 注意     | **策略保护开启时 `instId`/`openAvgPx`/`markPx` 为空**，但 pnl/margin/lever 仍有值                                                                                                                            |

### 1.9 交易员统计数据（未集成）

| 接口            | `GET /priapi/v5/ecotrade/public/trader/trade-data`                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用途            | 获取交易员带单天数、AUM、跟单人数、分润比例、胜率、盈亏比等                                                                                                                                                                                           |
| 认证            | 无（公开 API）                                                                                                                                                                                                                                        |
| 代码位置        | 暂未集成                                                                                                                                                                                                                                              |
| 参数            | `latestNum=0`, `bizType=SWAP`, `uniqueName`                                                                                                                                                                                                           |
| 响应结构        | `data: [{ nonPeriodicPart: [{ functionId, title, value }], periodicPart: [{ functionId, title, value }] }]`                                                                                                                                           |
| 关键 functionId | `initialDay`(带单天数), `asset`(带单资产USDT), `aum`(带单规模), `currentFollowPnl`(跟单用户收益), `followerNum`(跟单人数), `profitShareRatio`(分润比例), `profitDays`(盈利天数), `lossDays`(亏损天数), `winRatio`(胜率), `pnlProfitLossRatio`(盈亏比) |

### 1.10 交易员周度 PnL（未集成）

| 接口     | `GET /priapi/v5/ecotrade/public/week-pnl`           |
| -------- | --------------------------------------------------- |
| 用途     | 获取周度 PnL 时间序列                               |
| 认证     | 无（公开 API）                                      |
| 代码位置 | 暂未集成                                            |
| 参数     | `uniqueName`                                        |
| 响应结构 | `data: [{ pnl, ratio, statTime }]`（每周一个点）    |
| 用途说明 | 类似 yield-pnl 但为周粒度，可用于更粗粒度的收益曲线 |

### 1.11 交易员持仓历史散点图（未集成）

| 接口     | `GET /priapi/v5/ecotrade/public/position-history-scatter` |
| -------- | --------------------------------------------------------- |
| 用途     | 获取已平仓交易散点数据（平仓 PnL vs 持仓时长）            |
| 认证     | 无（公开 API）                                            |
| 代码位置 | 暂未集成                                                  |
| 参数     | `period=30D`, `instType=SWAP`, `uniqueName`               |
| 响应结构 | `data: [{ itemScatterList: [{ closePnl, holdTimeMS }] }]` |
| 用途说明 | 可用于可视化交易结果分布和持仓时长分析                    |

### 1.12 跟单账户持仓（私有 API，CCXT）

| 接口     | CCXT `fetchBalance()` + `fetchPositions()`                                                    |
| -------- | --------------------------------------------------------------------------------------------- |
| 用途     | 获取跟单账户余额和持仓（用于 teacher account snapshot）                                       |
| 认证     | 需要 `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_API_PASSWORD`                                    |
| 代码位置 | `src/lib/trading/teacher-account-adapters.ts` → `fetchOkxTeacherAccount`                      |
| 响应     | balance.info 包含 `uBal`/`uEq`/`uMrg`/`upl` 等 USDT 字段；positions 为标准 CCXT position 数组 |

### 1.13 实盘下单 / 平仓（私有 API，CCXT）

| 接口     | CCXT `createMarketOrder()`                           |
| -------- | ---------------------------------------------------- |
| 用途     | 跟单实盘开仓和平仓                                   |
| 认证     | 需要 OKX API 凭证                                    |
| 代码位置 | `src/lib/trading/execution/okx-execution-adapter.ts` |
| 说明     | 开仓：按 positionSide 买/卖；平仓：反向市价单        |

---

## 2. Bitget

### 2.1 交易员排行榜

| 接口     | `POST /v1/trigger/public/uta/traderView`                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| 用途     | 获取跟单交易员排行榜列表                                                                                       |
| 认证     | 无（公开 API）                                                                                                 |
| 代码位置 | `src/lib/trading/adapters/trader-rank-adapters.ts`                                                             |
| 请求体   | `{ pageNo, pageSize, sortType, sortField, fullStatus: 1 }`                                                     |
| 响应结构 | `data: { records: [{ traderUid, ...itemData }], total }`，itemData 为 key-value 数组                           |
| 映射字段 | `traderUid` → traderId, `copied_people` → followers, `max_retracement` → maxDrawdown, `winning_rate` → winRate |

### 2.2 交易员周期数据

| 接口     | `POST /v1/trigger/trace/public/cycleData`                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 用途     | 获取交易员 90 天周期统计数据（余额、回撤、胜率等）                                                                                                                                                                 |
| 认证     | 无（公开 API）                                                                                                                                                                                                     |
| 代码位置 | `trader-position-adapters.ts` → `fetchBitgetCycleData`                                                                                                                                                             |
| 请求体   | `{ languageType: 0, triggerUserId: traderId, cycleTime: 90 }`                                                                                                                                                      |
| 响应结构 | `data: { statisticsDTO, pageScoreDTO, pnlRows, netProfitKlineDTO, roiRows, positionTimeDTO, symbolDistributeDetail }`                                                                                              |
| 关键字段 | `statisticsDTO.aum` → balance, `statisticsDTO.maxRetracement` → threeMonthMaxDrawdown（取负）, `statisticsDTO.profit` → 总利润, `statisticsDTO.winningRate` → 胜率, `pageScoreDTO.traderUserDetail` → 详细盈亏统计 |

### 2.3 交易员历史订单

| 接口     | `POST /v1/trigger/trace/order/historyList`                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 用途     | 获取交易员已平仓历史订单，用于 historyPositions 和月均仓位价值                                                                                                                                                                                   |
| 认证     | 无（公开 API）                                                                                                                                                                                                                                   |
| 代码位置 | `trader-position-adapters.ts` → `fetchBitgetHistoryOrders`                                                                                                                                                                                       |
| 请求体   | `{ languageType: 0, pageNo, pageSize: 50, traderUid: traderId }`                                                                                                                                                                                 |
| 响应结构 | `data: { rows: [{ orderNo, productCode, symbolDisplayName, openAvgPrice, closeAvgPrice, openTime, closeTime, netProfit, returnRate, openLevel, openDealCount, positionDesc, marginMode }], nextFlag, totals }`                                   |
| 映射字段 | `orderNo` → id, `productCode` → symbol, `openAvgPrice` → entryPrice, `closeAvgPrice` → closePrice, `openLevel` → leverage, `openDealCount` → amount, `netProfit` → profit, `returnRate/100` → profitRate, `positionDesc`（含"空仓"=short）→ side |
| 分页策略 | 每页 50 条，最多 5 页，通过 `nextFlag` 判断是否继续                                                                                                                                                                                              |

### 2.4 交易员当前持仓（私有 API，CCXT）

| 接口     | CCXT `privateMixPostMixV1TraceReportOrderCurrentList`                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用途     | 获取交易员当前跟单持仓                                                                                                                                                                                           |
| 认证     | 需要 `BITGET_API_KEY` / `BITGET_API_SECRET` / `BITGET_API_PASSWORD`                                                                                                                                              |
| 代码位置 | `trader-position-adapters.ts` → `fetchBitgetPositions`                                                                                                                                                           |
| 请求体   | `{ traderId }`                                                                                                                                                                                                   |
| 响应结构 | `data: [{ trackingNo, holdMode, leverage, holdSide, symbol, openPrice, openTime, openAmount, marginAmount }]`                                                                                                    |
| 映射字段 | `trackingNo` → id, `symbol` → symbol, `openPrice` → entryPrice, `openAmount` → amount, `leverage` → leverage, `openTime` → openTime, `marginAmount` → margin, `holdMode` → marginMode, `holdSide` → positionSide |

### 2.5 跟单账户持仓（私有 API，CCXT）

| 接口     | CCXT `fetchBalance()` + `fetchPositions()`                                                       |
| -------- | ------------------------------------------------------------------------------------------------ |
| 用途     | 获取跟单账户余额和持仓                                                                           |
| 认证     | 需要 Bitget API 凭证                                                                             |
| 代码位置 | `teacher-account-adapters.ts` → `fetchBitgetTeacherAccount`                                      |
| 响应     | balance.info[0] 包含 `usdtEquity`/`crossMaxAvailable`/`unrealizedPL`；positions 为标准 CCXT 数组 |

### 2.6 实盘开仓（私有 API，CCXT）

| 接口     | CCXT `createMarketOrder()`                                                        |
| -------- | --------------------------------------------------------------------------------- |
| 用途     | 跟单实盘开仓                                                                      |
| 认证     | 需要 Bitget API 凭证                                                              |
| 代码位置 | `src/lib/trading/execution/bitget-execution-adapter.ts` → `createBitgetLiveOrder` |
| 说明     | 按 positionSide 决定 buy/sell，symbol 格式为 `BTC/USDT:USDT`                      |

### 2.7 实盘平仓（私有 API，CCXT）

| 接口     | CCXT `privateMixPostMixV1TraceCloseTrackOrder`         |
| -------- | ------------------------------------------------------ |
| 用途     | 跟单实盘平仓（关闭跟单跟踪订单）                       |
| 认证     | 需要 Bitget API 凭证                                   |
| 代码位置 | `bitget-execution-adapter.ts` → `closeBitgetLiveOrder` |
| 请求体   | `{ symbol: "BTCUSDT_UMCBL", trackingNo: orderId }`     |
| 响应     | `code === "00000"` 表示成功                            |

---

## 3. Binance / Binance Futures

### 3.1 交易员排行榜（Binance Futures）

| 接口     | `POST /bapi/futures/v1/friendly/future/copy-trade/home-page/query-list`        |
| -------- | ------------------------------------------------------------------------------ |
| 用途     | 获取 Binance Futures 跟单交易员排行榜                                          |
| 认证     | 无（公开 API）                                                                 |
| 代码位置 | `trader-rank-adapters.ts`                                                      |
| 请求体   | `{ pageNo, pageSize, ... }`                                                    |
| 响应结构 | 包含 `leadPortfolioId`, `nickName`, `avatar`, `roi`, `mdd`, `winRate` 等       |
| 映射字段 | `leadPortfolioId` → traderId, `mdd/100` → maxDrawdown, `winRate/100` → winRate |

### 3.2 交易员当前持仓（Binance Futures）

| 接口     | `POST /bapi/futures/v2/private/future/leaderboard/getOtherPosition`                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用途     | 获取 Binance Futures 交易员当前持仓                                                                                                                                                                   |
| 认证     | 无（公开 API）                                                                                                                                                                                        |
| 代码位置 | `trader-position-adapters.ts` → `fetchBinanceFuturesPositions`                                                                                                                                        |
| 请求体   | `{ encryptedUid: traderId, tradeType: "PERPETUAL" }`                                                                                                                                                  |
| 响应结构 | `data: { otherPositionRetList: [{ symbol, entryPrice, markPrice, pnl, roe, amount, updateTimeStamp, leverage }] }`                                                                                    |
| 映射字段 | `symbol` → symbol, `entryPrice` → entryPrice, `markPrice` → markPrice, `amount`（正=long, 负=short）→ amount+side, `leverage` → leverage, `pnl` → pnl, `roe` → pnlRatio, `updateTimeStamp` → openTime |
| 注意     | `code === "000000"` 表示成功                                                                                                                                                                          |

### 3.3 交易员档案推断（Binance 现货跟单）

| 接口     | `GET /bapi/futures/v1/friendly/future/copy-trade/lead-portfolio/detail` |
| -------- | ----------------------------------------------------------------------- |
| 用途     | 获取 Binance 现货跟单交易员档案信息                                     |
| 认证     | 无（公开 API）                                                          |
| 代码位置 | `src/lib/trading/trader-profile-inference.ts` → `fetchBinanceProfile`   |
| 参数     | `portfolioId`（交易员 ID）                                              |
| 响应结构 | 包含 `nickName`, `avatar`, `introduction` 等                            |

### 3.4 交易员收益率/PNL 曲线（未集成）

| 接口     | `GET /bapi/futures/v1/public/future/copy-trade/lead-portfolio/chart-data` |
| -------- | ------------------------------------------------------------------------- |
| 用途     | 获取交易员收益率(ROI)或 PNL 时间序列曲线                                  |
| 认证     | 无（公开 API）                                                            |
| 代码位置 | 暂未集成                                                                  |
| 参数     | `portfolioId`, `dataType=ROI\|PNL`, `timeRange=7D\|30D\|90D\|180D\|365D`  |
| 响应结构 | `data: [{ time, value }]`（时间序列点）                                   |
| 用途说明 | 可用于推算 balance（类似 OKX yield-pnl）、计算最大回撤、绘制收益曲线      |

### 3.5 交易员当前持仓（lead-data/positions，未集成）

| 接口     | `GET /bapi/futures/v1/friendly/future/copy-trade/lead-data/positions` |
| -------- | --------------------------------------------------------------------- |
| 用途     | 获取交易员当前持仓（与 `getOtherPosition` 不同的另一种接口）          |
| 认证     | 无（公开 API）                                                        |
| 代码位置 | 暂未集成                                                              |
| 参数     | `portfolioId`                                                         |
| 响应结构 | 待确认（需实际调用验证）                                              |
| 用途说明 | 可作为 `getOtherPosition` 的替代或补充数据源                          |

### 3.6 交易员历史持仓（未集成）

| 接口     | `POST /bapi/futures/v1/friendly/future/copy-trade/lead-portfolio/position-history`   |
| -------- | ------------------------------------------------------------------------------------ |
| 用途     | 获取交易员已平仓历史持仓列表                                                         |
| 认证     | 无（公开 API）                                                                       |
| 代码位置 | 暂未集成                                                                             |
| 请求体   | `{ pageNumber, pageSize, portfolioId, sort: "OPENING" }`                             |
| 响应结构 | 待确认（需实际调用验证）                                                             |
| 用途说明 | 类似 OKX position-history / Bitget historyList，用于 historyPositions 和月均仓位价值 |

### 3.7 交易员订单历史（未集成）

| 接口     | `POST /bapi/futures/v1/friendly/future/copy-trade/lead-portfolio/order-history` |
| -------- | ------------------------------------------------------------------------------- |
| 用途     | 获取交易员订单历史（按时间范围）                                                |
| 认证     | 无（公开 API）                                                                  |
| 代码位置 | 暂未集成                                                                        |
| 请求体   | `{ portfolioId, startTime, endTime, pageSize }`                                 |
| 响应结构 | 待确认（需实际调用验证）                                                        |
| 用途说明 | 可用于更细粒度的交易记录分析                                                    |

### 3.8 交易员转账记录（未集成）

| 接口     | `POST /bapi/futures/v1/friendly/future/copy-trade/lead-portfolio/transfer-history` |
| -------- | ---------------------------------------------------------------------------------- |
| 用途     | 获取交易员资金转账记录                                                             |
| 认证     | 无（公开 API）                                                                     |
| 代码位置 | 暂未集成                                                                           |
| 请求体   | `{ pageNumber, pageSize, portfolioId }`                                            |
| 响应结构 | 待确认（需实际调用验证）                                                           |
| 用途说明 | 可用于追踪资金进出，辅助计算实际余额变化                                           |

### 3.9 交易员项目表现（未集成）

| 接口     | `GET /bapi/futures/v1/public/future/copy-trade/lead-portfolio/performance` |
| -------- | -------------------------------------------------------------------------- |
| 用途     | 获取交易员项目表现指标（ROI、胜率、回撤、盈亏比等）                        |
| 认证     | 无（公开 API）                                                             |
| 代码位置 | 暂未集成                                                                   |
| 参数     | `portfolioId`, `timeRange=7D\|30D\|90D\|180D\|365D`                        |
| 响应结构 | 待确认（需实际调用验证）                                                   |
| 用途说明 | 可用于补充 balance、maxDrawdown、winRate 等 trader 字段                    |

### 3.10 跟单账户持仓（私有 API，CCXT）

| 接口     | CCXT `fetchBalance()` + `fetchPositionsRisk()`               |
| -------- | ------------------------------------------------------------ |
| 用途     | 获取 Binance 跟单账户余额和持仓风险                          |
| 认证     | 需要 `BINANCE_API_KEY` / `BINANCE_API_SECRET`                |
| 代码位置 | `teacher-account-adapters.ts` → `fetchBinanceTeacherAccount` |

---

## 4. Bybit

### 4.1 交易员排行榜

| 接口     | `GET /x-api/fapi/beehive/public/v1/common/dynamic-leader-list`                  |
| -------- | ------------------------------------------------------------------------------- |
| 用途     | 获取 Bybit 跟单交易员排行榜                                                     |
| 认证     | 无（公开 API）                                                                  |
| 代码位置 | `trader-rank-adapters.ts`                                                       |
| 参数     | `pageNo`, `pageSize`, `leaderLevel`, `sortField`, `t`                           |
| 响应结构 | 包含 `leaderId`, `nickName`, `avatar`, `roi`, `maxDrawDown`, `winRate` 等       |
| 映射字段 | `leaderId` → traderId, `maxDrawDown/100` → maxDrawdown, `winRate/100` → winRate |

### 4.2 交易员当前持仓

| 接口     | `GET /fapi/beehive/public/v1/common/order/list-detail`                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用途     | 获取 Bybit 交易员当前持仓                                                                                                                                                                                                                         |
| 认证     | 可选 `BYBIT_API_USERTOKEN` / `BYBIT_API_COOKIE`（有则带，无则匿名）                                                                                                                                                                               |
| 代码位置 | `trader-position-adapters.ts` → `fetchBybitPositions`                                                                                                                                                                                             |
| 参数     | `leaderMark`（交易员 ID）, `pageSize=100`, `page=1`                                                                                                                                                                                               |
| 响应结构 | `result: { openTradeInfoProtection, data: [{ symbol, entryPrice, side, leverageE2, transactTimeE3, positionEntryPrice, closeFreeQtyX, orderCostE8, isIsolated }] }`                                                                               |
| 映射字段 | `symbol` → symbol, `positionEntryPrice` → entryPrice, `side`（Buy=long, Sell=short）→ positionSide, `leverageE2/100` → leverage, `closeFreeQtyX/1e8` → amount, `orderCostE8/1e8` → margin, `isIsolated` → marginMode, `transactTimeE3` → openTime |
| 注意     | `openTradeInfoProtection === 1` 时抛错，回退到浏览器 Puppeteer 抓取                                                                                                                                                                               |

### 4.3 浏览器回退持仓抓取

| 接口     | Puppeteer 浏览器抓取                                                                            |
| -------- | ----------------------------------------------------------------------------------------------- |
| 用途     | 当 API 因策略保护失败时，通过浏览器自动化抓取 Bybit 持仓                                        |
| 认证     | 需要浏览器登录态                                                                                |
| 代码位置 | `src/lib/trading/adapters/bybit-browser-fallback.ts` → `fetchBybitPositionsWithBrowserFallback` |
| 说明     | API 返回 `openTradeInfoProtection === 1` 时自动触发                                             |

---

## 5. 代码文件索引

| 文件                                                    | 职责                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/trading/adapters/trader-position-adapters.ts`  | 交易员持仓抓取（OKX/Bitget/Binance/Bybit），含元数据和历史持仓         |
| `src/lib/trading/adapters/trader-rank-adapters.ts`      | 交易员排行榜抓取（OKX/Binance/Bitget/Bybit）+ OKX 深度分析             |
| `src/lib/trading/adapters/bybit-browser-fallback.ts`    | Bybit 浏览器 Puppeteer 回退                                            |
| `src/lib/trading/trader-profile-inference.ts`           | 交易员创建时档案推断（OKX basic-info / Binance lead-portfolio/detail） |
| `src/lib/trading/teacher-account-adapters.ts`           | 跟单账户持仓抓取（CCXT 私有 API）                                      |
| `src/lib/trading/execution/okx-execution-adapter.ts`    | OKX 实盘开仓/平仓                                                      |
| `src/lib/trading/execution/bitget-execution-adapter.ts` | Bitget 实盘开仓/平仓                                                   |
| `src/lib/trading/execution/common.ts`                   | 凭证解析工具（envPrefix: BITGET/OKX/BINANCE）                          |

---

## 6. 策略保护（Strategy Protection）处理

| 平台    | 检测方式                        | 回退方案                                 |
| ------- | ------------------------------- | ---------------------------------------- |
| OKX     | `position-detail` 返回空数组    | 回退到 `community/user/position-current` |
| Bybit   | `openTradeInfoProtection === 1` | 回退到 Puppeteer 浏览器抓取              |
| Bitget  | 无策略保护                      | —                                        |
| Binance | 无策略保护                      | —                                        |
