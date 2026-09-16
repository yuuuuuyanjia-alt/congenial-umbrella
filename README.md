# 出口贸易风险管控（询盘 → 收汇）

面向国企跨境出口的微信小程序 + 后端 MVP 骨架。风险筛查嵌在业务节点里，**不另开筛查登录**。

| 风险结论 | 系统行为 |
| --- | --- |
| 高风险 / 高置信命中 | **硬拦截（Hard Block）**，禁止进入后续交易节点 |
| 中风险 | **审核队列**，须在案例工作台处置后才能推进 |
| 低风险 / 低置信 | **软提示**，不阻断，写入审计 |

全程 **仅追加审计日志**（无修改/删除接口）。

> 制裁筛查为 **本地模拟黑名单 + 接口抽象**，不包含、也不需要真实 OFAC/UN 等 API Key。

## 范围

设计口径：9 个业务节点，本仓库 **只实现 1 / 3 / 6 / 7 / 9**；2 / 4 / 5 / 8 为页面 + API 占位（返回 TODO）。

| 节点 | 名称 | MVP | 要点 |
| --- | --- | --- | --- |
| N1 | 询盘/客户KYC | 是 | 买方 / 付款人 / 收货人关系；模拟筛查 OFAC、UN、EU、UK、中国不可靠实体清单；KYC 报告 + 风险评分；高置信命中硬拦截 |
| N2 | 信用证/信用险 | 否 | TODO |
| N3 | 合同/订单确认 | 是 | **所有权保留**、**争议解决**条款必填；校验 Incoterms 与付款条件 |
| N4 | 生产备货/质检 | 否 | TODO |
| N5 | 报关出口 | 否 | TODO |
| N6 | 装运/提单指示 | 是 | **硬闸门**：客户书面指示 + 内部审批 + 提单控制（正本 / 电放） |
| N7 | 单证一致性 | 是 | **硬闸门**：终稿合同 + 合同/发票/装箱单/提单字段一致 + 不符点修改记录 |
| N8 | 交单/议付 | 否 | TODO |
| N9 | 收汇对账 | 是 | **硬闸门**：第三方关系证明（代付）+ 汇款附言 + 单证一致证明 + 放行审批 |

同时提供：

- 案例工作台：误报排除 / 确认真实 / 补充信息 / 持续监控
- 闸门引擎（Gate Engine）
- 模拟黑名单匹配（高 / 中 / 低置信）

## 技术栈

- 小程序：uni-app（Vue 3）+ Vite，可出微信小程序与 H5 演示
- 后端：NestJS 10 + Prisma 6
- 数据库：**本地演示用 SQLite**（见 `backend/.env`）；Schema **可迁 MySQL**（无 SQLite 专有类型）

切换 MySQL：

1. `backend/prisma/schema.prisma` 中 `provider = "mysql"`
2. `DATABASE_URL="mysql://user:password@127.0.0.1:3306/export_risk_guard"`
3. `npx prisma migrate dev`

## 目录

```
backend/     NestJS API、Prisma、闸门与种子数据
miniapp/      uni-app 微信小程序 / H5
```

## 本地运行

需要 Node.js 18+（推荐 20/22）。

```bash
# 1. 安装
npm run bootstrap
# 或分别：
# npm --prefix backend install
# npm --prefix miniapp install

# 2. 迁移 + 种子（三种演示路径 + 硬闸门缺证据案件）
cd backend
cp -n .env.example .env 2>/dev/null || true
npx prisma migrate deploy
npm run seed
cd ..

# 3. 启动后端  http://127.0.0.1:3000/api/health
npm run backend

# 4. 另开终端，启动 H5 小程序壳  http://127.0.0.1:5173
npm run miniapp
```

微信开发者工具：`npm --prefix miniapp run dev:mp-weixin`，导入 `miniapp/dist/dev/mp-weixin`。请把合法域名校验关闭（manifest 已设 `urlCheck: false`），并确保开发者工具能访问本机 `http://127.0.0.1:3000`。

### 闸门单测（不依赖 HTTP）

```bash
npm test
```

覆盖：N1 高置信硬拦截 / 低置信软提示；N3 缺条款拒绝；**N6 / N7 / N9 缺证据拒绝推进**。

## 种子案件（三条路径）

启动后打开首页三张卡片，或 `GET /api/cases`：

| 案件号 | 路径 | 说明 |
| --- | --- | --- |
| `DEMO-PASS` | 绿灯通过 | Nordlicht GmbH，清单未命中，N1→N9 证据齐全并已完成 |
| `DEMO-SOFT` | 软提示 | `Acme Industrial Co` 低置信近似命中 `ACME INDUSTRIES LIMITED`，不阻断 |
| `DEMO-BLOCK` | 硬拦截 | `Banned Trading LLC` 高置信命中模拟 OFAC，N1 拒绝 |
| `DEMO-GATE` | 闸门演示 | 已过 KYC/合同，停在 N6，书面指示等证据为空 |

## 硬闸门拒绝示例（N6 / N7 / N9）

先查案件 id：

```bash
curl -s http://127.0.0.1:3000/api/cases | python -c "import json,sys; d=json.load(sys.stdin);\
[print(c['caseNo'], c['id']) for c in d]"
```

对 `DEMO-GATE`（缺装运证据）推进 N6，应返回 **409** 且 `canProceed: false`：

```bash
curl -s -X POST http://127.0.0.1:3000/api/cases/<DEMO-GATE的id>/nodes/N6/advance
```

缺终稿合同/单证时推进 N7、缺汇款附言或代付证明时推进 N9，同样拒绝。补齐证据后再 `advance` 才会放行。

常用接口：

- `GET /api/catalog` 节点与领域用语
- `POST /api/cases/:id/nodes/N1/screen` 模拟筛查
- `GET /api/cases/:id/nodes/:code/gate` 预览闸门
- `POST /api/cases/:id/nodes/:code/advance` 过闸（占位节点会跳过并返回 TODO）
- `GET /api/workbench/queue` 命中队列
- `POST /api/workbench/:caseId/action` 工作台处置
- `GET /api/cases/:id/audit` 审计轨迹

请求头 `x-actor-id` 可传入种子用户 id，写入审计。

## 领域用语（与产品口径一致）

- **当事方关系**：买方、付款人、收货人（可与买方不同）
- **提单控制**：正本提单 / 电放提单
- **工作台动作**：误报排除、确认真实、补充信息、持续监控
- **硬闸门**：N6 / N7 / N9，证据缺失即拒绝推进

## 后续版本（明确不做）

真实制裁数据源、信用证/信用险、生产质检、报关、交单议付、生产级身份认证与权限矩阵、MySQL 生产部署与高可用。
