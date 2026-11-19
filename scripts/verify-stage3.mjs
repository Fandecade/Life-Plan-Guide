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

async function clickAbilityAction(page, name, label) {
  const result = await page.evaluate(
    ({ abilityName, actionLabel }) => {
      const node = Array.from(document.querySelectorAll('.ability-node')).find(
        (element) => element.dataset.abilityName === abilityName,
      )
      if (!node) return { error: `未找到能力节点：${abilityName}` }
      node.scrollIntoView({ block: 'center' })
      const button = Array.from(
        node.querySelectorAll(':scope > .ability-row .ability-actions button'),
      ).find((element) => element.getAttribute('aria-label') === actionLabel)
      if (!button) return { error: `节点中未找到操作：${actionLabel}` }
      button.click()
      return {}
    },
    { abilityName: name, actionLabel: label },
  )
  if (result.error) throw new Error(result.error)
}

async function clickAbilityControl(page, name, selector) {
  const result = await page.evaluate(
    ({ abilityName, targetSelector }) => {
      const node = Array.from(document.querySelectorAll('.ability-node')).find(
        (element) => element.dataset.abilityName === abilityName,
      )
      if (!node) return { error: `未找到能力节点：${abilityName}` }
      node.scrollIntoView({ block: 'center' })
      const target = node.querySelector(`:scope > .ability-row ${targetSelector}`)
      if (!target) return { error: `节点中未找到控件：${targetSelector}` }
      target.click()
      return {}
    },
    { abilityName: name, targetSelector: selector },
  )
  if (result.error) throw new Error(result.error)
}

async function ensureAbilityExpanded(page, name) {
  const expanded = await page.evaluate((abilityName) => {
    const node = Array.from(document.querySelectorAll('.ability-node')).find(
      (element) => element.dataset.abilityName === abilityName,
    )
    if (!node) return null
    const button = node.querySelector(':scope > .ability-row .ability-expand')
    if (!button) return null
    if (button.getAttribute('aria-expanded') !== 'true') button.click()
    return true
  }, name)
  if (!expanded) throw new Error(`节点中未找到展开控件：${name}`)
}

