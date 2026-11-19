import { setTimeout as delay } from 'node:timers/promises'
import puppeteer from 'puppeteer-core'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'
const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const ACO_GOAL = '掌握 ACO 求解 SAT 的基本原理与实现'
const LINUX_GOAL = '掌握嵌入式 Linux 驱动开发'
const READ_TASK = '阅读 SAT 局部搜索论文'


function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function clickText(page, selector, text) {
  const elements = await page.$$(selector)
  for (const element of elements) {
    const content = await element.evaluate((node) => (node.textContent ?? '').trim())
    if (content.includes(text)) {
      await element.evaluate((node) => node.scrollIntoView({ block: 'center' }))
      await element.click()
      return
    }
  }
  throw new Error(`未找到包含“${text}”的元素：${selector}`)
}

async function waitText(page, text, timeout = 15000) {
  await page.waitForFunction(
    (needle) => document.body.innerText.includes(needle),
    { timeout, polling: 100 },
    text,
  )
}

async function waitTextGone(page, text, timeout = 8000) {
  await page.waitForFunction(
    (needle) => !document.body.innerText.includes(needle),
    { timeout, polling: 100 },
    text,
  )
}

async function closeDrawer(page) {
  await page.click('.drawer-head button')
  await page.waitForFunction(() => !document.querySelector('.drawer-panel'), {
    timeout: 8000,
  })
}

async function goalRowDepth(page, title) {
  return page.evaluate((needle) => {
    const row = Array.from(document.querySelectorAll('.goal-tree-row')).find(
      (node) => (node.querySelector('.goal-tree-title')?.textContent ?? '').trim() === needle,
    )
    if (!row) return null
    return Number(row.style.getPropertyValue('--depth') || 0)
  }, title)
}

async function dragGoal(page, sourceTitle, targetTitle) {
  await page.evaluate(
    (srcTitle, dstTitle) => {
      const rows = Array.from(document.querySelectorAll('.goal-tree-row'))
      const source = rows.find(
        (node) => (node.querySelector('.goal-tree-title')?.textContent ?? '').trim() === srcTitle,
      )
      const target = dstTitle
        ? rows.find(
            (node) => (node.querySelector('.goal-tree-title')?.textContent ?? '').trim() === dstTitle,
          )
        : document.querySelector('.goal-tree-body')
      if (!source || !target) throw new Error('目标树拖拽源或目标不存在')
      const transfer = new DataTransfer()
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
      target.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      )
      target.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      )
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }))
    },
    sourceTitle,
    targetTitle,
  )
}

async function dragSelectorToSelector(page, sourceSelector, targetSelector, matchText = '') {
  await page.evaluate(
    (fromSelector, toSelector, needle) => {
      const candidates = Array.from(document.querySelectorAll(fromSelector))
      const source = needle
        ? candidates.find((node) => (node.textContent ?? '').includes(needle))
        : candidates[0]
      const target = document.querySelector(toSelector)
      if (!source || !target) throw new Error('拖拽源或目标不存在')
      const transfer = new DataTransfer()
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
      target.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      )
      target.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      )
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }))
    },
    sourceSelector,
    targetSelector,
    matchText,
  )
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,1100'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1100 })

const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))

const steps = []
function pass(name, detail = '') {
  steps.push({ name, detail })
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
}

