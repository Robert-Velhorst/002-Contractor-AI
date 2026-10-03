export const JSX_BRIDGE_IMPORT_SOURCE = 'contractor:elements'
export const JSX_BRIDGE_ID = `${JSX_BRIDGE_IMPORT_SOURCE}/jsx-runtime`
export const JSX_BRIDGE_INTERNAL_ID = '\0contractor-automatic-elements'
export const JSX_BRIDGE_SOURCE = "import React from 'react'; import Runtime from 'react/jsx-runtime'; const jsx = Runtime.jsx; const jsxs = Runtime.jsxs; const Fragment = Runtime.Fragment; const createElement = React.createElement; export { jsx, jsxs, Fragment, createElement };"

export function jsxRuntimeBridgePlugin() {
  return {
    name: 'contractor-jsx-runtime-bridge',
    apply: 'build',
    enforce: 'pre',
    resolveId(source) {
      if (source === JSX_BRIDGE_ID || source === JSX_BRIDGE_IMPORT_SOURCE) return JSX_BRIDGE_INTERNAL_ID
      return null
    },
    load(id) {
      if (id === JSX_BRIDGE_INTERNAL_ID) return JSX_BRIDGE_SOURCE
      return null
    },
  }
}
