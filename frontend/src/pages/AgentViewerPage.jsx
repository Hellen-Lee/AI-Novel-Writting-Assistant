import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { listProjects } from '../api/projects'
import { getAgentRun, listAgentRuns } from '../api/agentViewer'
import { getErrorMessage } from '../api/client'
import { Button } from '../components/ui/Button'
import { RunDetail } from '../components/agent-viewer/RunDetail'
import { RunList } from '../components/agent-viewer/RunList'
import './AgentViewerPage.css'

export default function AgentViewerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = searchParams.get('project') || ''
  const runId = searchParams.get('run') || ''

  const [projects, setProjects] = useState([])
  const [runs, setRuns] = useState([])
  const [run, setRun] = useState(null)
  const [listError, setListError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const projectOptions = useMemo(
    () =>
      (projects || []).map((item) => ({
        id: item.id,
        name: item.name || item.id,
      })),
    [projects],
  )

  const setQuery = useCallback(
    (nextProject, nextRun) => {
      const params = {}
      if (nextProject) params.project = nextProject
      if (nextRun) params.run = nextRun
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  const loadProjects = useCallback(async () => {
    try {
      const data = await listProjects()
      const items = Array.isArray(data) ? data : []
      setProjects(items)
      return items
    } catch (err) {
      setListError(getErrorMessage(err, '无法加载项目列表'))
      return []
    }
  }, [])

  const loadRuns = useCallback(async (pid) => {
    if (!pid) {
      setRuns([])
      return
    }
    setListLoading(true)
    setListError('')
    try {
      const data = await listAgentRuns(pid)
      setRuns(Array.isArray(data?.runs) ? data.runs : [])
    } catch (err) {
      setRuns([])
      setListError(getErrorMessage(err, '无法加载 run 列表'))
    } finally {
      setListLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (pid, rid) => {
    if (!pid || !rid) {
      setRun(null)
      return
    }
    setDetailLoading(true)
    setDetailError('')
    try {
      setRun(await getAgentRun(pid, rid))
    } catch (err) {
      setRun(null)
      setDetailError(getErrorMessage(err, '无法加载 run 详情'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadProjects().then((items) => {
      if (cancelled || projectId || !items[0]?.id) return
      setQuery(items[0].id, '')
    })
    return () => {
      cancelled = true
    }
    // 仅挂载时拉项目；已有 ?project= 则不覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadRuns(projectId)
  }, [projectId, loadRuns])

  useEffect(() => {
    if (!projectId || !runId) {
      setRun(null)
      return undefined
    }
    loadDetail(projectId, runId)
    return undefined
  }, [projectId, runId, loadDetail])

  const onRefresh = () => {
    loadProjects()
    loadRuns(projectId)
    if (runId) loadDetail(projectId, runId)
  }

  return (
    <div className="agent-viewer-page">
      <header className="agent-viewer-page__header">
        <div className="agent-viewer-page__title">
          <h1>Agent 观测</h1>
          <p>开发者只读 · 每次模型调用的 skill / 工具 / prompt</p>
        </div>
        <div className="agent-viewer-page__actions">
          <label className="agent-viewer-page__project">
            <span>项目</span>
            <select
              value={projectId}
              onChange={(event) => setQuery(event.target.value, '')}
            >
              {projectOptions.length === 0 ? (
                <option value="">暂无项目</option>
              ) : null}
              {projectOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw size={14} strokeWidth={2} />
            刷新
          </Button>
        </div>
      </header>

      <div className="agent-viewer-page__body">
        <aside className="agent-viewer-page__list">
          {listError ? (
            <p className="agent-viewer-page__error">{listError}</p>
          ) : null}
          {listLoading ? (
            <p className="agent-viewer-page__hint">加载列表…</p>
          ) : (
            <RunList
              runs={runs}
              selectedId={runId}
              onSelect={(id) => setQuery(projectId, id)}
            />
          )}
        </aside>
        <main className="agent-viewer-page__detail">
          <RunDetail run={run} loading={detailLoading} error={detailError} />
        </main>
      </div>
    </div>
  )
}
