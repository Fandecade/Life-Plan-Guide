import { setTimeout as delay } from 'node:timers/promises'
import puppeteer from 'puppeteer-core'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'
const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

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

async function textOf(page, selector) {
  return page.$eval(selector, (node) => (node.textContent ?? '').trim())
}

async function textsOf(page, selector) {
  return page.$$eval(selector, (nodes) =>
    nodes.map((node) => (node.textContent ?? '').trim()),
  )
}

async function assertNoHorizontalOverflow(page, label) {
  await delay(350)
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  assert(
    dimensions.document <= dimensions.viewport + 1,
    `${label} 页面横向溢出：viewport ${dimensions.viewport}px，document ${dimensions.document}px`,
  )
  assert(
    dimensions.body <= dimensions.viewport + 1,
    `${label} 页面 body 横向溢出：viewport ${dimensions.viewport}px，body ${dimensions.body}px`,
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
  pass('准备演示数据', '一次完整业务数据写入 IndexedDB')

  // Review: 成长洞察与自动汇总
  await clickText(page, 'a.nav-item', '复盘与洞察')
  await page.waitForSelector('.review-page', { timeout: 15000 })
  await clickText(page, '.view-tab', '成长洞察')
  await page.waitForSelector('.insight-data-grid', { timeout: 10000 })

  const insightCards = await page.$$eval('.insight-data-grid .insight-data-card', (nodes) => nodes.length)
  assert(insightCards >= 6, `成长洞察应有至少 6 张数据卡，实际 ${insightCards}`)
  for (const selector of [
    '.direction-list',
    '.compare-list',
    '.habit-map-bars',
    '.competency-evidence-list',
    '.insight-list',
  ]) {
    await page.waitForSelector(selector, { timeout: 10000 })
  }
  pass('成长洞察数据卡', `${insightCards} 张真实数据卡，含方向、计划/实际、能力证据与习惯诊断`)

  await clickText(page, '.view-tab', '复盘记录')
  await page.waitForSelector('.start-strip', { timeout: 8000 })
  await clickText(page, '.start-chip', '周复盘')
  await page.waitForSelector('#review-type', { timeout: 8000 })
  await page.waitForSelector('.auto-review-panel', { timeout: 8000 })
  await page.waitForSelector('.auto-metrics', { timeout: 8000 })
  await page.waitForSelector('.pdca-auto', { timeout: 8000 })
  await page.waitForSelector('.incomplete-reasons', { timeout: 8000 })
  await page.waitForSelector('.evidence-picker', { timeout: 8000 })
  pass('周复盘自动上下文', '自动指标、PDCA、未完成原因与真实证据可同时读取')

  await page.click('.pdca-auto .link-btn')
  await page.waitForFunction(
    () => (document.querySelector('#review-section-0')?.value ?? '').trim().length > 0,
    { timeout: 8000, polling: 100 },
  )
  const autoPlan = await page.$eval('#review-section-0', (node) => node.value)
  assert(autoPlan.includes('计划任务'), '写入真实汇总后 P 段未出现计划任务')
  await page.select('.incomplete-reasons select', '时间预估不足')
  await page.click('.evidence-picker input[type="checkbox"]')
  await clickText(page, '.modal-actions button', '保存复盘')
  await waitText(page, '复盘已保存', 15000)
  await page.waitForSelector('.review-detail', { timeout: 8000 })
  await waitText(page, '自动汇总')
  pass('PDCA 自动写入并保存', 'P 段写入真实计划，未完成原因与证据随复盘保存')
  await clickText(page, '.review-detail .modal-actions button', '关闭')
  await page.waitForFunction(() => !document.querySelector('.review-detail'), {
    timeout: 8000,
  })

  // Goals & Tasks: 日/周/月/列表时间盒与四象限排序
  await clickText(page, 'a.nav-item', '目标与任务')
  await page.waitForSelector('.goals-tasks', { timeout: 15000 })
  await clickText(page, '.view-tab', '时间盒')
  await page.waitForSelector('.timebox-card', { timeout: 8000 })

  await clickText(page, '.seg-btn', '日视图')
  await page.waitForSelector('.day-board', { timeout: 8000 })
  await page.waitForSelector('.day-agenda-item', { timeout: 8000 })
  const durationBefore = await textOf(page, '.day-agenda-item .time-duration')
  await page.click('.day-agenda-item .timebox-resize button:nth-of-type(2)')
  await waitText(page, '时间盒已延长 15 分钟')
  await page.waitForFunction(
    (before) =>
      (document.querySelector('.day-agenda-item .time-duration')?.textContent ?? '').trim() !==
      before,
    { timeout: 8000, polling: 100 },
    durationBefore,
  )
  const durationAfter = await textOf(page, '.day-agenda-item .time-duration')
  await page.click('.day-agenda-item .timebox-resize button:nth-of-type(1)')
  await waitText(page, '时间盒已缩短 15 分钟')
  await page.waitForFunction(
    (before) =>
      (document.querySelector('.day-agenda-item .time-duration')?.textContent ?? '').trim() ===
      before,
    { timeout: 8000, polling: 100 },
    durationBefore,
  )
  pass('日视图时长微调', `${durationBefore} → ${durationAfter} → ${durationBefore}`)

  await clickText(page, '.seg-btn', '周视图')
  await page.waitForSelector('.week-board .week-grid', { timeout: 8000 })
  const weekDays = await page.$$eval('.week-board .week-day', (nodes) => nodes.length)
  assert(weekDays === 7, `周视图应有 7 列，实际 ${weekDays}`)
  await page.waitForSelector('.week-board .week-card', { timeout: 8000 })
  pass('周时间盒视图', `7 列，${await page.$$eval('.week-board .week-card', (nodes) => nodes.length)} 个本周时间盒`)

  await clickText(page, '.seg-btn', '月视图')
  await page.waitForSelector('.month-board .month-grid', { timeout: 8000 })
  const monthDays = await page.$$eval('.month-board .month-day', (nodes) => nodes.length)
  assert(monthDays >= 28, `月视图日期格不足，实际 ${monthDays}`)
  await page.click('.month-board .month-day.today .month-day-number')
  await page.waitForSelector('.day-board', { timeout: 8000 })
  pass('月视图进入日视图', `${monthDays} 个日期格，点击今天返回日安排`)

  await clickText(page, '.seg-btn', '列表')
  await page.waitForSelector('.timebox-groups', { timeout: 8000 })
  pass('时间盒列表视图', `${await page.$$eval('.timebox-item', (nodes) => nodes.length)} 个时间盒条目`)

  await clickText(page, '.view-tab', '目标')
  await page.waitForSelector('.goal-tree', { timeout: 8000 })
  const goalRowsBefore = await page.$$eval('.goal-tree-row', (nodes) => nodes.length)
  assert(goalRowsBefore >= 2, `目标树行数不足，实际 ${goalRowsBefore}`)
  const goalCapabilityBadges = await page.$$eval('.goal-capability-badge', (nodes) => nodes.length)
  assert(goalCapabilityBadges >= 1, '目标树未显示能力锚点')
  const hasFilterBar = await page.$('.goal-filter-bar')
  assert(hasFilterBar !== null, '目标页缺少能力锚点筛选栏')
  pass('目标拆解与能力锚点', `${goalRowsBefore} 个目标行，${goalCapabilityBadges} 个能力标签`)

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.goals-tasks', { timeout: 15000 })
  await page.waitForSelector('.goal-tree', { timeout: 8000 })
  const goalRowsAfter = await page.$$eval('.goal-tree-row', (nodes) => nodes.length)
  assert(goalRowsAfter === goalRowsBefore, `刷新后目标行数变化：${goalRowsBefore} → ${goalRowsAfter}`)
  pass('目标树持久化', '刷新后目标层级与能力锚点保持不变')

  // Roadmap: 方向摘要、融合能力树与 S 型总时间线
  await clickText(page, 'a.nav-item', '发展路线')
  await page.waitForSelector('.roadmap', { timeout: 15000 })
  await page.waitForSelector('.direction-card', { timeout: 10000 })
  const initialRoadmap = await page.evaluate(() => ({
    directions: document.querySelectorAll('.direction-card').length,
    openTrees: document.querySelectorAll('.direction-body').length,
    abilityNodes: document.querySelectorAll('.ability-node').length,
    legacyNodes: document.querySelectorAll('.s-timeline-node, .ability-milestone').length,
  }))
  assert(initialRoadmap.directions >= 2, `发展方向不足：${initialRoadmap.directions}`)
  assert(initialRoadmap.openTrees === 0, `路线图默认不应展开能力树，实际 ${initialRoadmap.openTrees}`)
  assert(initialRoadmap.abilityNodes === 0, `默认不应显示能力节点，实际 ${initialRoadmap.abilityNodes}`)
  assert(initialRoadmap.legacyNodes === 0, '路线图仍残留里程碑或时间线节点')
  pass('路线图默认折叠', `${initialRoadmap.directions} 个方向摘要，无里程碑与时间线`)

  await clickText(page, '.direction-summary', '研究生学业与科研')
  await page.waitForSelector('.direction-card .ability-node', { timeout: 8000 })
  const treeNodeCount = await page.$$eval(
    '.direction-card .ability-node',
    (nodes) => nodes.length,
  )
  const detailCountBefore = await page.$$eval('.ability-detail', (nodes) => nodes.length)
  assert(treeNodeCount >= 2, `展开方向后能力节点不足：${treeNodeCount}`)
  assert(detailCountBefore === 0, `能力详情默认不应展开，实际 ${detailCountBefore}`)
  pass('展开方向能力树', `${treeNodeCount} 个能力节点，能力详情仍折叠`)

  const expandAbility = async (name) => {
    const result = await page.evaluate((abilityName) => {
      const node = Array.from(document.querySelectorAll('.ability-node')).find(
        (element) => element.dataset.abilityName === abilityName,
      )
      if (!node) return false
      const button = node.querySelector(':scope > .ability-row .ability-expand')
      if (!button) return false
      if (button.getAttribute('aria-expanded') !== 'true') button.click()
      return true
    }, name)
    if (!result) throw new Error(`未找到能力节点：${name}`)
  }

  await expandAbility('算法与数据结构')
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.ability-node')).some(
        (node) => node.dataset.abilityName === 'SAT 与局部搜索',
      ),
    { timeout: 8000 },
  )
  pass('能力树逐层展开', '算法与数据结构 → SAT 与局部搜索')

  await expandAbility('SAT 与局部搜索')
  await page.waitForSelector('.ability-goals', { timeout: 8000 })
  const abilityGoalsClosed = await page.$eval(
    '.ability-goals',
    (node) => !node.hasAttribute('open'),
  )
  assert(abilityGoalsClosed, '能力下的目标列表默认应收起')
  await page.click('.ability-goals summary')
  await page.waitForFunction(
    () => document.querySelector('.ability-goals')?.hasAttribute('open') === true,
    { timeout: 5000 },
  )
  const abilityGoalText = await page.$eval('.ability-goals', (node) =>
    (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
  )
  assert(abilityGoalText.includes('掌握 ACO'), '能力下的目标列表缺少 ACO 目标')
  pass('能力内查看拆解目标', '默认收起，展开后可见 ACO 目标')

  const decomposed = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('.ability-node')).find(
      (element) => element.dataset.abilityName === 'SAT 与局部搜索',
    )
    const button = node?.querySelector(':scope > .ability-row .ability-decompose')
    if (!button) return false
    button.click()
    return true
  })
  assert(decomposed, 'SAT 能力节点缺少“拆解为目标”按钮')
  await page.waitForFunction(() => location.pathname === '/goals', { timeout: 10000 })
  await page.waitForSelector('.goal-tree', { timeout: 8000 })
  const linkedFilter = await page.$eval(
    '.goal-filter-bar select',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  assert(linkedFilter.includes('SAT 与局部搜索'), `能力深链未带上筛选：${linkedFilter}`)
  const linkedGoals = await page.$$eval('.goal-tree-row', (nodes) => nodes.length)
  assert(linkedGoals >= 1, `能力深链后目标列表为空，实际 ${linkedGoals}`)
  pass('能力跳转目标拆解', `已筛选 ${linkedFilter}，${linkedGoals} 个目标`)

  await page.goto(new URL('roadmap', APP_URL).toString(), { waitUntil: 'networkidle0' })
  await page.waitForSelector('.direction-card', { timeout: 15000 })
  await clickText(page, '.direction-summary', '研究生学业与科研')
  await page.waitForSelector('.ability-node', { timeout: 8000 })
  await delay(400)
  await page.screenshot({ path: '/tmp/growth-os-ui6-roadmap.png', fullPage: true })
  pass('桌面截图', '/tmp/growth-os-ui6-roadmap.png')

  // 390px 窄屏：核心新增页面不能造成页面级横向滚动
  await page.setViewport({ width: 390, height: 844 })
  await assertNoHorizontalOverflow(page, '路线图能力树')
  const mobileDirectionWidth = await page.$eval(
    '.direction-copy',
    (node) => node.getBoundingClientRect().width,
  )
  assert(mobileDirectionWidth > 200, `390px 方向摘要宽度异常：${mobileDirectionWidth}`)

  await page.goto(new URL('review', APP_URL).toString(), { waitUntil: 'networkidle0' })
  await page.waitForSelector('.review-page', { timeout: 15000 })
  await clickText(page, '.view-tab', '成长洞察')
  await page.waitForSelector('.insight-data-grid', { timeout: 10000 })
  await assertNoHorizontalOverflow(page, '复盘成长洞察')

  await page.goto(new URL('goals', APP_URL).toString(), { waitUntil: 'networkidle0' })
  await page.waitForSelector('.goals-tasks', { timeout: 15000 })
  await clickText(page, '.view-tab', '时间盒')
  await clickText(page, '.seg-btn', '周视图')
  await page.waitForSelector('.week-board .week-grid', { timeout: 8000 })
  await assertNoHorizontalOverflow(page, '目标与任务时间盒')
  await page.screenshot({ path: '/tmp/growth-os-ui6-mobile.png', fullPage: true })
  pass('390px 响应式检查', '路线图、成长洞察与周时间盒无页面级横向溢出')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\nUI 阶段 6 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-ui6-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\nUI 阶段 6 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
