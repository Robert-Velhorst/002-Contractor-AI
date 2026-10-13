export default function ListPagination({ t, total, page, pageCount, pageSize, setPage, setPageSize }) {
  if (total <= pageSize) return null
  const first = page * pageSize + 1
  const last = Math.min((page + 1) * pageSize, total)
  return (
    <nav className="resource-pagination" aria-label={t('List pages')}>
      <span aria-live="polite">{t('Showing {first}-{last} of {total}', { first, last, total })}</span>
      <label>{t('Rows per page')}
        <select aria-label={t('Rows per page')} value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
          {[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" className="secondary-button" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>{t('Previous')}</button>
      <span>{t('Page {page} of {pages}', { page: page + 1, pages: pageCount })}</span>
      <button type="button" className="secondary-button" disabled={page + 1 >= pageCount} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))}>{t('Next')}</button>
    </nav>
  )
}
