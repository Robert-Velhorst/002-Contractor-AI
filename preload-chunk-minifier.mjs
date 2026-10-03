import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { minify } from 'terser'

const compilerVersion = createRequire(import.meta.url)('terser/package.json').version

function transferSize(code) {
  return {
    raw: Buffer.byteLength(code),
    gzip: gzipSync(code, { level: 9 }).length,
    brotli: Math.min(...[10, 11].map(quality => brotliCompressSync(code, {
      params: { [constants.BROTLI_PARAM_QUALITY]: quality }
    }).length))
  }
}

export function preloadChunkMinifierPlugin() {
  let configured = false, enabled = false, esm = false, options, identity
  return {
    name: 'contractor-preload-chunk-minifier',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      configured = true
      enabled = config.build.minify === 'terser' && !config.build.sourcemap && !config.build.ssr && !config.build.lib
      options = { safari10: true, ...config.build.terserOptions, module: true, toplevel: false }
      delete options.maxWorkers
      identity = createHash('sha256').update(JSON.stringify({ policy: 1, compilerVersion, options,
        runtime: { node: process.versions.node, zlib: process.versions.zlib, brotli: process.versions.brotli }
      })).digest('hex')
    },
    renderStart(output) {
      if (!configured) throw new Error('Preload minification requires resolved build configuration.')
      esm = output.format === 'es'
    },
    augmentChunkHash(chunk) {
      // Vite inserts its dependency map after renderChunk. Salt before final names
      // so this later transformation also invalidates browser/offline caches.
      if (enabled && esm && chunk.dynamicImports.length) return identity
    },
    generateBundle: {
      order: 'post',
      async handler(output, bundle) {
        if (!configured) throw new Error('Preload minification requires resolved build configuration.')
        if (!enabled || output.format !== 'es') return
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk' || !chunk.dynamicImports.length || chunk.map || !chunk.code.includes('__vite__mapDeps')) continue
          const result = await minify(chunk.code, options)
          const before = transferSize(chunk.code), after = transferSize(result.code)
          if (after.raw < before.raw && after.gzip < before.gzip && after.brotli <= before.brotli) chunk.code = result.code
        }
      }
    }
  }
}
