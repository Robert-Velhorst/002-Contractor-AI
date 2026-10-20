import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { brotliAssetsPlugin } from './brotli-assets-plugin.mjs'
import { offlineShellPlugin } from './offline-shell-plugin.mjs'
import { operatorLocaleCompactPlugin } from './operator-locale-compact.mjs'
import { directIconImportsPlugin } from './direct-icon-imports.mjs'
import { JSX_BRIDGE_INTERNAL_ID, JSX_BRIDGE_IMPORT_SOURCE, jsxRuntimeBridgePlugin } from './jsx-runtime-bridge.mjs'
import { preloadChunkMinifierPlugin } from './preload-chunk-minifier.mjs'
import { loadedPreloadFilterPlugin } from './loaded-preload-filter.mjs'

const DOSSIER_CONTROLS = new Set(['CloseoutRegister', 'CommercialControl', 'DayworkControl',
  'FieldRiskControl', 'InspectionChecklistControl', 'NonconformanceControl',
  'PhotoEvidenceControl', 'ProductionControl', 'ProjectControls', 'TakeoffControl', 'WorkPlanControl'])

function manualChunkName(id) {
  // Both delivery roles reuse the same small list and authorized viewer.
  if (/[\\/]components[\\/](ConversationPhoto|ClientDeliveryPhotos)\.jsx$/.test(id)
    || /[\\/]conversation-photo-(reader|visibility)\.mjs$/.test(id)
    || /[\\/]conversation-request\.mjs$/.test(id)) return 'ConversationPhoto'
  // Cache the public React functions once; generated JSX imports bindings
  // instead of repeating CommonJS property lookups at every element.
  // CommonJS interop belongs with React, not the changing entry. Putting
  // it in the entry creates a cycle and invalidates cached runtime bytes.
  if (id === JSX_BRIDGE_INTERNAL_ID || id === '\0commonjsHelpers.js') return 'react'
  // The dossier renders these together; keep their compression dictionary
  // shared while the separately used field-assurance queue stays independent.
  if (/[\\/]components[\\/]/.test(id) && DOSSIER_CONTROLS.has(path.basename(id, '.jsx'))) return 'job-controls'
  if (!id.includes('node_modules')) return null
  if (id.includes('lucide-react')) return 'icons'
  if (id.includes('@dagrejs/graphlib')) return 'graph'
  if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
  return 'vendor'
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = process.env.VITE_API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001'

  return {
  plugins: [directIconImportsPlugin(), operatorLocaleCompactPlugin(process.cwd()), jsxRuntimeBridgePlugin(),
    react({ jsxRuntime: 'automatic', jsxImportSource: command === 'build' ? JSX_BRIDGE_IMPORT_SOURCE : undefined }),
    loadedPreloadFilterPlugin(), preloadChunkMinifierPlugin(), offlineShellPlugin(), brotliAssetsPlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 600,
    manifest: true,
    minify: 'terser',
    terserOptions: { ecma: 2022, compress: { passes: 10 } },
    cssMinify: 'lightningcss',
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [{ name: manualChunkName, debugName: 'manual-chunks', includeDependenciesRecursively: false }]
        }
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/client-portal.html': apiTarget
    }
  }
  }
})
