import { setTimeout as delay } from 'node:timers/promises'
import puppeteer from 'puppeteer-core'
import { resolveChromePath } from './lib/chrome-path.mjs'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'
const CHROME_PATH = resolveChromePath()

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
  assert(stats[3] === '1', `待复习应为 1，实际 ${stats[3]}`)
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

  const selectedVisionTitle = await page.$eval(
    '#vision-select',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  assert(
    selectedVisionTitle.includes('成为具备独立研究与工程实践能力的技术人才'),
    `FUTURE VISION 未显示当前愿景：${selectedVisionTitle}`,
  )
  const removedFuturePanels = await page.evaluate(() => ({
    visionRail: document.querySelectorAll('.vision-rail').length,
    identityList: document.querySelectorAll('.identity-list').length,
    directionGrid: document.querySelectorAll('.direction-grid').length,
  }))
  assert(removedFuturePanels.visionRail === 0, '旧愿景侧栏仍然存在')
  assert(removedFuturePanels.identityList === 0, '重复的“未来身份”列表仍然存在')
  assert(removedFuturePanels.directionGrid === 0, '重复的“发展方向”列表仍然存在')
  pass('愿景选择整合', selectedVisionTitle)

  await clickText(page, '.identity-map-actions button', '收起能力树')
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.identity-tree-body')).display === 'none',
    { timeout: 5000 },
  )
  await clickText(page, '.identity-map-actions button', '展开能力树')
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.identity-tree-body')).display !== 'none',
    { timeout: 5000 },
  )
  pass('整棵能力树折叠', '可收起并恢复身份树主体，身份切换器保持可见')

  const identityTabs = await page.$$eval('.identity-tab-name', (nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? ''),
  )
  assert(identityTabs.length === 2, `身份切换器应有 2 个身份，实际 ${identityTabs.length}`)
  assert(
    identityTabs.includes('软硬件全栈工程师') && identityTabs.includes('独立研究者'),
    `身份切换器内容不正确：${identityTabs.join(' / ')}`,
  )
  await clickText(page, '.identity-tab', '软硬件全栈工程师')
  await page.waitForFunction(
    () =>
      (document.querySelector('.identity-root-title-row h4')?.textContent ?? '').trim() ===
      '软硬件全栈工程师',
    { timeout: 5000 },
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

  await page.click('.tree-toggle')
  await page.waitForFunction(
    (previous) => document.querySelectorAll('.capability-name').length < previous,
    { timeout: 5000 },
    capabilityNames.length,
  )
  await page.click('.tree-toggle')
  await page.waitForFunction(
    (previous) => document.querySelectorAll('.capability-name').length === previous,
    { timeout: 5000 },
    capabilityNames.length,
  )
  pass('单节点能力折叠', '子能力分支可单独收起并恢复')

  const rootCapabilityCount = await page.$$eval(
    '.capability-tree-root > .capability-node',
    (nodes) => nodes.length,
  )
  await clickText(page, '.capability-tree-head-actions button', '全部收起')
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.capability-name').length === expected,
    { timeout: 5000 },
    rootCapabilityCount,
  )
  await clickText(page, '.capability-tree-head-actions button', '全部展开')
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.capability-name').length === expected,
    { timeout: 5000 },
    capabilityNames.length,
  )
  pass('能力节点全部展开收起', `${rootCapabilityCount} 个根节点，恢复 ${capabilityNames.length} 个节点`)

  await page.click('.identity-direction-manage summary')
  await clickText(page, '.identity-direction-manage .link-btn', '软硬件全栈工程')
  await page.waitForFunction(() => location.pathname === '/roadmap', { timeout: 10000 })
  await page.waitForSelector('.direction-card', { timeout: 15000 })
  await page.waitForFunction(() => location.search === '', { timeout: 10000 })
  const directionFilterText = await page.$eval(
    'select[aria-label="按方向筛选"]',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  const linkedDirectionCards = await page.$$eval('.direction-card', (nodes) =>
    nodes.map((node) => (node.textContent ?? '').trim()),
  )
  const linkedAbilityNodes = await page.$$eval('.ability-node', (nodes) => nodes.length)
  assert(
    directionFilterText === '软硬件全栈工程',
    `方向深链未筛选正确方向：${directionFilterText}`,
  )
  assert(linkedDirectionCards.length === 1, `方向深链应只显示 1 个方向，实际 ${linkedDirectionCards.length}`)
  assert(linkedDirectionCards[0].includes('软硬件全栈工程'), '方向深链卡片内容不正确')
  assert(linkedAbilityNodes >= 3, `方向深链未展开能力树，实际 ${linkedAbilityNodes} 个节点`)
  pass('能力到路线图联动', `已筛选 ${directionFilterText} 并展开 ${linkedAbilityNodes} 个能力节点`)
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
