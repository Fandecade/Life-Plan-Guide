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

async function clickNodeAction(page, name, label) {
  const nodes = await page.$$('.tree-node')
  for (const node of nodes) {
    const nodeName = await node
      .$eval('.node-name', (element) => (element.textContent ?? '').trim())
      .catch(() => '')
    if (nodeName !== name) continue
    await node.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    const button = await node.$(`button[aria-label="${label}"]`)
    if (!button) throw new Error(`节点中未找到操作：${label}`)
    await button.click()
    return
  }
  throw new Error(`未找到能力节点：${name}`)
}

async function clickCardAction(page, selector, name, label) {
  const cards = await page.$$(selector)
  for (const card of cards) {
    const content = await card.evaluate((node) => (node.textContent ?? '').trim())
    if (!content.includes(name)) continue
    await card.evaluate((node) => node.scrollIntoView({ block: 'center' }))
    const button = await card.$(`button[aria-label="${label}"]`)
    if (!button) throw new Error(`卡片中未找到操作：${label}`)
    await button.click()
    return
  }
  throw new Error(`未找到卡片：${name}`)
}

async function toggleRelation(page, directionName, checked) {
  const rows = await page.$$('.relation-row')
  for (const row of rows) {
    const content = await row.evaluate((node) => (node.textContent ?? '').trim())
    if (!content.includes(directionName)) continue
    const input = await row.$('input[type="checkbox"]')
    if (!input) throw new Error('关联方向行缺少复选框')
    const isChecked = await input.evaluate((element) => element.checked)
    if (isChecked !== checked) await input.click()
    return row
  }
  throw new Error(`未找到关联方向：${directionName}`)
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
  await page.waitForSelector('.map-card', { timeout: 15000 })
  pass('进入发展路线')

  const stats = await page.$$eval('.roadmap-stat .stat-number', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats[0] === '5', `能力节点应为 5，实际 ${stats[0]}`)
  assert(stats[1] === '2', `里程碑应为 2，实际 ${stats[1]}`)
  assert(stats[2] === '1', `进行中里程碑应为 1，实际 ${stats[2]}`)
  assert(stats[3] === '2', `覆盖方向应为 2，实际 ${stats[3]}`)
  const nodeCount = await page.$$eval('.tree-node', (nodes) => nodes.length)
  assert(nodeCount === 5, `能力树节点应为 5，实际 ${nodeCount}`)
  pass('能力地图聚合', `${stats.join(' / ')}，${nodeCount} 个树节点`)

  await clickText(page, '.header-actions button', '新建能力')
  await page.waitForSelector('#competency-name', { timeout: 8000 })
  await setInput(page, '#competency-name', '产品设计')
  await setInput(page, '#competency-desc', '能够从用户问题出发定义可验证的产品方案。')
  await setSelect(page, '#competency-category', 'SKILL')
  await setSelect(page, '#competency-current', 'L1')
  await setSelect(page, '#competency-target', 'L3')
  await setSelect(page, '#competency-status', 'LEARNING')
  await setInput(page, '#competency-criteria', '能独立完成需求分析、原型设计和一轮用户验证。')
  await toggleRelation(page, '软硬件全栈工程', true)
  await delay(150)
  const relationRow = await toggleRelation(page, '软硬件全栈工程', true)
  const levelSelect = await relationRow.$('select[aria-label="要求等级"]')
  if (levelSelect) await levelSelect.select('L3')
  const prioritySelect = await relationRow.$('select[aria-label="关联优先级"]')
  if (prioritySelect) await prioritySelect.select('HIGH')
  await clickText(page, '.modal-actions button', '添加能力')
  await waitText(page, '能力节点已添加', 15000)
  await waitModalClosed(page)
  await waitText(page, '产品设计')
  pass('创建能力', '关联到软硬件全栈工程，要求 L3')

  await clickNodeAction(page, '产品设计', '编辑能力')
  await page.waitForSelector('#competency-name', { timeout: 8000 })
  await setInput(page, '#competency-name', '产品设计与需求分析')
  await toggleRelation(page, '研究生学业与科研', true)
  await delay(150)
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '能力节点已更新', 15000)
  await waitModalClosed(page)
  await waitText(page, '产品设计与需求分析')
  const tagCount = await page.$$eval('.tree-node', (nodes) => {
    const node = nodes.find(
      (element) =>
        (element.querySelector('.node-name')?.textContent ?? '').trim() ===
        '产品设计与需求分析',
    )
    return node ? node.querySelectorAll('.direction-tag').length : 0
  })
  assert(tagCount === 2, `编辑后应有 2 个方向关联，实际 ${tagCount}`)
  pass('编辑能力与多方向关联', '同一能力被 2 个方向共享')

  await clickNodeAction(page, '产品设计与需求分析', '添加子能力')
  await page.waitForSelector('#competency-name', { timeout: 8000 })
  await setInput(page, '#competency-name', '用户访谈')
  await setInput(page, '#competency-desc', '能够设计并执行一轮用户访谈。')
  await setSelect(page, '#competency-current', 'L0')
  await setSelect(page, '#competency-target', 'L2')
  await clickText(page, '.modal-actions button', '添加能力')
  await waitText(page, '能力节点已添加', 15000)
  await waitModalClosed(page)
  await waitText(page, '用户访谈')
  const afterChild = await page.$$eval('.tree-node', (nodes) => nodes.length)
  assert(afterChild === 7, `添加子能力后应有 7 个节点，实际 ${afterChild}`)
  pass('WBS 式能力树', '新增子能力节点')

  await clickNodeAction(page, '用户访谈', '归档能力')
  await waitText(page, '归档内容')
  await clickText(page, '.modal-actions button', '确认归档')
  await waitText(page, '已归档，可随时恢复', 15000)
  await waitModalClosed(page)
  await delay(300)
  const visibleChild = await page.$$eval('.tree-node', (nodes) =>
    nodes.some(
      (node) =>
        (node.querySelector('.node-name')?.textContent ?? '').trim() === '用户访谈',
    ),
  )
  assert(!visibleChild, '归档能力仍显示在默认树中')
  await clickText(page, '.toolbar-actions button', '显示已归档')
  await delay(300)
  await clickNodeAction(page, '用户访谈', '恢复能力')
  await waitText(page, '恢复内容')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  await clickText(page, '.toolbar-actions button', '隐藏已归档')
  pass('归档与恢复能力')

  await clickText(page, '.view-tab', '里程碑')
  await page.waitForSelector('.milestone-board', { timeout: 8000 })
  const boardCards = await page.$$eval('.milestone-card', (nodes) => nodes.length)
  assert(boardCards === 2, `里程碑卡应为 2，实际 ${boardCards}`)
  pass('里程碑视图', `${boardCards} 个里程碑`)

  const columns = await page.$$('.direction-column')
  const engineeringColumn = await (async () => {
    for (const column of columns) {
      const content = await column.evaluate((node) => (node.textContent ?? '').trim())
      if (content.includes('软硬件全栈工程')) return column
    }
    throw new Error('未找到软硬件全栈工程列')
  })()
  const addButton = await engineeringColumn.$('button[aria-label="在此方向添加里程碑"]')
  if (!addButton) throw new Error('方向列缺少添加里程碑按钮')
  await addButton.click()

  await page.waitForSelector('#milestone-name', { timeout: 8000 })
  await setInput(page, '#milestone-name', '完成产品原型')
  await setInput(page, '#milestone-desc', '完成可演示的产品原型与一轮用户测试。')
  await setInput(page, '#milestone-start', '2027-01-10')
  await setInput(page, '#milestone-due', '2027-03-31')
  await setSelect(page, '#milestone-importance', 'IMPORTANT')
  await setSelect(page, '#milestone-status', 'IN_PROGRESS')
  await setInput(page, '#milestone-criteria', '原型可运行，完成 5 位用户测试并记录反馈。')
  await clickText(page, '.modal-actions button', '添加里程碑')
  await waitText(page, '里程碑已添加', 15000)
  await waitModalClosed(page)
  await waitText(page, '完成产品原型')
  pass('创建里程碑', '归属软硬件全栈工程')

  await clickCardAction(page, '.milestone-card', '完成产品原型', '编辑里程碑')
  await page.waitForSelector('#milestone-status', { timeout: 8000 })
  await setSelect(page, '#milestone-status', 'COMPLETED')
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '里程碑已更新', 15000)
  await waitModalClosed(page)
  const completedCard = await page.$$eval('.milestone-card', (nodes) =>
    nodes.find((node) => (node.textContent ?? '').includes('完成产品原型'))?.textContent ?? '',
  )
  assert(completedCard.includes('完成'), '里程碑状态未更新为完成')
  pass('编辑里程碑状态')

  await clickText(page, '.view-tab', '时间线')
  await page.waitForSelector('.timeline-table', { timeout: 8000 })
  const yearBars = await page.$$eval('.timeline-bar', (nodes) => nodes.length)
  assert(yearBars === 3, `年视图时间条应为 3，实际 ${yearBars}`)
  const yearTicks = await page.$$eval('.tick', (nodes) => nodes.length)
  await clickText(page, '.scale-switch button', '季度')
  await delay(200)
  const quarterTicks = await page.$$eval('.tick', (nodes) => nodes.length)
  await clickText(page, '.scale-switch button', '月')
  await delay(200)
  const monthTicks = await page.$$eval('.tick', (nodes) => nodes.length)
  assert(quarterTicks > yearTicks, '季度刻度未增加')
  assert(monthTicks > quarterTicks, '月刻度未增加')
  pass('多轨道时间线', `年 ${yearTicks} / 季度 ${quarterTicks} / 月 ${monthTicks} 个刻度，${yearBars} 条里程碑`)

  await clickText(page, '.timeline-bar', '完成产品原型')
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '验收条件')
  await page.click('.drawer-head button')
  await page.waitForFunction(() => !document.querySelector('.drawer-panel'), {
    timeout: 8000,
  })
  pass('时间线条目打开里程碑详情')

  await page.screenshot({ path: '/tmp/growth-os-roadmap.png', fullPage: true })
  pass('路线图截图', '/tmp/growth-os-roadmap.png')

  await clickText(page, '.view-tab', '里程碑')
  await delay(200)
  await clickCardAction(page, '.milestone-card', '完成产品原型', '归档里程碑')
  await waitText(page, '归档内容')
  await clickText(page, '.modal-actions button', '确认归档')
  await waitText(page, '已归档，可随时恢复', 15000)
  await waitModalClosed(page)
  await delay(250)
  const hiddenMilestone = await page.$$eval('.milestone-card', (nodes) =>
    nodes.some((node) => (node.textContent ?? '').includes('完成产品原型')),
  )
  assert(!hiddenMilestone, '归档里程碑仍显示')
  await clickText(page, '.toolbar-actions button', '显示已归档')
  await delay(250)
  await clickCardAction(page, '.milestone-card', '完成产品原型', '恢复里程碑')
  await waitText(page, '恢复内容')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  pass('归档与恢复里程碑')

  const filterOptions = await page.$$eval('select.direction-filter option', (options) =>
    options.map((option) => ({ value: option.value, text: option.textContent.trim() })),
  )
  const researchOption = filterOptions.find((option) => option.text.includes('研究生'))
  assert(researchOption, '未找到研究生方向筛选项')
  await setSelect(page, 'select.direction-filter', researchOption.value)
  await delay(300)
  const filteredColumns = await page.$$eval('.direction-column', (nodes) => nodes.length)
  assert(filteredColumns === 1, `方向筛选后应只剩 1 列，实际 ${filteredColumns}`)
  await setSelect(page, 'select.direction-filter', 'all')
  pass('方向筛选')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.map-card', { timeout: 15000 })
  await waitText(page, '产品设计与需求分析')
  await waitText(page, '用户访谈')
  await clickText(page, '.view-tab', '里程碑')
  await waitText(page, '完成产品原型')
  pass('刷新后持久化')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\n阶段 3 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-stage3-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\n阶段 3 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}