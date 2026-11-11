# 斗地主 · 网页版（欢乐斗地主风格）

好友实时对战的网页版斗地主。服务端权威判定、Durable Object 实时房间、D1 账号与战绩，部署在 Cloudflare 边缘网络。

- **在线地址**：https://ddz.646474.xyz
- **技术栈**：Cloudflare Workers（静态资源 + API + WebSocket）· Durable Objects · D1 · React 18 · TypeScript · Vite
- **音乐**：通过自建 [Meting API](https://meting-api.646474.xyz) 播放《欢乐斗地主配乐合集》

---

## 一、功能

### 牌局
- **人数可配**：2 人（一副牌 / 20 张底牌归地主）、3 人（经典）、4 人（两副牌 / 8 张底牌）
- **完整牌型**：单张、对子、三张、三带一、三带二、顺子、连对、飞机（带单/带对）、四带二、四带两对、炸弹、王炸
- **叫分**：1/2/3 分，最高者当地主，全不叫则重新发牌
- **计分**：底分 × 叫分 × 炸弹倍数 × 春天/反春，地主与农民按人数差结算，零和
- **服务端权威**：每一次出牌都在 Worker 内用同一份规则引擎校验牌型、轮次、手牌归属，客户端无法伪造
- **超时托管**：到点自动叫分/出牌；掉线自动托管，重连回到原座位
- **机器人补位**：空位由规则型 AI 补齐（会留牌、会配合队友、不无脑炸）

### 房间与账号
- 注册 / 登录 / 游客（游客 7 天有效）
- 4 位房间号 + 分享链接 `?r=CODE`
- 大厅房间列表、房主可改人数/底分/时限/是否补机器人、可踢人
- 战绩与金币写入 D1
- **空房自动回收**：房主离开或全员离线后自动销毁（无人 5 秒、全员离线 120 秒，可由 `EMPTY_GRACE_SECONDS` / `EMPTY_TTL_SECONDS` 覆盖），D1 记录同步删除，大厅不会残留空房间
- 诊断接口：`GET /api/rooms/:code/state` 返回 DO 内部状态（座位、在线、空房计时），便于排查

### 表现层
- 绿毡牌桌 + 描金内圈 + 暗纹，桌面/移动端自适应
- 纯 CSS 绘制扑克牌（无图片资源，任意分辨率清晰）
- **图标与头像全部为内联 SVG**（线性图标 + 8 个卡通头像），不依赖 emoji 字体，跨平台渲染一致；旧账号的 emoji 头像在渲染时自动映射
- 发牌、出牌、炸弹震屏、王炸闪光、结算面板等动画
- 音效：Web Audio 实时合成（出牌、炸弹、胜利、失败、按钮）
- **语音播报**：Web Speech API 中文语音，按牌型念出「对四 / 三带一 / 顺子 / 炸弹 / 王炸」，并播报叫分、不要、胜负与快捷语；可在快捷语面板或大厅一键关闭
- **快捷语**：任何阶段（含发牌、对局中）都可发送，带气泡与语音播报
- 背景音乐：Meting API 拉取网易云音源，按「大厅 / 对局 / 激烈 / 胜利 / 失败」切换，带淡入淡出与自动轮播；接口不可用时自动降级为合成 BGM（两者互斥，不会同时发声）

---

## 二、架构

```
浏览器
  │  静态资源（HTML/JS/CSS）
  ├──────────────────────────────► Worker（ASSETS 绑定）
  │  REST /api/*
  ├──────────────────────────────► Worker ──► D1（users / rooms / matches）
  │  WebSocket /ws?room=CODE
  └──────────────────────────────► Worker ──► Durable Object「GameRoom」（每房间一个）
                                                  │
                                                  └─ 权威牌局状态机 + 广播 + alarm 超时
```

### 为什么用 Workers 而不是 Pages
Cloudflare Pages Functions **不支持 Durable Objects**（无法声明 DO 迁移），而实时房间、服务端权威状态、超时定时器都依赖 DO。若拆成「Pages 静态站 + Worker 实时服」，会引入跨域、双份部署与 Cookie/令牌跨站问题。

因此本项目采用 **Workers + Static Assets**（Pages 的官方继任形态）：同一个 Worker 同时提供静态资源、REST API 与 WebSocket，同源、单次部署、无 CORS。前端产物是纯静态 `dist/`，若坚持拆分到 Pages，只需在构建时设置 `VITE_API_BASE` / `VITE_WS_BASE` 指向 Worker 域名即可。

### 目录

```
shared/            客户端与 Worker 共用（关键：规则只有一份实现）
  cards.ts         牌模型、洗牌、排序
  rules.ts         牌型判定与大小比较
  hints.ts         组合枚举 / 提示
  ai.ts            机器人策略
  types.ts         协议、状态、变体配置
worker/
  index.ts         路由：/api/*、/ws、静态资源
  room.ts          GameRoom Durable Object（状态机）
  auth.ts          PBKDF2 口令 + HMAC 令牌
  db.ts            D1 访问
  schema.sql       建表语句
src/
  App.tsx          登录 / 大厅 / 牌桌路由
  components/      Auth、Lobby、Table、Card、Logo
  audio/sfx.ts     合成音效
  audio/music.ts   Meting 配乐管理
  game/useGame.ts  WebSocket 客户端（自动重连、心跳）
tests/rules.test.ts  规则引擎单测（13 项）
scripts/           端到端测试、截图、生产验收
```

---

## 三、本地开发

```bash
npm install

# 本地 D1 建表
npm run db:local

# 终端 A：Worker（含 DO、D1 模拟）
npx wrangler dev --port 8787

# 终端 B：前端热更新（已配置 /api 与 /ws 代理到 8787）
npm run dev
```

访问 http://localhost:5173。

`.dev.vars` 用于本地密钥：

```
JWT_SECRET=local-dev-secret
```

### 测试

```bash
npm test                              # 规则引擎单测
node scripts/e2e.mjs http://127.0.0.1:8787   # 端到端：注册→建房→WS 对局→结算→战绩
node scripts/prod-check.mjs           # 生产环境验收（需浏览器）
```

端到端测试覆盖 24 项断言：重复用户名、错误密码、未登录建房、非法出牌、越权出牌、机器人补位、零和结算、战绩落库、断线重连。

---

## 四、部署

```bash
# 1. 建库（首次）
npx wrangler d1 create ddz-db
# 把输出的 database_id 填入 wrangler.jsonc

# 2. 建表
npx wrangler d1 execute ddz-db --remote --file=./worker/schema.sql --yes

# 3. 密钥
openssl rand -hex 32 | npx wrangler secret put JWT_SECRET

# 4. 构建 + 部署
npm run build:client && npx wrangler deploy
```

自定义域在 `wrangler.jsonc` 的 `routes` 中声明（`custom_domain: true`），首次部署会自动创建 DNS 记录与证书：

```jsonc
"routes": [{ "pattern": "ddz.646474.xyz", "custom_domain": true }]
```

---

## 五、数据表

| 表 | 用途 |
| --- | --- |
| `users` | 账号、PBKDF2 口令散列、金币、胜负场 |
| `rooms` | 大厅列表（由 DO 在状态变化时回写） |
| `matches` | 每局结果、倍数、座位与得分明细 |

Durable Object 内部状态（手牌、轮次、计时）保存在 DO 的 SQLite 存储中，通过 `alarm()` 驱动超时。

---

## 六、已知限制

1. **音源依赖第三方**：Meting API 走网易云 `outer/url` 接口，个别曲目可能因版权/会员限制返回 404，此时自动降级为合成音乐。
2. **无匹配/排位**：定位是熟人房，靠房间号加入；没有天梯与好友系统。
3. **机器人强度有限**：规则型 AI，能打但不是最优解。
4. **未做频率限制**：个人使用未加登录/建房限流，公开暴露时建议补 Rate Limiting。
5. **断线重连窗口 120 秒**：全员离线超过该时长房间会被回收，期间回到页面可继续原局。

---

## 七、版权说明

- 牌面、牌桌、按钮均为本项目自行绘制（CSS），未使用任何商业游戏的美术资源。
- 背景音乐版权归原作者（小旭音乐）与网易云音乐所有，本项目仅通过 Meting API 做个人学习用途的在线播放，不分发音频文件。
- 「欢乐斗地主」为腾讯商标，本项目与其无关联。
