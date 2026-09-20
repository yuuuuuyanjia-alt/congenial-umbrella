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

设计口径：9 个业务节点，流程 **1 → 2 → 3 → 4（按需）→ 5 → 6 → 7 → 8 → 9**。**销售合同（N3）与采购合同（N5）分开签订**；公司惯例 **先销售后采购**。N3 之后若无变更单则跳过 N4；一旦产生未生效变更，须完成客户/内部确认后才能进入国内采购/备货。进入 N5 时须**关联一笔已签订的销售合同案件**（至少已过 N3 且已签销售合同），否则不得保存或推进采购。公司无自有产线，签约后向**国内供应商**采购备货。

| 节点 | 名称 | 要点 |
| --- | --- | --- |
| N1 | 询盘/客户KYC | 买方 / 付款人 / 收货人关系；模拟筛查 OFAC、UN、EU、UK、中国不可靠实体清单；KYC 报告 + 风险评分；高置信命中硬拦截 |
| N2 | 报价环节 | 价格基础（含/不含项目）、有效期、运费/税费承担方必填；「价格待定/费用另议」禁止推进；相对成本底线/历史价异常偏离软提示或中风险；报价版本 + 字段快照入审计 |
| N3 | 销售合同/订单确认 | **销售/出口合同**与采购合同分开签订。**所有权保留**、**争议解决**条款必填；校验 Incoterms 与付款条件；记录交货期与数量；**中信保限额未登记，不得签订合同**；须上传中信保保单并登记投保限额；按买方占用测算，超额分档提示或拦截 |
| N4 | 变更管理 | 交货期 / 数量 / 收货人 / 付款条件变更须出变更单（含 diff）；客户确认 + 内部确认；敏感变更须审批；旧版 `SUPERSEDED`；当事方/付款/收货人变更会重跑关联节点闸门；**进入变更时须再次确认中信保并按变更后金额重算占用** |
| N5 | 采购合同/国内备货 | **先销售后采购**：须关联一笔已达 N3 且已签的销售合同案件（客户、合同号、金额、状态），否则不得保存或推进；登记国内供应商、采购合同/PO 与计划到货；付款方式选择 **一次性付清** 或 **分期支付**（每期须填约定付款时间、付款比例、金额）；供应商过 OFAC/UN/EU/UK 与中国不可靠实体模拟筛查（高置信硬拦截、中置信审核队列、低置信软提示）；计划到货 ≤ 客户合同交期，否则须登记**结构化延期触发条件**；客户同意延期须有可追溯证据编号；无同意则中风险不得推进 |
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

# 2. 迁移 + 种子（演示路径含绿灯 / 软提示 / 硬拦截 / 闸门拒绝 / FOB 无提单 / 中信保占用分档与未登记 / 客户按期与逾期收汇）
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

克隆后一条命令拉起 **API + 已构建 H5**（同一主机、同源 `/api`），SQLite 写入 `DEMO-PASS` / `DEMO-NORD-LATE` / `DEMO-NORD-OPEN` / `DEMO-NORD-WIP` / `DEMO-SOFT` / `DEMO-BLOCK` / `DEMO-GATE` / `DEMO-FOB` / `DEMO-LIMIT` / `DEMO-LIMIT-MED` / `DEMO-LIMIT-HIGH` / `DEMO-NOLIMIT` / `DEMO-SUPPLIER`。制裁筛查仍为本地模拟名单，**不需要、也不读取真实 OFAC/UN 等 API Key**。

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

覆盖：N1 高置信硬拦截 / 低置信软提示；N2 模糊报价拒绝与成本底线偏离；N3 缺条款拒绝、**中信保限额未登记不得签订合同 / 缺保单/占用超高风险拒绝、高风险审核、中风险软提示**；N4 变更确认链、**变更后占用复核**、无变更跳过且不要求 N4 中信保；N5 **须关联已签销售合同**、供应商高置信硬拦截、采购到货延期无同意中风险；**N6 正本/电放二选一、FOB 无提单路径、缺证据拒绝**；N7 / N9 缺证据拒绝推进；N8 HS/申报要素缺口禁止申报；**采购货款一次性付清或分期支付（每期约定付款时间、付款比例、金额）与按期次逾期**；**先销售后采购：未签销售合同不得作为采购关联对象，已签合同可任选、不自动锁定本案**；**销售/采购合同列表按 N3 / N5 过滤，不混用采购 PO 作为销售合同条目**。

