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

async function closeDrawer(page) {
  await page.click('.drawer-head button')
  await page.waitForFunction(() => !document.querySelector('.drawer-panel'), {
    timeout: 8000,
  })
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

  await clickText(page, 'a.nav-item', '发展路线')
  await page.waitForSelector('.direction-card', { timeout: 15000 })
  const initialRoadmap = await page.evaluate(() => ({
    directions: document.querySelectorAll('.direction-card').length,
    openTrees: document.querySelectorAll('.direction-body').length,
    abilityNodes: document.querySelectorAll('.ability-node').length,
    legacyNodes: document.querySelectorAll('.s-timeline-node, .ability-milestone').length,
    flow: (document.querySelector('.roadmap-flow')?.textContent ?? '').replace(/\s+/g, ''),
  }))
  assert(initialRoadmap.directions >= 2, `发展方向不足：${initialRoadmap.directions}`)
  assert(initialRoadmap.openTrees === 0, `路线图默认不应展开能力树，实际 ${initialRoadmap.openTrees}`)
  assert(initialRoadmap.abilityNodes === 0, `默认不应显示能力节点，实际 ${initialRoadmap.abilityNodes}`)
  assert(initialRoadmap.legacyNodes === 0, '路线图仍残留里程碑或时间线节点')
  assert(
    initialRoadmap.flow.includes('发展方向') &&
      initialRoadmap.flow.includes('能力') &&
      initialRoadmap.flow.includes('时间盒'),
    `规划链路说明不正确：${initialRoadmap.flow}`,
  )
  pass('克制默认视图', `${initialRoadmap.directions} 个方向折叠，已移除里程碑与时间线`)

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

  const findAbilityButton = async (name, selector = '.ability-main') => {
    const nodes = await page.$$('.ability-node')
    for (const node of nodes) {
      const title = await node
        .$eval('.ability-name-line strong', (element) => (element.textContent ?? '').trim())
        .catch(() => '')
      if (title !== name) continue
      const button = await node.$(selector)
      if (!button) throw new Error(`${name} 缺少 ${selector}`)
      await node.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await button.click()
      return node
    }
    throw new Error(`未找到能力节点：${name}`)
  }

  await findAbilityButton('算法与数据结构', '.ability-expand')
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.ability-name-line strong')).some(
      (node) => (node.textContent ?? '').trim() === 'SAT 与局部搜索',
    ),
    { timeout: 8000 },
  )
  pass('能力树逐层展开', '算法与数据结构 → SAT 与局部搜索')

  await findAbilityButton('SAT 与局部搜索')
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '评价标准')
  await waitText(page, '所属方向')
  await waitText(page, '下一步')
  const legacyDrawer = await page.evaluate(
    () => document.querySelectorAll('.milestone-detail-grid, .s-timeline-node').length,
  )
  assert(legacyDrawer === 0, '能力详情仍包含里程碑或时间线区块')
  pass('能力节点详情', '等级、评价标准、方向与下一步拆解入口')

  await clickText(page, '.ability-decompose-panel button', '拆解为目标')
  await page.waitForFunction(() => location.pathname === '/goals', { timeout: 10000 })
  await page.waitForSelector('.goal-tree', { timeout: 8000 })
  const linkedFilter = await page.$eval(
    '.goal-filter-bar select',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  assert(linkedFilter.includes('SAT 与局部搜索'), `能力深链未带上筛选：${linkedFilter}`)
  const linkedGoals = await page.$$eval('.goal-tree-row', (nodes) => nodes.length)
  assert(linkedGoals >= 1, `能力深链后目标列表为空，实际 ${linkedGoals}`)
  await waitText(page, '掌握 ACO 求解 SAT 的基本原理与实现')
  pass('能力跳转目标拆解', `已筛选 ${linkedFilter}，${linkedGoals} 个目标可继续拆解`)
  await delay(400)
  await page.screenshot({ path: '/tmp/growth-os-ui4-goals-link.png', fullPage: true })
  pass('能力到目标链路截图', '/tmp/growth-os-ui4-goals-link.png')

  await page.goto(`${APP_URL}roadmap`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.direction-card', { timeout: 15000 })
  await clickText(page, '.direction-summary', '研究生学业与科研')
  await page.waitForSelector('.ability-node', { timeout: 8000 })
  await delay(450)
  await page.screenshot({ path: '/tmp/growth-os-ui4-roadmap.png', fullPage: true })
  pass('路线图截图', '/tmp/growth-os-ui4-roadmap.png')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.direction-card', { timeout: 15000 })
  const persistedRoadmap = await page.evaluate(() => ({
    openTrees: document.querySelectorAll('.direction-body').length,
    abilityNodes: document.querySelectorAll('.ability-node').length,
  }))
  assert(persistedRoadmap.openTrees === 0, '刷新后方向应恢复为默认折叠')
  assert(persistedRoadmap.abilityNodes === 0, '刷新后不应自动展开能力节点')
  pass('刷新后路线图持久化', '默认保持折叠，能力节点按需展开')

  await page.setViewport({ width: 390, height: 844 })
  await delay(350)
  const mobileRoadmap = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    copyWidth: document.querySelector('.direction-copy')?.getBoundingClientRect().width ?? 0,
  }))
  assert(
    mobileRoadmap.document <= mobileRoadmap.viewport + 1 &&
      mobileRoadmap.body <= mobileRoadmap.viewport + 1,
    `390px 路线图横向溢出：${JSON.stringify(mobileRoadmap)}`,
  )
  assert(mobileRoadmap.copyWidth > 200, `390px 方向摘要宽度异常：${mobileRoadmap.copyWidth}`)
  pass('390px 路线图响应式', `方向摘要可用宽度 ${Math.round(mobileRoadmap.copyWidth)}px，无页面级横向溢出`)

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\nUI 阶段 4 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-ui4-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\nUI 阶段 4 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}