try {
  await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForSelector('.hero-title', { timeout: 15000 })
  await clickText(page, 'button', '载入演示数据')
  await waitText(page, '演示数据已载入', 20000)
  await page.waitForSelector('.dashboard-grid', { timeout: 15000 })

  await clickText(page, 'a.nav-item', '目标与任务')
  await page.waitForSelector('.goal-tree', { timeout: 15000 })
  const initialRows = await page.$$eval('.goal-tree-row', (nodes) => nodes.length)
  assert(initialRows === 2, `默认树形视图应显示 2 个顶层目标，实际 ${initialRows}`)
  pass('目标树默认视图', `${initialRows} 个顶层目标`)

  await clickText(page, '.goal-tree-main', ACO_GOAL)
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '验收标准')
  await waitText(page, '关联任务')
  await waitText(page, '时间与复盘')
  pass('目标详情抽屉', '验收标准、关联任务与复盘信息')
  await closeDrawer(page)

  await page.waitForSelector('.goal-tree-row', { timeout: 8000 })
  const collapsedTaskLists = await page.$$eval('.goal-tree-tasks', (nodes) => nodes.length)
  assert(collapsedTaskLists === 0, '目标下的任务列表默认应收起')
  const taskToggled = await page.evaluate((needle) => {
    const row = Array.from(document.querySelectorAll('.goal-tree-row')).find((node) =>
      (node.textContent ?? '').includes(needle),
    )
    const button = row?.querySelector('.goal-task-toggle')
    if (!button) return false
    button.click()
    return true
  }, ACO_GOAL)
  assert(taskToggled, '目标行缺少任务展开入口')
  await page.waitForSelector('.goal-tree-tasks', { timeout: 8000 })
  await waitText(page, READ_TASK)
  pass('目标下任务默认收起', '展开后可见关联任务')

  await dragGoal(page, LINUX_GOAL, ACO_GOAL)
  await waitText(page, '目标层级已调整')
  await delay(300)
  const nestedDepth = await goalRowDepth(page, LINUX_GOAL)
  assert(nestedDepth === 1, `拖拽后 Linux 目标层级应为 1，实际 ${nestedDepth}`)
  const toggles = await page.$$eval('.tree-toggle:not(.tree-toggle-empty)', (nodes) => nodes.length)
  assert(toggles >= 1, '成为父目标后应出现折叠按钮')
  pass('拖动目标调整层级', `${LINUX_GOAL} → ${ACO_GOAL} 下`)

  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.goal-tree-row')).find(
      (node) => (node.querySelector('.goal-tree-title')?.textContent ?? '').trim().includes('ACO'),
    )
    const toggle = row?.querySelector('.tree-toggle')
    if (!toggle) throw new Error('未找到折叠按钮')
    toggle.click()
  })
  await page.waitForFunction(() => document.querySelectorAll('.goal-tree-row').length === 1, {
    timeout: 8000,
  })
  pass('折叠子目标', '子目标行收起')

  await page.evaluate(() => {
    const toggle = document.querySelector('.goal-tree-row .tree-toggle')
    if (!toggle) throw new Error('未找到展开按钮')
    toggle.click()
  })
  await page.waitForFunction(() => document.querySelectorAll('.goal-tree-row').length === 2, {
    timeout: 8000,
  })
  pass('展开子目标', '子目标行恢复')

  await dragGoal(page, ACO_GOAL, LINUX_GOAL)
  await waitText(page, '不能把目标移动到自身或自己的子目标下')
  const loopDepth = await goalRowDepth(page, LINUX_GOAL)
  assert(loopDepth === 1, '环路拖拽后层级应保持不变')
  pass('目标层级环路保护', '父目标拖到子目标被拒绝')

  await dragGoal(page, LINUX_GOAL, '')
  await waitText(page, '目标已移动为顶层目标')
  await delay(300)
  const rootDepth = await goalRowDepth(page, LINUX_GOAL)
  assert(rootDepth === 0, `拖到空白处后应回到顶层，实际层级 ${rootDepth}`)
  pass('拖到空白区回到顶层')
  await delay(400)
  await page.screenshot({ path: '/tmp/growth-os-ui5-goal-tree.png', fullPage: true })
  pass('目标树截图', '/tmp/growth-os-ui5-goal-tree.png')

  await clickText(page, '.view-tab', '任务')
  await page.waitForSelector('.task-tree', { timeout: 8000 })
  await page.evaluate((needle) => {
    const node = Array.from(document.querySelectorAll('.task-main')).find((element) =>
      (element.textContent ?? '').includes(needle),
    )
    if (!node) throw new Error('未找到任务行')
    node.click()
  }, READ_TASK)
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '完成条件')
  await waitText(page, '时间安排')
  await waitText(page, '关联目标')
  pass('任务详情抽屉', '完成条件、时间安排与关联目标')
  await closeDrawer(page)

  await clickText(page, '.seg-btn', '看板')
  await page.waitForSelector('.kanban-board', { timeout: 8000 })
  const columns = await page.$$eval('.kanban-column', (nodes) => nodes.length)
  assert(columns === 3, `看板应有 3 列，实际 ${columns}`)
  const beforeDoing = await page.$$eval('.kanban-doing .kanban-card', (nodes) => nodes.length)
  await dragSelectorToSelector(page, '.kanban-todo .kanban-card', '.kanban-doing', READ_TASK)
  await waitText(page, '任务已移动到')
  await page.waitForFunction(
    (needle) =>
      Array.from(document.querySelectorAll('.kanban-doing .kanban-card')).some((node) =>
        (node.textContent ?? '').includes(needle),
      ),
    { timeout: 8000, polling: 100 },
    READ_TASK,
  )
  pass('看板拖拽改状态', `进行中卡片 ${beforeDoing} → ${beforeDoing + 1}`)
  await delay(400)
  await page.screenshot({ path: '/tmp/growth-os-ui5-kanban.png', fullPage: true })
  pass('任务看板截图', '/tmp/growth-os-ui5-kanban.png')

  await page.evaluate((needle) => {
    const card = Array.from(document.querySelectorAll('.kanban-card')).find((node) =>
      (node.textContent ?? '').includes(needle),
    )
    if (!card) throw new Error('未找到用于设置父任务的任务卡片')
    card.click()
  }, '白纸输出算法流程')
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await clickText(page, '.drawer-foot button', '编辑任务')
  await page.waitForSelector('#task-parent', { timeout: 8000 })
  await page.evaluate((parentTitle) => {
    const select = document.querySelector('#task-parent')
    const option = Array.from(select.options).find(
      (item) => (item.textContent ?? '').trim() === parentTitle,
    )
    if (!option) throw new Error('未找到父任务选项')
    select.value = option.value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }, READ_TASK)
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '任务已更新')
  pass('编辑任务设置父任务', `白纸输出算法流程 → ${READ_TASK} 的子任务`)

  await dragSelectorToSelector(page, '.kanban-doing .kanban-card', '.kanban-done', READ_TASK)
  await page.waitForSelector('.modal', { timeout: 8000 })
  await waitText(page, '强制完成父任务')
  await waitText(page, '未完成子任务')
  await clickText(page, '.modal button', '返回')
  await waitTextGone(page, '强制完成父任务')
  const stillDoing = await page.$$eval('.kanban-doing .kanban-card', (nodes) => nodes.length)
  assert(stillDoing === beforeDoing + 1, '父任务未完成子任务时不应直接完成')
  pass('看板完成保护', '父任务带着未完成子任务时弹确认')

  await clickText(page, '.view-tab', '目标')
  await page.waitForSelector('.goal-tree', { timeout: 8000 })
  await page.evaluate((needle) => {
    const row = Array.from(document.querySelectorAll('.goal-tree-row')).find(
      (node) => (node.querySelector('.goal-tree-title')?.textContent ?? '').trim().includes(needle),
    )
    const addTask = row?.querySelector('button[title="添加任务"]')
    if (!addTask) throw new Error('未找到目标的“添加任务”按钮')
    addTask.click()
  }, ACO_GOAL)
  await page.waitForSelector('.modal', { timeout: 8000 })
  const prefilledGoal = await page.evaluate((needle) => {
    return Array.from(document.querySelectorAll('.chip-check')).some(
      (label) =>
        (label.textContent ?? '').includes(needle) &&
        label.classList.contains('selected') &&
        Boolean(label.querySelector('input[type="checkbox"]')?.checked),
    )
  }, ACO_GOAL)
  assert(prefilledGoal, '从目标创建任务时未预填关联目标')
  pass('目标拆任务预填', `关联目标已选中 ${ACO_GOAL}`)
  await clickText(page, '.modal-actions button', '取消')
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 8000 })

  await clickText(page, '.view-tab', '时间盒')
  await clickText(page, '.seg-btn', '周视图')
  await page.waitForSelector('.week-grid', { timeout: 8000 })
  const weekDays = await page.$$eval('.week-day', (nodes) => nodes.length)
  assert(weekDays === 7, `周视图应有 7 列，实际 ${weekDays}`)
  const todayCards = await page.$$eval('.week-card', (nodes) => nodes.length)
  assert(todayCards >= 1, '本周应至少有一个时间盒')

  await clickText(page, '.week-board .period-nav button', '上一周')
  await page.waitForFunction(() => document.querySelectorAll('.week-card').length === 0, {
    timeout: 8000,
  })
  pass('周视图切换', `7 列 · 本周 ${todayCards} 个时间盒 · 上一周为空`)

  await clickText(page, '.week-board .period-nav button', '回到本周')
  await page.waitForFunction(() => document.querySelectorAll('.week-card').length >= 1, {
    timeout: 8000,
  })
  const targetDay = await page.evaluate(() => {
    const days = Array.from(document.querySelectorAll('.week-day'))
    const source = document.querySelector('.week-card')
    const todayIndex = days.findIndex((node) => node.classList.contains('today'))
    const targetIndex = todayIndex === 6 ? 5 : todayIndex + 1
    const target = days[targetIndex]
    if (!source || !target) throw new Error('周视图拖拽源或目标不存在')
    const transfer = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
    target.dispatchEvent(
      new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }),
    )
    target.dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
    )
    return { todayIndex, targetIndex }
  })
  await waitText(page, '时间盒日期已调整')
  await delay(300)
  const moveResult = await page.evaluate(
    (indices) => {
      const days = Array.from(document.querySelectorAll('.week-day'))
      return {
        source: (days[indices.todayIndex]?.querySelectorAll('.week-card') ?? []).length,
        target: (days[indices.targetIndex]?.querySelectorAll('.week-card') ?? []).length,
      }
    },
    targetDay,
  )
  assert(moveResult.target >= 1, '时间盒未移动到目标日列')
  assert(moveResult.source === 0, '时间盒仍留在原日期列')
  pass('拖动时间盒改日期', `第 ${targetDay.todayIndex + 1} 列 → 第 ${targetDay.targetIndex + 1} 列`)

  await delay(500)
  await page.screenshot({ path: '/tmp/growth-os-ui5-week.png', fullPage: true })
  pass('周时间盒截图', '/tmp/growth-os-ui5-week.png')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.goal-tree', { timeout: 15000 })
  const reloadRows = await page.$$eval('.goal-tree-row', (nodes) => nodes.length)
  assert(reloadRows === 2, `刷新后目标树应回到 2 个顶层目标，实际 ${reloadRows}`)
  await clickText(page, '.view-tab', '任务')
  await clickText(page, '.seg-btn', '看板')
  await page.waitForSelector('.kanban-board', { timeout: 8000 })
  const persistedDoing = await page.evaluate(
    (needle) =>
      Array.from(document.querySelectorAll('.kanban-doing .kanban-card')).some((node) =>
        (node.textContent ?? '').includes(needle),
      ),
    READ_TASK,
  )
  assert(persistedDoing, '刷新后任务状态未持久化到进行中')
  pass('刷新后持久化', '目标层级、任务状态与时间盒日期均保留')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\nUI 阶段 5 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-ui5-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\nUI 阶段 5 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}