## 种子案件

启动后打开首页三张卡片，或 `GET /api/cases`：

| 案件号 | 路径 | 说明 |
| --- | --- | --- |
| `DEMO-PASS` | 绿灯通过 | Nordlicht GmbH，清单未命中；国内供应商苏州精工机械筛查通过；CIF **正本提单**过 N6；报价 v1 废止 / v2 生效；中信保限额 150,000 USD；变更单 CO-001 数量 8→10 已确认生效并再次核对占用；**采购合同 `PO-BH-2026-011` 关联销售合同 DEMO-PASS**；采购到货未延期；HS 要素与原产地证齐全并模拟放行 |
| `DEMO-SOFT` | 软提示 | `Acme Industrial Co` 低置信近似命中，不阻断；N2 报价已过，**已到达 N3**（尚无销售合同、中信保未登记，客户管理会录入；保存合同应 **409 GATE_REFUSED**）。**未签销售合同，不得出现在 N5 关联选项中** |
| `DEMO-BLOCK` | 硬拦截 | `Banned Trading LLC` 高置信命中模拟 OFAC，N1 拒绝；**未到达 N3，不进入客户管理** |
| `DEMO-GATE` | 闸门演示 | 已过 KYC / 报价 / **销售合同**（FOB，含中信保）/ **无变更故跳过 N4** / 国内采购备货（`PO-HV-2026-088` **关联 DEMO-GATE**），停在 N6，书面指示与无提单依据为空 |
| `DEMO-FOB` | FOB 无提单 | Pacific Tools，FOB 买方订舱；N6 走「无提单」路径（书面指示 + 内部审批 + 装船通知依据），已过闸停在 N7；采购 `PO-PT-FOB-004` **关联销售合同 DEMO-FOB** |
| `DEMO-LIMIT` | 中信保超高风险 | Pacific Gear Ltd，新签 80,000 USD，限额 30,000 USD，超额正好 50,000 USD → **超高风险硬拦截**，停在 N3；推进应 **409 GATE_REFUSED**，`missing` 含 `N3_SINOSURE_OVER_LIMIT` |
| `DEMO-LIMIT-MED` | 中信保中风险 | Helios Marine Ltd：已履行未回款 20,000 + 未履行未回款 8,000 + 新签 25,000 = 占用 53,000，限额 40,000，超额 13,000 → **中风险软提示，可推进** |
| `DEMO-LIMIT-HIGH` | 中信保高风险 | Caspian Spare Ltd，新签 75,000 USD，限额 50,000 USD，超额 25,000 → **高风险审核队列**，N3 不得直接推进 |
| `DEMO-NOLIMIT` | 中信保未登记 | Cedar Trade Ltd，已到 N3 尚无合同、未登记限额；保存合同或推进应 **409 GATE_REFUSED**，文案「尚未登记中信保限额，不得签订合同」 |
| `DEMO-SUPPLIER` | 供应商硬拦截 | 国外买方 Rhein Parts 筛查通过；国内供应商「某不可靠实体贸易有限公司」高置信命中模拟不可靠实体清单，N5 拒绝；采购 `PO-UNREL-2026-001` **已关联销售合同 DEMO-SUPPLIER** |
| `DEMO-NORD-LATE` | 逾期收汇 | 同为 Nordlicht 历史订单，约定到期 2026-04-14，到账 2026-05-20，**逾期**；采购 `PO-BH-2026-003` **关联 DEMO-NORD-LATE** |
| `DEMO-NORD-OPEN` | 收汇未到期 | Nordlicht 在手已装运订单，已过报关，约定到期 2026-12-31，尚无到账，**未到期**；采购 `PO-BH-2026-019` **关联 DEMO-NORD-OPEN** |
| `DEMO-NORD-WIP` | 未履行完毕 | Nordlicht 已签销售合同停在国内采购，尚未装运，未回款 18,000 USD；**待登记采购合同并关联本销售案件** |

## 合同管理

首页顶部「工作入口」进入 **合同管理**，先选择：

