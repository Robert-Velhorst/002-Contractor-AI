import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const compilerVersion = createRequire(import.meta.url)('vite/package.json').version

export function loadedPreloadFilterPlugin() {
  let configured = false, enabled = false, esm = false, graph = null, identity

  function resolveDependencies(_filename, dependencies, context) {
    if (!enabled || !esm || context.hostType !== 'js' || graph?.[context.hostId]?.type !== 'chunk') return dependencies
    const loaded = new Set()
    function visit(name) {
      const chunk = graph[name]
      if (loaded.has(name) || chunk?.type !== 'chunk') return
      loaded.add(name)
      for (const dependency of chunk.imports) visit(dependency)
    }
    // ESM fetches the entire static closure before the importer can execute.
    // Never traverse dynamic imports or infer ownership from similar filenames.
    visit(context.hostId)
    const retained = dependencies.filter(name => !name.endsWith('.js') || !loaded.has(name))
    return retained.length === dependencies.length ? dependencies : retained
  }

  return {
    name: 'contractor-loaded-preload-filter',
    apply: 'build',
    config(config) {
      const preload = config.build?.modulePreload
      if (preload === false || preload?.resolveDependencies) return
      return { build: { modulePreload: { resolveDependencies } } }
    },
    configResolved(config) {
      configured = true
      const build = config.build
      enabled = build.modulePreload?.resolveDependencies === resolveDependencies
        && build.minify === 'terser' && !build.sourcemap && !build.ssr && !build.lib
      identity = createHash('sha256').update(JSON.stringify({ policy: 1, compilerVersion,
        implementation: loadedPreloadFilterPlugin.toString() })).digest('hex')
    },
    buildStart() { graph = null },
    renderStart(output) {
      if (!configured) throw new Error('Preload filtering requires resolved build configuration.')
      esm = output.format === 'es'
      graph = null
    },
    augmentChunkHash(chunk) {
      // Vite inserts preload maps after Rollup finalizes filenames. The policy
      // must participate in the earlier hash to invalidate browser/offline caches.
      if (enabled && esm && chunk.dynamicImports.length) return identity
    },
    generateBundle: {
      order: 'pre',
      handler(output, bundle) {
        if (!configured) throw new Error('Preload filtering requires resolved build configuration.')
        // Keep the live graph: Vite may subsequently remove pure-CSS chunks.
        graph = enabled && output.format === 'es' ? bundle : null
      }
    }
  }
}
