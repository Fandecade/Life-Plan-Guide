# Life Plan Guide｜个人成长系统

一个本地优先的个人成长与学习应用，使用 Vue 3、TypeScript、Vite 和 Dexie/IndexedDB 构建。

## 启动

环境要求：Node.js 22.12+、pnpm 10+，以及可用的 Chrome/Chromium。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

浏览器打开终端显示的本地地址（默认 `http://localhost:5173/`）。

## 常用命令

```bash
pnpm typecheck       # TypeScript / Vue 类型检查
pnpm build           # 类型检查并构建生产包
pnpm verify:smoke    # 自动启动 Vite 并执行浏览器冒烟验收
pnpm preview         # 预览已构建版本
```

验收脚本通过 `CHROME_PATH` 指定浏览器；未设置时会自动查找常见的 Linux/macOS Chrome 路径。

```bash
CHROME_PATH=/usr/bin/google-chrome-stable pnpm verify:smoke
```

## 数据说明

应用数据只保存在当前浏览器的 IndexedDB 中，不上传服务器。请在设置页定期导出完整 JSON 备份；清除浏览器站点数据会同时清除应用数据。