| 入口 | 列表口径 | 填写路径 |
| --- | --- | --- |
| **销售合同管理** | 已到达销售合同/订单确认（N3）或已有销售合同的出口案件。询盘未通过（如 `DEMO-BLOCK`）不出现。列表按销售合同展示，**不含采购 PO** | 打开即进入既有 **N3 销售合同/订单确认** 表单，可保存并提交 |
| **采购合同管理** | 已到达国内采购/备货（N5）或已登记采购合同/PO 的案件 | 打开即进入既有 **N5 采购合同** 表单；**关联销售合同**为可任选的已签销售合同列表（`GET /api/cases/:id/nodes/N5/sales-options`），不锁定本案。保存/推进须已选（`salesCaseId`，闸门 `N5_SALES_LINK` / `N5_SALES_NOT_SIGNED`）。货款 **一次性付清** 或 **分期支付**（每期约定付款时间、付款比例、金额） |

同一出口案件可同时出现在两个列表（销售面与采购面分开看），不另建一套合同主数据。`GET /api/cases?kind=sales` / `kind=procurement` 为列表过滤；首页演示路径仍用 `GET /api/cases`（全量）。

采购合同列表卡片与详情页主标题格式为 **`{供应商名称}采购{产品}出口{客户公司}`**，例如「苏州精工机械有限公司采购数控机床配件出口Nordlicht GmbH」。产品字段优先取**关联销售合同**的 `goodsDesc`（出口品名），其次本案 `goodsDesc`（货物描述/品名）、销售合同 `goodsDesc`、报关 `productName`；都没有时显示「货物」。客户取关联销售合同买方（未关联则回退本案买方）。供应商未登记时显示「供应商待登记」。销售合同管理列表标题仍为客户名称，不套用该模板。`GET /api/cases?kind=procurement` 与案件详情会返回 `procurementTitle`。

N5 采购表单**不再填写「客户合同交货期」**（亦不再作为必填闸门）。计划到货仍须填写；若关联销售合同有交货期，则对照该交期判断是否须登记延期。供应商、关联销售合同任选、付款方式（一次性付清/分期）、计划到货等其余字段不变。

## 客户管理

首页顶部「工作入口」进入 **客户管理**。仅收录 **已到达合同/订单确认（N3）及之后** 的买方：询盘 KYC（N1）填写的买方会带到合同节点，但 **未到达 N3 的案件不会作为正式客户出现**（例如 `DEMO-BLOCK` 停在 N1）。同一买方多笔已达 N3 的订单合并到同一客户详情。

录入触发：保存 N3 合同、登记 N3 中信保、或案件推进至 N3 / 通过 N3。幂等。

匹配与合并（避免重复档案）：

1. **注册号 / 税号**（`Party.registrationNo`）：若已填写，按规范化号码（去空格、连字符与点，忽略大小写）精确匹配；命中则视为同一客户。
2. 否则按 **规范化名称 + 国家** 匹配：去掉 GmbH / Ltd / Pte / 有限公司 等法律后缀，忽略大小写与标点。
3. 名称相同但国家不同，视为不同客户。
4. 未填国家时，仅当该规范化名称在库中唯一才合并。
5. 名称+国家命中但双方税号均已填且不一致 → 不合并。
6. 命中则 **合并** 到已有客户档案（补全空字段，把本案合同/交易挂到该客户下）；未命中则新建。

便于业务人员查看：

1. **中信保限额与占用**：最新保单投保限额（无保单则显示未登记；未登记不得在 N3 签订合同）；占用 = 未履行完毕合同未回款 + 已履行完毕合同未回款（客户页无新签项）。超额自动测算并分档；额度内显示剩余额度
2. **签过哪些合同**：已登记出口合同的案件（相对方、金额、付款条件、约定收款日、是否已履行完毕）
3. **已收汇 / 未收汇**：合同金额与 N9 到账金额之差（支持部分收汇）
4. **约定收款日**：每笔及总体为 **按期 / 逾期 / 未到期 / 无收款约定**（即是否按期回款）
5. **历次交易记录**：该客户已达 N3 的案件（含已到 N3 但尚未保存合同的，如 `DEMO-SOFT`）

判断口径（合同到期日字段较薄时的推算）：

