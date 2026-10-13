import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import ProductBoundary from './components/ProductBoundary'
import './index.css'

const clientPortalRoute = window.location.pathname === '/client-portal.html'
const ProductScreen = lazy(window.location.pathname === '/identity.html' ? () => import('./IdentityPortal.jsx') : window.location.pathname === '/work-board.html' ? () => import('./WorkBoard.jsx') : window.location.pathname === '/field-offline.html' ? () => import('./OfflineField.jsx') : clientPortalRoute
  ? () => import('./ClientPortal.jsx')
  : () => import('./App.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ProductBoundary>
      <Suspense fallback={<main className="route-loading" aria-busy="true"><span>Loading Contractor.AI</span></main>}>
        <ProductScreen />
      </Suspense>
    </ProductBoundary>
  </StrictMode>,
)
