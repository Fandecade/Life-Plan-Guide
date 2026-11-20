# 成长系统迁移计划

| 项目 | 内容 |
|---|---|
| 起始 schema | v7 |
| 目标 schema | v8 |
| 迁移策略 | 同库、增量、可回退、先备份后迁移 |
| 数据来源 | 浏览器 IndexedDB `personal-growth-os` |
| 状态 | 已设计，待阶段 1 实施 |

## 1. 原则

1. 不新建第二套长期并行数据库。
2. 不删除旧表、旧字段和用户数据。
3. 迁移脚本必须可重复执行且结果确定。
4. 迁移前必须支持完整 JSON 导出。
5. 迁移后必须通过关联完整性检查。
6. 无法自动判断的语义不强行覆盖，保留旧数据并标记为兼容状态。
7. 每个阶段使用独立 Git 提交，验证通过后推送远端。

## 2. v8 数据库变更

### 2.1 Identity

变更：

- `visionId` 由 `string` 调整为 `string | null`。
- 新身份允许不创建 Vision。

迁移：

- 旧身份保留原 `visionId`。
- 不删除 Vision 记录。

### 2.2 Competency

新增：

- `identityId: string | null`
- `weight: number`，默认 `1`

索引：

```text
id, identityId, parentId, category, status, createdAt, updatedAt, archivedAt
```

迁移顺序：

1. 建立 `directionId → identityId` 映射。
2. 建立 `competencyId → 首个 direction.identityId` 映射。
3. 已有 `identityId` 不覆盖。
4. 缺失时使用已推断值。
5. 仍缺失且系统只有一个身份时，使用该身份。
6. 仍无法判断时保留 `null`，并在数据健康检查中列为待处理项。
7. 父能力为 `null` 的子能力继承父能力的 `identityId`。
8. `weight` 缺失时设为 `1`。

### 2.3 Task

新增：

- `stageOutcomeId: string | null`

索引：

```text
id, stageOutcomeId, parentTaskId, status, taskType,
scheduledDate, dueDate, priority, completedAt,
createdAt, updatedAt, archivedAt
```

迁移：

1. 读取所有有效 `taskGoals`。
2. 按 `taskId` 分组。
3. 优先选择未归档、所属目标未归档的关系。
4. 按关系 `createdAt` 升序选择第一个 `goalId`。
5. 写入 `task.stageOutcomeId`。
6. 保留原 `taskGoals`，不删除。
7. 多目标任务在健康检查报告中标记为“旧多目标任务”。

### 2.4 Timebox

变更：

- `taskId` 由 `string` 调整为 `string | null`。
- `kind` 扩展为 `TASK | REVIEW | FOCUS | BREAK`。

迁移：

- 已有 `kind` 不改。
- `kind` 缺失且存在 `taskId` 时设为 `TASK`。
- `kind` 缺失且不存在 `taskId` 时设为 `FOCUS`。
- `taskId` 缺失设为 `null`，不伪造任务。

索引：

```text
id, taskId, plannedStart, status, kind, updatedAt
```

### 2.5 LearningSession

新增：

- `blockId: string | null`

索引：

```text
id, taskId, blockId, workflowId, status, startedAt, updatedAt
```

迁移：

- 旧会话 `blockId` 设为 `null`。
- 不根据开始时间猜测时间块，避免错误关联。

## 3. 迁移执行流程

```text
检查 schema
→ 自动导出迁移前备份
→ 执行 Dexie v8 upgrade
→ 校验基础字段
→ 校验实体关系
→ 输出迁移报告
→ 打开应用
```

如果没有成功生成备份：

- 中止自动迁移。
- 显示明确错误。
- 保留 v7 数据库原状。

## 4. 关系校验

迁移后必须检查：

### 4.1 Identity → Competency

- `competency.identityId` 指向存在且未删除的身份。
- 根能力具有身份。
- 父子能力身份一致。
- 不存在父子循环。

### 4.2 Competency → StageOutcome

- `goal.competencyId` 指向存在的能力。
- 非叶子能力默认不新增阶段成果。
- 归档能力下的阶段成果不进入默认统计。

### 4.3 StageOutcome → Task

- `task.stageOutcomeId` 指向存在的阶段成果。
- 阶段成果与任务存在有效关联。
- 多目标旧任务标记为兼容数据。

### 4.4 Task → Block / Session / Evidence

- 时间块可无任务，但有任务时必须有效。
- 学习会话可无任务，但有任务时必须有效。
- 证据可无任务，但能力关系必须有效。

## 5. 回退方案

### 5.1 应用回退

- Git 回退到阶段提交前 tag。
- 保留迁移前 JSON 备份。
- 不通过手工删除 IndexedDB 表尝试“修复”。

### 5.2 数据回退

1. 导出当前 v8 数据，留作诊断。
2. 清空当前数据库业务数据。
3. 使用迁移前 JSON 备份执行“替换导入”。
4. 回退到 v7 应用版本。
5. 检查记录数和关键关联。

## 6. 验收用例

### 6.1 空数据库

- 可以创建身份。
- 可以创建根能力。
- 可以创建多级子能力。
- 可以创建阶段成果。
- 可以创建任务。
- 可以创建无任务时间块。

### 6.2 v7 旧数据

- 身份、能力、目标、任务、时间块数量迁移前后一致。
- 任务的首个目标关系迁移到 `stageOutcomeId`。
- 旧 TaskGoal 记录未删除。
- 能力通过 Direction 关系推断出身份。
- 无法推断的能力记录出现在报告，不丢失。

### 6.3 导入导出

- v7 备份可导入。
- v8 备份可导出并重新导入。
- 导入后关系完整性检查通过。
- 归档数据数量不被误计为活跃数据。

## 7. 阶段 1 交付物

- Dexie v8 schema migration。
- 迁移前自动备份能力。
- 迁移报告与健康检查。
- 规范化 Growth Query / Growth Command。
- 单一进度计算模块。
- 数据库迁移单元测试或浏览器验证脚本。
- 当前情况台账更新。
