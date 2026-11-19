import {
  AnchorType,
  BehaviorCandidateStatus,
  BehaviorSourceType,
  CompetencyCategory,
  CompetencyLevel,
  CompetencyStatus,
  DirectionStatus,
  EvidenceType,
  FindingType,
  GoalStatus,
  GoalType,
  HabitCategory,
  HabitStatus,
  Importance,
  LearningRecordType,
  MasteryLevel,
  MilestoneStatus,
  NotificationStatus,
  NotificationType,
  Priority,
  ProgressMode,
  PromptStatus,
  ResourceType,
  ReviewScheduleStatus,
  ReviewStatus,
  ReviewType,
  SessionStatus,
  TaskStatus,
  TaskType,
  Urgency,
  VisionStatus,
  AdjustmentStatus,
  AdjustmentTargetType,
  IntegrationStatus,
} from '@/domain'

import type { Repositories } from './repositories'

function at(days: number, hour = 9, minute = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

export async function seedDemoData(repos: Repositories): Promise<void> {
  const existing =
    (await repos.visions.count({ includeArchived: true })) +
    (await repos.tasks.count({ includeArchived: true })) +
    (await repos.habits.count({ includeArchived: true }))

  if (existing > 0) {
    throw new Error('当前数据库已有数据，请先清空或使用“重置演示数据”')
  }

  const vision = await repos.visions.create({
    title: '成为具备独立研究与工程实践能力的技术人才',
    description:
      '未来三到五年内，既能够独立设计并实现复杂软硬件系统，也能够独立开展科研工作，把算法、系统与工程实践连接起来。',
    timeHorizon: at(365 * 5, 12),
    lifeArea: '学业与职业',
    motivation:
      '希望具备独立设计系统、解决复杂工程问题和开展科研工作的能力，并在真实项目中验证自己的判断。',
    successCriteria:
      '能独立完成综合软硬件项目；能独立复现和改进研究算法；能完成研究生阶段的学业要求。',
    status: VisionStatus.ACTIVE,
    reviewDate: at(90, 20),
  })

  const engineerIdentity = await repos.identities.create({
    visionId: vision.id,
    title: '软硬件全栈工程师',
    description: '能够从需求、架构到实现和调试，独立完成软硬件结合的系统。',
    identityStatement: '我是一个能够把复杂系统真正做出来的工程师。',
  })

  await new Promise((resolve) => setTimeout(resolve, 5))

  const researcherIdentity = await repos.identities.create({
    visionId: vision.id,
    title: '独立研究者',
    description: '能够发现问题、阅读文献、设计实验并产出可信的研究结果。',
    identityStatement: '我是一个能够独立开展研究并解释结果的研究者。',
  })

  const directionEngineering = await repos.directions.create({
    visionId: vision.id,
    identityId: engineerIdentity.id,
    name: '软硬件全栈工程',
    description: '以系统能力为主线，覆盖 C++、Linux、嵌入式和软件架构。',
    priority: 1,
    startDate: at(-120, 9),
    targetDate: at(365 * 3, 9),
    weeklyTimeBudget: 600,
    status: DirectionStatus.ACTIVE,
    color: '#2f6b4f',
    reviewFrequency: '每两周',
  })

  const directionResearch = await repos.directions.create({
    visionId: vision.id,
    identityId: researcherIdentity.id,
    name: '研究生学业与科研',
    description: '以算法理论和科研实践为主线，训练论文阅读、复现和实验分析能力。',
    priority: 1,
    startDate: at(-180, 9),
    targetDate: at(365 * 2, 9),
    weeklyTimeBudget: 720,
    status: DirectionStatus.ACTIVE,
    color: '#8a5a2b',
    reviewFrequency: '每周',
  })

  await repos.behaviorCandidates.create({
    title: '每天阅读论文 5 分钟',
    description: '把阅读论文缩小成每天打开并读一小段，降低开始成本。',
    sourceType: BehaviorSourceType.DIRECTION,
    sourceId: directionResearch.id,
    directionId: directionResearch.id,
    impact: 4,
    ease: 5,
    status: BehaviorCandidateStatus.CANDIDATE,
    habitId: null,
    note: '高影响且容易执行，适合作为 Golden Behavior。',
  })

  await repos.behaviorCandidates.create({
    title: '每天复习一个知识点',
    description: '用一次主动回忆代替重复阅读，维持长期记忆。',
    sourceType: BehaviorSourceType.CUSTOM,
    sourceId: null,
    directionId: directionResearch.id,
    impact: 4,
    ease: 5,
    status: BehaviorCandidateStatus.CANDIDATE,
    habitId: null,
    note: '',
  })

  await repos.behaviorCandidates.create({
    title: '每天完成 3 小时科研',
    description: '高影响，但需要完整时间块和较高精力。',
    sourceType: BehaviorSourceType.DIRECTION,
    sourceId: directionResearch.id,
    directionId: directionResearch.id,
    impact: 5,
    ease: 1,
    status: BehaviorCandidateStatus.CANDIDATE,
    habitId: null,
    note: '当前阶段优先级高，但不容易稳定执行。',
  })

  await repos.behaviorCandidates.create({
    title: '整理桌面 1 分钟',
    description: '容易执行，但对长期发展影响有限。',
    sourceType: BehaviorSourceType.CUSTOM,
    sourceId: null,
    directionId: null,
    impact: 1,
    ease: 5,
    status: BehaviorCandidateStatus.CANDIDATE,
    habitId: null,
    note: '',
  })

  const competencyAlgorithm = await repos.competencies.create({
    name: '算法与数据结构',
    description: '理解常见算法范式，能够分析复杂度并独立实现。',
    category: CompetencyCategory.KNOWLEDGE,
    parentId: null,
    targetLevel: CompetencyLevel.L4,
    currentLevel: CompetencyLevel.L2,
    assessmentCriteria: '能独立实现并解释典型算法，能分析时间与空间复杂度。',
    status: CompetencyStatus.LEARNING,
  })

  const competencySat = await repos.competencies.create({
    name: 'SAT 与局部搜索',
    description: '理解 SAT 问题建模、局部搜索与群智能求解方法。',
    category: CompetencyCategory.KNOWLEDGE,
    parentId: competencyAlgorithm.id,
    targetLevel: CompetencyLevel.L3,
    currentLevel: CompetencyLevel.L2,
    assessmentCriteria: '能复现 WalkSAT / ACO-SAT，能解释关键参数并分析实验结果。',
    status: CompetencyStatus.PENDING_VALIDATION,
  })

  const competencyCpp = await repos.competencies.create({
    name: 'C++ 工程能力',
    description: '能够使用现代 C++ 编写可维护的系统代码。',
    category: CompetencyCategory.SKILL,
    parentId: null,
    targetLevel: CompetencyLevel.L4,
    currentLevel: CompetencyLevel.L2,
    assessmentCriteria: '能独立完成模块设计、实现、测试和性能分析。',
    status: CompetencyStatus.LEARNING,
  })

  const competencyLinux = await repos.competencies.create({
    name: 'Linux 系统与驱动',
    description: '理解 Linux 系统编程和字符设备驱动的基本机制。',
    category: CompetencyCategory.SKILL,
    parentId: null,
    targetLevel: CompetencyLevel.L3,
    currentLevel: CompetencyLevel.L1,
    assessmentCriteria: '能阅读驱动框架并实现一个可运行的字符设备驱动。',
    status: CompetencyStatus.LEARNING,
  })

  const competencyResearch = await repos.competencies.create({
    name: '科研阅读与写作',
    description: '能够高效阅读论文、提炼问题并撰写实验分析。',
    category: CompetencyCategory.SOFT_SKILL,
    parentId: null,
    targetLevel: CompetencyLevel.L4,
    currentLevel: CompetencyLevel.L2,
    assessmentCriteria: '每周完成有效论文阅读输出，能写出结构清晰的实验报告。',
    status: CompetencyStatus.LEARNING,
  })

  for (const [directionId, competencyId, level, priority] of [
    [directionResearch.id, competencySat.id, CompetencyLevel.L3, Priority.HIGH],
    [directionResearch.id, competencyAlgorithm.id, CompetencyLevel.L3, Priority.HIGH],
    [directionResearch.id, competencyResearch.id, CompetencyLevel.L4, Priority.MEDIUM],
    [directionEngineering.id, competencyCpp.id, CompetencyLevel.L4, Priority.HIGH],
    [directionEngineering.id, competencyLinux.id, CompetencyLevel.L3, Priority.HIGH],
    [directionEngineering.id, competencySat.id, CompetencyLevel.L2, Priority.LOW],
  ] as const) {
    await repos.directionCompetencies.create({ directionId, competencyId, requiredLevel: level, priority })
  }

  const milestonePaper = await repos.milestones.create({
    directionId: directionResearch.id,
    competencyId: competencySat.id,
    name: '独立完成 SAT 算法复现实验',
    description: '从论文阅读到代码实现、基准测试和实验分析，形成完整复现报告。',
    startDate: at(-14, 9),
    dueDate: at(12, 18),
    importance: Importance.CRITICAL,
    status: MilestoneStatus.IN_PROGRESS,
    successCriteria: '代码可运行、实验可复现、报告能解释关键结果与局限。',
  })

  const milestoneEmbedded = await repos.milestones.create({
    directionId: directionEngineering.id,
    competencyId: competencyLinux.id,
    name: '完成一个嵌入式 Linux 小项目',
    description: '实现字符设备驱动，并在开发板上完成读写验证。',
    startDate: at(7, 9),
    dueDate: at(90, 18),
    importance: Importance.IMPORTANT,
    status: MilestoneStatus.NOT_STARTED,
    successCriteria: '驱动可加载、可读写、有测试记录和复盘。',
  })

  const goalSat = await repos.goals.create({
    title: '掌握 ACO 求解 SAT 的基本原理与实现',
    description: '以论文复现为主线，完成算法实现、基准测试和实验分析。',
    goalType: GoalType.COMPETENCY,
    parentGoalId: null,
    competencyId: competencySat.id,
    startDate: at(-14, 9),
    dueDate: at(12, 18),
    priority: Priority.HIGH,
    successCriteria: '能独立解释算法、运行代码、复现实验并分析结果。',
    status: GoalStatus.ACTIVE,
    progressMode: ProgressMode.TASK_BASED,
    manualProgress: 0,
    reviewFrequency: '每周',
  })

  const goalEmbedded = await repos.goals.create({
    title: '掌握嵌入式 Linux 驱动开发',
    description: '从阅读框架开始，完成一个字符设备驱动和测试记录。',
    goalType: GoalType.COMPETENCY,
    parentGoalId: null,
    competencyId: competencyLinux.id,
    startDate: at(7, 9),
    dueDate: at(90, 18),
    priority: Priority.MEDIUM,
    successCriteria: '能独立编写、加载、调试字符设备驱动。',
    status: GoalStatus.ACTIVE,
    progressMode: ProgressMode.TASK_BASED,
    manualProgress: 0,
    reviewFrequency: '每两周',
  })

  await repos.goalDirections.create({ goalId: goalSat.id, directionId: directionResearch.id })
  await repos.goalDirections.create({ goalId: goalEmbedded.id, directionId: directionEngineering.id })
  await repos.goalMilestones.create({ goalId: goalSat.id, milestoneId: milestonePaper.id })
  await repos.goalMilestones.create({ goalId: goalEmbedded.id, milestoneId: milestoneEmbedded.id })

  const workflow = await repos.workflows.create({
    name: '论文阅读 · 预习到批判',
    description: '用于学术论文的精读与复现准备，强调独立输出和批判性分析。',
    stages: [
      {
        key: 'preview',
        name: '预习',
        goal: '建立论文的整体地图',
        prompt: '先读标题、摘要、图表和结论，写出你认为论文要解决什么问题。',
        suggestedMinutes: 10,
        required: true,
        needsRecord: true,
        externalTool: 'Zotero',
      },
      {
        key: 'input',
        name: '精读输入',
        goal: '理解方法与实验设计',
        prompt: '逐节阅读，标记关键假设、算法步骤和实验设置。',
        suggestedMinutes: 30,
        required: true,
        needsRecord: false,
        externalTool: null,
      },
      {
        key: 'output',
        name: '白纸输出',
        goal: '用自己的语言重建论文',
        prompt: '关闭论文，写出问题、方法、关键步骤和你仍然不确定的地方。',
        suggestedMinutes: 20,
        required: true,
        needsRecord: true,
        externalTool: 'Obsidian',
      },
      {
        key: 'feedback',
        name: '对照反馈',
        goal: '发现理解偏差',
        prompt: '重新打开论文，对照你的输出，标出遗漏和错误。',
        suggestedMinutes: 15,
        required: true,
        needsRecord: true,
        externalTool: null,
      },
      {
        key: 'reflection',
        name: '反思与下一步',
        goal: '形成可执行的学习调整',
        prompt: '写下知识盲区、需要补的基础，以及下一步任务。',
        suggestedMinutes: 10,
        required: false,
        needsRecord: true,
        externalTool: null,
      },
    ],
    applicableTaskTypes: [TaskType.LEARNING, TaskType.REVIEW],
    defaultDuration: 85,
    outputRequirements: '一份可独立阅读的论文摘要与算法流程说明。',
    feedbackRequirements: '至少指出一处理解偏差或知识盲区。',
    externalToolSuggestions: ['Zotero', 'Obsidian'],
  })

  const taskRead = await repos.tasks.create({
    title: '阅读 SAT 局部搜索论文',
    description: '重点理解 WalkSAT 的变量选择机制和噪声参数。',
    taskType: TaskType.LEARNING,
    parentTaskId: null,
    startDate: at(0, 8),
    dueDate: at(0, 22),
    scheduledDate: at(0, 8),
    estimatedDuration: 45,
    actualDuration: 0,
    priority: Priority.HIGH,
    importance: Importance.CRITICAL,
    urgency: Urgency.HIGH,
    status: TaskStatus.TODO,
    completionCriteria: '完成预习、精读，并产出一段白纸输出。',
    learningTemplateId: workflow.id,
  })

  const taskOutput = await repos.tasks.create({
    title: '白纸输出算法流程',
    description: '关闭论文，用自己的语言写出 WalkSAT 的主要执行过程。',
    taskType: TaskType.OUTPUT,
    parentTaskId: null,
    startDate: at(0, 9),
    dueDate: at(0, 22),
    scheduledDate: at(0, 9),
    estimatedDuration: 20,
    actualDuration: 0,
    priority: Priority.HIGH,
    importance: Importance.IMPORTANT,
    urgency: Urgency.MEDIUM,
    status: TaskStatus.TODO,
    completionCriteria: '输出包含变量选择、翻转规则和终止条件。',
    learningTemplateId: null,
  })

  const taskImplement = await repos.tasks.create({
    title: '实现变量选择函数',
    description: '在复现代码中实现 WalkSAT 的变量选择逻辑，并补充单元测试。',
    taskType: TaskType.PRACTICE,
    parentTaskId: null,
    startDate: at(1, 9),
    dueDate: at(3, 22),
    scheduledDate: at(1, 9),
    estimatedDuration: 90,
    actualDuration: 0,
    priority: Priority.MEDIUM,
    importance: Importance.IMPORTANT,
    urgency: Urgency.MEDIUM,
    status: TaskStatus.TODO,
    completionCriteria: '函数通过测试，能在一个小规模 SAT 实例上运行。',
    learningTemplateId: null,
  })

  const taskDriver = await repos.tasks.create({
    title: '阅读 Linux 字符设备驱动框架',
    description: '梳理 file_operations、注册流程和用户态读写路径。',
    taskType: TaskType.LEARNING,
    parentTaskId: null,
    startDate: at(0, 14),
    dueDate: at(2, 22),
    scheduledDate: at(0, 14),
    estimatedDuration: 60,
    actualDuration: 0,
    priority: Priority.MEDIUM,
    importance: Importance.IMPORTANT,
    urgency: Urgency.LOW,
    status: TaskStatus.TODO,
    completionCriteria: '画出驱动注册与读写调用的流程草图。',
    learningTemplateId: null,
  })

  await repos.tasks.create({
    title: '复习：蚁群算法与信息素更新',
    description: '主动回忆信息素更新公式，并解释参数对搜索的影响。',
    taskType: TaskType.REVIEW,
    parentTaskId: null,
    startDate: at(0, 20),
    dueDate: at(0, 22),
    scheduledDate: at(0, 20),
    estimatedDuration: 15,
    actualDuration: 0,
    priority: Priority.LOW,
    importance: Importance.NORMAL,
    urgency: Urgency.MEDIUM,
    status: TaskStatus.TODO,
    completionCriteria: '能不看资料写出更新公式并解释参数。',
    learningTemplateId: null,
  })

  for (const taskId of [taskRead.id, taskOutput.id, taskImplement.id]) {
    await repos.taskGoals.create({ taskId, goalId: goalSat.id })
  }
  await repos.taskGoals.create({ taskId: taskDriver.id, goalId: goalEmbedded.id })

  await repos.taskCompetencies.create({ taskId: taskRead.id, competencyId: competencySat.id })
  await repos.taskCompetencies.create({ taskId: taskOutput.id, competencyId: competencyResearch.id })
  await repos.taskCompetencies.create({ taskId: taskImplement.id, competencyId: competencyCpp.id })
  await repos.taskCompetencies.create({ taskId: taskDriver.id, competencyId: competencyLinux.id })

  await repos.taskDependencies.create({
    predecessorTaskId: taskRead.id,
    successorTaskId: taskOutput.id,
    dependencyType: 'FINISH_TO_START',
  })
  await repos.taskDependencies.create({
    predecessorTaskId: taskOutput.id,
    successorTaskId: taskImplement.id,
    dependencyType: 'FINISH_TO_START',
  })

  await repos.timeboxes.create({
    taskId: taskRead.id,
    plannedStart: at(0, 9),
    plannedEnd: at(0, 9, 45),
    plannedDuration: 45,
    actualStart: null,
    actualEnd: null,
    actualDuration: 0,
    status: 'PLANNED',
    note: '上午专注时段',
  })

  const habitRead = await repos.habits.create({
    name: '打开论文阅读一个自然段',
    description: '把开始阅读的成本降到最低。',
    category: HabitCategory.STARTER,
    anchorType: AnchorType.EVENT,
    anchorDescription: '每天早上坐到书桌前',
    tinyBehavior: '打开论文并阅读一个自然段',
    celebration: '对自己说：很好，我已经开始了。',
    motivationLevel: 4,
    abilityLevel: 5,
    promptStatus: PromptStatus.CLEAR,
    frequency: '每天',
    status: HabitStatus.ACTIVE,
  })

  const habitBreathe = await repos.habits.create({
    name: '学习前深呼吸一分钟',
    description: '在开始困难任务前降低紧张感。',
    category: HabitCategory.SUPPORT,
    anchorType: AnchorType.EVENT,
    anchorDescription: '打开学习工作台之后',
    tinyBehavior: '做三次缓慢深呼吸',
    celebration: '感受肩膀放松，再开始第一步。',
    motivationLevel: 3,
    abilityLevel: 5,
    promptStatus: PromptStatus.CLEAR,
    frequency: '每次学习前',
    status: HabitStatus.ACTIVE,
  })

  await repos.habits.create({
    name: '每天独立学习 25 分钟',
    description: '建立一个稳定的最小学习节奏。',
    category: HabitCategory.SUSTAINER,
    anchorType: AnchorType.TIME,
    anchorDescription: '每天晚饭后',
    tinyBehavior: '打开计时器，独立学习 25 分钟',
    celebration: '在习惯记录里打勾，并写一句今天学到什么。',
    motivationLevel: 3,
    abilityLevel: 4,
    promptStatus: PromptStatus.PARTIAL,
    frequency: '每天',
    status: HabitStatus.ACTIVE,
  })

  await repos.habitLogs.create({
    habitId: habitRead.id,
    occurredAt: at(0, 8, 10),
    anchorTriggered: true,
    tinyCompleted: true,
    expandedCompleted: false,
    celebrationDone: true,
    difficulty: 2,
    obstacle: '',
    note: '读了一个自然段，进入状态比预想快。',
  })

  await repos.habitLogs.create({
    habitId: habitBreathe.id,
    occurredAt: at(0, 8, 20),
    anchorTriggered: true,
    tinyCompleted: true,
    expandedCompleted: false,
    celebrationDone: true,
    difficulty: 1,
    obstacle: '',
    note: '',
  })

  const session = await repos.learningSessions.create({
    taskId: taskRead.id,
    workflowId: workflow.id,
    startedAt: at(0, 8, 30),
    endedAt: at(0, 9, 15),
    currentStage: 'output',
    status: SessionStatus.COMPLETED,
    learningIntention: '理解 WalkSAT 的变量选择机制，并输出算法流程。',
    selfPrediction: 2,
    actualAssessment: 3,
    actualDuration: 45,
  })

  await repos.learningRecords.create({
    sessionId: session.id,
    taskId: taskRead.id,
    recordType: LearningRecordType.INPUT,
    title: '论文核心问题与假设',
    content:
      '论文把 SAT 求解视为在赋值空间中搜索，局部搜索通过单变量翻转逐步降低不满足子句数。',
    externalUrl: '',
    occurredAt: at(0, 8, 50),
    selfAssessment: 3,
  })

  await repos.learningRecords.create({
    sessionId: session.id,
    taskId: taskRead.id,
    recordType: LearningRecordType.OUTPUT,
    title: 'WalkSAT 执行流程草图',
    content:
      '随机初始化赋值；每轮检查是否满足；从未满足子句中选择一个变量；以一定概率随机翻转，否则选择使不满足子句最少的方向。',
    externalUrl: 'obsidian://open?vault=study&file=WalkSAT',
    occurredAt: at(0, 9, 10),
    selfAssessment: 3,
  })

  await repos.learningRecords.create({
    sessionId: session.id,
    taskId: taskRead.id,
    recordType: LearningRecordType.FEEDBACK,
    title: '对噪声参数的理解有偏差',
    content: '原以为噪声概率只影响随机性，实际上它直接调节探索与利用的平衡。',
    externalUrl: '',
    occurredAt: at(0, 9, 12),
    selfAssessment: 2,
  })

  const knowledgeAc = await repos.knowledgeItems.create({
    title: '蚁群算法（ACO）',
    description: '通过信息素和启发式信息构造解的群智能方法。',
    source: 'SAT 复现论文',
    masteryLevel: MasteryLevel.L2,
    lastReviewedAt: at(-2, 20),
  })

  const knowledgePheromone = await repos.knowledgeItems.create({
    title: '信息素更新',
    description: '信息素挥发与沉积共同影响后续搜索的概率分布。',
    source: 'SAT 复现论文',
    masteryLevel: MasteryLevel.L1,
    lastReviewedAt: at(-3, 20),
  })

  const knowledgeWalksat = await repos.knowledgeItems.create({
    title: 'WalkSAT 变量选择',
    description: '在未满足子句中选变量，并以噪声概率决定随机翻转或贪心翻转。',
    source: 'SAT 局部搜索论文',
    masteryLevel: MasteryLevel.L2,
    lastReviewedAt: at(0, 9),
  })

  await repos.sessionKnowledge.create({ sessionId: session.id, knowledgeItemId: knowledgeWalksat.id })
  await repos.sessionKnowledge.create({ sessionId: session.id, knowledgeItemId: knowledgeAc.id })

  await repos.reviewSchedules.create({
    knowledgeItemId: knowledgePheromone.id,
    scheduledAt: at(0, 20),
    completedAt: null,
    recallResult: null,
    difficulty: null,
    nextReviewAt: null,
    externalTool: 'Anki',
    externalUrl: 'anki://browse?search=信息素',
    status: ReviewScheduleStatus.DUE,
  })

  await repos.reviewSchedules.create({
    knowledgeItemId: knowledgeAc.id,
    scheduledAt: at(0, 20),
    completedAt: null,
    recallResult: null,
    difficulty: null,
    nextReviewAt: null,
    externalTool: 'Anki',
    externalUrl: '',
    status: ReviewScheduleStatus.DUE,
  })

  await repos.reviewSchedules.create({
    knowledgeItemId: knowledgeWalksat.id,
    scheduledAt: at(-1, 20),
    completedAt: at(-1, 20, 30),
    recallResult: 4,
    difficulty: 2,
    nextReviewAt: at(6, 20),
    externalTool: 'Anki',
    externalUrl: '',
    status: ReviewScheduleStatus.COMPLETED,
  })

  const evidenceRepo = await repos.evidences.create({
    title: 'ACO-SAT 复现仓库',
    description: '包含 WalkSAT / ACO 的基础实现、测试与基准脚本。',
    evidenceType: EvidenceType.CODE,
    fileUrl: '',
    externalUrl: 'https://github.com/example/aco-sat-reproduction',
    qualityNote: '结构清晰，但实验部分还不完整。',
  })

  const evidenceReport = await repos.evidences.create({
    title: 'WalkSAT 阅读笔记与流程图',
    description: '论文核心方法、变量选择流程与遗留问题。',
    evidenceType: EvidenceType.NOTE,
    fileUrl: '',
    externalUrl: 'obsidian://open?vault=study&file=WalkSAT',
    qualityNote: '能独立复述，但噪声参数部分仍需补强。',
  })

  await repos.competencyEvidences.create({
    competencyId: competencySat.id,
    evidenceId: evidenceRepo.id,
    assessedLevel: CompetencyLevel.L2,
    assessmentNote: '代码可运行，尚未完成完整实验对比。',
    assessedAt: at(0, 10),
  })

  await repos.competencyEvidences.create({
    competencyId: competencySat.id,
    evidenceId: evidenceReport.id,
    assessedLevel: CompetencyLevel.L1,
    assessmentNote: '早期阅读笔记只能复述论文结构，还不能解释算法细节。',
    assessedAt: at(-24, 18),
  })

  await repos.competencyEvidences.create({
    competencyId: competencyResearch.id,
    evidenceId: evidenceReport.id,
    assessedLevel: CompetencyLevel.L2,
    assessmentNote: '输出结构完整，但批判性分析还不足。',
    assessedAt: at(0, 10),
  })

  await repos.resources.create({
    title: '学习闪卡',
    resourceType: ResourceType.ANKI,
    externalUrl: 'anki://',
    description: '用于知识点主动回忆。',
    source: 'Anki',
  })

  await repos.resources.create({
    title: '研究笔记库',
    resourceType: ResourceType.OBSIDIAN,
    externalUrl: 'obsidian://open?vault=study',
    description: '论文笔记、算法草图和复盘输出。',
    source: 'Obsidian',
  })

  await repos.resources.create({
    title: '复现项目仓库',
    resourceType: ResourceType.GITHUB,
    externalUrl: 'https://github.com/example/aco-sat-reproduction',
    description: '代码、实验脚本与结果。',
    source: 'GitHub',
  })

  await repos.externalIntegrations.create({
    provider: 'github',
    name: 'GitHub',
    externalUrl: 'https://github.com',
    settings: { syncMode: 'link-only' },
    status: IntegrationStatus.CONNECTED,
  })

  const review = await repos.reviews.create({
    reviewType: ReviewType.WEEKLY,
    targetDate: at(-1, 21),
    startDate: at(-7, 9),
    endDate: at(-1, 21),
    content:
      '本周论文阅读启动了，但实验实现还没开始。主要问题是低估了背景知识补齐的时间。下周把实现任务拆小，并保留两个完整的实验时段。',
    energyLevel: 3,
    status: ReviewStatus.COMPLETED,
  })

  await repos.reviewFindings.create({
    reviewId: review.id,
    findingType: FindingType.PROBLEM,
    description: '论文阅读计划完成率低，实验实现尚未开始。',
    rootCause: '每篇论文预计阅读时间过短，且低估了补齐概率论基础的时间。',
    proposedAction: '将论文阅读时间从 2 小时调整为 4 小时，并增加一次基础补齐任务。',
  })

  await repos.reviewFindings.create({
    reviewId: review.id,
    findingType: FindingType.EFFECTIVE,
    description: '白纸输出能有效暴露理解偏差。',
    rootCause: '关闭资料后强迫自己重建内容。',
    proposedAction: '保留每次论文学习后的白纸输出环节。',
  })

  await repos.adjustments.create({
    reviewId: review.id,
    targetType: AdjustmentTargetType.TASK,
    targetId: taskRead.id,
    oldValue: '预计 30 分钟',
    newValue: '预计 45 分钟',
    reason: '实际阅读与输出需要更多时间，避免计划持续失真。',
    status: AdjustmentStatus.APPLIED,
  })

  await repos.adjustments.create({
    reviewId: review.id,
    targetType: AdjustmentTargetType.DIRECTION,
    targetId: directionResearch.id,
    oldValue: '每周时间预算 10 小时',
    newValue: '每周时间预算 12 小时',
    reason: '论文阅读与基础补齐需要更稳定的时间块。',
    status: AdjustmentStatus.CONFIRMED,
  })

  await repos.notifications.create({
    title: '今天有 2 个知识点需要复习',
    content: '信息素更新与蚁群算法已经到期，建议在今晚 20:00 前完成主动回忆。',
    notificationType: NotificationType.REVIEW,
    scheduledAt: at(0, 20),
    status: NotificationStatus.PENDING,
  })

  await repos.userSettings.create({
    key: 'appearance.theme',
    value: 'system',
    description: '界面主题：light / dark / system',
  })

  await repos.userSettings.create({
    key: 'review.weekly.day',
    value: 'SUNDAY',
    description: '周复盘默认日期',
  })

}
