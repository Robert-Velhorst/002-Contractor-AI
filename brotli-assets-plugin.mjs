import fs from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib'

export function brotliAssetsPlugin() {
  let assetsDirectory
  return {
    name: 'contractor-brotli-assets',
    apply: 'build',
    configResolved(config) {
      assetsDirectory = path.resolve(config.root, config.build.outDir, 'assets')
    },
    closeBundle() {
      if (!assetsDirectory) throw new Error('The build output must be resolved before asset compression.')
      if (!fs.existsSync(assetsDirectory)) return
      for (const name of fs.readdirSync(assetsDirectory)) {
        if (!/\.(?:js|css)$/.test(name)) continue
        const filePath = path.join(assetsDirectory, name)
        const bytes = fs.readFileSync(filePath)
        // Offline work only: higher effort is not always a smaller representation.
        const choices = [10, 11].map(quality => brotliCompressSync(bytes, {
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: quality }
        }))
        const compressed = choices[1].length < choices[0].length ? choices[1] : choices[0]
        fs.writeFileSync(`${filePath}.br`, compressed)
      }
    }
  }
}
