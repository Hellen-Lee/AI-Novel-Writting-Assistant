/**
 * 一键启动后端 + 前端。
 *
 * 开发（热更新）：
 *   npm run start
 *   node scripts/start.mjs
 *
 * 生产（后端无 reload + 前端预览 dist）：
 *   npm run start:prod
 *   node scripts/start.mjs --prod
 *
 * Ctrl+C 同时结束两侧进程。
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  BACKEND_URL,
  FRONTEND_DEV_URL,
  FRONTEND_PREVIEW_URL,
  backendDir,
  frontendDir,
  link,
  prefixPipe,
  resolvePython,
  root,
} from './lib.mjs'

const isProd = process.argv.includes('--prod')
const children = []
let shuttingDown = false

function fail(msg) {
  console.error(`\n[start] ${msg}`)
  process.exit(1)
}

function ensureFrontendDeps() {
  if (!existsSync(path.join(frontendDir, 'node_modules'))) {
    console.log('[start] 未检测到 frontend/node_modules，先执行 npm install…')
    const result = spawnSync('npm', ['install'], {
      cwd: frontendDir,
      stdio: 'inherit',
      shell: true,
    })
    if (result.status !== 0) fail('frontend npm install 失败')
  }
}

function ensureProdDist() {
  const distIndex = path.join(frontendDir, 'dist', 'index.html')
  if (existsSync(distIndex)) return
  console.log('[start] 未找到 frontend/dist，先执行 npm run build…')
  const result = spawnSync('node', [path.join(root, 'scripts', 'build.mjs')], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) fail('生产构建失败')
}

function spawnLabeled(label, command, args, cwd, { shell = true } = {}) {
  const child = spawn(command, args, {
    cwd,
    shell,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  })
  prefixPipe(child.stdout, label, process.stdout)
  prefixPipe(child.stderr, label, process.stderr)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(
      `\n[start] ${label} 已退出（code=${code ?? 'null'} signal=${signal ?? 'null'}），正在关闭其余进程…`,
    )
    shutdown(code ?? 1)
  })
  children.push(child)
  return child
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode !== null || child.killed) continue
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
      })
    } else {
      child.kill('SIGTERM')
    }
  }
  process.exit(exitCode)
}

process.on('SIGINT', () => {
  console.log('\n[start] 收到 Ctrl+C，正在停止…')
  shutdown(0)
})
process.on('SIGTERM', () => shutdown(0))

const python = resolvePython()
if (!python) fail('未找到 Python（请安装并确保 python/py 在 PATH 中）')
if (!existsSync(path.join(backendDir, 'app'))) fail(`未找到 ${backendDir}/app`)
if (!existsSync(path.join(frontendDir, 'package.json'))) {
  fail(`未找到 ${frontendDir}`)
}

ensureFrontendDeps()

const modeLabel = isProd ? '生产' : '开发'
const frontendUrl = isProd ? FRONTEND_PREVIEW_URL : FRONTEND_DEV_URL

console.log(`[start] AINovel — ${modeLabel}模式（后端 + 前端）`)
console.log(`  前端  ${link(frontendUrl)}`)
console.log(`  后端  ${link(BACKEND_URL)}`)
console.log('  停止  Ctrl+C\n')

if (isProd) {
  ensureProdDist()
  spawnLabeled(
    'backend',
    python,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001'],
    backendDir,
    { shell: false },
  )
  spawnLabeled(
    'frontend',
    'npm',
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'],
    frontendDir,
  )
} else {
  spawnLabeled('backend', python, ['run.py'], backendDir, { shell: false })
  spawnLabeled('frontend', 'npm', ['run', 'dev', '--', '--host', '127.0.0.1'], frontendDir)
}
