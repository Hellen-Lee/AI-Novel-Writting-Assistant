import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { listProjects } from '../api/projects'
import { listAgentRuns, listSessionAgentRuns } from '../api/agentViewer'
import { getSession, listSessions } from '../api/sessions'
import { getErrorMessage } from '../api/client'
import { Button } from '../components/ui/Button'
import { SessionDetail } from '../components/agent-viewer/SessionDetail'
import { SessionList } from '../components/agent-viewer/SessionList'
import { NONE_SESSION_ID } from '../components/agent-viewer/format'
import { groupRunsBySession } from '../components/agent-viewer/pipeline'
import './AgentViewerPage.css'

export default function AgentViewerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = searchParams.get('project') || ''
  const sessionId = searchParams.get('session') || ''
  const runId = searchParams.get('run') || ''

  const [projects, setProjects] = useState([])
  const [sessions, setSessions] = useState([])
  const [sessionRuns, setSessionRuns] = useState([])
  const [sessionInfo, setSessionInfo] = useState(null)
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

  const selectedSession = useMemo(() => {
    const found = sessions.find((item) => item.sessionId === sessionId)
    if (found) return found
    if (!sessionId) return null
    return {
      sessionId,
      title: sessionInfo?.title || sessionId,
      runs: [],
      updatedAt: '',
    }
  }, [sessions, sessionId, sessionInfo])

  const setQuery = useCallback(
    (nextProject, nextSession, nextRun) => {
      const params = {}
      if (nextProject) params.project = nextProject
      if (nextSession) params.session = nextSession
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

  const loadList = useCallback(async (pid) => {
    if (!pid) {
      setSessions([])
      return
    }
    setListLoading(true)
    setListError('')
    try {
      const [runsData, sessData] = await Promise.all([
        listAgentRuns(pid),
        listSessions(pid).catch(() => ({ sessions: [] })),
      ])
      const titles = Object.fromEntries(
        (sessData?.sessions || []).map((item) => [item.id, item.title || item.id]),
      )
      setSessions(groupRunsBySession(runsData?.runs || [], titles))
    } catch (err) {
      setSessions([])
      setListError(getErrorMessage(err, '无法加载会话列表'))
    } finally {
      setListLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (pid, sid) => {
    if (!pid || !sid) {
      setSessionRuns([])
      setSessionInfo(null)
      return
    }
    setDetailLoading(true)
    setDetailError('')
    try {
      const [runsData, info] = await Promise.all([
        listSessionAgentRuns(pid, sid),
        sid === NONE_SESSION_ID
          ? Promise.resolve(null)
          : getSession(pid, sid).catch(() => null),
      ])
      setSessionRuns(Array.isArray(runsData?.runs) ? runsData.runs : [])
      setSessionInfo(info)
    } catch (err) {
      setSessionRuns([])
      setSessionInfo(null)
      setDetailError(getErrorMessage(err, '无法加载会话详情'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadProjects().then((items) => {
      if (cancelled || projectId || !items[0]?.id) return
      setQuery(items[0].id, '', '')
    })
    return () => {
      cancelled = true
    }
    // 仅挂载时拉项目；已有 ?project= 则不覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadList(projectId)
  }, [projectId, loadList])

  useEffect(() => {
    if (!projectId || sessionId || !sessions.length) return
    if (runId) {
      const found = sessions.find((item) =>
        item.runs.some((run) => run.run_id === runId),
      )
      if (found) {
        setQuery(projectId, found.sessionId, runId)
        return
      }
    }
    setQuery(projectId, sessions[0].sessionId, '')
  }, [projectId, sessionId, runId, sessions, setQuery])

  useEffect(() => {
    loadDetail(projectId, sessionId)
  }, [projectId, sessionId, loadDetail])

  const onRefresh = () => {
    loadProjects()
    loadList(projectId)
    if (sessionId) loadDetail(projectId, sessionId)
  }

  return (
    <div className="agent-viewer-page">
      <header className="agent-viewer-page__header">
        <div className="agent-viewer-page__title">
          <h1>Agent 观测</h1>
          <p>按会话查看每一轮用户 / Agent，以及中间的模型调用</p>
        </div>
        <div className="agent-viewer-page__actions">
          <label className="agent-viewer-page__project">
            <span>项目</span>
            <select
              value={projectId}
              onChange={(event) => setQuery(event.target.value, '', '')}
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
            <SessionList
              sessions={sessions}
              selectedSessionId={sessionId}
              onSelectSession={(id) => setQuery(projectId, id, '')}
            />
          )}
        </aside>
        <main className="agent-viewer-page__detail">
          <SessionDetail
            projectId={projectId}
            session={selectedSession}
            sessionInfo={sessionInfo}
            runs={sessionRuns}
            selectedRunId={runId}
            loading={detailLoading}
            error={detailError}
          />
        </main>
      </div>
    </div>
  )
}
