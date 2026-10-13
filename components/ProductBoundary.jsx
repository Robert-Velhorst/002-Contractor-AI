import { Component } from 'react'
import { RefreshCw } from 'lucide-react'

export default class ProductBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    const dutch = (this.props.locale || document.documentElement.lang || navigator.language).startsWith('nl')
    return <main className="route-failure">
      <div role="alert">
        <p className="route-brand">Contractor.AI</p>
        <h1>{dutch ? 'De werkruimte kon niet worden geladen' : 'The workspace could not load'}</h1>
        <p>{dutch ? 'Er is een laad- of weergavefout opgetreden.' : 'A loading or display error occurred.'}</p>
        <button type="button" onClick={this.props.onReload || (() => window.location.reload())}>
          <RefreshCw size={18} aria-hidden="true" />
          {dutch ? 'Werkruimte herladen' : 'Reload workspace'}
        </button>
        <p>{dutch ? 'Niet-opgeslagen invoer kan verloren zijn. Controleer na het herladen de status van je laatste handeling.' : 'Unsaved input may be lost. Check the status of your last action after reloading.'}</p>
      </div>
    </main>
  }
}
