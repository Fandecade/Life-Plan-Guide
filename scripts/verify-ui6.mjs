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

  await clickText(page, '.view-tab', '四象限')
  await page.waitForSelector('.quadrant-grid', { timeout: 8000 })
  const q2Before = await textsOf(page, '.quadrant-q2 .qt-title')
  assert(q2Before.length >= 2, `Q2 至少需要 2 个任务才能验证排序，实际 ${q2Before.length}`)
  await page.click('.quadrant-q2 .quadrant-task-row button[aria-label="象限内下移"]')
  await waitText(page, '任务已下移')
  await page.waitForFunction(
    (previous) => {
      const current = Array.from(document.querySelectorAll('.quadrant-q2 .qt-title')).map(
        (node) => (node.textContent ?? '').trim(),
      )
      return current.length === previous.length && current.some((item, index) => item !== previous[index])
    },
    { timeout: 8000, polling: 100 },
    q2Before,
  )
  const q2After = await textsOf(page, '.quadrant-q2 .qt-title')
  assert(q2After[0] === q2Before[1], 'Q2 下移后第二项未移动到首位')
  pass('四象限内排序', `${q2Before[0]} ↔ ${q2Before[1]}`)

  await page.click('.quadrant-q2 .quadrant-task-row button[aria-label="编辑重要/紧急程度"]')
  await page.waitForSelector('#task-importance', { timeout: 8000 })
  await page.waitForSelector('#task-urgency', { timeout: 8000 })
  pass('四象限编辑入口', '可编辑重要程度与紧急程度')
  await clickText(page, '.modal-actions button', '取消')
  await page.waitForFunction(() => !document.querySelector('#task-importance'), { timeout: 8000 })

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.goals-tasks', { timeout: 15000 })
  await clickText(page, '.view-tab', '四象限')
  await page.waitForSelector('.quadrant-q2 .qt-title', { timeout: 8000 })
  const q2Reloaded = await textsOf(page, '.quadrant-q2 .qt-title')
  assert(
    q2Reloaded.every((title, index) => title === q2After[index]),
    '刷新后四象限排序未持久化',
  )
  pass('四象限排序持久化', '刷新后顺序保持不变')

  // Roadmap: 能力完整度、推导阶段、日期微调与时间线
  await clickText(page, 'a.nav-item', '发展路线')
  await page.waitForSelector('.roadmap', { timeout: 15000 })
  await page.waitForSelector('.direction-progress-grid', { timeout: 10000 })
  const progressCards = await page.$$eval('.direction-progress-card', (nodes) => nodes.length)
  assert(progressCards >= 2, `方向能力完整度卡片不足，实际 ${progressCards}`)
  pass('方向能力完整度', `${progressCards} 个方向卡片与进度条`)

  await clickText(page, '.view-tab', '里程碑')
  await page.waitForSelector('.milestone-board', { timeout: 8000 })
  await page.waitForSelector('.stage-list', { timeout: 8000 })
  const stageCards = await page.$$eval('.stage-card', (nodes) => nodes.length)
  const stageAddButtons = await page.$$eval('.stage-add-btn', (nodes) => nodes.length)
  const milestoneCards = await page.$$eval('.milestone-card', (nodes) => nodes.length)
  assert(stageCards >= 2, `阶段卡片不足，实际 ${stageCards}`)
  assert(stageAddButtons >= 2, `阶段里程碑入口不足，实际 ${stageAddButtons}`)
  assert(milestoneCards >= 2, `里程碑卡片不足，实际 ${milestoneCards}`)

  const stageRangeBefore = await textOf(page, '.stage-card .stage-range')
  await page.click('.stage-card:first-of-type button[aria-label$="延后一天"]')
  await waitText(page, '已延后 1 天')
  await page.waitForFunction(
    (before) =>
      (document.querySelector('.stage-card .stage-range')?.textContent ?? '').trim() !== before,
    { timeout: 8000, polling: 100 },
    stageRangeBefore,
  )
  const stageRangeAfter = await textOf(page, '.stage-card .stage-range')
  pass(
    '阶段轨道与边界调整',
    `${stageCards} 个阶段 · ${milestoneCards} 个里程碑 · ${stageRangeBefore} → ${stageRangeAfter}`,
  )

  await page.click('.stage-card:first-of-type .stage-open-btn')
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '快速调整日期')
  await waitText(page, '相关能力')
  await waitText(page, '能力完整度')
  const datesBefore = await page.$$eval('.milestone-detail-grid strong', (nodes) =>
    nodes.slice(0, 2).map((node) => (node.textContent ?? '').trim()),
  )
  await page.click('.milestone-date-editor .date-shift-btn')
  await waitText(page, '已提前 1 天')
  await page.waitForFunction(
    (previous) => {
      const current = Array.from(document.querySelectorAll('.milestone-detail-grid strong'))
        .slice(0, 2)
        .map((node) => (node.textContent ?? '').trim())
      return current.some((value, index) => value !== previous[index])
    },
    { timeout: 8000, polling: 100 },
    datesBefore,
  )
  const datesAfter = await page.$$eval('.milestone-detail-grid strong', (nodes) =>
    nodes.slice(0, 2).map((node) => (node.textContent ?? '').trim()),
  )
  pass('里程碑详情日期微调', `${datesBefore.join(' / ')} → ${datesAfter.join(' / ')}`)
  await closeDrawer(page)

  await clickText(page, '.view-tab', '时间线')
  await page.waitForSelector('.timeline-scroll', { timeout: 8000 })
  const phaseBars = await page.$$eval('.timeline-phase', (nodes) => nodes.length)
  const milestoneBars = await page.$$eval('.timeline-bar', (nodes) => nodes.length)
  const legendItems = await page.$$eval('.timeline-legend', (nodes) => nodes.length)
  const scaleButtons = await page.$$eval('.scale-switch button', (nodes) => nodes.length)
  assert(phaseBars >= 2, `时间线阶段区间不足，实际 ${phaseBars}`)
  assert(milestoneBars >= 2, `时间线里程碑条不足，实际 ${milestoneBars}`)
  assert(legendItems >= 4, `时间线图例不足，实际 ${legendItems}`)
  assert(scaleButtons === 4, `时间尺度应含年/季/月/周，实际 ${scaleButtons}`)
  await clickText(page, '.scale-switch button', '周')
  await page.waitForFunction(
    () => document.querySelectorAll('.scale-switch button.active')[0]?.textContent?.trim() === '周',
    { timeout: 8000, polling: 100 },
  )
  pass(
    '时间线阶段层',
    `${phaseBars} 个推导阶段 · ${milestoneBars} 个里程碑条 · ${legendItems} 个图例`,
  )

  await delay(400)
  await page.screenshot({ path: '/tmp/growth-os-ui6-roadmap.png', fullPage: true })
  pass('桌面截图', '/tmp/growth-os-ui6-roadmap.png')

  // 390px 窄屏：核心新增页面不能造成页面级横向滚动
  await page.setViewport({ width: 390, height: 844 })
  await assertNoHorizontalOverflow(page, '路线图时间线')
  await clickText(page, '.view-tab', '能力地图')
  await page.waitForSelector('.direction-progress-grid', { timeout: 8000 })
  await assertNoHorizontalOverflow(page, '路线图能力地图')

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
