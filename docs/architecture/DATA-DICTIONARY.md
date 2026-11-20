# 成长系统数据字典

| 项目 | 内容 |
|---|---|
| 版本 | 1.0 |
| 适用 schema | v8（P0） |
| 基准 schema | v7 |
| 状态 | 已冻结 |

## 1. 说明

P0 采用“沿用旧表、收敛新语义”的策略：

- `Goal` 在 UI 中显示为“阶段成果”。
- `Timebox` 在 UI 中显示为“时间块”。
- `LearningSession` 在 UI 中显示为“学习会话”。
- 旧 `Vision`、`Direction`、`Milestone`、`Habit` 等表保留，但不再是新用户必经路径。
- 所有实体继承 `BaseEntity`。

### 1.1 BaseEntity

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | string | 是 | UUIDv7 | 主键 |
| createdAt | string | 是 | 当前 ISO 时间 | 创建时间 |
| updatedAt | string | 是 | 当前 ISO 时间 | 更新时间 |
| archivedAt | string \| null | 是 | null | 归档时间；非空即归档 |
| version | number | 是 | 1 | 每次写入递增 |
| schemaVersion | number | 是 | 当前 schema | 数据写入时版本 |
| syncStatus | SyncStatus | 是 | LOCAL_ONLY | 本地优先同步状态 |
| lastSyncedAt | string \| null | 是 | null | 最近同步时间 |
| deletedAt | string \| null | 是 | null | 软删除时间，P0 不主动使用 |

## 2. Identity｜身份

存储：`identities`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| visionId | string \| null | 是 | null | 旧愿景兼容字段；新身份不要求 |
| title | string | 是 | — | 身份名称，如“AI 研究者” |
| description | string | 是 | `''` | 补充说明 |
| identityStatement | string | 是 | `''` | 一句话愿景，如“成为能独立完成研究的 AI 研究者” |

业务规则：

- `title` 去除首尾空格后不能为空。
- 新身份不要求 `visionId`。
- 身份归档后，其下能力、阶段成果、任务不物理删除。

## 3. Competency｜能力

存储：`competencies`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| identityId | string \| null | 是 | null | 所属身份；旧数据迁移后补全 |
| parentId | string \| null | 是 | null | 父能力 |
| name | string | 是 | — | 能力名称 |
| description | string | 是 | `''` | 能力说明 |
| category | CompetencyCategory | 是 | SKILL | 能力类别 |
| targetLevel | CompetencyLevel | 是 | L3 | 目标等级 |
| currentLevel | CompetencyLevel | 是 | L0 | 当前等级 |
| weight | number | 是 | 1 | 聚合权重，必须大于 0 |
| assessmentCriteria | string | 是 | `''` | 等级评估标准 |
| status | CompetencyStatus | 是 | NOT_STARTED | 能力状态 |

业务规则：

- `name` 不能为空。
- 根能力 `parentId = null`，必须具有 `identityId`。
- 子能力必须与父能力具有相同 `identityId`。
- 禁止形成父子循环。
- 归档父能力时，子能力不物理删除，由级联服务统一归档或提示。
- P0 只允许叶子能力挂阶段成果。

## 4. StageOutcome｜阶段成果（Goal）

存储：`goals`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| title | string | 是 | — | 阶段成果名称 |
| description | string | 是 | `''` | 成果说明 |
| goalType | GoalType | 是 | OUTCOME | 固定使用成果型 |
| parentGoalId | string \| null | 是 | null | 保留字段，P0 不用于阶段成果树 |
| competencyId | string \| null | 是 | null | 所属叶子能力；新记录必填 |
| startDate | string \| null | 是 | null | 开始日期 |
| dueDate | string \| null | 是 | null | 截止日期 |
| priority | Priority | 是 | MEDIUM | 优先级 |
| successCriteria | string | 是 | — | 验收标准，必须可验证 |
| status | GoalStatus | 是 | ACTIVE | 阶段成果状态 |
| progressMode | ProgressMode | 是 | TASK_BASED | 新记录统一任务加权 |
| manualProgress | number | 是 | 0 | 旧数据兼容；新记录不单独编辑 |
| reviewFrequency | string | 是 | `''` | 复盘频率，可空 |

