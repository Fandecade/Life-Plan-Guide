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

async function findAbilityNode(page, name) {
  const found = await page.evaluate((abilityName) => {
    return Array.from(document.querySelectorAll('.ability-node')).some(
      (element) => element.dataset.abilityName === abilityName,
    )
  }, name)
  if (!found) throw new Error(`未找到能力节点：${name}`)
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
      const ownedSelector =
        targetSelector === '.ability-expand' || targetSelector === '.ability-main'
          ? `:scope > .ability-row ${targetSelector}`
          : targetSelector === '.ability-add-milestone'
            ? ':scope > .ability-detail > .ability-milestones .ability-add-milestone'
            : targetSelector
      const target = node.querySelector(ownedSelector)
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
  await page.waitForSelector('.direction-card', { timeout: 15000 })
  pass('进入发展路线')

  const stats = await page.$$eval('.roadmap-stat .stat-number', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats[0] === '5', `能力节点应为 5，实际 ${stats[0]}`)
  assert(stats[1] === '2', `里程碑应为 2，实际 ${stats[1]}`)
  assert(stats[2] === '1', `进行中里程碑应为 1，实际 ${stats[2]}`)
  assert(stats[3] === '2', `覆盖方向应为 2，实际 ${stats[3]}`)
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
  const prioritySelect = await relationRow.$('select[aria-label="关联优先级"]')
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
  const directionTags = await page.$$eval('.detail-tag', (nodes) =>
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
  await waitText(page, '归档内容')
  await clickText(page, '.modal-actions button', '确认归档')
  await waitText(page, '已归档，可随时恢复', 15000)
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
  await waitText(page, '恢复内容')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  await clickText(page, '.toolbar-actions button', '隐藏归档')
  await ensureAbilityExpanded(page, '产品设计与需求分析')
  pass('归档与恢复能力')

  await clickAbilityControl(page, '产品设计与需求分析', '.ability-add-milestone')
  await page.waitForSelector('#milestone-name', { timeout: 8000 })
  const linkedDirection = await page.$eval(
    '#milestone-direction',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  const linkedCompetency = await page.$eval(
    '#milestone-competency',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  assert(linkedDirection === '软硬件全栈工程', `里程碑未继承当前方向：${linkedDirection}`)
  assert(linkedCompetency === '产品设计与需求分析', `里程碑未继承当前能力：${linkedCompetency}`)
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
  await ensureAbilityExpanded(page, '产品设计与需求分析')
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.ability-milestone')).some(
      (node) => (node.textContent ?? '').includes('完成产品原型'),
    ),
    { timeout: 8000 },
  )
  pass('能力里程碑创建', '里程碑与时间节点直接挂在能力节点下')

  await page.evaluate(() => {
    const milestone = Array.from(document.querySelectorAll('.ability-milestone')).find(
      (node) => (node.textContent ?? '').includes('完成产品原型'),
    )
    if (!milestone) throw new Error('未找到完成产品原型里程碑')
    milestone.click()
  })
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '验收条件')
  await waitText(page, '关联能力')
  await waitText(page, '产品设计与需求分析')
  await clickText(page, '.drawer-panel button', '编辑里程碑')
  await page.waitForSelector('#milestone-status', { timeout: 8000 })
  await setSelect(page, '#milestone-status', 'COMPLETED')
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '里程碑已更新', 15000)
  await waitModalClosed(page)
  await ensureAbilityExpanded(page, '产品设计与需求分析')
  const completedMilestone = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('.ability-milestone')).find((item) =>
      (item.textContent ?? '').includes('完成产品原型'),
    )
    return node?.querySelector('.milestone-status')?.textContent?.trim() ?? ''
  })
  assert(completedMilestone === '完成', `能力里程碑状态未更新：${completedMilestone}`)
  pass('编辑能力里程碑状态')

  const timelineDirectionOption = await page.$$eval(
    'select[aria-label="时间线方向范围"] option',
    (options) => {
      const option = options.find((item) => (item.textContent ?? '').includes('软硬件全栈工程'))
      return option ? { value: option.value, text: option.textContent?.trim() ?? '' } : null
    },
  )
  assert(timelineDirectionOption, '时间线缺少软硬件全栈工程筛选')
  await setSelect(page, 'select[aria-label="时间线方向范围"]', timelineDirectionOption.value)
  const timelineCompetencyOption = await page.$$eval(
    'select[aria-label="时间线能力范围"] option',
    (options) => {
      const option = options.find((item) => (item.textContent ?? '').includes('产品设计与需求分析'))
      return option ? { value: option.value, text: option.textContent?.trim() ?? '' } : null
    },
  )
  assert(timelineCompetencyOption, '时间线缺少产品设计与需求分析筛选')
  await setSelect(page, 'select[aria-label="时间线能力范围"]', timelineCompetencyOption.value)
  await page.waitForFunction(
    () => document.querySelectorAll('.s-timeline-node').length === 1,
    { timeout: 8000 },
  )
  const timelineNodeText = await page.$eval(
    '.s-timeline-node',
    (node) => (node.textContent ?? '').trim(),
  )
  assert(timelineNodeText.includes('完成产品原型'), 'S 型时间线未显示新里程碑')
  await page.click('.s-timeline-node')
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '验收条件')
  await waitText(page, '产品设计与需求分析')
  await page.click('.drawer-head button')
  await page.waitForFunction(() => !document.querySelector('.drawer-panel'), { timeout: 8000 })
  pass('S 型时间线筛选与详情', '方向 + 能力筛选收敛到新里程碑')

  await page.screenshot({ path: '/tmp/growth-os-roadmap.png', fullPage: true })
  pass('路线图截图', '/tmp/growth-os-roadmap.png')

  await page.evaluate(() => {
    const milestone = Array.from(document.querySelectorAll('.ability-milestone')).find(
      (node) => (node.textContent ?? '').includes('完成产品原型'),
    )
    if (!milestone) throw new Error('未找到用于归档的里程碑')
    milestone.click()
  })
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await clickText(page, '.drawer-panel button', '归档里程碑')
  await waitText(page, '归档内容')
  await clickText(page, '.modal-actions button', '确认归档')
  await waitText(page, '已归档，可随时恢复', 15000)
  await waitModalClosed(page)
  await delay(250)
  let hiddenMilestone = await page.$$eval('.ability-milestone', (nodes) =>
    nodes.some((node) => (node.textContent ?? '').includes('完成产品原型')),
  )
  assert(!hiddenMilestone, '归档里程碑仍显示')
  await clickText(page, '.toolbar-actions button', '显示归档')
  await ensureAbilityExpanded(page, '产品设计与需求分析')
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.ability-milestone')).some(
      (node) => (node.textContent ?? '').includes('完成产品原型'),
    ),
    { timeout: 8000 },
  )
  await page.evaluate(() => {
    const milestone = Array.from(document.querySelectorAll('.ability-milestone')).find(
      (node) => (node.textContent ?? '').includes('完成产品原型'),
    )
    if (!milestone) throw new Error('未找到已归档的里程碑')
    milestone.click()
  })
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await clickText(page, '.drawer-panel button', '恢复里程碑')
  await waitText(page, '恢复内容')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  await clickText(page, '.toolbar-actions button', '隐藏归档')
  pass('归档与恢复里程碑')

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
  await waitText(page, '用户访谈')
  await waitText(page, '完成产品原型')
  pass('刷新后持久化', '能力、子能力、里程碑与能力归属均保留')

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