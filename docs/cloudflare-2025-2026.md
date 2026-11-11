# Cloudflare 免费能力全景（2025 → 2026-11）

> 调研时间：2026-11-11 · 数据来源：Cloudflare 官方文档定价页、官方博客、Developer/Birthday Week 2025 公告页，以及对你账户（`666mingqing666@gmail.com` / `9e80bc9e…5921`）的只读 API 探测。
> 免费额度以官方定价页为准；每日额度在北京时间 08:00（UTC 00:00）重置，超限后该类操作直接报错，不会自动转付费。

---

## 一、结论先行

1. **免费层已经能撑起一个完整的生产级应用**：Workers（计算）+ D1（关系库）+ R2（对象存储）+ KV（缓存）+ Queues（异步）+ Workflows（长流程）+ Durable Objects（实时/有状态）+ Workers AI（推理）+ Vectorize（向量检索）+ Browser Run（无头浏览器）。
2. **2025 年的主线是「把付费能力下放到免费层」**：Durable Objects 免费层（SQLite 后端）、Queues/Vectorize/Hyperdrive/Workflows 的免费额度、Browser Rendering 免费 10 分钟/天，都是这一年的产物。
3. **2026 年的主线是「Agent 基础设施」**：Python Workers GA、Containers 重构为 Agent 沙箱、AI Search GA、AI Gateway Web Search API、Cloudflare Traces、D1 百万库架构。
4. **你账户目前是 Workers Free 计划**：Containers 返回 401（需 Paid），其余上述产品均可直接使用。

---

## 二、当前免费额度总表（2026-11 官方数据）

| 产品 | 免费额度 | 关键限制 | 适合做什么 |
|---|---|---|---|
| **Workers** | 100,000 请求/天；10 ms CPU/次 | 单次 CPU 10ms（I/O 等待不计） | API、SSR、BFF、Webhook |
| **D1** | 读 500 万行/天；写 10 万行/天；5 GB；**10 个库** | 单库 10 GB（付费） | 业务主库、账号、订单 |
| **Durable Objects** | 100,000 请求/天；13,000 GB-s/天；5 GB；读 500 万行/天；写 10 万行/天 | **仅 SQLite 后端** | 房间、协同编辑、限流、购物车 |
| **KV** | 读 100,000/天；写 1,000/天；1 GB | 最终一致 | 配置、会话、缓存 |
| **R2** | 10 GB 存储；Class A 100 万/月；Class B 1000 万/月；**出网免费** | — | 图片、视频、备份、静态资源 |
| **Queues** | 10,000 操作/天；**保留 24 小时（不可配）** | 免费层不可延长保留 | 异步任务、削峰 |
| **Workflows** | 100,000 请求/天（与 Workers 共享）；3,000 步骤/天；1 GB-month | 步骤额度较小 | 多步骤流程、Saga、AI 编排 |
| **Workers AI** | 10,000 Neurons/天 | 部分前沿模型需付费方式 | 文本/图像/语音推理 |
| **Vectorize** | 查询 3000 万维/月；存储 500 万维；100 个索引 | 免费层够原型与中小规模 RAG | 语义检索、RAG |
| **Hyperdrive** | 100,000 查询/天 | 连接外部 Postgres/MySQL | 加速外部数据库 |
| **Browser Run**（原 Browser Rendering） | **10 分钟/天**；3 个并发浏览器 | 10 分钟很快耗尽 | 截图、PDF、爬取、E2E |
| **Workers Logs** | 200,000 条/天；保留 3 天 | — | 线上排障 |
| **Containers** | **无免费额度** | 需 Workers Paid | 长驻服务、任意运行时 |
| **Pages** | 静态请求不限量；构建次数有限 | 已并入 Workers 生态 | 静态站、前端托管 |

---

## 三、2025 年新增（按时间线）

### 4 月 · Developer Week 2025
- **Agents SDK 开源**（`npm i agents`）：把 Durable Object + WebSocket + MCP Server 封装成一套 Agent 基元，是目前 Cloudflare 做 AI Agent 的官方路径。
- **Containers 预告**：宣布 2025 年 6 月把容器带进 Workers 体系。

### 6–7 月 · Containers 公测
- 容器与 Workers 深度集成，由 Worker 直接调度；面向付费用户开放。

### 9 月 25 日 · Cloudflare Email Service（私有 Beta）
- Workers 原生绑定收发邮件，无需 API Key，把「发信」和「收信路由」统一成一个服务。
- 你的账户 **Email Routing 已启用（5 条规则）**，发信能力仍在 Beta 阶段。

### 9 月下旬 · Birthday Week 2025（15 周年）
一次性放出的一批能力，与开发者最相关的：