业务规则：

- 新阶段成果必须有 `competencyId`，且该能力必须是叶子能力。
- `successCriteria` 不能为空。
- 进度由任务估算时长计算，不接受页面传入人工进度。
- `CANCELLED` 和归档对象不进入默认统计。

## 5. Task｜任务

存储：`tasks`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| stageOutcomeId | string \| null | 是 | null | 所属阶段成果；新任务必填 |
| title | string | 是 | — | 任务标题 |
| description | string | 是 | `''` | 任务说明 |
| taskType | TaskType | 是 | LEARNING | 任务类型 |
| parentTaskId | string \| null | 是 | null | 子任务兼容字段 |
| startDate | string \| null | 是 | null | 开始日期 |
| dueDate | string \| null | 是 | null | 截止日期 |
| scheduledDate | string \| null | 是 | null | 计划执行日期，`YYYY-MM-DD` |
| estimatedDuration | number | 是 | 30 | 预计分钟数，必须大于 0 |
| actualDuration | number | 是 | 0 | 实际分钟数，由时间块汇总 |
| priority | Priority | 是 | MEDIUM | 优先级 |
| importance | Importance | 是 | NORMAL | 重要度 |
| urgency | Urgency | 是 | MEDIUM | 紧急度 |
| status | TaskStatus | 是 | TODO | 唯一状态事实来源 |
| completionCriteria | string | 是 | `''` | 完成标准 |
| learningTemplateId | string \| null | 是 | null | 旧学习模板兼容 |
| completedAt | string \| null | 是 | null | 完成时间 |

业务规则：

- 新任务必须有 `stageOutcomeId`。
- 完成时写入 `completedAt`；重新打开时清空。
- 归档任务不计入阶段成果进度。
- `taskGoals` 仅保留为旧数据兼容关系，新任务以 `stageOutcomeId` 为唯一归属。

## 6. Block｜时间块（Timebox）

存储：`timeboxes`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| taskId | string \| null | 是 | null | 关联任务；可为空 |
| plannedStart | string | 是 | — | ISO 开始时间 |
| plannedEnd | string | 是 | — | ISO 结束时间 |
| plannedDuration | number | 是 | — | 计划分钟数 |
| actualStart | string \| null | 是 | null | 实际开始 |
| actualEnd | string \| null | 是 | null | 实际结束 |
| actualDuration | number | 是 | 0 | 实际分钟数 |
| status | TimeboxStatus | 是 | PLANNED | 时间块状态 |
| note | string | 是 | `''` | 备注 |
| kind | TimeboxKind | 是 | TASK | TASK、REVIEW、FOCUS、BREAK |
| reviewScheduleId | string \| null | 是 | null | 旧复习计划兼容 |

业务规则：

- `plannedEnd` 必须晚于 `plannedStart`。
- `taskId = null` 时允许 `kind = FOCUS` 或 `BREAK`。
- 完成时间块后，汇总同任务已完成时间块的 `actualDuration` 到任务。
- 时间块状态不直接改变任务完成状态。

## 7. Session｜学习会话

存储：`learningSessions`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| taskId | string \| null | 是 | null | 关联任务 |
| blockId | string \| null | 是 | null | 关联时间块 |
| workflowId | string \| null | 是 | null | 旧工作流兼容；新会话可为空 |
| startedAt | string | 是 | — | 开始时间 |
| endedAt | string \| null | 是 | null | 结束时间 |
| currentStage | InputStage \| null | 是 | INPUT | INPUT、UNDERSTAND、OUTPUT、REVIEW |
| status | SessionStatus | 是 | IN_PROGRESS | 会话状态 |
| learningIntention | string | 是 | `''` | 本次学习意图 |
| selfPrediction | number | 是 | 0 | 预测完成度 0–100 |
| actualAssessment | number \| null | 是 | null | 实际自评 0–100 |
| actualDuration | number | 是 | 0 | 实际分钟数 |
| completedStages | string[] | 否 | `[]` | 已完成阶段 |
| checklistProgress | Record<string, string[]> | 否 | `{}` | 旧工作流兼容 |

