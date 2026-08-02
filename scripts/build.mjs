/**
 * 一键构建前端 + 后端校验（不启动服务）。
 * 用法（仓库根目录）：
 *   npm run build
 *   node scripts/build.mjs
 *   .\scripts\build.ps1
 *
 * 可选参数：
 *   --install         先 pip install -r requirements.txt
 *   --frontend-only   只构建前端
 *   --backend-only    只校验后端
 *
 * 启动服务请用：
 *   npm run start       开发
 *   npm run start:prod  生产
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  FRONTEND_DEV_URL,
  FRONTEND_PREVIEW_URL,
  backendDir,
  frontendDir,
  link,
  resolvePython,
} from './lib.mjs'

const args = new Set(process.argv.slice(2))
const frontendOnly = args.has('--frontend-only')
const backendOnly = args.has('--backend-only')
const withInstall = args.has('--install')

function log(msg) {
  console.log(`\n==> ${msg}`)
}

function fail(msg) {
  console.error(`\n[build] ${msg}`)
  process.exit(1)
}

if (frontendOnly && backendOnly) {
  fail('不能同时指定 --frontend-only 与 --backend-only')
}

function run(command, cmdArgs, cwd, { shell = true } = {}) {
  const result = spawnSync(command, cmdArgs, {
    cwd,
    stdio: 'inherit',
    shell,
    env: process.env,
  })
  if (result.error) {
    fail(`无法执行 ${command}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`${command} ${cmdArgs.join(' ')} 失败（exit ${result.status}）`)
  }
  return true
}

function buildFrontend() {
  log('Frontend: npm run build')
  if (!existsSync(path.join(frontendDir, 'package.json'))) {
    fail(`未找到 ${frontendDir}`)
  }
  if (!existsSync(path.join(frontendDir, 'node_modules'))) {
    log('Frontend: 未检测到 node_modules，先执行 npm install')
    run('npm', ['install'], frontendDir)
  }
  run('npm', ['run', 'build'], frontendDir)
}

function buildBackend() {
  log('Backend: compile + import check')
  if (!existsSync(path.join(backendDir, 'app'))) {
    fail(`未找到 ${backendDir}/app`)
  }

  const python = resolvePython()
  if (!python) fail('未找到 Python（请安装并确保 python/py 在 PATH 中）')

  const req = path.join(backendDir, 'requirements.txt')
  if (existsSync(req) && withInstall) {
    log('Backend: pip install -r requirements.txt（--install）')
    run(python, ['-m', 'pip', 'install', '-r', 'requirements.txt'], backendDir)
  }

  run(python, ['-m', 'compileall', '-q', 'app'], backendDir, { shell: false })
  run(python, ['verify_build.py'], backendDir, { shell: false })
}

console.log('[build] AINovel — frontend + backend')
if (!backendOnly) buildFrontend()
if (!frontendOnly) buildBackend()
console.log('\n[build] 完成')
if (!backendOnly) {
  console.log('  frontend dist → frontend/dist')
  console.log(`  开发启动  npm run start       → ${link(FRONTEND_DEV_URL)}`)
  console.log(`  生产启动  npm run start:prod  → ${link(FRONTEND_PREVIEW_URL)}`)
}
if (!frontendOnly) console.log('  backend       → compileall + import 校验通过')
