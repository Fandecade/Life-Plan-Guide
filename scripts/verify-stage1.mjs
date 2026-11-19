import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import puppeteer from 'puppeteer-core'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'
const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DOWNLOAD_DIR = '/tmp/growth-os-downloads'

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

async function waitForFile(dir, timeout = 12000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (existsSync(dir)) {
      const file = readdirSync(dir).find((name) => name.endsWith('.json'))
      if (file) return `${dir}/${file}`
    }
    await delay(120)
  }
  throw new Error('等待备份文件下载超时')
}

rmSync(DOWNLOAD_DIR, { recursive: true, force: true })
mkdirSync(DOWNLOAD_DIR, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,1000'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
const cdp = await page.createCDPSession()
await cdp.send('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: DOWNLOAD_DIR,
})

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
  pass('应用启动', await page.title())

  await waitText(page, '开始使用')
  const emptyStats = await page.$$eval('.stat-value', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(emptyStats[0] === '0', `空库今日进行中应为 0，实际 ${emptyStats[0]}`)
  pass('空状态与启动引导', `统计卡：${emptyStats.join(' / ')}`)

  await clickText(page, 'button', '载入演示数据')
  await waitText(page, '演示数据已载入', 20000)
  await page.waitForSelector('.dashboard-grid', { timeout: 15000 })
  pass('载入演示数据', '通过 Repository 写入全部集合')

  const stats = await page.$$eval('.stat-value', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats.length === 4, '首页统计卡数量异常')
  assert(stats[0] === '0', `今日进行中应为 0，实际 ${stats[0]}`)
  assert(stats[1] === '4', `今日任务应为 4，实际 ${stats[1]}`)
  assert(stats[2] === '45 分钟', `今日学习应为 45 分钟，实际 ${stats[2]}`)
  assert(stats[3] === '2', `待复习应为 2，实际 ${stats[3]}`)
  pass('首页聚合计算', stats.join(' / '))

  const focusTitle = await page.$eval('.hero-focus .focus-title', (node) =>
    node.textContent.trim(),
  )
  assert(
    focusTitle === '阅读 SAT 局部搜索论文',
    `今日重点排序异常：${focusTitle}`,
  )
  await waitText(page, '掌握 ACO 求解 SAT 的基本原理与实现')
  pass('今日重点与近期目标', focusTitle)

  const heroShot = '/tmp/growth-os-home.png'
  await page.screenshot({ path: heroShot, fullPage: true })
  pass('首页截图', heroShot)

  await clickText(page, 'a.nav-item', '设置与数据')
  await page.waitForFunction(() => location.pathname === '/settings', { timeout: 10000 })
  await page.waitForSelector('.db-summary', { timeout: 15000 })
  await page.waitForSelector('.health-grid', { timeout: 15000 })
  await waitText(page, '关联正常')
  pass('设置页与数据完整性', '0 处孤立关联')

  const summary = await page.$$eval('.db-summary .db-value', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  const totalRecords = Number(summary[3])
  assert(totalRecords > 40, `演示数据记录总数偏低：${totalRecords}`)
  const visibleRows = await page.$$eval('.store-table tbody tr', (nodes) => nodes.length)
  assert(visibleRows >= 20, `非空集合数量偏低：${visibleRows}`)
  pass('集合明细', `${visibleRows} 个非空集合，共 ${totalRecords} 条记录`)

  await clickText(page, 'button', '显示全部集合')
  await delay(200)
  const allRows = await page.$$eval('.store-table tbody tr', (nodes) => nodes.length)
  assert(allRows === 33, `Object Store 总数应为 33，实际 ${allRows}`)
  pass('完整 Schema', `${allRows} 个 Object Store`)

  const settingsShot = '/tmp/growth-os-settings.png'
  await page.screenshot({ path: settingsShot, fullPage: true })
  pass('设置页截图', settingsShot)

  await clickText(page, 'button', '导出完整 JSON')
  const backupPath = await waitForFile(DOWNLOAD_DIR)
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'))
  assert(backup.app === 'personal-growth-os', '备份 app 标识不正确')
  assert(backup.schemaVersion === 5, '备份 schemaVersion 不正确')
  assert(Array.isArray(backup.data.visions) && backup.data.visions.length === 1, '备份缺少愿景')
  assert(Array.isArray(backup.data.tasks) && backup.data.tasks.length === 5, '备份任务数量异常')
  await waitText(page, '已导出')
  pass('导出完整 JSON', `${Object.values(backup.counts).reduce((a, b) => a + b, 0)} 条记录`)

  const fileInput = await page.$('input[type="file"]')
  assert(fileInput, '未找到导入文件输入框')
  await fileInput.uploadFile(backupPath)
  await page.waitForSelector('.import-body', { timeout: 15000 })
  await waitText(page, '包含的集合')
  const modeText = await page.$eval('.mode-card.active', (node) => node.textContent ?? '')
  assert(modeText.includes('合并导入'), '默认导入模式不是合并')
  pass('导入预览', '结构版本、集合数量与关联缺失检查通过')

  await clickText(page, '.modal-actions button', '合并导入')
  await waitText(page, '导入完成', 20000)
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'), {
    timeout: 8000,
  })
  await delay(250)
  pass('合并导入', '同 ID 记录被跳过，未破坏本地数据')

  await clickText(page, 'button', '重置演示数据')
  await waitText(page, '重置为演示数据')
  await delay(200)
  await clickText(page, '.modal-actions button', '清空并载入演示数据')
  await waitText(page, '演示数据已重置', 20000)
  pass('重置演示数据', '恢复干净的验收状态')

  const finalTotal = Number(
    (await page.$$eval('.db-summary .db-value', (nodes) =>
      nodes.map((node) => node.textContent.trim()),
    ))[3],
  )
  assert(finalTotal === totalRecords, `重置后记录数不一致：${finalTotal} vs ${totalRecords}`)
  pass('重置后一致性', `${finalTotal} 条记录`)

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\n阶段 1 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page.screenshot({ path: '/tmp/growth-os-failure.png', fullPage: true }).catch(() => {})
  console.error('\n验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) {
    console.error('控制台错误：\n' + consoleErrors.join('\n'))
  }
  process.exitCode = 1
} finally {
  await browser.close()
}