async function toggleRelation(page, directionName, checked) {
  const rows = await page.$$('.assignment-row')
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
  await page.waitForSelector('.direction-card', { timeout: 15000 })
  pass('进入发展路线')

  const stats = await page.$$eval('.roadmap-stat strong', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats[0] === '5', `能力节点应为 5，实际 ${stats[0]}`)
  assert(stats[1] === '2', `关联目标应为 2，实际 ${stats[1]}`)
  assert(stats[2] === '2', `覆盖方向应为 2，实际 ${stats[2]}`)
  assert(stats[3] === '2', `进行中方向应为 2，实际 ${stats[3]}`)
  const initialCollapsed = await page.evaluate(() => ({
    cards: document.querySelectorAll('.direction-card').length,
    trees: document.querySelectorAll('.direction-body').length,
    nodes: document.querySelectorAll('.ability-node').length,
  }))
  assert(initialCollapsed.cards === 2, `方向卡片应为 2，实际 ${initialCollapsed.cards}`)
  assert(initialCollapsed.trees === 0 && initialCollapsed.nodes === 0, '路线图默认应只显示方向摘要')
  pass('路线图摘要与统计', `${stats.join(' / ')}，默认折叠能力树`)

  await clickText(page, '.direction-summary', '软硬件全栈工程')
  await page.waitForSelector('.direction-card .ability-node', { timeout: 8000 })
  const seedTreeNodes = await page.$$eval('.ability-node', (nodes) => nodes.length)
  assert(seedTreeNodes >= 2, `展开后能力节点不足：${seedTreeNodes}`)
  pass('展开方向能力树', `${seedTreeNodes} 个能力节点`)

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
  const prioritySelect = await relationRow.$('select[aria-label="方向内优先级"]')
  if (prioritySelect) await prioritySelect.select('HIGH')
  await clickText(page, '.modal-actions button', '添加能力')
  await waitText(page, '能力节点已添加', 15000)
  await waitModalClosed(page)
  await waitText(page, '产品设计')
  pass('创建能力', '关联到软硬件全栈工程，要求 L3')

  await clickAbilityAction(page, '产品设计', '编辑能力')
  await page.waitForSelector('#competency-name', { timeout: 8000 })
  await setInput(page, '#competency-name', '产品设计与需求分析')
  await toggleRelation(page, '研究生学业与科研', true)
  await delay(150)
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '能力节点已更新', 15000)
  await waitModalClosed(page)
  await waitText(page, '产品设计与需求分析')
  await clickAbilityControl(page, '产品设计与需求分析', '.ability-main')
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '所属方向')
  const directionTags = await page.$$eval('.detail-tag-list .goal-tag', (nodes) =>
    nodes.map((node) => (node.textContent ?? '').trim()),
  )
  assert(directionTags.length === 2, `编辑后应有 2 个方向关联，实际 ${directionTags.length}`)
  pass('编辑能力与多方向关联', '同一能力被 2 个方向共享')
  await page.click('.drawer-head button')
  await page.waitForFunction(() => !document.querySelector('.drawer-panel'), { timeout: 8000 })

  await clickAbilityAction(page, '产品设计与需求分析', '添加子能力')
  await page.waitForSelector('#competency-name', { timeout: 8000 })
  await setInput(page, '#competency-name', '用户访谈')
  await setInput(page, '#competency-desc', '能够设计并执行一轮用户访谈。')
  await setSelect(page, '#competency-current', 'L0')
  await setSelect(page, '#competency-target', 'L2')
  await clickText(page, '.modal-actions button', '添加能力')
  await waitText(page, '能力节点已添加', 15000)
  await waitModalClosed(page)
  await ensureAbilityExpanded(page, '产品设计与需求分析')
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.ability-node')).some(
        (node) => node.dataset.abilityName === '用户访谈',
      ),
    { timeout: 8000 },
  )
  pass('WBS 式能力树', '新增子能力并展开父节点')

  await clickAbilityAction(page, '用户访谈', '归档能力')
  await waitText(page, '将归档「用户访谈」')
  await clickText(page, '.modal-actions button', '归档能力')
  await waitText(page, '能力已归档', 15000)
  await waitModalClosed(page)
  await delay(300)
  const visibleChild = await page.$$eval('.ability-name-line strong', (nodes) =>
    nodes.some((node) => (node.textContent ?? '').trim() === '用户访谈'),
  )
  assert(!visibleChild, '归档能力仍显示在默认树中')
  await clickText(page, '.toolbar-actions button', '显示归档')
  await delay(300)
  await ensureAbilityExpanded(page, '产品设计与需求分析')
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.ability-node')).some(
        (node) => node.dataset.abilityName === '用户访谈',
      ),
    { timeout: 8000 },
  )
  await clickAbilityAction(page, '用户访谈', '恢复能力')
  await waitText(page, '将恢复「用户访谈」')
  await clickText(page, '.modal-actions button', '恢复能力')
  await waitText(page, '能力已恢复', 15000)
  await waitModalClosed(page)
  await clickText(page, '.toolbar-actions button', '隐藏归档')
  await ensureAbilityExpanded(page, '产品设计与需求分析')
  pass('归档与恢复能力')

  await clickAbilityControl(page, '产品设计与需求分析', '.ability-decompose')
  await page.waitForFunction(() => location.pathname === '/goals', { timeout: 10000 })
  await page.waitForSelector('.goal-tree', { timeout: 8000 })
  const linkedFilter = await page.$eval(
    '.goal-filter-bar select',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  assert(linkedFilter.includes('产品设计与需求分析'), `能力深链未带上筛选：${linkedFilter}`)
  pass('能力跳转目标拆解', `已筛选 ${linkedFilter}`)
  await delay(300)
  await page.screenshot({ path: '/tmp/growth-os-stage3-goals.png', fullPage: true })
  pass('能力到目标截图', '/tmp/growth-os-stage3-goals.png')

  await page.goto(new URL('roadmap', APP_URL).toString(), { waitUntil: 'networkidle0' })
  await page.waitForSelector('.direction-card', { timeout: 15000 })
  await clickText(page, '.direction-summary', '软硬件全栈工程')
  await page.waitForSelector('.ability-node', { timeout: 8000 })
  await ensureAbilityExpanded(page, '产品设计与需求分析')
  await delay(400)
  await page.screenshot({ path: '/tmp/growth-os-roadmap.png', fullPage: true })
  pass('路线图截图', '/tmp/growth-os-roadmap.png')

  const filterOptions = await page.$$eval('select[aria-label="按方向筛选"] option', (options) =>
    options.map((option) => ({ value: option.value, text: option.textContent.trim() })),
  )
  const researchOption = filterOptions.find((option) => option.text.includes('研究生'))
  assert(researchOption, '未找到研究生方向筛选项')
  await setSelect(page, 'select[aria-label="按方向筛选"]', researchOption.value)
  await page.waitForFunction(
    () => document.querySelectorAll('.direction-card').length === 1,
    { timeout: 8000 },
  )
  pass('方向筛选')
  await setSelect(page, 'select[aria-label="按方向筛选"]', 'all')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.direction-card', { timeout: 15000 })
  assert(
    (await page.$$eval('.direction-body', (nodes) => nodes.length)) === 0,
    '刷新后路线图应恢复为默认折叠',
  )
  await clickText(page, '.direction-summary', '软硬件全栈工程')
  await waitText(page, '产品设计与需求分析')
  await ensureAbilityExpanded(page, '产品设计与需求分析')
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.ability-node')).some(
        (node) => node.dataset.abilityName === '用户访谈',
      ),
    { timeout: 8000 },
  )
  pass('刷新后持久化', '能力、子能力与方向归属均保留')

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
  console.error(
    '\n阶段 3 验收失败：',
    error instanceof Error ? (error.stack ?? error.message) : error,
  )
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}