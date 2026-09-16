# 出口贸易风险管控（询盘 → 收汇）

面向国企跨境出口的微信小程序 + 后端。风险筛查嵌在业务节点里，**不另开筛查登录**。

| 风险结论 | 系统行为 |
| --- | --- |
| 高风险 / 高置信命中 | **硬拦截（Hard Block）**，禁止进入后续交易节点 |
| 中风险 | **审核队列**，须在案例工作台处置后才能推进 |
| 低风险 / 低置信 | **软提示**，不阻断，写入审计 |

全程 **仅追加审计日志**（无修改/删除接口）。报价与合同变更保留旧版本（`SUPERSEDED`），禁止硬删除。

> 制裁筛查为 **本地模拟黑名单 + 接口抽象**，不包含、也不需要真实 OFAC/UN 等 API Key。电子口岸为模拟状态同步。

## 范围

设计口径：9 个业务节点，流程 **1 → 2 → 3 → 4（按需）→ 5 → 6 → 7 → 8 → 9**。N3 之后若无变更单则跳过 N4；一旦产生未生效变更，须完成客户/内部确认后才能进入排期。

| 节点 | 名称 | 要点 |
| --- | --- | --- |
| N1 | 询盘/客户KYC | 买方 / 付款人 / 收货人关系；模拟筛查 OFAC、UN、EU、UK、中国不可靠实体清单；KYC 报告 + 风险评分；高置信命中硬拦截 |
| N2 | 报价环节 | 价格基础（含/不含项目）、有效期、运费/税费承担方必填；「价格待定/费用另议」禁止推进；相对成本底线/历史价异常偏离软提示或中风险；报价版本 + 字段快照入审计 |
| N3 | 合同/订单确认 | **所有权保留**、**争议解决**条款必填；校验 Incoterms 与付款条件；记录交货期与数量 |
| N4 | 变更管理 | 交货期 / 数量 / 收货人 / 付款条件变更须出变更单（含 diff）；客户确认 + 内部确认；敏感变更须审批；旧版 `SUPERSEDED`；当事方/付款/收货人变更会重跑关联节点闸门 |
| N5 | 生产/备货排期 | 计划交期 ≤ 合同交期，否则须登记**结构化延期触发条件**；客户同意延期须有可追溯证据编号；无同意则中风险不得推进 |
| N6 | 装运/提单指示 | **硬闸门**：客户书面指示 + 内部审批 + 提单控制（正本 / 电放） |
| N7 | 单证一致性 | **硬闸门**：终稿合同 + 合同/发票/装箱单/提单字段一致 + 不符点修改记录 |
| N8 | 报关放行 | HS 与品名/申报要素模板核对；要素完整性与原产地证据；税则品名/计量单位不符软提示；严重缺口禁止申报；可模拟同步电子口岸 |
| N9 | 收汇对账 | **硬闸门**：第三方关系证明（代付）+ 汇款附言 + 单证一致证明 + 放行审批 |

同时提供：

- 案例工作台：误报排除 / 确认真实 / 补充信息 / 持续监控
- 闸门引擎（Gate Engine）
- 模拟黑名单匹配（高 / 中 / 低置信）
- 成本底线、历史报价、HS 申报要素模板（种子数据）

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

# 2. 迁移 + 种子（三条演示路径 + 硬闸门缺证据案件）
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

覆盖：N1 高置信硬拦截 / 低置信软提示；N2 模糊报价拒绝与成本底线偏离；N3 缺条款拒绝；N4 变更确认链；N5 延期无同意中风险；**N6 / N7 / N9 缺证据拒绝推进**；N8 HS/申报要素缺口禁止申报。

## 种子案件

启动后打开首页三张卡片，或 `GET /api/cases`：

| 案件号 | 路径 | 说明 |
| --- | --- | --- |
| `DEMO-PASS` | 绿灯通过 | Nordlicht GmbH，清单未命中；报价 v1 废止 / v2 生效；变更单 CO-001 数量 8→10 已确认生效；排期未延期；HS 要素与原产地证齐全并模拟放行 |
| `DEMO-SOFT` | 软提示 | `Acme Industrial Co` 低置信近似命中，不阻断；N2 报价已过，停在 N3 |
| `DEMO-BLOCK` | 硬拦截 | `Banned Trading LLC` 高置信命中模拟 OFAC，N1 拒绝 |
| `DEMO-GATE` | 闸门演示 | 已过 KYC / 报价 / 合同 / 无变更 / 排期，停在 N6，书面指示等证据为空 |

## 硬闸门 / 业务闸门拒绝示例

先查案件 id：

```bash
curl -s http://127.0.0.1:3000/api/cases | python -c "import json,sys; d=json.load(sys.stdin);\
[print(c['caseNo'], c['id']) for c in d]"
```

对 `DEMO-GATE`（缺装运证据）推进 N6，应返回 **409** 且 `canProceed: false`：

```bash
curl -s -X POST http://127.0.0.1:3000/api/cases/<DEMO-GATE的id>/nodes/N6/advance
```

报价含模糊用语、变更单未确认、延期无客户同意、HS 申报要素缺口，分别对 N2 / N4 / N5 / N8 `advance` 同样拒绝。

常用接口：

- `GET /api/catalog` 节点、HS 模板、延期原因、价格基础等
- `POST /api/cases/:id/nodes/N1/screen` 模拟筛查
- `POST /api/cases/:id/nodes/N2/quotes` 保存报价新版本
- `POST /api/cases/:id/nodes/N4/changes` 创建变更单
- `POST /api/cases/:id/nodes/N4/changes/:changeId/ack` 客户/内部确认或审批
- `POST /api/cases/:id/nodes/N4/changes/:changeId/apply` 生效新版本
- `POST /api/cases/:id/nodes/N5/plan` 生产排期
- `POST /api/cases/:id/nodes/N8/customs` 报关单
- `POST /api/cases/:id/nodes/N8/eport-sync` 模拟电子口岸同步
- `GET /api/cases/:id/nodes/:code/gate` 预览闸门
- `POST /api/cases/:id/nodes/:code/advance` 过闸
- `GET /api/workbench/queue` 命中队列
- `POST /api/workbench/:caseId/action` 工作台处置
- `GET /api/cases/:id/audit` 审计轨迹

请求头 `x-actor-id` 可传入种子用户 id，写入审计。

## 领域用语（与产品口径一致）

- **当事方关系**：买方、付款人、收货人（可与买方不同）
- **价格基础**：含项目 / 不含项目 / 部分含
- **变更证据链**：变更单号 → diff → 客户确认证据 → 内部确认（敏感则审批）→ 合同新版本
- **提单控制**：正本提单 / 电放提单
- **工作台动作**：误报排除、确认真实、补充信息、持续监控
- **硬闸门**：N6 / N7 / N9，证据缺失即拒绝推进

## 明确不做

真实制裁数据源、真实电子口岸/单一窗口对接、生产级身份认证与权限矩阵、MySQL 生产部署与高可用。
