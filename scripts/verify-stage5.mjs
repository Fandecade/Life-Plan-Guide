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

async function selectOptionByText(page, selector, text) {
  const options = await page.$$eval(selector, (nodes) =>
    nodes.map((node) => ({ value: node.value, text: (node.textContent ?? '').trim() })),
  )
  const option = options.find((item) => item.text.includes(text))
  if (!option) throw new Error(`下拉框没有选项：${text}`)
  await setSelect(page, selector, option.value)
  return option
}

async function clickCardAction(page, cardSelector, text, label) {
  await page.evaluate(
    ({ selector, needle, action }) => {
      const cards = Array.from(document.querySelectorAll(selector))
      const card = cards.find((node) => (node.textContent ?? '').includes(needle))
      if (!card) throw new Error(`未找到卡片：${needle}`)
      const button = card.querySelector(`button[aria-label="${action}"]`)
      if (!button) throw new Error(`卡片缺少操作：${action}`)
      button.scrollIntoView({ block: 'center' })
      button.click()
    },
    { selector: cardSelector, needle: text, action: label },
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

  await clickText(page, 'a.nav-item', '学习系统')
  await page.waitForSelector('.learning-stats', { timeout: 15000 })
  pass('进入学习系统')

  const stats = await page.$$eval('.learning-stat .stat-number', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats[0] === '1', `学习会话应为 1，实际 ${stats[0]}`)
  assert(stats[1] === '45 分钟', `本周学习时长应为 45 分钟，实际 ${stats[1]}`)
  assert(stats[2] === '3', `知识点应为 3，实际 ${stats[2]}`)
  assert(stats[3] === '2', `待复习应为 2，实际 ${stats[3]}`)
  await waitText(page, '开始一次学习会话')
  pass('学习概览', stats.join(' / '))

  await selectOptionByText(page, '#start-task', '阅读 SAT 局部搜索论文')
  await selectOptionByText(page, '#start-workflow', '论文阅读')
  await setInput(page, '#start-intention', '理解 WalkSAT 变量选择，并独立复述算法流程。')
  await setSelect(page, '#start-prediction', '2')
  await clickText(page, '.start-form button', '开始学习')
  await page.waitForSelector('.session-shell', { timeout: 15000 })
  await waitText(page, '进行中')
  pass('开始学习会话', '任务 + 流程 + 学习意图')

  await clickText(page, '.session-actions button', '下一阶段')
  await page.waitForFunction(
    () => (document.querySelector('.stage-card h4')?.textContent ?? '').includes('精读输入'),
    { timeout: 8000 },
  )
  await clickText(page, '.session-actions button', '下一阶段')
  await page.waitForFunction(
    () => (document.querySelector('.stage-card h4')?.textContent ?? '').includes('白纸输出'),
    { timeout: 8000 },
  )
  pass('阶段推进', '预习 → 精读 → 白纸输出')

  await clickText(page, '.session-actions button', '添加本阶段记录')
  await page.waitForSelector('#record-title', { timeout: 8000 })
  await setInput(page, '#record-title', 'WalkSAT 流程复述')
  await setInput(
    page,
    '#record-content',
    '随机初始化；检查是否满足；从未满足子句中选择变量；按噪声概率随机翻转或贪心翻转。',
  )
  await setSelect(page, '#record-assessment', '3')
  await clickText(page, '.modal-actions button', '保存记录')
  await waitText(page, '记录已保存', 15000)
  await waitModalClosed(page)
  await waitText(page, 'WalkSAT 流程复述')
  pass('保存学习记录', '输出记录带自评')

  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.knowledge-link'))
    const target = labels.find((node) =>
      (node.textContent ?? '').includes('WalkSAT 变量选择'),
    )
    if (!target) throw new Error('未找到知识点关联项')
    const input = target.querySelector('input[type="checkbox"]')
    if (!input) throw new Error('知识点关联缺少复选框')
    input.click()
  })
  await delay(400)
  const linked = await page.$$eval('.knowledge-link', (nodes) =>
    nodes.some(
      (node) =>
        (node.textContent ?? '').includes('WalkSAT 变量选择') &&
        node.classList.contains('selected'),
    ),
  )
  assert(linked, '知识点关联未保存')
  pass('关联知识点')

  await clickText(page, '.session-actions button', '完成会话')
  await page.waitForSelector('#finish-assessment', { timeout: 8000 })
  await setSelect(page, '#finish-assessment', '3')
  await setInput(page, '#finish-reflection', '对噪声参数的理解还需要补概率论基础。')
  await clickText(page, '.modal-actions button', '完成并保存')
  await waitText(page, '学习会话已完成', 20000)
  await waitModalClosed(page)
  await waitText(page, '开始一次学习会话')
  pass('完成学习会话', '时长、实际表现与反思记录')

  const sessionCount = await page.$$eval('.session-list-item', (nodes) => nodes.length)
  assert(sessionCount >= 2, `最近会话应至少有 2 条，实际 ${sessionCount}`)
  await page.click('.session-list-main')
  await page.waitForSelector('.session-detail', { timeout: 8000 })
  await waitText(page, 'WalkSAT 流程复述')
  await waitText(page, '会话反思')
  await waitText(page, 'WalkSAT 变量选择')
  pass('会话详情', '记录、反思与知识点可回看')
  await page.click('.modal-head button')
  await waitModalClosed(page)

  await clickText(page, '.header-actions button', '新建学习流程')
  await page.waitForSelector('#workflow-preset', { timeout: 8000 })
  await setSelect(page, '#workflow-preset', 'feynman')
  await delay(250)
  const presetName = await page.$eval('#workflow-name', (element) => element.value)
  assert(presetName.includes('费曼学习'), '预设未填充流程名称')
  await clickText(page, '.modal-actions button', '创建流程')
  await waitText(page, '学习流程已创建', 15000)
  await waitModalClosed(page)
  await waitText(page, '费曼学习 · 解释与重学')
  await waitText(page, '5 个阶段')
  pass('从预设创建学习流程', '费曼学习 5 阶段')

  await clickCardAction(page, '.workflow-card', '费曼学习 · 解释与重学', '编辑流程')
  await page.waitForSelector('#workflow-name', { timeout: 8000 })
  await setInput(page, '#workflow-name', '费曼学习 · 我的版本')
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '学习流程已更新', 15000)
  await waitModalClosed(page)
  await waitText(page, '费曼学习 · 我的版本')
  pass('编辑学习流程')

  await clickText(page, '.view-tab', '知识点')
  await page.waitForSelector('.knowledge-view', { timeout: 8000 })
  await clickText(page, '.knowledge-view button', '新建知识点')
  await page.waitForSelector('#knowledge-title', { timeout: 8000 })
  await setInput(page, '#knowledge-title', 'SAT 噪声参数')
  await setInput(page, '#knowledge-desc', '噪声概率调节探索与利用的平衡，不是单纯的随机性。')
  await setInput(page, '#knowledge-source', 'SAT 局部搜索论文')
  await setSelect(page, '#knowledge-mastery', 'L2')
  await clickText(page, '.modal-actions button', '创建知识点')
  await waitText(page, '知识点已创建', 15000)
  await waitModalClosed(page)
  await waitText(page, 'SAT 噪声参数')
  pass('创建知识点')

  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.knowledge-row'))
    const row = rows.find((node) => (node.textContent ?? '').includes('SAT 噪声参数'))
    if (!row) throw new Error('未找到知识点行')
    const button = Array.from(row.querySelectorAll('button')).find((node) =>
      (node.textContent ?? '').includes('安排复习'),
    )
    if (!button) throw new Error('知识点行缺少安排复习按钮')
    button.click()
  })
  await page.waitForSelector('#schedule-date', { timeout: 8000 })
  await setInput(page, '#schedule-date', dateKey(1))
  await clickText(page, '.modal-actions button', '安排复习')
  await waitText(page, '复习已安排', 15000)
  await waitModalClosed(page)
  pass('安排复习', '知识点进入复习调度')

  await clickText(page, '.view-tab', '复习')
  await page.waitForSelector('.due-card', { timeout: 8000 })
  await clickText(page, '.due-card button', '开始复习')
  await page.waitForSelector('#review-recall', { timeout: 8000 })
  await setSelect(page, '#review-recall', '4')
  await setInput(page, '#review-difficulty', '2')
  await clickText(page, '.modal-actions button', '记录复习结果')
  await waitText(page, '复习已记录', 20000)
  await waitModalClosed(page)
  await waitText(page, '下次复习')
  pass('完成主动回忆', '按回忆结果生成下次复习日期')

  await delay(300)
  await clickText(page, '.due-card button', '跳过')
  await waitText(page, '本次复习已跳过', 15000)
  await waitText(page, '没有到期的复习')
  pass('跳过复习', '调度状态与掌握程度分离')

  await clickText(page, '.view-tab', '资源与工具')
  await page.waitForSelector('.resource-view', { timeout: 8000 })
  await clickText(page, '.resource-view button', '添加资源')
  await page.waitForSelector('#resource-title', { timeout: 8000 })
  await setInput(page, '#resource-title', '论文实验清单')
  await setSelect(page, '#resource-type', 'ZOTERO')
  await setInput(page, '#resource-url', 'https://www.zotero.org/')
  await setInput(page, '#resource-source', 'Zotero')
  await setInput(page, '#resource-desc', '复现实验的文献与批注。')
  await clickText(page, '.modal-actions button', '添加资源')
  await waitText(page, '资源已添加', 15000)
  await waitModalClosed(page)
  await waitText(page, '论文实验清单')
  pass('添加外部资源')

  await clickCardAction(page, '.resource-card', '论文实验清单', '归档资源')
  await waitText(page, '归档内容')
  await clickText(page, '.modal-actions button', '确认归档')
  await waitText(page, '已归档，可随时恢复', 15000)
  await waitModalClosed(page)
  await delay(250)
  await clickText(page, '.toolbar-actions button', '显示已归档')
  await delay(250)
  await clickCardAction(page, '.resource-card', '论文实验清单', '恢复资源')
  await waitText(page, '恢复内容')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  pass('归档与恢复资源')

  await page.screenshot({ path: '/tmp/growth-os-learning.png', fullPage: true })
  pass('学习系统截图', '/tmp/growth-os-learning.png')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.learning-stats', { timeout: 15000 })
  await waitText(page, '最近学习会话')
  const sessionsAfterReload = await page.$$eval('.session-list-item', (nodes) => nodes.length)
  assert(sessionsAfterReload >= 2, `刷新后会话列表异常：${sessionsAfterReload}`)
  await clickText(page, '.view-tab', '知识点')
  await waitText(page, 'SAT 噪声参数')
  await clickText(page, '.view-tab', '资源与工具')
  await waitText(page, '论文实验清单')
  pass('刷新后持久化')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\n阶段 5 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-stage5-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\n阶段 5 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}