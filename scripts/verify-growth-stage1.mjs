import puppeteer from 'puppeteer-core'
import { resolveChromePath } from './lib/chrome-path.mjs'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'
const CHROME_PATH = resolveChromePath()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function closeEnough(actual, expected, tolerance = 0.0001) {
  return Math.abs(actual - expected) <= tolerance
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,1000'],
})

let pageErrors = []

try {
  const dataPage = await browser.newPage()
  await dataPage.setViewport({ width: 1440, height: 1000 })
  dataPage.on('pageerror', (error) => pageErrors.push(error.message))
  await dataPage.goto(new URL('/src/data/index.ts', APP_URL).href, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })

  const result = await dataPage.evaluate(async () => {
    const api = await import('/src/data/index.ts')
    const transfer = await import('/src/data/transfer.ts')
    const migrations = await import('/src/data/migrations/v8.ts')

    const steps = []
    function pass(name, detail = '') {
      steps.push({ name, detail })
    }
    function expect(condition, message) {
      if (!condition) throw new Error(message)
    }
    async function expectReject(action, expectedText) {
      try {
        await action()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        expect(
          message.includes(expectedText),
          `错误信息不符合预期：期望包含“${expectedText}”，实际为“${message}”`,
        )
        return message
      }
      throw new Error(`操作应被拒绝：${expectedText}`)
    }
    function deleteDatabase(name) {
      return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error ?? new Error(`删除数据库失败：${name}`))
      })
    }
    function closeEnough(actual, expected, tolerance = 0.0001) {
      return Math.abs(actual - expected) <= tolerance
    }

    await deleteDatabase(api.DATABASE_NAME)
    await deleteDatabase('personal-growth-os-migration-backups')
    await api.initDataLayer()
    await api.clearAllData(api.db)
    expect(api.db.verno === 8, `数据库版本应为 8，实际 ${api.db.verno}`)
    const secondOpenBackup = await api.backupBeforeMigration(api.DATABASE_NAME, 8)
    expect(secondOpenBackup === null, '逻辑 v8 数据库不应被 Dexie 物理版本 80 误判')
    pass('v8 空库初始化', '应用数据库与迁移备份库均可创建')

    const identity = await api.growthCommands.createIdentity({
      id: 'identity-growth-test',
      title: '独立产品工程师',
      identityStatement: '我能把复杂问题做成可用、可靠的产品。',
      description: '用于验证身份、能力、成果、任务和进度链路。',
    })
    const rootOne = await api.growthCommands.createRootCompetency({
      id: 'competency-product',
      identityId: identity.id,
      name: '产品工程能力',
      weight: 2,
      currentLevel: 'L2',
      targetLevel: 'L4',
    })
    const child = await api.growthCommands.createChildCompetency({
      id: 'competency-delivery',
      identityId: identity.id,
      parentId: rootOne.id,
      name: '交付复杂功能',
      weight: 1,
      currentLevel: 'L2',
      targetLevel: 'L4',
    })
    const rootTwo = await api.growthCommands.createRootCompetency({
      id: 'competency-research',
      identityId: identity.id,
      name: '用户研究能力',
      weight: 1,
      currentLevel: 'L1',
      targetLevel: 'L2',
    })

    await expectReject(
      () =>
        api.growthCommands.createStageOutcome({
          competencyId: rootOne.id,
          title: '不应挂载',
          successCriteria: '不可创建',
        }),
      '叶子能力',
    )

    const outcome = await api.growthCommands.createStageOutcome({
      id: 'outcome-delivery-v1',
      competencyId: child.id,
      title: '完成首个端到端功能',
      successCriteria: '需求、实现、测试和发布均有证据。',
    })
    const completedTask = await api.growthCommands.createTask({
      id: 'task-completed',
      stageOutcomeId: outcome.id,
      title: '完成实现',
      estimatedDuration: 60,
      status: 'COMPLETED',
    })
    await api.growthCommands.createTask({
      id: 'task-open',
      stageOutcomeId: outcome.id,
      title: '补齐测试',
      estimatedDuration: 30,
    })
    await api.growthCommands.createTask({
      id: 'task-cancelled',
      stageOutcomeId: outcome.id,
      title: '已取消方案',
      estimatedDuration: 120,
      status: 'CANCELLED',
    })
    await api.growthCommands.createTask({
      id: 'task-default-estimate',
      stageOutcomeId: outcome.id,
      title: '整理发布说明',
    })

    const freeBlock = await api.growthCommands.createTimebox({
      id: 'timebox-free',
      plannedStart: '2026-11-20T09:00:00+08:00',
      plannedEnd: '2026-11-20T09:30:00+08:00',
      kind: 'FOCUS',
    })
    await api.growthCommands.createTimebox({
      id: 'timebox-task',
      taskId: completedTask.id,
      plannedStart: '2026-11-20T10:00:00+08:00',
      plannedEnd: '2026-11-20T11:00:00+08:00',
    })
    await expectReject(
      () =>
        api.growthCommands.createTimebox({
          plannedStart: '2026-11-20T12:00:00+08:00',
          plannedEnd: '2026-11-20T12:30:00+08:00',
          kind: 'TASK',
        }),
      '无任务时间块',
    )
    await expectReject(
      () =>
        api.growthCommands.createTimebox({
          plannedStart: '2026-11-20T13:00:00+08:00',
          plannedEnd: '2026-11-20T12:30:00+08:00',
          kind: 'BREAK',
        }),
      '结束时间必须晚于开始时间',
    )
    pass('Growth 命令链路', '身份 → 根能力 → 子能力 → 阶段成果 → 任务 → 时间块')

    const outcomeProgress = await api.growthQueries.loadStageOutcomeProgress(outcome.id)
    expect(outcomeProgress, '阶段成果进度不存在')
    expect(outcomeProgress.percent === 50, `阶段成果进度应为 50，实际 ${outcomeProgress.percent}`)
    expect(outcomeProgress.completedMinutes === 60, '已完成估算时长不正确')
    expect(outcomeProgress.totalMinutes === 120, `有效任务估算时长应为 120，实际 ${outcomeProgress.totalMinutes}`)
    expect(outcomeProgress.taskCount === 3, `有效任务数应为 3，实际 ${outcomeProgress.taskCount}`)
    expect(outcomeProgress.completedTaskCount === 1, '完成任务数不正确')
    expect(outcomeProgress.openTaskCount === 2, '未完成任务数不正确')
    pass('阶段成果进度', '按估算时长计算；取消任务和默认 30 分钟估时符合口径')

    const overview = await api.growthQueries.loadOverview()
    expect(overview.identities.length === 1, '身份总览数量不正确')
    const identityNode = overview.identities[0]
    expect(identityNode.roots.length === 2, '根能力数量不正确')
    expect(closeEnough(identityNode.percent, 50), `身份进度应为 50，实际 ${identityNode.percent}`)
    expect(identityNode.taskCount === 3, `身份任务数应为 3，实际 ${identityNode.taskCount}`)
    expect(identityNode.completedTaskCount === 1, '身份完成任务数不正确')
    const productNode = identityNode.roots.find((node) => node.competency.id === rootOne.id)
    expect(productNode, '根能力节点不存在')
    expect(productNode.children.length === 1, '子能力节点数量不正确')
    expect(productNode.stageOutcomes.length === 0, '非叶子能力不应直接挂载阶段成果')
    expect(productNode.progress.stageOutcomeCount === 1, '根能力汇总的阶段成果数不正确')
    expect(closeEnough(productNode.progress.percent, 50), '父能力应按子能力进度汇总')
    expect(productNode.progress.taskCount === 3, '父能力任务数应排除取消任务')
    expect(overview.unassignedCompetencies.length === 0, '不应存在未归属能力')
    const identityTree = await api.growthQueries.loadIdentityTree(identity.id)
    expect(identityTree?.identity.id === identity.id, '身份树查询结果不正确')
    pass('能力树与身份进度', '叶子等级进度、父能力加权汇总、身份根能力加权汇总')

    const snapshot = await api.growthQueries.loadSnapshot()
    const validation = api.validateGrowthSnapshot(snapshot)
    expect(validation.valid, `有效 Growth 快照不应报错：${validation.issues.map((row) => row.message).join('；')}`)
    expect(validation.errorCount === 0, '有效 Growth 快照错误数应为 0')

    const invalidSnapshot = {
      ...snapshot,
      competencies: snapshot.competencies.map((row) =>
        row.id === rootOne.id ? { ...row, parentId: child.id } : row,
      ),
      stageOutcomes: snapshot.stageOutcomes.map((row) =>
        row.id === outcome.id ? { ...row, competencyId: rootOne.id } : row,
      ),
      timeboxes: snapshot.timeboxes.map((row) =>
        row.id === freeBlock.id ? { ...row, kind: 'TASK' } : row,
      ),
    }
    const invalidValidation = api.validateGrowthSnapshot(invalidSnapshot)
    const issueCodes = new Set(invalidValidation.issues.map((row) => row.code))
    expect(issueCodes.has('COMPETENCY_CYCLE'), '校验器未发现能力树循环')
    expect(issueCodes.has('STAGE_OUTCOME_ON_NON_LEAF'), '校验器未发现非叶子阶段成果')
    expect(issueCodes.has('FREE_TIMEBOX_INVALID_KIND'), '校验器未发现无任务时间块类型错误')
    expect(!invalidValidation.valid, '无效 Growth 快照应返回 valid=false')
    pass('Growth 领域校验', '覆盖循环、非叶子阶段成果、无任务时间块类型')

    const levelProgress = api.calculateLevelProgress('L2', 'L4')
    expect(levelProgress === 50, '等级进度公式不正确')
    expect(api.taskEstimateMinutes({ estimatedDuration: 0 }) === 30, '默认任务估时不正确')
    pass('进度公式', '叶子等级 50%；父能力、身份按权重汇总；默认估时 30 分钟')

    await api.db.close()
    await deleteDatabase(api.DATABASE_NAME)
    await deleteDatabase('personal-growth-os-migration-backups')

    const timestamp = '2026-11-01T00:00:00.000Z'
    function base(id, createdAt = timestamp) {
      return {
        id,
        createdAt,
        updatedAt: createdAt,
        archivedAt: null,
        version: 1,
        schemaVersion: 7,
        syncStatus: 'LOCAL_ONLY',
        lastSyncedAt: null,
        deletedAt: null,
      }
    }

    const legacyData = {
      visions: [
        {
          ...base('vision-migration'),
          title: '迁移验收愿景',
          description: '',
          timeHorizon: '2028-12-31',
          lifeArea: '职业',
          motivation: '',
          successCriteria: '',
          status: 'ACTIVE',
          reviewDate: null,
        },
      ],
      identities: [
        {
          ...base('identity-a'),
          title: '身份 A',
          description: '',
          identityStatement: '成为 A',
        },
        {
          ...base('identity-b'),
          title: '身份 B',
          description: '',
          identityStatement: '成为 B',
        },
      ],
      directions: [
        {
          ...base('direction-a'),
          visionId: 'vision-migration',
          identityId: 'identity-a',
          name: '方向 A',
          description: '',
          priority: 1,
          startDate: null,
          targetDate: null,
          weeklyTimeBudget: 0,
          status: 'ACTIVE',
          color: '#123456',
          reviewFrequency: '每周',
        },
        {
          ...base('direction-b'),
          visionId: 'vision-migration',
          identityId: 'identity-b',
          name: '方向 B',
          description: '',
          priority: 1,
          startDate: null,
          targetDate: null,
          weeklyTimeBudget: 0,
          status: 'ACTIVE',
          color: '#654321',
          reviewFrequency: '每周',
        },
      ],
      competencies: [
        {
          ...base('competency-root-a'),
          name: '根能力 A',
          description: '',
          category: 'SKILL',
          parentId: null,
          targetLevel: 'L4',
          currentLevel: 'L2',
          assessmentCriteria: '',
          status: 'LEARNING',
        },
        {
          ...base('competency-child-a'),
          name: '子能力 A',
          description: '',
          category: 'SKILL',
          parentId: 'competency-root-a',
          targetLevel: 'L4',
          currentLevel: 'L2',
          assessmentCriteria: '',
          status: 'LEARNING',
        },
        {
          ...base('competency-root-b'),
          name: '根能力 B',
          description: '',
          category: 'KNOWLEDGE',
          parentId: null,
          targetLevel: 'L3',
          currentLevel: 'L1',
          assessmentCriteria: '',
          status: 'LEARNING',
        },
        {
          ...base('competency-orphan'),
          name: '待归属能力',
          description: '',
          category: 'SOFT_SKILL',
          parentId: null,
          targetLevel: 'L2',
          currentLevel: 'L0',
          assessmentCriteria: '',
          status: 'NOT_STARTED',
        },
      ],
      directionCompetencies: [
        {
          ...base('relation-direction-a'),
          directionId: 'direction-a',
          competencyId: 'competency-root-a',
          requiredLevel: 'L4',
          priority: 'HIGH',
        },
        {
          ...base('relation-direction-b'),
          directionId: 'direction-b',
          competencyId: 'competency-root-b',
          requiredLevel: 'L3',
          priority: 'HIGH',
        },
      ],
      goals: [
        {
          ...base('goal-a'),
          title: '阶段成果 A',
          description: '',
          goalType: 'OUTCOME',
          parentGoalId: null,
          competencyId: 'competency-child-a',
          startDate: null,
          dueDate: null,
          priority: 'MEDIUM',
          successCriteria: '完成 A',
          status: 'ACTIVE',
          progressMode: 'TASK_BASED',
          manualProgress: 0,
          reviewFrequency: '每周',
        },
        {
          ...base('goal-b'),
          title: '阶段成果 B',
          description: '',
          goalType: 'OUTCOME',
          parentGoalId: null,
          competencyId: 'competency-root-b',
          startDate: null,
          dueDate: null,
          priority: 'MEDIUM',
          successCriteria: '完成 B',
          status: 'ACTIVE',
          progressMode: 'TASK_BASED',
          manualProgress: 0,
          reviewFrequency: '每周',
        },
      ],
      tasks: [
        {
          ...base('task-mapped'),
          title: '旧任务 A',
          description: '',
          taskType: 'LEARNING',
          parentTaskId: null,
          startDate: null,
          dueDate: null,
          scheduledDate: null,
          estimatedDuration: 30,
          actualDuration: 0,
          priority: 'MEDIUM',
          importance: 'NORMAL',
          urgency: 'MEDIUM',
          status: 'TODO',
          completionCriteria: '',
          learningTemplateId: null,
          completedAt: null,
        },
        {
          ...base('task-multi'),
          title: '多目标旧任务',
          description: '',
          taskType: 'PROJECT',
          parentTaskId: null,
          startDate: null,
          dueDate: null,
          scheduledDate: null,
          estimatedDuration: 30,
          actualDuration: 0,
          priority: 'HIGH',
          importance: 'IMPORTANT',
          urgency: 'HIGH',
          status: 'IN_PROGRESS',
          completionCriteria: '',
          learningTemplateId: null,
          completedAt: null,
        },
        {
          ...base('task-unresolved'),
          title: '无目标旧任务',
          description: '',
          taskType: 'DAILY',
          parentTaskId: null,
          startDate: null,
          dueDate: null,
          scheduledDate: null,
          estimatedDuration: 30,
          actualDuration: 0,
          priority: 'LOW',
          importance: 'NORMAL',
          urgency: 'LOW',
          status: 'TODO',
          completionCriteria: '',
          learningTemplateId: null,
          completedAt: null,
        },
      ],
      taskGoals: [
        {
          ...base('task-goal-a'),
          taskId: 'task-mapped',
          goalId: 'goal-a',
        },
        {
          ...base('task-goal-multi-b', '2026-11-02T00:00:00.000Z'),
          taskId: 'task-multi',
          goalId: 'goal-b',
        },
        {
          ...base('task-goal-multi-a', '2026-11-03T00:00:00.000Z'),
          taskId: 'task-multi',
          goalId: 'goal-a',
        },
      ],
      timeboxes: [
        {
          ...base('timebox-legacy-task'),
          taskId: 'task-mapped',
          plannedStart: '2026-11-04T09:00:00.000Z',
          plannedEnd: '2026-11-04T09:30:00.000Z',
          plannedDuration: 30,
          actualStart: null,
          actualEnd: null,
          actualDuration: 0,
          status: 'PLANNED',
          note: '',
        },
        {
          ...base('timebox-legacy-free'),
          taskId: null,
          plannedStart: '2026-11-04T10:00:00.000Z',
          plannedEnd: '2026-11-04T10:30:00.000Z',
          plannedDuration: 30,
          actualStart: null,
          actualEnd: null,
          actualDuration: 0,
          status: 'PLANNED',
          note: '',
        },
        {
          ...base('timebox-legacy-review'),
          taskId: null,
          plannedStart: '2026-11-04T11:00:00.000Z',
          plannedEnd: '2026-11-04T11:15:00.000Z',
          plannedDuration: 15,
          actualStart: null,
          actualEnd: null,
          actualDuration: 0,
          status: 'PLANNED',
          note: '',
          kind: 'REVIEW',
        },
      ],
      learningSessions: [
        {
          ...base('learning-session-legacy'),
          taskId: 'task-mapped',
          workflowId: null,
          startedAt: '2026-11-04T09:00:00.000Z',
          endedAt: null,
          currentStage: null,
          status: 'IN_PROGRESS',
          learningIntention: '验证迁移',
          selfPrediction: 3,
          actualAssessment: null,
          actualDuration: 0,
        },
      ],
    }

    const v7Stores = {
      visions: 'id, createdAt, updatedAt, status, reviewDate, archivedAt',
      identities: 'id, visionId, createdAt, updatedAt, archivedAt',
      directions: 'id, visionId, identityId, status, priority, createdAt, updatedAt, archivedAt',
      competencies: 'id, parentId, category, status, createdAt, updatedAt, archivedAt',
      directionCompetencies: 'id, directionId, competencyId, [directionId+competencyId], updatedAt',
      milestones: 'id, directionId, competencyId, status, dueDate, importance, createdAt, updatedAt, archivedAt',
      goals: 'id, parentGoalId, competencyId, status, goalType, dueDate, createdAt, updatedAt, archivedAt',
      goalDirections: 'id, goalId, directionId, [goalId+directionId], updatedAt',
      goalMilestones: 'id, goalId, milestoneId, [goalId+milestoneId], updatedAt',
      tasks: 'id, parentTaskId, status, taskType, scheduledDate, dueDate, priority, completedAt, createdAt, updatedAt, archivedAt',
      taskGoals: 'id, taskId, goalId, [taskId+goalId], updatedAt',
      taskCompetencies: 'id, taskId, competencyId, [taskId+competencyId], updatedAt',
      taskDependencies: 'id, predecessorTaskId, successorTaskId, updatedAt',
      timeboxes: 'id, taskId, plannedStart, status, kind, updatedAt',
      habits: 'id, status, category, createdAt, updatedAt, archivedAt',
      habitLogs: 'id, habitId, occurredAt, updatedAt',
      behaviorCandidates: 'id, status, directionId, impact, ease, habitId, createdAt, updatedAt, archivedAt',
      workflows: 'id, name, createdAt, updatedAt, archivedAt',
      learningSessions: 'id, taskId, workflowId, status, startedAt, updatedAt',
      learningRecords: 'id, sessionId, recordType, occurredAt, updatedAt',
      knowledgeItems: 'id, masteryLevel, lastReviewedAt, createdAt, updatedAt, archivedAt',
      sessionKnowledge: 'id, sessionId, knowledgeItemId, [sessionId+knowledgeItemId], updatedAt',
      reviewSchedules: 'id, knowledgeItemId, scheduledAt, status, nextReviewAt, updatedAt',
      evidences: 'id, evidenceType, taskId, createdAt, updatedAt, archivedAt',
      competencyEvidences: 'id, competencyId, evidenceId, [competencyId+evidenceId], updatedAt',
      resources: 'id, resourceType, createdAt, updatedAt, archivedAt',
      reviews: 'id, reviewType, targetDate, status, createdAt, updatedAt, archivedAt',
      reviewFindings: 'id, reviewId, findingType, updatedAt',
      adjustments: 'id, reviewId, targetType, status, updatedAt',
      userSettings: 'id, key, updatedAt',
      notifications: 'id, notificationType, status, scheduledAt, updatedAt',
      externalIntegrations: 'id, provider, status, updatedAt',
      dataExports: 'id, exportType, status, createdAt, updatedAt',
    }

    await new Promise((resolve, reject) => {
      const request = indexedDB.open(api.DATABASE_NAME, 7)
      request.onerror = () => reject(request.error ?? new Error('创建 v7 数据库失败'))
      request.onupgradeneeded = () => {
        const database = request.result
        for (const [storeName, schema] of Object.entries(v7Stores)) {
          const store = database.createObjectStore(storeName, { keyPath: 'id' })
          const indexes = schema
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(1)
          for (const index of indexes) {
            const keyPath = index.startsWith('[')
              ? index.slice(1, -1).split('+')
              : index
            store.createIndex(index, keyPath)
          }
        }
      }
      request.onsuccess = async () => {
        const database = request.result
        const transaction = database.transaction(Object.keys(v7Stores), 'readwrite')
        try {
          for (const [storeName, rows] of Object.entries(legacyData)) {
            for (const row of rows) transaction.objectStore(storeName).put(row)
          }
          await new Promise((done, fail) => {
            transaction.oncomplete = () => done()
            transaction.onerror = () => fail(transaction.error ?? new Error('写入 v7 数据失败'))
            transaction.onabort = () => fail(transaction.error ?? new Error('写入 v7 数据已中止'))
          })
          database.close()
          resolve()
        } catch (error) {
          database.close()
          reject(error)
        }
      }
    })
    pass('构造 v7 数据库', '包含身份、方向、能力、旧任务关系、时间块和学习会话')

    await api.initDataLayer()
    expect(api.db.verno === 8, `迁移后数据库版本应为 8，实际 ${api.db.verno}`)
    const migratedRootA = await api.db.competencies.get('competency-root-a')
    const migratedChildA = await api.db.competencies.get('competency-child-a')
    const migratedRootB = await api.db.competencies.get('competency-root-b')
    const migratedOrphan = await api.db.competencies.get('competency-orphan')
    expect(migratedRootA?.identityId === 'identity-a', '方向关系推断能力 A 身份失败')
    expect(migratedChildA?.identityId === 'identity-a', '子能力未继承父能力身份')
    expect(migratedRootB?.identityId === 'identity-b', '方向关系推断能力 B 身份失败')
    expect(migratedOrphan?.identityId === null, '多身份下的无关系能力不应被猜测归属')
    expect(migratedRootA?.weight === 1, '能力权重默认值应为 1')
    const mappedTask = await api.db.tasks.get('task-mapped')
    const multiTask = await api.db.tasks.get('task-multi')
    const unresolvedTask = await api.db.tasks.get('task-unresolved')
    expect(mappedTask?.stageOutcomeId === 'goal-a', '旧任务主阶段成果映射失败')
    expect(multiTask?.stageOutcomeId === 'goal-b', '多目标任务应使用最早的可用关系')
    expect(unresolvedTask?.stageOutcomeId === null, '无关系旧任务应保留为待补齐')
    expect((await api.db.taskGoals.count()) === 3, '旧 taskGoals 关系必须保留')
    const migratedTaskBlock = await api.db.timeboxes.get('timebox-legacy-task')
    const migratedFreeBlock = await api.db.timeboxes.get('timebox-legacy-free')
    const migratedReviewBlock = await api.db.timeboxes.get('timebox-legacy-review')
    expect(migratedTaskBlock?.kind === 'TASK', '任务时间块类型补齐失败')
    expect(migratedFreeBlock?.kind === 'FOCUS', '无任务时间块类型补齐失败')
    expect(migratedReviewBlock?.kind === 'REVIEW', '已有时间块类型被覆盖')
    const migratedSession = await api.db.learningSessions.get('learning-session-legacy')
    expect(migratedSession?.blockId === null, '学习会话 blockId 未补齐')
    pass('v7 → v8 自动迁移', '身份推断、阶段成果映射、时间块和学习会话字段补齐')

    const migrationReportSetting = await api.db.userSettings.get('migration.v8.report')
    const migrationReport = migrationReportSetting?.value
    expect(migrationReport, '未写入 v8 迁移报告')
    expect(migrationReport.toSchemaVersion === 8, '迁移报告目标版本不正确')
    expect(migrationReport.competencyIdentityInferred === 3, '迁移报告身份推断数量不正确')
    expect(migrationReport.competencyIdentityUnresolved === 1, '迁移报告未记录待归属能力')
    expect(migrationReport.taskStageOutcomeMapped === 2, '迁移报告阶段成果映射数量不正确')
    expect(migrationReport.taskStageOutcomeUnresolved === 1, '迁移报告未记录待补齐任务')
    expect(migrationReport.multiStageOutcomeTasks === 1, '迁移报告未记录多阶段成果任务')
    expect(migrationReport.preservedLegacyTaskGoals === 3, '迁移报告旧关系数量不正确')
    expect(migrationReport.freeTimeboxes === 2, '迁移报告自由时间块数量不正确')
    expect(migrationReport.learningSessionsWithoutBlock === 1, '迁移报告未记录待关联时间块的学习会话')
    pass('迁移报告', '数量、无法推断项与多目标冲突均落盘')

    const migrationSnapshot = await api.readLatestMigrationSnapshot()
    expect(migrationSnapshot, '未生成迁移前备份快照')
    expect(migrationSnapshot.sourceVersion === 7, '迁移前备份源版本应为 7')
    expect(migrationSnapshot.targetVersion === 8, '迁移前备份目标版本应为 8')
    expect(migrationSnapshot.data.competencies?.length === 4, '迁移前备份未保存完整能力')
    expect(migrationSnapshot.data.taskGoals?.length === 3, '迁移前备份未保存旧任务关系')
    pass('迁移前备份', '独立数据库保存 v7 完整快照')

    const defensiveMigration = migrations.migrateV8Data(
      {
        identities: legacyData.identities,
        directions: legacyData.directions,
        competencies: legacyData.competencies,
        directionCompetencies: legacyData.directionCompetencies,
        goals: legacyData.goals,
        tasks: legacyData.tasks,
        taskGoals: legacyData.taskGoals,
        timeboxes: legacyData.timeboxes,
        learningSessions: legacyData.learningSessions,
      },
      { fromSchemaVersion: 7 },
    )
    expect(defensiveMigration.report.timeboxKindsDefaulted === 2, 'v8 时间块兜底补全数量不正确')
    expect(
      defensiveMigration.report.learningSessionsWithoutBlock === 1,
      'v8 学习会话时间块兜底统计不正确',
    )
    pass('v8 迁移兜底逻辑', '旧库即使缺少 v7 时间块升级结果也能补齐类型')

    const migratedSnapshot = await api.growthQueries.loadSnapshot({ includeArchived: true })
    const migratedValidation = api.validateGrowthSnapshot(migratedSnapshot)
    const migratedCodes = new Set(migratedValidation.issues.map((row) => row.code))
    expect(migratedCodes.has('COMPETENCY_IDENTITY_REQUIRED'), '迁移后应报告待归属能力')
    expect(migratedCodes.has('TASK_STAGE_OUTCOME_UNRESOLVED'), '迁移后应报告待补齐任务')
    expect(migratedCodes.has('LEGACY_TASK_MULTIPLE_STAGE_OUTCOMES'), '迁移后应报告多目标旧任务')
    pass('迁移后数据健康', '保留问题以提示用户补齐，不静默猜测或删除')

    const legacyBackup = {
      app: transfer.EXPORT_APP_ID,
      schemaVersion: 7,
      exportedAt: timestamp,
      counts: {},
      data: legacyData,
    }
    const preview = await transfer.analyzeBackup(api.db, legacyBackup, 'replace')
    expect(preview.ok, `v7 JSON 导入预览失败：${preview.errors.join('；')}`)
    expect(preview.missingReferences.length === 0, 'v7 JSON 导入出现意外关联缺失')
    expect(preview.warnings.some((warning) => warning.includes('自动迁移')), '导入预览未提示自动迁移')
    const importResult = await transfer.importBackup(api.db, legacyBackup, 'replace')
    expect(importResult.imported > 0, 'v7 JSON 导入未写入记录')
    const importedRootA = await api.db.competencies.get('competency-root-a')
    const importedMappedTask = await api.db.tasks.get('task-mapped')
    expect(importedRootA?.identityId === 'identity-a', 'v7 JSON 导入后能力归属错误')
    expect(importedMappedTask?.stageOutcomeId === 'goal-a', 'v7 JSON 导入后任务映射错误')
    expect((await api.db.taskGoals.count()) === 3, 'v7 JSON 导入后旧关系数量错误')
    pass('v7 JSON 导入', '预览与实际导入共用 v8 归一化逻辑')

    const roundtripBackup = await transfer.createBackup(api.db)
    expect(roundtripBackup.schemaVersion === 8, '导出备份版本应为 v8')
    const beforeInfo = await api.readDatabaseInfo(api.db)
    const mergeRoundtrip = await transfer.importBackup(api.db, roundtripBackup, 'merge')
    expect(mergeRoundtrip.imported === 0, '同库合并导入不应新增记录')
    expect(mergeRoundtrip.skipped === beforeInfo.total, '同库合并导入应跳过全部已有记录')
    await api.clearAllData(api.db)
    const replaceRoundtrip = await transfer.importBackup(api.db, roundtripBackup, 'replace')
    expect(replaceRoundtrip.imported === beforeInfo.total, 'v8 替换导入记录数不一致')
    const afterInfo = await api.readDatabaseInfo(api.db)
    expect(afterInfo.total === beforeInfo.total, 'v8 导出再导入后总记录数变化')
    const roundtripCompetency = await api.db.competencies.get('competency-root-a')
    const roundtripTask = await api.db.tasks.get('task-mapped')
    expect(roundtripCompetency?.identityId === 'identity-a', 'v8 往返后能力归属丢失')
    expect(roundtripTask?.stageOutcomeId === 'goal-a', 'v8 往返后任务映射丢失')
    pass('v8 JSON 往返', '合并跳过同 ID；替换后记录数与关键关系保持一致')

    return { steps }
  })

  for (const step of result.steps) {
    console.log(`✓ ${step.name}${step.detail ? ` — ${step.detail}` : ''}`)
  }
  await dataPage.close()

  const uiPage = await browser.newPage()
  await uiPage.setViewport({ width: 1440, height: 1000 })
  uiPage.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
  uiPage.on('pageerror', (error) => pageErrors.push(error.message))
  await uiPage.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 30000 })
  try {
    await uiPage.waitForSelector('.hero-title', { timeout: 15000 })
  } catch (error) {
    const bodyText = await uiPage.$eval('body', (node) => node.innerText).catch(() => '')
    await uiPage.screenshot({ path: '/tmp/growth-stage1-ui-failure.png', fullPage: true }).catch(() => {})
    console.error('UI 启动失败页面内容：\n' + bodyText.slice(0, 3000))
    throw error
  }
  const uiText = await uiPage.$eval('body', (node) => node.innerText)
  assert(uiText.length > 0, '应用页面为空')
  assert(!uiText.includes('本地数据库打开失败'), 'v8 数据导致应用启动失败')
  assert(pageErrors.length === 0, `浏览器运行错误：\n${pageErrors.join('\n')}`)
  console.log('✓ 应用启动集成 — v8 数据可直接被现有界面打开')

  assert(result.steps.length >= 10, 'Growth 验收步骤数量异常')
  console.log('\n阶段 1 Growth 专项验收通过。')
} catch (error) {
  console.error('\n阶段 1 Growth 专项验收失败：', error instanceof Error ? error.message : error)
  if (pageErrors.length > 0) console.error('页面错误：\n' + pageErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close().catch(() => {})
}