| 能力 | 说明 |
|---|---|
| **Cloudflare Data Platform** | 基于 Apache Iceberg + R2 的托管数据摄取/转换/查询套件 |
| **R2 SQL** | 直接对 R2 Data Catalog 做 serverless 分析查询 |
| **Browser Rendering GA** | Playwright/Puppeteer 正式可用，免费 10 分钟/天 |
| **Workers Builds GA** | 从 Git 仓库直接构建部署 Workers |
| **Media Transformations GA** | 图片/视频实时转码（按量计费） |
| **VibeSDK** | 开源的 AI「vibe coding」平台，可一键自建 |
| **AI Index** | 为站点自动生成 AI 友好的搜索索引（MCP Server / llms.txt / 搜索 API） |
| **Code Mode（MCP）** | 把 MCP 工具转成 TypeScript API 供 LLM 调用 |
| **PlanetScale 集成** | Workers 内直接连 PlanetScale（Postgres/MySQL） |
| **学生/非营利免费** | 美国 .edu 学生免费一年；合格非营利最高 $250,000 额度 |
| **「所有功能向所有客户开放」** | 多项原企业级能力下放 |

> 同年，**Durable Objects 免费层**（SQLite 后端）落地——这是免费层从「无状态」跨到「有状态实时」的关键一步。官方定价页未标注具体上线日期，但当前 Free 计划已明确包含 10 万请求/天与 5 GB 存储。

---

## 四、2026 年新增（截至 11 月 11 日）

| 日期 | 发布 | 对免费用户的意义 |
|---|---|---|
| 09-21 | **Python Workers GA** | 可直接用 Python 写 Worker，接 D1/R2/AI，无需 JS 胶水 |
| 09-28 | **Vinext 1.0** | Next.js 应用跑在 Vite 上，部署链路更轻 |
| 09-28 | **Rust 原生支持**（wasm-bindgen Emscripten target） | Rust 库可直接进 Workers |
| 09-30 | **Containers 重构为 Agent 沙箱** | 启动快 6 倍、可选镜像/实例、文件系统快照公测（仍付费） |
| 09-30 | **AI Gateway User Insights** | 模型/任务/用户维度用量洞察，**免费提供** |
| 10-01 | **AI Search GA** | 视觉检索、扫描版 PDF OCR、10 MiB 文件上限 |
| 10-01 | **Cloudflare K2** | 基于 R2 的 serverless 事件流（持久有序日志） |
| 10-02 | **AI Gateway Web Search API** | 一个 REST/绑定即可给模型注入实时网页上下文 |
| 10-02 | **Cloudflare Traces** | 请求穿越 WAF/缓存/Workers/源站的全链路追踪 |
| 10-13 | **D1 百万级数据库架构** | 控制面可扩展到数百万库，数据面仍在边缘 |
| 10-20 | **tsrs** | TypeScript 编译器 Rust 移植，最高 8× 提速 |
| 11-05 | **Durable Objects 自动重试** | 调用失败自动重试（默认 4 次），弱网下更稳 |
| 11-09 | **DO 启动位置优化** | 重新激活时回到上次运行的机器，减少 SQLite 冷启动 |
| 11-10 | **Workflow 并发上限** | 可为单个 Workflow 设并发，超出排队（免费层账户并发 100） |

此外，**Browser Rendering 已更名为 Browser Run**，并明确 Free 计划为 10 分钟/天、3 并发浏览器。

---

## 五、你的账户实测能力

只读探测（不创建任何资源），结果如下：

| 产品 | 状态 | 证据 |
|---|---|---|
| Workers | ✅ 可用 | 已有 **11** 个脚本 |
| D1 | ✅ 可用 | 已有 **8** 个数据库（免费上限 10） |
| KV | ✅ 可用 | 已有 **20** 个命名空间 |
| R2 | ✅ 可用 | 已有 **1** 个存储桶 |
| Pages | ✅ 可用 | 已有 **10** 个项目 |
| Queues | ✅ 可用 | 0 个队列，可创建（10 万 ops/天） |
| Vectorize | ✅ 可用 | 0 个索引，可创建（100 索引 / 500 万维） |
| Hyperdrive | ✅ 可用 | 0 个配置，可创建 |
| Workflows | ✅ 可用 | 已有 **1** 个 |
| Durable Objects | ✅ 可用 | 1 个命名空间（即 `ddz` 的 `GameRoom`） |
| Workers AI | ✅ 可用 | 模型目录共 **333** 个模型（首页返回 73 个） |
| AI Search | ✅ 可用 | 已有 **1** 个命名空间 |
| Secrets Store | ✅ 可用 | 已有 **1** 个 store |
| Email Routing | ✅ 可用 | 已有 **5** 条路由规则 |
| Workers 自定义域 | ✅ 可用 | 已绑定 **5** 个域名 |
| **Containers** | ❌ 不可用 | `401 You do not have access to Cloudflare Containers`（需 Workers Paid） |
| Pipelines | ❌ 不可用 | `403 Forbidden` |
| R2 Data Catalog | ⚠️ 未开通 | `Warehouse not found` |
| AI Gateway / 订阅 / Logpush / Turnstile | ⚠️ 探测受限 | 返回 403，为 Token 权限不足，非账户不可用 |

