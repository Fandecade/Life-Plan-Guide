import { setTimeout as delay } from 'node:timers/promises'
import puppeteer from 'puppeteer-core'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'
const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function dateKey(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
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

async function setInput(page, selector, value) {
  await page.$eval(
    selector,
    (element, next) => {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(element),
        'value',
      )?.set
      setter?.call(element, next)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    },
    value,
  )
}

async function setSelect(page, selector, value) {
  await page.$eval(
    selector,
    (element, next) => {
      element.value = next
      element.dispatchEvent(new Event('change', { bubbles: true }))
    },
    value,
  )
}

async function waitText(page, text, timeout = 15000) {
  await page.waitForFunction(
    (needle) => document.body.innerText.includes(needle),
    { timeout, polling: 100 },
    text,
  )
}

async function waitModalClosed(page, timeout = 8000) {
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'), { timeout })
}

async function toggleChip(page, text, checked) {
  await page.evaluate(
    ({ needle, next }) => {
      const chips = Array.from(document.querySelectorAll('.chip-check'))
      const chip = chips.find((node) => (node.textContent ?? '').includes(needle))
      if (!chip) throw new Error(`未找到选项：${needle}`)
      const input = chip.querySelector('input[type="checkbox"]')
      if (!input) throw new Error('选项缺少复选框')
      if (input.checked !== next) input.click()
    },
    { needle: text, next: checked },
  )
}

async function clickTaskAction(page, title, label) {
  await page.evaluate(
    ({ name, action }) => {
      const nodes = Array.from(document.querySelectorAll('.task-tree-node'))
      const node = nodes.find(
        (element) => (element.querySelector('.task-title')?.textContent ?? '').trim() === name,
      )
      if (!node) throw new Error(`未找到任务节点：${name}`)
      const button = node.querySelector(`button[aria-label="${action}"]`)
      if (!button) throw new Error(`任务节点中未找到操作：${action}`)
      button.scrollIntoView({ block: 'center' })
      button.click()
    },
    { name: title, action: label },
  )
}

async function clickTaskCheck(page, title) {
  await page.evaluate((name) => {
    const nodes = Array.from(document.querySelectorAll('.task-tree-node'))
    const node = nodes.find(
      (element) => (element.querySelector('.task-title')?.textContent ?? '').trim() === name,
    )
    if (!node) throw new Error(`未找到任务节点：${name}`)
    const check = node.querySelector('button.task-check')
    if (!check) throw new Error('任务节点缺少完成按钮')
    check.scrollIntoView({ block: 'center' })
    check.click()
  }, title)
}

