import { TaskType, type WorkflowStage } from '@/domain'

export interface WorkflowPreset {
  key: string
  name: string
  description: string
  stages: WorkflowStage[]
  applicableTaskTypes: TaskType[]
  defaultDuration: number
  outputRequirements: string
  feedbackRequirements: string
  externalToolSuggestions: string[]
}

function stage(
  key: string,
  name: string,
  goal: string,
  prompt: string,
  suggestedMinutes: number,
  externalTool: string | null = null,
  required = true,
  needsRecord = true,
  checklist: string[] = [],
): WorkflowStage {
  return { key, name, goal, prompt, suggestedMinutes, required, needsRecord, externalTool, checklist }
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    key: 'concept',
    name: '概念学习 · 输入到回忆',
    description: '用于理解定义、理论和基本概念，强调关闭资料后的主动回忆。',
    stages: [
      stage('input', '输入', '建立初步理解', '阅读材料，标记定义、前提和关键例子。', 20, null, true, true, [
        '读一遍材料，标记定义、前提与关键例子',
        '用一句话写出这个概念的适用场景',
        '标出仍然不清楚的术语',
      ]),
      stage('recall', '主动回忆', '在不看资料的情况下重建概念', '关闭资料，用自己的语言写出定义与一个例子。', 10, 'Obsidian', true, true, [
        '关掉资料，写下定义',
        '补一个自己的例子',
        '写出它与相近概念的区别',
      ]),
      stage('feedback', '对照反馈', '发现遗漏和误解', '重新打开资料，对照并标出偏差。', 10, null, true, true, [
        '打开资料逐条对照',
        '标出遗漏与说错的地方',
        '把偏差整理成一条待补清单',
      ]),
    ],
    applicableTaskTypes: [TaskType.LEARNING, TaskType.REVIEW],
    defaultDuration: 40,
    outputRequirements: '一段可独立阅读的概念解释和一个例子。',
    feedbackRequirements: '至少指出一处遗漏或理解偏差。',
    externalToolSuggestions: ['Obsidian', 'Anki'],
  },
  {
    key: 'feynman',
    name: '费曼学习 · 解释与重学',
    description: '用于复杂概念，通过向假想听众解释来暴露知识盲区。',
    stages: [
      stage('input', '输入', '获得基本材料', '阅读或观看材料，不做详细笔记。', 20, null, true, true, [
        '通读材料，不做细节笔记',
        '圈出必须讲清楚的核心概念',
        '确定你要讲给谁听',
      ]),
      stage('explain', '尝试解释', '用简单语言讲清楚', '假装向一个初学者解释，不使用术语堆砌。', 15, 'Obsidian', true, true, [
        '不用术语，向初学者解释一遍',
        '为每个抽象概念补一个类比',
        '记录解释中断的位置',
      ]),
      stage('feedback', '找出卡点', '定位无法解释的部分', '标记解释中断、含糊或依赖背诵的地方。', 10, null, true, true, [
        '回看自己的解释',
        '标出含糊、背诵式或跳跃的地方',
        '选出最关键的 1–2 个卡点',
      ]),
      stage('relearn', '针对性重学', '补齐知识盲区', '只回到材料中不理解的部分重新学习。', 15, null, true, true, [
        '只回到卡点对应的材料',
        '补一个反例或边界条件',
        '把新理解写进原解释稿',
      ]),
      stage('explain-again', '再次解释', '验证理解是否改善', '重新完整解释一遍，并写出仍然不确定的地方。', 10, 'Obsidian', false, true, [
        '重新完整解释一遍',
        '确认上次卡点是否讲清',
        '写下仍然不确定的部分',
      ]),
    ],
    applicableTaskTypes: [TaskType.LEARNING, TaskType.OUTPUT],
    defaultDuration: 70,
    outputRequirements: '一份面向初学者的解释稿。',
    feedbackRequirements: '列出至少两个解释卡点及补充材料。',
    externalToolSuggestions: ['Obsidian'],
  },
  {
    key: 'paper',
    name: '论文阅读 · 预习到批判',
    description: '用于学术论文精读与复现准备，强调独立输出和批判性分析。',
    stages: [
      stage('preview', '预习', '建立论文整体地图', '先读标题、摘要、图表和结论，写出论文试图解决的问题。', 10, 'Zotero', true, true, [
        '读标题、摘要、图表和结论',
        '写出论文试图解决的问题',
        '列出 3 个阅读时要验证的问题',
      ]),
      stage('input', '精读输入', '理解方法与实验', '逐节阅读，标记关键假设、算法步骤和实验设置。', 30, null, true, false, [
        '逐节阅读方法与实验',
        '标记关键假设、算法步骤和实验设置',
        '记录不懂的段落与术语',
      ]),
      stage('output', '白纸输出', '重建论文核心', '关闭论文，写出问题、方法、关键步骤和仍不确定的地方。', 20, 'Obsidian', true, true, [
        '关闭论文，写出问题、方法与关键步骤',
        '画出算法流程图',
        '标出仍然不确定的地方',
      ]),
      stage('feedback', '对照反馈', '发现理解偏差', '重新打开论文，对照输出并标出遗漏与错误。', 15, null, true, true, [
        '重新打开论文对照输出',
        '标出遗漏、错误和过度推断',
        '把偏差整理成待补清单',
      ]),
      stage('reflection', '反思与下一步', '形成学习调整', '写下知识盲区、需要补的基础和下一步任务。', 10, null, false, true, [
        '写下知识盲区',
        '确定需要补的基础',
        '生成下一步任务',
      ]),
    ],
    applicableTaskTypes: [TaskType.LEARNING, TaskType.REVIEW],
    defaultDuration: 85,
    outputRequirements: '一份论文摘要与算法流程说明。',
    feedbackRequirements: '至少指出一处理解偏差或知识盲区。',
    externalToolSuggestions: ['Zotero', 'Obsidian'],
  },
  {
    key: 'algorithm',
    name: '算法学习 · 推导到实现',
    description: '用于算法原理、数学推导与代码实现结合的学习任务。',
    stages: [
      stage('input', '原理输入', '理解算法思想', '阅读材料，写清楚输入、输出、核心循环与终止条件。', 25, null, true, true, [
        '写清输入、输出与核心循环',
        '标出终止条件与复杂度',
        '记录不懂的推导步骤',
      ]),
      stage('pseudocode', '伪代码', '独立重建算法步骤', '不看原文写出伪代码并标注复杂度。', 15, 'Obsidian', true, true, [
        '不看原文写出伪代码',
        '标注每一步的复杂度',
        '用一个最小样例手工走一遍',
      ]),
      stage('derive', '推导验证', '验证正确性与边界', '尝试推导关键性质，检查边界条件和反例。', 20, null, true, true, [
        '推导关键性质',
        '检查边界条件和反例',
        '记录推导中断的位置',
      ]),
      stage('implement', '代码实现', '把理解转化为可运行代码', '实现核心逻辑并跑一个最小测试。', 40, 'VS Code', true, true, [
        '实现核心逻辑',
        '跑一个最小测试',
        '记录失败与修正过程',
      ]),
      stage('feedback', '测试反馈', '用结果检验理解', '运行测试，记录失败原因和修正过程。', 15, 'GitHub', true, true, [
        '运行测试并记录结果',
        '对照伪代码找差异',
        '写下下一轮要补的测试',
      ]),
    ],
    applicableTaskTypes: [TaskType.LEARNING, TaskType.PRACTICE, TaskType.PROJECT],
    defaultDuration: 115,
    outputRequirements: '可运行代码、测试记录和复杂度说明。',
    feedbackRequirements: '至少记录一次失败或修正。',
    externalToolSuggestions: ['VS Code', 'GitHub'],
  },
  {
    key: 'project',
    name: '项目实践 · 需求到反馈',
    description: '用于工程实践与项目任务，以可交付成果和反馈为核心。',
    stages: [
      stage('require', '需求澄清', '明确要解决的问题', '写出用户、场景、约束和本次迭代的完成条件。', 15, 'Obsidian', true, true, [
        '写清用户、场景与约束',
        '定义本次迭代的完成条件',
        '列出这次明确不做什么',
      ]),
      stage('design', '方案设计', '做出可执行的取舍', '列出至少两个方案，说明选择理由和风险。', 20, null, true, true, [
        '列出至少两个方案',
        '说明选择理由与风险',
        '标出需要验证的假设',
      ]),
      stage('implement', '实现', '产出可运行结果', '完成本次迭代的核心实现。', 60, 'VS Code', true, true, [
        '完成本次迭代的核心实现',
        '保持一个可运行的最小闭环',
        '记录临时取舍',
      ]),
      stage('test', '测试与验证', '验证结果是否可信', '运行测试或用户验证，记录结果。', 20, 'GitHub', true, true, [
        '运行测试或用户验证',
        '记录结果与失败原因',
        '确认完成条件是否满足',
      ]),
      stage('feedback', '反馈与调整', '形成下一轮改进', '总结问题、原因和下一步行动。', 15, null, true, true, [
        '总结问题与原因',
        '形成下一轮改进项',
        '更新任务或目标',
      ]),
    ],
    applicableTaskTypes: [TaskType.PROJECT, TaskType.PRACTICE, TaskType.OUTPUT],
    defaultDuration: 130,
    outputRequirements: '本次迭代的可运行成果与测试记录。',
    feedbackRequirements: '至少得到一个可验证的反馈。',
    externalToolSuggestions: ['VS Code', 'GitHub'],
  },
]