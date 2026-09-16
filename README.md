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

设计口径：9 个业务节点，流程 **1 → 2 → 3 → 4（按需）→ 5 → 6 → 7 → 8 → 9**。N3 之后若无变更单则跳过 N4；一旦产生未生效变更，须完成客户/内部确认后才能进入国内采购/备货。公司无自有产线，签约后向**国内供应商**采购备货。

| 节点 | 名称 | 要点 |
| --- | --- | --- |
| N1 | 询盘/客户KYC | 买方 / 付款人 / 收货人关系；模拟筛查 OFAC、UN、EU、UK、中国不可靠实体清单；KYC 报告 + 风险评分；高置信命中硬拦截 |
| N2 | 报价环节 | 价格基础（含/不含项目）、有效期、运费/税费承担方必填；「价格待定/费用另议」禁止推进；相对成本底线/历史价异常偏离软提示或中风险；报价版本 + 字段快照入审计 |
| N3 | 合同/订单确认 | **所有权保留**、**争议解决**条款必填；校验 Incoterms 与付款条件；记录交货期与数量；**须上传中信保保单并登记投保限额**，合同总金额不得超过限额 |
| N4 | 变更管理 | 交货期 / 数量 / 收货人 / 付款条件变更须出变更单（含 diff）；客户确认 + 内部确认；敏感变更须审批；旧版 `SUPERSEDED`；当事方/付款/收货人变更会重跑关联节点闸门；**进入变更时须再次确认中信保并按变更后金额核对限额** |
| N5 | 国内采购/备货 | 登记国内供应商、采购合同/PO 与计划到货；供应商过 OFAC/UN/EU/UK 与中国不可靠实体模拟筛查（高置信硬拦截、中置信审核队列、低置信软提示）；计划到货 ≤ 客户合同交期，否则须登记**结构化延期触发条件**；客户同意延期须有可追溯证据编号；无同意则中风险不得推进 |
| N6 | 装运/提单指示 | **硬闸门**：客户书面指示 + 内部审批；CIF/CFR 等须 **正本或电放其一**；FOB/EXW/FAS/FCA 可走 **无提单**（须记录依据） |
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
backend/              NestJS API、Prisma、闸门与种子数据
miniapp/              uni-app 微信小程序 / H5
docker-compose.yml    一键演示（API :3000 + H5 :8080）
scripts/demo-up.sh    封装 docker compose up --build -d
```

## 本地运行

需要 Node.js 18+（推荐 20/22）。

```bash
# 1. 安装
npm run bootstrap
# 或分别：
# npm --prefix backend install
# npm --prefix miniapp install

# 2. 迁移 + 种子（演示路径含绿灯 / 软提示 / 硬拦截 / 闸门拒绝 / FOB 无提单 / 中信保超额）
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

本地 `npm run backend` / `npm run miniapp` 流程不变。分享给他人时请用下面的 Docker 演示环境。

## 演示环境部署

克隆后一条命令拉起 **API + 已构建 H5**（同一主机、同源 `/api`），SQLite 写入 `DEMO-PASS` / `DEMO-SOFT` / `DEMO-BLOCK` / `DEMO-GATE` / `DEMO-FOB` / `DEMO-LIMIT` / `DEMO-SUPPLIER`。制裁筛查仍为本地模拟名单，**不需要、也不读取真实 OFAC/UN 等 API Key**。

需要本机已安装 Docker 与 Docker Compose v2。

```bash
docker compose up --build -d
# 或：
# bash scripts/demo-up.sh
# npm run demo
```

| 入口 | 地址 |
| --- | --- |
| H5 演示 | http://127.0.0.1:8080 |
| API 健康检查 | http://127.0.0.1:3000/api/health |
| 同源反代健康检查 | http://127.0.0.1:8080/api/health |

`web`（nginx :8080）托管 `npm run build:h5` 产物，并把 `/api/` 反代到本机已发布的 API（`host.docker.internal:3000`，Compose 中 `extra_hosts: host.docker.internal:host-gateway`）。H5 默认 `VITE_API_BASE=/api`，与开发态 Vite 代理一致。

部分沙箱 / 混合 iptables 宿主会过滤容器互访（`proxy_pass http://api:3000` 会超时），但经 Docker 宿主机网关访问已发布的 `:3000` 正常，因此默认走 host-gateway。若在普通 Docker 网桥上容器互访可用，可把 `miniapp/nginx.conf` 改回 `proxy_pass http://api:3000;`。

SQLite 文件挂在 named volume `sqlite-data`（容器内 `DATABASE_URL=file:/data/demo.db`）。首次启动会 `prisma migrate deploy`，空库则自动 seed；之后重启会保留案件数据。

```bash
# 健康检查
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:8080/api/health

# 查看种子案件
curl -s http://127.0.0.1:8080/api/cases | python -c "import json,sys; [print(c['caseNo'], c['status']) for c in json.load(sys.stdin)]"

# 停止
docker compose down

# 清库并重新写入种子
docker compose down -v && docker compose up --build -d

# 强制重种但保留卷（会清空业务表再写入演示路径）
DEMO_FORCE_SEED=1 docker compose up -d --force-recreate api
```

镜像说明：`backend/Dockerfile` 为 Node 20 多阶段构建，入口 `docker-entrypoint.js` 负责 migrate + 按需 seed + `node dist/main`；`miniapp/Dockerfile` 构建 H5 后交给 nginx。

### 闸门单测（不依赖 HTTP）

```bash
npm test
```