- 合同可手填 `paymentDueAt`（约定收款日）
- 未手填时，用 **交货期 + 付款条件账期天数**（如 `T/T 30 days`、`OA 60天`）推算
- 收汇节点登记 `receivedAt`（实际到账日）与 `amountFen`（已收汇金额）；有汇款附言但未填到账日则保存时记为当天
- 未收齐且到期日已过 → 逾期；已收齐且到账不晚于到期日 → 按期；未到期则未到期
- 客户总体：任一笔逾期则为逾期

演示客户 **Nordlicht GmbH**：多笔已达 N3 的订单（`DEMO-PASS` / `DEMO-NORD-LATE` / `DEMO-NORD-OPEN` / `DEMO-NORD-WIP`）按名称+国家合并为同一档案；中信保限额 150,000 USD。占用口径：`DEMO-NORD-WIP` 未履行完毕未回款 18,000；`DEMO-NORD-LATE` 已履行未回款 25,000 + `DEMO-NORD-OPEN` 已履行未回款 72,000；`DEMO-PASS` 已收齐不占用。合计占用 115,000，剩余额度 35,000。Acme（`DEMO-SOFT`）与 Cedar Trade（`DEMO-NOLIMIT`）已达 N3、尚无合同、限额未登记。Banned Trading（`DEMO-BLOCK`）未达 N3，不出现。

```bash
curl -s http://127.0.0.1:3000/api/customers | python -c "import json,sys; [print(c['name'], c['collection']['label'], c.get('receivable')) for c in json.load(sys.stdin)]"
```

## 供应商管理

首页顶部「工作入口」进入 **供应商管理**。按 N5 国内供应商（`Party.role=SUPPLIER`）聚合采购合同/PO：

1. **每一笔采购合同/采购单**：PO 号、**关联销售合同**（客户、销售合同案件号、金额、状态）、关联出口案件、计划/实际到货、客户合同交期
2. **是否按期交货**：实际到货对照计划到货（无计划则对照客户合同交期）→ 按期 / 逾期 / 未到期 / 无交货记录
3. **货款支付方式**：采购合同上选择 **一次性付清** 或 **分期支付**。分期支付时每一期须填写 **约定付款时间**（约定日期或触发时间）、**付款比例**、**金额**
4. **每期已付 / 未付款**：登记本期实付后，未付清且已过该期约定付款时间即为该期逾期；任一期逾期则该 PO 与供应商总体为逾期
5. **状态**：未到期 / 按期 / 逾期 / 已付清（已付清仍保留是否晚于约定日）

一次性付清不必拆期。分期支付示例：「货物到达交付地点之后支付（ ）%货款，剩余尾款（具体金额）于（填写条件）支付」。付款比例可改，如 90% + 10%。

演示供应商 **苏州精工机械有限公司** 有三笔采购（均已关联对应销售合同）：`PO-BH-2026-011` ↔ `DEMO-PASS` **一次性付清**且交货与付款均按期；`PO-BH-2026-003` ↔ `DEMO-NORD-LATE` **90%/10% 分期**（到货后付 90%，尾款于验收合格并开具发票后支付）——到货款已付但晚于约定日、尾款未付且逾期；`PO-BH-2026-019` ↔ `DEMO-NORD-OPEN` 一次性付款尚未到期。宁波五金 `PO-PT-FOB-004` ↔ `DEMO-FOB` 为一次性付清、交货未到期；某不可靠实体 `PO-UNREL-2026-001` ↔ `DEMO-SUPPLIER` 为一次性付款逾期（未付且约定付款日已过）。

种子里的采购-销售关联对：

| 采购合同 | 关联销售合同 | 客户 |
| --- | --- | --- |
| `PO-BH-2026-011` | `DEMO-PASS` | Nordlicht GmbH |
| `PO-BH-2026-003` | `DEMO-NORD-LATE` | Nordlicht GmbH |
| `PO-BH-2026-019` | `DEMO-NORD-OPEN` | Nordlicht GmbH |
| `PO-HV-2026-088` | `DEMO-GATE` | Harbor View Ltd |
| `PO-PT-FOB-004` | `DEMO-FOB` | Pacific Tools Pte Ltd |
| `PO-UNREL-2026-001` | `DEMO-SUPPLIER` | Rhein Parts GmbH |

