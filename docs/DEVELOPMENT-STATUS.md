# 简化个人成长系统｜当前情况

> 本文件是唯一开发阶段台账。每个阶段开始时更新“进行中”，完成验证、提交并推送后改为“已完成”。

最后更新：2026-11-20（阶段 1 已完成）

## 1. 当前基线

| 项目 | 当前值 |
|---|---|
| 仓库 | Life-Plan-Guide |
| 分支 | main |
| 起始提交 | `924ef28 feat: unify task status flow and cross-module sync` |
| 技术栈 | Vue 3 + TypeScript + Vite + Dexie/IndexedDB |
| 起始 schema | v7 |
| 当前 schema | v8 |
| 包管理器 | pnpm 11.28.4；单一 `pnpm-lock.yaml` |
| 类型检查 | 通过 |
| 构建 | `pnpm run build`（基线通过） |
| 浏览器验收 | 自动解析 Chrome；基线 smoke / stage1 通过 |
| 数据策略 | 本地优先，导出 JSON 备份 |

## 2. 阶段进度

| 阶段 | 内容 | 状态 | 验收 | 提交 |
|---|---|---|---|---|
| -1 | 模型冻结与迁移设计 | 已完成 | 四份文档完成；typecheck 通过 | `a60d4e6` |
| 0 | 工程基座与备份点 | 已完成 | typecheck/build/smoke/stage1 通过 | `6887e2c` |
| 1 | 统一数据层与 schema v8 | 已完成 | 五条验收命令全部通过 | `2313eae` |
| 2 | 路线页重构 | 未开始 | 身份→能力→阶段成果→任务 + S 时间线 | — |
| 3 | 今天页重构 | 未开始 | 今日任务、时间轴、待安排、逾期 | — |
| 4 | 学习与证据整合 | 未开始 | 固定四阶段、会话、证据、等级确认 | — |
| 5 | 复盘重构 | 未开始 | 自动统计 + 三问 + 三类调整 | — |
| 6 | UI 收口与整体验收 | 未开始 | 响应式、可读性、完整闭环演示 | — |

## 3. 阶段 -1 清单

- [x] 冻结身份为根节点。
- [x] 冻结能力多级树与 `parentId`。
- [x] 冻结阶段成果复用 `Goal`。
- [x] 冻结任务属于阶段成果。
- [x] 冻结时间块可独立于任务。
- [x] 冻结学习四阶段与证据关系。
- [x] 冻结进度公式。
- [x] 冻结 S 型时间线为派生视图。
- [x] 编写 `DOMAIN-MODEL.md`。
- [x] 编写 `DATA-DICTIONARY.md`。
- [x] 编写 `MIGRATION-PLAN.md`。
- [x] 类型检查通过。
- [x] 提交并推送。

## 4. 阶段 0 清单

- [x] 创建重构前备份 tag：`growth-os-before-refactor`。
- [x] 抽取 Chrome 路径解析器，支持 `CHROME_PATH` / `CHROME_BIN` 覆盖。
- [x] 修复全部既有验收脚本的 macOS 写死路径。
- [x] 新增自包含 `pnpm verify:smoke` 浏览器冒烟验收。
- [x] 统一为 pnpm，生成 `pnpm-lock.yaml`，移除 `package-lock.json`。
- [x] 补充 README 启动、构建、验收和数据备份说明。
- [x] `pnpm install --frozen-lockfile` 通过。
- [x] `pnpm run typecheck` 通过。
- [x] `pnpm run build` 通过。
- [x] `pnpm run verify:smoke` 通过。
- [x] `pnpm run verify:stage1` 回归通过。
- [x] 提交并推送。

## 5. 阶段 1 清单