业务规则：

- 四阶段固定为 INPUT → UNDERSTAND → OUTPUT → REVIEW。
- `completedStages` 只记录完成阶段，不替代学习记录内容。
- 学习时长进入投入统计，不直接改变能力等级。

## 8. LearningRecord｜学习记录

存储：`learningRecords`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| sessionId | string | 是 | — | 所属学习会话 |
| taskId | string \| null | 是 | null | 关联任务 |
| recordType | LearningRecordType | 是 | INPUT | 输入、输出、反馈、反思等 |
| title | string | 是 | — | 记录标题 |
| content | string | 是 | `''` | 记录正文 |
| externalUrl | string | 是 | `''` | 外部链接 |
| occurredAt | string | 是 | — | 发生时间 |
| selfAssessment | number \| null | 是 | null | 0–100 自评 |

## 9. Evidence｜证据

存储：`evidences`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| taskId | string \| null | 是 | null | 来源任务 |
| title | string | 是 | — | 证据标题 |
| description | string | 是 | `''` | 证据说明 |
| evidenceType | EvidenceType | 是 | NOTE | 代码、报告、项目、论文等 |
| fileUrl | string | 是 | `''` | 本地/外部文件地址 |
| externalUrl | string | 是 | `''` | 外部链接 |
| qualityNote | string | 是 | `''` | 质量说明 |

能力关联存储：`competencyEvidences`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| competencyId | string | 是 | 被证明的能力 |
| evidenceId | string | 是 | 证据 |
| assessedLevel | CompetencyLevel | 是 | 证据支持的等级 |
| assessmentNote | string | 是 | 评估说明 |
| assessedAt | string | 是 | 评估时间 |

## 10. Review｜复盘与调整

存储：`reviews`、`reviewFindings`、`adjustments`

| 实体 | 关键字段 | 说明 |
|---|---|---|
| Review | reviewType, targetDate, content, status | 日/周/月复盘 |
| ReviewFinding | reviewId, findingType, description, rootCause, proposedAction | 发现与原因 |
| Adjustment | reviewId, targetType, targetId, field, oldValue, newValue, reason, status | 可执行调整 |

P0 的调整类型限定为：

- 调整日期：任务、阶段成果截止时间。
- 调整范围：归档、取消、降低优先级。
- 调整路径：改任务拆解或学习方法。

## 11. 旧表与新模型映射

| 旧对象 | P0 处理 | 新用途 |
|---|---|---|
| Vision | 保留 | 身份描述的历史来源，不再要求新用户创建 |
| Direction | 保留 | 可选分组/标签，不再是必经层 |
| DirectionCompetency | 保留 | 旧数据迁移时用于推断能力所属身份 |
| Milestone | 保留 | 历史里程碑兼容；新页面统一使用阶段成果 |
| Goal | 复用 | UI 显示为阶段成果 |
| TaskGoal | 保留 | 旧任务-目标关系；迁移为首个 `Task.stageOutcomeId` |
| Timebox | 复用 | UI 显示为时间块，任务关联可空 |
| Workflow | 保留 | 旧学习流程兼容，新学习页使用固定四阶段 |
| Habit/HabitLog | 保留 | P1 重复任务和旧数据兼容 |
| Resource | 保留 | 学习资料兼容 |

## 12. 索引与约束摘要

新增或调整索引：

```text
identities: id, visionId, status, updatedAt, archivedAt
competencies: id, identityId, parentId, category, status, updatedAt, archivedAt
goals: id, competencyId, status, dueDate, updatedAt, archivedAt
tasks: id, stageOutcomeId, scheduledDate, dueDate, status, updatedAt, archivedAt
timeboxes: id, taskId, plannedStart, status, kind, updatedAt
learningSessions: id, taskId, blockId, status, startedAt, updatedAt
```

逻辑约束无法完全依赖 IndexedDB 索引表达，必须由 Growth Command 的验证层执行。
