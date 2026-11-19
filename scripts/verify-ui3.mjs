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

async function waitModalClosed(page, timeout = 8000) {
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'), { timeout })
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
  await page.waitForFunction(
    () => (document.querySelectorAll('.stat-value')[1]?.textContent ?? '').trim() === '4',
    { timeout: 10000 },
  )

  const stats = await page.$$eval('.stat-value', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats[0] === '0', `今日进行中应为 0，实际 ${stats[0]}`)
  assert(stats[1] === '4', `今日任务应为 4，实际 ${stats[1]}`)
  assert(stats[2] === '45 分钟', `今日学习应为 45 分钟，实际 ${stats[2]}`)
  assert(stats[3] === '2', `待复习应为 2，实际 ${stats[3]}`)
  await waitText(page, '今日安排')
  const scheduleItems = await page.$$eval('.schedule-item', (nodes) => nodes.length)
  assert(scheduleItems === 4, `今日安排应有 4 项，实际 ${scheduleItems}`)
  const scheduleText = await page.$eval('.schedule-list', (node) => node.textContent ?? '')
  assert(scheduleText.includes('09:00'), '今日安排缺少时间盒时间')
  assert(scheduleText.includes('阅读 SAT 局部搜索论文'), '今日安排缺少重点任务')
  assert(scheduleText.includes('待安排'), '今日安排缺少未排期任务')
  pass('Dashboard 今日安排', `${scheduleItems} 项时间盒与任务`)

  const focusTitle = await page.$eval('.hero-focus .focus-title', (node) =>
    node.textContent.trim(),
  )
  pass('今日重点', focusTitle)

  await page.screenshot({ path: '/tmp/growth-os-ui3-dashboard.png', fullPage: true })
  pass('Dashboard 截图', '/tmp/growth-os-ui3-dashboard.png')

  await page.click('.habit-quick')
  await waitText(page, '已记录微行为', 15000)
  await page.waitForFunction(
    () => document.querySelectorAll('.habit-state.done').length === 3,
    { timeout: 10000 },
  )
  pass('习惯一键打卡', '微行为已完成并刷新首页')

  await clickText(page, '.focus-start', '开始这个任务')
  await page.waitForFunction(() => location.pathname === '/learning', { timeout: 10000 })
  await page.waitForSelector('#start-task', { timeout: 15000 })
  const selectedTask = await page.$eval(
    '#start-task',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  assert(selectedTask.includes(focusTitle), `学习任务未预选：${selectedTask} / ${focusTitle}`)
  const learningQuery = await page.evaluate(() => location.search)
  assert(learningQuery === '', `学习深链参数未清理：${learningQuery}`)
  pass('从今日重点开始学习', `预选任务：${selectedTask}`)

  await clickText(page, 'a.nav-item', '未来自我')
  await page.waitForSelector('.identity-map-card', { timeout: 15000 })
  await page.waitForSelector('.capability-name', { timeout: 15000 })
  await waitText(page, '身份能力树')

  const identityTabs = await page.$$eval('.identity-tab-name', (nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? ''),
  )
  assert(identityTabs.length === 2, `身份切换器应有 2 个身份，实际 ${identityTabs.length}`)
  assert(
    identityTabs.includes('软硬件全栈工程师') && identityTabs.includes('独立研究者'),
    `身份切换器内容不正确：${identityTabs.join(' / ')}`,
  )
  const rootIdentity = await page.$eval(
    '.identity-root-title-row h4',
    (node) => node.textContent?.trim() ?? '',
  )
  assert(rootIdentity === '软硬件全栈工程师', `能力树根身份不正确：${rootIdentity}`)
  await waitText(page, '我是一个能够把复杂系统真正做出来的工程师。')

  const capabilityNames = await page.$$eval('.capability-name', (nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? ''),
  )
  for (const expected of ['C++ 工程能力', 'Linux 系统与驱动', '算法与数据结构', 'SAT 与局部搜索']) {
    assert(capabilityNames.includes(expected), `能力树缺少“${expected}”：${capabilityNames.join(' / ')}`)
  }
  const nestedCapability = await page.$eval(
    '.capability-children .capability-name',
    (node) => node.textContent?.trim() ?? '',
  )
  assert(
    nestedCapability === 'SAT 与局部搜索',
    `能力层级不正确，首个子能力应为 SAT 与局部搜索，实际 ${nestedCapability}`,
  )
  pass('身份能力树', `根身份 ${rootIdentity}，${capabilityNames.length} 个能力节点`)

  await clickText(page, '.roadmap-link', '在发展路线中查看')
  await page.waitForFunction(() => location.pathname === '/roadmap', { timeout: 10000 })
  await page.waitForSelector('.direction-filter', { timeout: 15000 })
  await page.waitForFunction(() => location.search === '', { timeout: 10000 })
  const directionFilterText = await page.$eval(
    '.direction-filter',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  const activeRoadmapView = await page.$eval(
    '.view-tab.active',
    (node) => node.textContent?.trim() ?? '',
  )
  assert(
    directionFilterText === '软硬件全栈工程',
    `方向深链未筛选正确方向：${directionFilterText}`,
  )
  assert(activeRoadmapView.includes('能力地图'), `方向深链未进入能力地图：${activeRoadmapView}`)
  pass('能力到路线图联动', `已筛选 ${directionFilterText} · ${activeRoadmapView}`)
  await page.screenshot({ path: '/tmp/growth-os-ui3-roadmap-link.png', fullPage: true })
  pass('路线图联动截图', '/tmp/growth-os-ui3-roadmap-link.png')

  await clickText(page, 'a.nav-item', '未来自我')
  await page.waitForSelector('.identity-map-card', { timeout: 15000 })
  await clickText(page, '.identity-map-actions button', '添加方向')
  await page.waitForSelector('#direction-name', { timeout: 8000 })
  const defaultIdentity = await page.$eval(
    '#direction-identity',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  assert(defaultIdentity === '软硬件全栈工程师', `新增方向未继承当前身份：${defaultIdentity}`)
  pass('身份能力树添加入口', `默认身份：${defaultIdentity}`)
  await clickText(page, '.modal-actions button', '取消')
  await waitModalClosed(page)

  await page.screenshot({ path: '/tmp/growth-os-ui3-future-self.png', fullPage: true })
  pass('未来自我身份能力树截图', '/tmp/growth-os-ui3-future-self.png')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.identity-map-card', { timeout: 15000 })
  await waitText(page, '身份能力树')
  pass('刷新后身份能力树持久化')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\nUI 阶段 3 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-ui3-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\nUI 阶段 3 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
