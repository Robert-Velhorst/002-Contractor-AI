import { Component } from 'react'
import DialogLoading from './DialogLoading'

export default class DialogBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed
      ? <DialogLoading locale={this.props.locale} title={this.props.title} onClose={this.props.onClose} failed />
      : this.props.children
  }
}