async function clickGoalAction(page, title, label) {
  await page.evaluate(
    ({ name, action }) => {
      const cards = Array.from(document.querySelectorAll('.goal-card'))
      const card = cards.find((element) => (element.textContent ?? '').includes(name))
      if (!card) throw new Error(`未找到目标卡：${name}`)
      const button = card.querySelector(`button[aria-label="${action}"]`)
      if (!button) throw new Error(`目标卡未找到操作：${action}`)
      button.scrollIntoView({ block: 'center' })
      button.click()
    },
    { name: title, action: label },
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
  await page.waitForSelector('.seg-control', { timeout: 15000 })
  await clickText(page, '.seg-btn', '卡片')
  await page.waitForSelector('.goal-grid', { timeout: 15000 })
  pass('进入目标与任务')

  const stats = await page.$$eval('.exec-stat .stat-number', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats[0] === '2', `进行中目标应为 2，实际 ${stats[0]}`)
  assert(stats[1] === '5', `未完成任务应为 5，实际 ${stats[1]}`)
  assert(stats[2] === '4', `今日任务应为 4，实际 ${stats[2]}`)
  assert(stats[3] === '1 小时 15 分钟', `本周已安排应为 1 小时 15 分钟，实际 ${stats[3]}`)
  const goalCards = await page.$$eval('.goal-card', (nodes) => nodes.length)
  assert(goalCards === 2, `目标卡应为 2，实际 ${goalCards}`)
  pass('执行概览', `${stats.join(' / ')}，${goalCards} 个目标`)

  await clickText(page, '.header-actions button', '新建目标')
  await page.waitForSelector('#goal-title', { timeout: 8000 })
  await setInput(page, '#goal-title', '完成产品原型并验证需求')
  await setInput(page, '#goal-desc', '从需求假设到可演示原型，完成一轮真实用户验证。')
  await setSelect(page, '#goal-type', 'OUTCOME')
  await setSelect(page, '#goal-status', 'ACTIVE')
  await setSelect(page, '#goal-priority', 'HIGH')
  await setInput(page, '#goal-due', dateKey(45))
  await setInput(page, '#goal-criteria', '原型可演示，完成 5 位用户测试并形成改进清单。')
  const goalCompetencyValue = await page.evaluate(() => {
    const select = document.querySelector('#goal-competency')
    if (!select) return ''
    const option = Array.from(select.options).find((item) =>
      (item.textContent ?? '').includes('SAT 与局部搜索'),
    )
    return option?.value ?? ''
  })
  assert(goalCompetencyValue, '主能力下拉缺少 SAT 与局部搜索')
  await setSelect(page, '#goal-competency', goalCompetencyValue)
  await clickText(page, '.modal-actions button', '创建目标')
  await waitText(page, '目标已创建', 15000)
  await waitModalClosed(page)
  await waitText(page, '完成产品原型并验证需求')
  const newGoalCard = await page.$$eval('.goal-card', (nodes) =>
    nodes.find((node) => (node.textContent ?? '').includes('完成产品原型并验证需求'))?.textContent ?? '',
  )
  assert(newGoalCard.includes('SAT 与局部搜索'), '目标与主能力关联未保存')
  pass('创建目标', '关联主能力 SAT 与局部搜索')

  await clickGoalAction(page, '完成产品原型并验证需求', '编辑目标')
  await page.waitForSelector('#goal-progress-mode', { timeout: 8000 })
  await setSelect(page, '#goal-progress-mode', 'MANUAL')
  await page.waitForSelector('#goal-manual', { timeout: 5000 })
  await setInput(page, '#goal-manual', '40')
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '目标已更新', 15000)
  await waitModalClosed(page)
  const goalProgressText = await page.$$eval('.goal-card', (nodes) =>
    nodes.find((node) => (node.textContent ?? '').includes('完成产品原型并验证需求'))?.textContent ?? '',
  )
  assert(goalProgressText.includes('40%'), '目标人工进度未显示 40%')
  pass('目标进度模式', '人工评估 40%')

  await clickText(page, '.view-tab', '任务')
  await page.waitForSelector('.task-tree', { timeout: 8000 })
  const initialNodes = await page.$$eval('.task-tree-node', (nodes) => nodes.length)
  assert(initialNodes === 5, `初始任务节点应为 5，实际 ${initialNodes}`)
  pass('WBS 任务树', `${initialNodes} 个根任务`)

  await clickText(page, '.header-actions button', '新建任务')
  await page.waitForSelector('#task-title', { timeout: 8000 })
  await setInput(page, '#task-title', '拆解用户需求')
  await setInput(page, '#task-desc', '把用户反馈整理成可验证的需求假设。')
  await setSelect(page, '#task-type', 'OUTPUT')
  await setSelect(page, '#task-status', 'TODO')
  await setSelect(page, '#task-priority', 'HIGH')

  await setInput(page, '#task-scheduled', dateKey(0))
  await setInput(page, '#task-due', dateKey(2))
  await setInput(page, '#task-estimate', '45')
  await setInput(page, '#task-criteria', '形成一份带优先级的需求清单。')
  await toggleChip(page, '完成产品原型并验证需求', true)
  await toggleChip(page, 'SAT 与局部搜索', true)
  await clickText(page, '.modal-actions button', '创建任务')
  await waitText(page, '任务已创建', 15000)
  await waitModalClosed(page)
  await waitText(page, '拆解用户需求')
  pass('创建任务', '关联目标与能力')

  await clickTaskAction(page, '拆解用户需求', '添加子任务')
  await page.waitForSelector('#task-title', { timeout: 8000 })
  await setInput(page, '#task-title', '整理用户访谈记录')
  await setInput(page, '#task-desc', '整理 5 位用户的访谈记录并标注主题。')
  await setSelect(page, '#task-type', 'OUTPUT')

  await setInput(page, '#task-estimate', '30')
  await setInput(page, '#task-criteria', '形成主题编码表和关键引用。')
  await clickText(page, '.modal-actions button', '创建任务')
  await waitText(page, '任务已创建', 15000)
  await waitModalClosed(page)
  await waitText(page, '整理用户访谈记录')
  const afterChild = await page.$$eval('.task-tree-node', (nodes) => nodes.length)
  assert(afterChild === 7, `添加子任务后节点应为 7，实际 ${afterChild}`)
  pass('添加子任务', 'WBS 层级建立')

  await clickTaskCheck(page, '拆解用户需求')
  await waitText(page, '强制完成父任务')
  await waitText(page, '1 个未完成子任务')
  await clickText(page, '.modal-actions button', '返回')
  await waitModalClosed(page)
  pass('父任务完成保护', '有未完成子任务时要求确认')

  await clickTaskCheck(page, '整理用户访谈记录')
  await waitText(page, '任务已完成', 15000)
  await delay(300)
  await clickTaskCheck(page, '拆解用户需求')
  await waitText(page, '任务已完成', 15000)
  pass('完成任务状态机', '先完成子任务，再完成父任务')
  await delay(400)

  await clickTaskAction(page, '阅读 SAT 局部搜索论文', '编辑任务依赖')
  await page.waitForSelector('.dependency-list', { timeout: 8000 })
  await page.evaluate((needle) => {
    const rows = Array.from(document.querySelectorAll('.dependency-row'))
    const row = rows.find((element) => (element.textContent ?? '').includes(needle))
    if (!row) throw new Error(`未找到前置任务：${needle}`)
    const input = row.querySelector('input[type="checkbox"]')
    if (!input) throw new Error('前置任务行缺少复选框')
    input.click()
  }, '白纸输出算法流程')
  await clickText(page, '.modal-actions button', '保存依赖')
  await waitText(page, '环路')
  pass('依赖环路校验', '阻止反向依赖形成循环')
  await clickText(page, '.modal-actions button', '取消')
  await waitModalClosed(page)

  await clickTaskAction(page, '整理用户访谈记录', '编辑任务依赖')
  await page.waitForSelector('.dependency-list', { timeout: 8000 })
  await page.evaluate((needle) => {
    const rows = Array.from(document.querySelectorAll('.dependency-row'))
    const row = rows.find((element) => (element.textContent ?? '').includes(needle))
    if (!row) throw new Error(`未找到前置任务：${needle}`)
    const input = row.querySelector('input[type="checkbox"]')
    if (!input) throw new Error('前置任务行缺少复选框')
    input.click()
  }, '拆解用户需求')
  await clickText(page, '.modal-actions button', '保存依赖')
  await waitText(page, '任务依赖已更新', 15000)
  await waitModalClosed(page)
  await waitText(page, '1 个前置')
  pass('任务依赖', '前置任务被保存并显示')

  await clickText(page, '.seg-btn', '看板')
  await page.waitForSelector('.kanban-board', { timeout: 8000 })
  const kanbanColumns = await page.$$eval('.kanban-column', (nodes) => nodes.length)
  assert(kanbanColumns === 3, `看板应有 3 列，实际 ${kanbanColumns}`)
  await waitText(page, '拆解用户需求')
  pass('任务看板视图', '3 列状态视图，任务上下文保留')
  await clickText(page, '.seg-btn', 'WBS')

  await clickText(page, '.view-tab', '时间盒')
  await page.waitForSelector('.timebox-card', { timeout: 8000 })
  const initialGroups = await page.$$eval('.timebox-group', (nodes) => nodes.length)
  assert(initialGroups === 1, `初始时间盒分组应为 1，实际 ${initialGroups}`)

  await clickText(page, '.timebox-card button', '安排时间盒')
  await page.waitForSelector('#timebox-goal', { timeout: 8000 })
  const goalOption = await page.$$eval('#timebox-goal option', (options) => {
    const option = options.find((item) => (item.textContent ?? '').includes('掌握 ACO'))
    return option ? option.value : ''
  })
  assert(goalOption, '时间盒目标选项缺少 ACO 目标')
  await setSelect(page, '#timebox-goal', goalOption)
  await page.waitForFunction(
    () => (document.querySelector('#timebox-task')?.options.length ?? 0) > 1,
    { timeout: 8000 },
  )
  const filteredTaskOptions = await page.$$eval('#timebox-task option', (options) =>
    options.map((item) => item.textContent.trim()).filter(Boolean),
  )
  assert(
    filteredTaskOptions.some((text) => text.includes('阅读 SAT')),
    '按目标筛选后缺少阅读任务',
  )
  pass('时间盒按目标筛选任务', '选择 ACO 目标后任务范围收敛')
  await page.waitForSelector('#timebox-task', { timeout: 8000 })
  const taskOptions = await page.$$eval('#timebox-task option', (options) =>
    options.map((option) => ({ value: option.value, text: option.textContent.trim() })),
  )
  const readOption = taskOptions.find((option) => option.text.includes('阅读 SAT'))
  assert(readOption, '时间盒任务选项缺少阅读任务')
  await setSelect(page, '#timebox-task', readOption.value)
  await setInput(page, '#timebox-start', `${dateKey(1)}T10:00`)
  await setInput(page, '#timebox-end', `${dateKey(1)}T10:45`)
  await clickText(page, '.modal-actions button', '安排时间盒')
  await waitText(page, '时间盒已安排', 15000)
  await waitModalClosed(page)
  const groupsAfter = await page.$$eval('.timebox-group', (nodes) => nodes.length)
  assert(groupsAfter === 2, `新增时间盒后应有 2 个分组，实际 ${groupsAfter}`)
  pass('安排时间盒', '未来日期分组')

  await clickText(page, '.timebox-card button', '安排时间盒')
  await page.waitForSelector('#timebox-task', { timeout: 8000 })
  const taskOptions2 = await page.$$eval('#timebox-task option', (options) =>
    options.map((option) => ({ value: option.value, text: option.textContent.trim() })),
  )
  const readOption2 = taskOptions2.find((option) => option.text.includes('阅读 SAT'))
  await setSelect(page, '#timebox-task', readOption2.value)
  await setInput(page, '#timebox-start', `${dateKey(1)}T10:15`)
  await setInput(page, '#timebox-end', `${dateKey(1)}T11:00`)
  await clickText(page, '.modal-actions button', '安排时间盒')
  await waitText(page, '时间冲突')
  pass('时间冲突保护', '重叠时段被阻止')
  await clickText(page, '.modal-actions button', '取消')
  await waitModalClosed(page)

  const timeboxItems = await page.$$('.timebox-item')
  let editedTimebox = false
  for (const item of timeboxItems) {
    const content = await item.evaluate((node) => (node.textContent ?? '').trim())
    if (!content.includes('10:00 – 10:45')) continue
    const editButton = await item.$('button[aria-label="编辑时间盒"]')
    if (!editButton) throw new Error('时间盒缺少编辑按钮')
    await editButton.click()
    editedTimebox = true
    break
  }
  assert(editedTimebox, '未找到新建的时间盒')
  await page.waitForSelector('#timebox-status', { timeout: 8000 })
  await setSelect(page, '#timebox-status', 'COMPLETED')
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '时间盒已更新', 15000)
  await waitModalClosed(page)
  pass('完成时间盒', '状态与任务实际耗时联动')

  await clickText(page, '.view-tab', '任务')
  await waitText(page, '实际 45 分钟')
  pass('任务实际耗时', '由已完成时间盒累计')

  await clickText(page, '.view-tab', '时间盒')
  await delay(350)
  await page.evaluate((needle) => {
    const items = Array.from(document.querySelectorAll('.timebox-item'))
    const item = items.find((element) => (element.textContent ?? '').includes(needle))
    if (!item) {
      throw new Error(
        `未找到时间盒项：${needle}；现有：${items
          .map((element) => (element.textContent ?? '').trim().replace(/\s+/g, ' '))
          .join(' | ')}`,
      )
    }
    const button = item.querySelector('button[aria-label="删除时间盒"]')
    if (!button) throw new Error('时间盒缺少删除按钮')
    button.click()
  }, '10:00 – 10:45')
  await page.waitForFunction(
    () => (document.querySelector('.modal-title')?.textContent ?? '').includes('删除时间盒'),
    { timeout: 10000 },
  )
  await clickText(page, '.modal-actions button', '确认删除')
  await waitText(page, '时间盒已删除', 15000)
  await waitModalClosed(page)
  pass('删除时间盒')

  await clickText(page, '.view-tab', '任务')
  await delay(200)
  await clickTaskAction(page, '整理用户访谈记录', '归档任务')
  await waitText(page, '归档内容')
  await clickText(page, '.modal-actions button', '确认归档')
  await waitText(page, '已归档，可随时恢复', 15000)
  await waitModalClosed(page)
  await delay(300)
  const hiddenTask = await page.$$eval('.task-tree-node', (nodes) =>
    nodes.some((node) => (node.textContent ?? '').includes('整理用户访谈记录')),
  )
  assert(!hiddenTask, '归档任务仍显示在任务树中')
  await clickText(page, '.toolbar-actions button', '显示已归档')
  await delay(300)
  await clickTaskAction(page, '整理用户访谈记录', '恢复任务')
  await waitText(page, '恢复内容')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  await clickText(page, '.toolbar-actions button', '隐藏已归档')
  pass('归档与恢复任务')

  await page.screenshot({ path: '/tmp/growth-os-goals-tasks.png', fullPage: true })
  pass('目标与任务截图', '/tmp/growth-os-goals-tasks.png')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.seg-control', { timeout: 15000 })
  await clickText(page, '.seg-btn', '卡片')
  await page.waitForSelector('.goal-grid', { timeout: 15000 })
  await waitText(page, '完成产品原型并验证需求')
  await clickText(page, '.view-tab', '任务')
  await waitText(page, '拆解用户需求')
  await waitText(page, '整理用户访谈记录')
  pass('刷新后持久化')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\n阶段 4 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-stage4-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\n阶段 4 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}