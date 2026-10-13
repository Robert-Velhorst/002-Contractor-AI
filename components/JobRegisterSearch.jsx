import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react'

const JobSearchResults = memo(function JobSearchResults({ renderRows, rows }) {
  return renderRows(rows)
})

export default function JobRegisterSearch({ api, initialJobs, initialPagination, t, children }) {
  const [query, setQuery] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pageData, setPageData] = useState(null)
  const [cursorHistory, setCursorHistory] = useState([null])
  const [pageIndex, setPageIndex] = useState(0)
  const requestRef = useRef(null)

  useEffect(() => {
    requestRef.current?.abort()
    setLoading(false)
    setActiveSearch('')
    setPageData(null)
    setCursorHistory([null])
    setPageIndex(0)
    setError('')
    return () => requestRef.current?.abort()
  }, [initialJobs, initialPagination])

  async function load(nextQuery, cursor = null, nextHistory = [null], nextPageIndex = 0) {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError('')
    try {
      const parameters = new URLSearchParams({ limit: '100' })
      if (nextQuery) parameters.set('search', nextQuery)
      if (cursor) {
        parameters.set('afterUpdatedAt', cursor.updatedAt)
        parameters.set('afterJobId', cursor.jobId)
      }
      const result = await api(`/api/ledger/jobs?${parameters.toString()}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      setPageData({ jobs: result.jobs || [], pagination: result.pagination || null })
      setActiveSearch(nextQuery)
      setCursorHistory(nextHistory)
      setPageIndex(nextPageIndex)
    } catch {
      if (!controller.signal.aborted) setError(t('Job search failed. Check your connection and try again.'))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    void load(query.trim())
  }

  function clear() {
    requestRef.current?.abort()
    setLoading(false)
    setQuery('')
    setActiveSearch('')
    setPageData(null)
    setCursorHistory([null])
    setPageIndex(0)
    setError('')
  }

  function nextPage() {
    const cursor = (pageData?.pagination || initialPagination)?.nextCursor
    if (!cursor || loading) return
    const nextHistory = [...cursorHistory.slice(0, pageIndex + 1), cursor]
    void load(activeSearch, cursor, nextHistory, pageIndex + 1)
  }

  function previousPage() {
    if (pageIndex <= 0 || loading) return
    const previousIndex = pageIndex - 1
    void load(activeSearch, cursorHistory[previousIndex], cursorHistory.slice(0, pageIndex), previousIndex)
  }

  const pageLimit = initialPagination?.limit || 100
  const initialPage = useMemo(() => initialJobs.slice(0, pageLimit), [initialJobs, pageLimit])
  const currentJobs = pageData?.jobs || initialPage
  const pagination = pageData?.pagination || initialPagination
  const visiblePage = pageIndex + 1

  return (
    <div className="job-register-search">
      <form className="job-register-search-form" role="search" onSubmit={submit}>
        <label className="search-control" htmlFor="job-register-search-input">
          <Search size={17} aria-hidden="true" />
          <span className="visually-hidden">{t('Search jobs')}</span>
          <input
            id="job-register-search-input"
            type="search"
            value={query}
            placeholder={t('Title, client, location, or ID')}
            disabled={loading}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <button className="secondary-button" type="submit" disabled={loading}>
          <Search size={16} aria-hidden="true" />
          {t('Search jobs')}
        </button>
        {activeSearch || query ? (
          <button className="icon-button" type="button" aria-label={t('Clear search')} title={t('Clear search')} disabled={loading} onClick={clear}>
            <X size={17} aria-hidden="true" />
          </button>
        ) : null}
      </form>
      {error ? <p className="job-register-search-message error" role="alert">{error}</p> : null}
      {!error && loading ? <p className="job-register-search-message" role="status">{t('Searching jobs...')}</p> : null}
      {!error && !loading && activeSearch && currentJobs.length === 0 ? <p className="job-register-search-message" role="status">{t('No jobs match this search.')}</p> : null}
      {!error && !loading && !activeSearch ? (
        <p className="job-register-search-message" role="status">
          {t('Page {page}: {count} jobs. Use Next page to browse older work.', { count: currentJobs.length, page: visiblePage })}
        </p>
      ) : null}
      {!error && !loading && activeSearch && currentJobs.length > 0 ? (
        <p className="job-register-search-message" role="status">
          {t('Search page {page}: {count} results.', { count: currentJobs.length, page: visiblePage })}
        </p>
      ) : null}
      {pageIndex > 0 || pagination?.hasMore ? (
        <nav className="job-register-pagination" aria-label={t('Job result pages')}>
          <button className="icon-button" type="button" title={t('Previous page')} aria-label={t('Previous page')} disabled={loading || pageIndex === 0} onClick={previousPage}>
            <ArrowLeft size={17} aria-hidden="true" />
          </button>
          <span>{t('Page {page}', { page: visiblePage })}</span>
          <button className="icon-button" type="button" title={t('Next page')} aria-label={t('Next page')} disabled={loading || !pagination?.hasMore} onClick={nextPage}>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </nav>
      ) : null}
      <JobSearchResults renderRows={children} rows={currentJobs} />
    </div>
  )
}