- [x] schema 升级到 v8，并保持 Dexie 逻辑版本与物理版本换算正确。
- [x] 身份增加一句愿景 `identityStatement`，并允许不再强制依赖旧 `Vision`。
- [x] 能力增加身份归属、父能力、权重、当前等级与目标等级。
- [x] 阶段成果复用 `Goal`，只允许挂载在叶子能力。
- [x] 任务增加主阶段成果 `stageOutcomeId`，旧 `TaskGoal` 关系完整保留。
- [x] 时间块支持无任务自由专注和休息，并补齐任务、复盘、学习会话关联。
- [x] 建立身份 → 能力树 → 阶段成果 → 任务 → 时间块/学习会话的查询与命令层。
- [x] 按估时、能力等级和权重实现阶段成果、能力、身份三级进度。
- [x] 实现 Growth 领域校验：循环、归属、叶子成果、时间块类型和旧关系提示。
- [x] 实现 v7 → v8 自动迁移、迁移报告、迁移前完整快照与 v7 JSON 导入归一化。
- [x] 修复迁移后二次启动：Dexie 物理 v80 正确换算为逻辑 v8。
- [x] `pnpm run typecheck` 通过。
- [x] `pnpm run build` 通过。
- [x] `pnpm run verify:smoke` 通过：8 项导航，UI 缩放 1.15。
- [x] `pnpm run verify:stage1` 通过：33 个 Object Store、81 条演示数据，导入导出、重置和健康检查正常。
- [x] `pnpm run verify:growth-stage1` 通过：15 项 Growth、迁移和二次启动场景。
- [x] 代码提交：`2313eae feat: add growth schema v8 and unified data layer`。

### 5.1 阶段 1 验收口径

- 阶段成果进度 = 已完成任务估时 / 全部有效任务估时；缺省估时按 30 分钟。
- 叶子能力进度 = `currentLevel / targetLevel`。
- 父能力按有效子能力的 `weight` 加权汇总；身份按根能力 `weight` 加权汇总。
- 取消、归档和删除任务不参与统计。
- 真实 v7 升级会先经过 v7 的时间块升级，因此 v8 报告中 `timeboxKindsDefaulted` 通常为 0；v8 兜底补全由专项测试单独覆盖。
- 无法推断身份或阶段成果的数据不删除、不猜测，只写入迁移报告和健康提示。

## 6. 已知现状与风险

### 6.1 已有基础

- v8 数据层、迁移、进度、校验和导入导出归一化已完成。
- 当前界面仍以旧 `Vision / Direction / Milestone` 页面为主，阶段 1 只保证旧界面兼容运行，不代表新信息架构已经上线。
- `Competency` 虽已具备 `identityId` 与 `weight`，旧路线页仍通过方向关系编辑能力，阶段 2 将统一为身份根节点。
- 当前导航仍是 7 个业务入口 + 设置，阶段 6 收敛为四个主入口。
- 现有页面体积大，重构采用页面级纵向切片，不一次性重写全部 composable。
- 字体偏小、主体可视区域不足、侧边栏不可折叠和移动端体验，统一留到阶段 6 收口。

### 6.2 风险

- 浏览器 IndexedDB 中的个人数据不在 Git 中，代码回退不能替代数据备份。
- 旧任务可能关联多个目标，迁移只能选择首个有效目标，原关系必须保留。
- 旧能力可能没有 Direction 关系，无法自动判断身份，必须报告而非猜测。
- 旧页面与新数据层会短期并存，阶段 2 起的页面必须经过 Growth API。
- 真实用户库升级前必须保留导出备份；迁移前快照不能替代用户主动导出。

## 7. 每个阶段的固定完成流程

1. 更新本台账为“进行中”。
2. 实现当前阶段最小完整纵向切片。
3. 运行 `pnpm run typecheck`。
4. 运行 `pnpm run build`。
5. 运行对应浏览器验收。
6. 更新台账、验收结果和已知问题。
7. 单独 Git 提交。
8. 推送 `origin/main`。
9. 确认远端提交成功后再开始下一阶段。

## 8. 远端推送记录

| 阶段 | 提交 | 推送时间 | 结果 |
|---|---|---|---|
| -1 | `a60d4e6` | 2026-11-20 15:48 CST | 已推送 origin/main |
| 0 | `6887e2c` | 2026-11-20 15:53 CST | 已推送 origin/main + 备份 tag |
| 1 | `2313eae` | 2026-11-20 17:41 CST | 已推送 origin/main（阶段记录 `fe03866`） |
