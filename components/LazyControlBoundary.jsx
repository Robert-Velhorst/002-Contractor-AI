import { Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'

export default function LazyControlBoundary({ label, mode = 'section', children }) {
  const className = mode === 'job' ? 'loading job-workspace-loading' : 'loading section-loading'
  return (
    <Suspense fallback={<div className={className} role="status"><LoaderCircle className="spin" size={16} /> Loading {label}</div>}>
      {children}
    </Suspense>
  )
}
