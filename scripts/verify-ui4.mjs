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
    timelineNodes: document.querySelectorAll('.s-timeline-node').length,
    snakeMode: document.querySelector('.s-timeline-board')?.getAttribute('data-timeline-mode'),
  }))
  assert(initialRoadmap.directions >= 2, `发展方向不足：${initialRoadmap.directions}`)
  assert(initialRoadmap.openTrees === 0, `路线图默认不应展开能力树，实际 ${initialRoadmap.openTrees}`)
  assert(initialRoadmap.abilityNodes === 0, `默认不应显示能力节点，实际 ${initialRoadmap.abilityNodes}`)
  assert(initialRoadmap.timelineNodes >= 2, `S 型时间线节点不足：${initialRoadmap.timelineNodes}`)
  assert(initialRoadmap.snakeMode === 'snake', '总时间线未启用 S 型排布')
  pass('克制默认视图', `${initialRoadmap.directions} 个方向折叠 · ${initialRoadmap.timelineNodes} 个时间节点`)

  await page.click('.direction-card:first-of-type .direction-summary')
  await page.waitForSelector('.direction-card:first-of-type .ability-node', { timeout: 8000 })
  const treeNodeCount = await page.$$eval(
    '.direction-card:first-of-type .ability-node',
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
  await findAbilityButton('SAT 与局部搜索', '.ability-expand')
  await page.waitForSelector('.ability-milestone', { timeout: 8000 })
  const linkedMilestoneText = await page.$eval(
    '.ability-milestone',
    (node) => (node.textContent ?? '').trim(),
  )
  assert(linkedMilestoneText.includes('独立完成 SAT 算法复现实验'), '能力节点下未显示关联里程碑')
  pass('能力与里程碑融合', '展开能力后同时显示里程碑和对应时间节点')

  await findAbilityButton('SAT 与局部搜索')
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '成长曲线')
  await waitText(page, '评价标准')
  await waitText(page, '关联发展方向')
  const growthSvg = await page.$$eval('.growth-svg', (nodes) => nodes.length)
  assert(growthSvg === 1, '能力详情未渲染成长曲线')
  pass('能力节点详情', '等级、评价标准、方向与成长曲线')
  await closeDrawer(page)

  await setSelect(page, 'select[aria-label="时间线方向范围"]', await page.$eval(
    'select[aria-label="时间线方向范围"] option:nth-child(2)',
    (element) => element.value,
  ))
  await page.waitForFunction(
    () => document.querySelectorAll('.s-timeline-node').length === 1,
    { timeout: 8000 },
  )
  const directionTimelineNode = await page.$eval(
    '.s-timeline-node',
    (node) => (node.textContent ?? '').trim(),
  )
  assert(directionTimelineNode.includes('SAT 算法复现实验'), '方向筛选后的时间线节点不正确')
  pass('时间线方向筛选', '仅保留研究生方向的 1 个时间节点')

  const satTimelineOption = await page.$$eval(
    'select[aria-label="时间线能力范围"] option',
    (options) => {
      const option = options.find((item) => (item.textContent ?? '').includes('SAT 与局部搜索'))
      return option ? { value: option.value, text: option.textContent?.trim() ?? '' } : null
    },
  )
  assert(satTimelineOption, '时间线能力筛选缺少 SAT 与局部搜索')
  await setSelect(page, 'select[aria-label="时间线能力范围"]', satTimelineOption.value)
  await page.waitForFunction(
    () => document.querySelectorAll('.s-timeline-node').length === 1,
    { timeout: 8000 },
  )
  pass('时间线能力筛选', '可按具体能力收敛到单个里程碑')

  await page.click('.s-timeline-node')
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '验收条件')
  await waitText(page, '关联目标（1）')
  await waitText(page, '掌握 ACO 求解 SAT 的基本原理与实现')
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
  pass('S 型节点详情与日期微调', '验收条件、关联目标与日期微调均可操作')
  await closeDrawer(page)

  await setSelect(page, 'select[aria-label="时间线方向范围"]', 'all')
  await setSelect(page, 'select[aria-label="时间线能力范围"]', 'all')
  await page.waitForFunction(
    () => document.querySelectorAll('.s-timeline-node').length >= 2,
    { timeout: 8000 },
  )
  await delay(450)
  await page.screenshot({ path: '/tmp/growth-os-ui4-roadmap.png', fullPage: true })
  pass('路线图截图', '/tmp/growth-os-ui4-roadmap.png')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.direction-card', { timeout: 15000 })
  await page.waitForSelector('.s-timeline-node', { timeout: 10000 })
  const persistedRoadmap = await page.evaluate(() => ({
    openTrees: document.querySelectorAll('.direction-body').length,
    timeline: Array.from(document.querySelectorAll('.s-timeline-node')).map(
      (node) => (node.textContent ?? '').trim(),
    ),
  }))
  assert(persistedRoadmap.openTrees === 0, '刷新后方向应恢复为默认折叠')
  assert(
    persistedRoadmap.timeline.some((text) => text.includes('SAT 算法复现实验')),
    '刷新后 S 型时间线未保留里程碑',
  )
  pass('刷新后路线图持久化', '默认保持折叠，里程碑时间节点仍存在')

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