覆盖：N1 高置信硬拦截 / 低置信软提示；N2 模糊报价拒绝与成本底线偏离；N3 缺条款拒绝、**中信保缺保单/超额拒绝**；N4 变更确认链、**变更后限额复核**、无变更跳过且不要求 N4 中信保；N5 供应商高置信硬拦截、采购到货延期无同意中风险；**N6 正本/电放二选一、FOB 无提单路径、缺证据拒绝**；N7 / N9 缺证据拒绝推进；N8 HS/申报要素缺口禁止申报。

## 种子案件

启动后打开首页三张卡片，或 `GET /api/cases`：

| 案件号 | 路径 | 说明 |
| --- | --- | --- |
| `DEMO-PASS` | 绿灯通过 | Nordlicht GmbH，清单未命中；国内供应商苏州精工机械筛查通过；CIF **正本提单**过 N6；报价 v1 废止 / v2 生效；中信保限额 150,000 USD 覆盖合同 128,000 USD；变更单 CO-001 数量 8→10 已确认生效并再次核对限额；采购到货未延期；HS 要素与原产地证齐全并模拟放行 |
| `DEMO-SOFT` | 软提示 | `Acme Industrial Co` 低置信近似命中，不阻断；N2 报价已过，停在 N3 |
| `DEMO-BLOCK` | 硬拦截 | `Banned Trading LLC` 高置信命中模拟 OFAC，N1 拒绝 |
| `DEMO-GATE` | 闸门演示 | 已过 KYC / 报价 / 合同（FOB，含中信保）/ **无变更故跳过 N4** / 国内采购备货，停在 N6，书面指示与无提单依据为空 |
| `DEMO-FOB` | FOB 无提单 | Pacific Tools，FOB 买方订舱；N6 走「无提单」路径（书面指示 + 内部审批 + 装船通知依据），已过闸停在 N7 |
| `DEMO-LIMIT` | 中信保超额 | Pacific Gear Ltd，合同 80,000 USD，投保限额仅 30,000 USD，停在 N3；推进应 **409 GATE_REFUSED** |
| `DEMO-SUPPLIER` | 供应商硬拦截 | 国外买方 Rhein Parts 筛查通过；国内供应商「某不可靠实体贸易有限公司」高置信命中模拟不可靠实体清单，N5 拒绝 |

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

对 `DEMO-LIMIT`（合同金额超过中信保限额）推进 N3，同样返回 **409**，`missing` 含 `N3_SINOSURE_OVER_LIMIT`：

```bash
curl -s -X POST http://127.0.0.1:3000/api/cases/<DEMO-LIMIT的id>/nodes/N3/advance
```

报价含模糊用语、变更单未确认、采购到货延期无客户同意、HS 申报要素缺口，分别对 N2 / N4 / N5 / N8 `advance` 同样拒绝。国内供应商高置信命中时 N5 `advance` 返回 **409** 且 `missing` 含 `N5_HIGH_CONFIDENCE_HIT`。进入 N4 后若未再次确认中信保，或变更后金额超过限额，N4 `advance` 也会拒绝。无变更单时 N3 通过后直接进入 N5，不要求 N4 中信保。

常用接口：

- `GET /api/catalog` 节点、HS 模板、延期原因、价格基础等
- `POST /api/cases/:id/nodes/N1/screen` 模拟筛查
- `POST /api/cases/:id/nodes/N2/quotes` 保存报价新版本
- `POST /api/cases/:id/nodes/N3/contract` 保存合同要素
- `POST /api/cases/:id/nodes/N3/sinosure` 登记中信保保单与投保限额
- `POST /api/cases/:id/nodes/N4/changes` 创建变更单
- `POST /api/cases/:id/nodes/N4/changes/:changeId/ack` 客户/内部确认或审批
- `POST /api/cases/:id/nodes/N4/changes/:changeId/apply` 生效新版本
- `POST /api/cases/:id/nodes/N4/sinosure` 变更后再次上传或确认中信保
- `POST /api/cases/:id/nodes/N5/plan` 国内采购/备货（供应商、PO、计划到货）
- `POST /api/cases/:id/nodes/N5/screen` 国内供应商模拟筛查
- `POST /api/cases/:id/nodes/N8/customs` 报关单
- `POST /api/cases/:id/nodes/N8/eport-sync` 模拟电子口岸同步
- `GET /api/cases/:id/nodes/:code/gate` 预览闸门
- `POST /api/cases/:id/nodes/:code/advance` 过闸
- `GET /api/workbench/queue` 命中队列
- `POST /api/workbench/:caseId/action` 工作台处置
- `GET /api/cases/:id/audit` 审计轨迹

请求头 `x-actor-id` 可传入种子用户 id，写入审计。

## 领域用语（与产品口径一致）

- **当事方关系**：买方、付款人、收货人（可与买方不同）；**国内供应商**（N5 采购对象，须单独筛查）
- **价格基础**：含项目 / 不含项目 / 部分含
- **变更证据链**：变更单号 → diff → 客户确认证据 → 内部确认（敏感则审批）→ 合同新版本
- **提单控制**：正本提单 **或** 电放提单（并列二选一，不必同时具备）
- **无提单路径**：FOB / EXW / FAS / FCA 等买方安排运输时，不要求提单号与正本/电放；须选择「无提单」并记录装船通知 / 订舱 / 买方运输安排。CIF/CFR 等卖方出单仍须正本或电放。合同术语由 N3 带入 N6，可在 N6 手工改术语后过闸。
- **工作台动作**：误报排除、确认真实、补充信息、持续监控
- **硬闸门**：N6 / N7 / N9，证据缺失即拒绝推进
- **中信保限额**：合同（及变更后）总金额不得超过投保限额，否则闸门拒绝推进

## 明确不做

真实制裁数据源、真实电子口岸/单一窗口对接、生产级身份认证与权限矩阵、MySQL 生产部署与高可用。
