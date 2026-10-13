import { Suspense } from 'react'
import DialogBoundary from './DialogBoundary'
import DialogLoading from './DialogLoading'

export default function DeferredActionDialog({ locale, title, onClose, children }) {
  return <DialogBoundary locale={locale} title={title} onClose={onClose}>
    <Suspense fallback={<DialogLoading locale={locale} title={title} onClose={onClose} />}>
      {children}
    </Suspense>
  </DialogBoundary>
}
