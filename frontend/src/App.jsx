import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setMessage(data.message || JSON.stringify(data)))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="container">
      <h1>AI 小说创作 Agent</h1>
      <p>前端已启动，正在测试与后端连通……</p>
      {message && <p className="success">后端响应：{message}</p>}
      {error && <p className="error">连接失败：{error}</p>}
    </div>
  )
}

export default App