```bash
curl -s http://127.0.0.1:3000/api/suppliers | python -c "import json,sys; [print(s['name'], s['delivery']['label'], s['payment']['label'], s.get('payable')) for s in json.load(sys.stdin)]"
```

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

对 `DEMO-NOLIMIT`（中信保限额未登记）保存合同或推进 N3，返回 **409**，`message` / `reasons` 为「尚未登记中信保限额，不得签订合同」，`missing` 含 `N3_SINOSURE_LIMIT`：

```bash
curl -s -X POST http://127.0.0.1:3000/api/cases/<DEMO-NOLIMIT的id>/nodes/N3/contract \
  -H 'Content-Type: application/json' \
  -d '{"counterparty":"Cedar Trade Ltd","incoterms":"CIF","paymentTerms":"T/T 30 days","hasRetentionOfTitle":true,"hasDisputeClause":true,"amountFen":4200000,"currency":"USD"}'
curl -s -X POST http://127.0.0.1:3000/api/cases/<DEMO-NOLIMIT的id>/nodes/N3/advance
```

对 `DEMO-LIMIT`（占用超额满 5 万美元，超高风险）推进 N3，同样返回 **409**，`missing` 含 `N3_SINOSURE_OVER_LIMIT`：

```bash
curl -s -X POST http://127.0.0.1:3000/api/cases/<DEMO-LIMIT的id>/nodes/N3/advance
```

报价含模糊用语、变更单未确认、采购未关联已签销售合同、采购到货延期无客户同意、HS 申报要素缺口，分别对 N2 / N4 / N5 / N8 `advance` 同样拒绝。国内供应商高置信命中时 N5 `advance` 返回 **409** 且 `missing` 含 `N5_HIGH_CONFIDENCE_HIT`。未关联销售合同时 N5 保存或推进返回 **409**，`missing` 含 `N5_SALES_LINK`（或关联对象尚未签订销售合同时为 `N5_SALES_NOT_SIGNED`）。进入 N4 后若未再次确认中信保，或变更后占用属超高风险，N4 `advance` 也会拒绝。高风险占用进入审核队列（`REVIEW`，`missing` 含 `N3_SINOSURE_EXPOSURE_HIGH` / `N4_SINOSURE_EXPOSURE_HIGH`）。无变更单时 N3 通过后直接进入 N5，不要求 N4 中信保。

常用接口：

- `GET /api/cases` 案件列表；`?kind=sales` 销售合同列表（已达 N3 或已有销售合同）；`?kind=procurement` 采购合同列表（已达 N5 或已有采购 PO，条目含 `procurementTitle`：供应商采购产品出口客户）
- `GET /api/catalog` 节点、HS 模板、延期原因、价格基础等
- `POST /api/cases/:id/nodes/N1/screen` 模拟筛查
- `POST /api/cases/:id/nodes/N2/quotes` 保存报价新版本
- `POST /api/cases/:id/nodes/N3/contract` 保存合同要素（未登记中信保限额则 **409 GATE_REFUSED**）
- `POST /api/cases/:id/nodes/N3/sinosure` 登记中信保保单与投保限额
- `GET /api/cases/:id/sinosure-exposure?newAmountFen=&currency=` 按买方测算占用（可传入拟新签金额）
- `POST /api/cases/:id/nodes/N4/changes` 创建变更单
- `POST /api/cases/:id/nodes/N4/changes/:changeId/ack` 客户/内部确认或审批
- `POST /api/cases/:id/nodes/N4/changes/:changeId/apply` 生效新版本
- `POST /api/cases/:id/nodes/N4/sinosure` 变更后再次上传或确认中信保
- `GET /api/cases/:id/nodes/N5/sales-options` 可选的已签销售合同列表（客户、合同号、金额、状态；全部已签销售合同均可选，不锁定本案；仅 N3 已通过或已过 N3 且有销售合同）
- `POST /api/cases/:id/nodes/N5/plan` 采购合同/国内备货（须传 `salesCaseId` 关联用户选定的已签销售合同；供应商、PO、计划到货、付款方式一次性付清或分期支付）。分期支付每期须填 `dueAt` 或 `conditionText`（约定付款时间）、`percent`（付款比例）、`amountFen`（金额）。未关联或关联对象未签销售合同则 **409 GATE_REFUSED**；不会因本案已签而自动填入
- `POST /api/cases/:id/nodes/N5/screen` 国内供应商模拟筛查
- `POST /api/cases/:id/nodes/N8/customs` 报关单
- `POST /api/cases/:id/nodes/N8/eport-sync` 模拟电子口岸同步
- `GET /api/cases/:id/nodes/:code/gate` 预览闸门
- `POST /api/cases/:id/nodes/:code/advance` 过闸
- `GET /api/workbench/queue` 命中队列
- `POST /api/workbench/:caseId/action` 工作台处置
- `GET /api/cases/:id/audit` 审计轨迹
- `GET /api/customers` 客户列表（仅 N3+ 买方；中信保限额、占用/剩余或超额分档、合同数、已收汇/未收汇、约定收款日）
- `GET /api/customers/:id` 客户详情（限额、占用拆分、合同、历次 N3+ 交易、收汇与收款日）
- `GET /api/suppliers` 供应商列表（采购单数、已付/未付、交货与付款是否按期）
- `GET /api/suppliers/:id` 供应商详情（每笔采购合同/PO、**关联销售合同**、交货、货款分期与汇总）