> **计划判定**：Containers 明确要求 Workers Paid，而你的账户返回 401；同时 D1 已有 8 个库（免费上限 10，付费上限 5 万），两项交叉印证当前为 **Workers Free**。若已升级，Containers 会直接可用。

---

## 六、基于当前免费额度，你现在能做什么

**完全可行（免费额度内）**
1. **全栈 Web 应用**：Workers + D1 + R2 + KV（ddz 就是这个形态）
2. **实时多人应用**：Durable Objects + WebSocket（房间、协同、在线状态）
3. **RAG 知识库/文档问答**：R2 存原文 + Vectorize 存向量 + Workers AI 做 embedding/生成
4. **AI 聊天/Agent**：Agents SDK + DO 持久会话 + AI Gateway（含免费 Web Search）
5. **异步任务系统**：Queues（削峰）+ Workflows（多步骤、可等待、可回滚）
6. **站点搜索**：AI Search（已 GA）+ AI Index
7. **定时任务**：Cron Triggers（含在 Workers 免费额度内）
8. **邮件收信自动化**：Email Routing + Email Worker
9. **轻量浏览器自动化**：Browser Run 10 分钟/天（截图、PDF、抓取，注意额度）
10. **外部数据库加速**：Hyperdrive 10 万查询/天

**做不了 / 需要付费**
- 常驻容器、任意语言运行时、GPU 训练（Containers 无免费额度）
- 长时视频转码（Media Transformations 按量计费）
- 大规模日志外推（Logpush 仅付费）
- 高并发浏览器任务（10 分钟/天极易耗尽）

---

## 七、容易踩的坑

1. **免费额度是「每日硬上限」**：超限不是降速，是直接报错。DO 与 D1 的写入额度（10 万/天）在活动量大的项目里最容易撞线。
2. **DO 免费层只支持 SQLite 后端**：`new_sqlite_classes` 迁移必须写对，key-value 后端在免费层不可用。
3. **Queues 免费层消息保留仅 24 小时且不可配置**：做延迟任务要注意。
4. **Browser Run 10 分钟/天**：一次 Playwright 全流程跑 30 秒，一天只有 20 次。
5. **Workers AI 前沿模型需付费方式**：`kimi-k2.6/2.7`、`glm-5.2/5.3`、`deepseek-v4` 系列即便在免费计划也会被拒。
6. **D1 免费仅 10 个库**：多环境（dev/staging/prod）要提前规划，别一个功能一个库。
7. **Vectorize 文档曾有「仅付费可用」的旧表述**：当前定价页已明确 Free 计划含 3000 万查询维/月，以定价页为准。

---

## 八、对当前 ddz 项目的具体建议

| 现状 | 可升级点 | 收益 |
|---|---|---|
| 音效靠 Web Speech API | Workers AI `melotts` 生成固定语音包，存 R2 | 音色统一、可离线、不依赖设备 TTS |
| 机器人是规则型 | Workers AI 小模型做「残局建议」 | 提升 AI 强度，成本可控（10k neurons/天） |
| 战绩只存 D1 明细 | Queues + Workflows 做赛季结算/排行榜聚合 | 解耦长任务，避免请求内超时 |
| 房间状态在 DO | 已是最佳实践 | — |
| 无监控 | Workers Logs（20 万条/天）+ Traces | 线上排障从「猜」变「看」 |

---

## 九、参考来源

- Workers 定价与免费额度：https://developers.cloudflare.com/workers/platform/pricing/
- Durable Objects 定价：https://developers.cloudflare.com/durable-objects/platform/pricing/
- Workers AI 定价：https://developers.cloudflare.com/workers-ai/platform/pricing/
- Queues 定价：https://developers.cloudflare.com/queues/platform/pricing/
- Vectorize 定价：https://developers.cloudflare.com/vectorize/platform/pricing/
- Browser Run 定价：https://developers.cloudflare.com/browser-run/pricing/
- Birthday Week 2025 公告汇总：https://www.cloudflare.com/innovation-week/birthday-week-2025/updates/
- Cloudflare 博客（2025–2026）：https://blog.cloudflare.com/
- Email Service 发布：https://blog.cloudflare.com/email-service/
