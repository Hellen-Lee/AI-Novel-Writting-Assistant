import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const root = path.resolve(__dirname, '..')
export const frontendDir = path.join(root, 'frontend')
export const backendDir = path.join(root, 'backend')

export const FRONTEND_DEV_URL = 'http://localhost:5173'
export const FRONTEND_PREVIEW_URL = 'http://localhost:4173'
export const BACKEND_URL = 'http://localhost:8001'

/** 终端可点击链接（OSC 8） */
export function link(url, label = url) {
  return `\u001b]8;;${url}\u0007${label}\u001b]8;;\u0007`
}

export function resolvePython() {
  for (const cmd of ['python', 'py', 'python3']) {
    const result = spawnSync(cmd, ['--version'], {
      shell: true,
      stdio: 'ignore',
    })
    if (!result.error && result.status === 0) return cmd
  }
  return null
}

export function prefixPipe(stream, label, write = process.stdout) {
  let buf = ''
  stream.on('data', (chunk) => {
    buf += chunk.toString()
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ''
    for (const line of lines) {
      write.write(`[${label}] ${line}\n`)
    }
  })
  stream.on('end', () => {
    if (buf) write.write(`[${label}] ${buf}\n`)
  })
}