请求头 `x-actor-id` 可传入种子用户 id，写入审计。

## 领域用语（与产品口径一致）

- **当事方关系**：买方、付款人、收货人（可与买方不同）；**国内供应商**（N5 采购对象，须单独筛查）
- **销售合同 / 采购合同**：分开签订。N3 为销售/出口合同，N5 为国内采购合同；案件主流程仍是出口侧
- **先销售后采购**：保存或推进采购合同前，须从已签销售合同中**任选一笔**关联；未签（如 `DEMO-SOFT` / `DEMO-NOLIMIT`）不得作为关联对象。不会因本案已签而自动锁定为本案。演示：打开 `DEMO-NORD-WIP`（采购待登记）可见多笔已签合同可选。
- **价格基础**：含项目 / 不含项目 / 部分含
- **变更证据链**：变更单号 → diff → 客户确认证据 → 内部确认（敏感则审批）→ 合同新版本
- **提单控制**：正本提单 **或** 电放提单（并列二选一，不必同时具备）
- **无提单路径**：FOB / EXW / FAS / FCA 等买方安排运输时，不要求提单号与正本/电放；须选择「无提单」并记录装船通知 / 订舱 / 买方运输安排。CIF/CFR 等卖方出单仍须正本或电放。合同术语由 N3 带入 N6，可在 N6 手工改术语后过闸。
- **工作台动作**：误报排除、确认真实、补充信息、持续监控
- **硬闸门**：N6 / N7 / N9，证据缺失即拒绝推进
- **中信保限额**：限额未登记不得签订合同
- **中信保占用**：占用 = **未履行完毕合同未回款**（已签但尚未装运/N6 未过）+ **已履行完毕合同未回款**（已装运或案件已完成，仍有应收）+ **新签订合同金额**（N3/N4 本笔）。客户详情不计入「新签」项，在手 N3 合同计入未履行完毕。
- **超额分档（美元，左闭右开）**：[10,000, 20,000) 中风险软提示可推进（`SOFT_ALERT`）；[20,000, 50,000) 高风险审核队列（`REVIEW`，N3 不得直接推进）；[50,000, ∞) 超高风险硬拦截（`HARD_BLOCK`，`N3_SINOSURE_OVER_LIMIT`）。正好 1 万→中，正好 2 万→高，正好 5 万→超高。超额不足 1 万美元仍显示超额，按软提示。额度内显示剩余额度。
- **币种**：演示环境占用与分档 **只按美元加总**，沿用 `SinosurePolicy.currency`；非美元不自动换算，超额一律按超高风险硬拦截。限额币种须与合同一致。
- **约定收款日 / 按期回款**：出口合同收款是否按期；对照到期日与收汇到账，并统计已收汇/未收汇
- **国内供应商货款**：采购合同须选择一次性付清或分期支付；分期每一期登记约定付款时间、付款比例、金额，分别统计已付未付与是否逾期

## 明确不做

真实制裁数据源、真实电子口岸/单一窗口对接、生产级身份认证与权限矩阵、MySQL 生产部署与高可用。
