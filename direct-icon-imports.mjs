import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { parse } from '@babel/parser'

const require = createRequire(import.meta.url)

export function iconExportMap(source) {
  const exports = new Map()
  const ast = parse(source, { sourceType: 'module' })
  for (const statement of ast.program.body) {
    if (statement.type !== 'ExportNamedDeclaration' || !statement.source?.value.startsWith('./icons/')) continue
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ExportSpecifier' || specifier.local.name !== 'default') continue
      const name = specifier.exported.name || specifier.exported.value
      exports.set(name, `lucide-react/dist/esm/${statement.source.value.slice(2)}`)
    }
  }
  return exports
}

export function rewriteIconImports(source, exports) {
  if (!source.includes('lucide-react')) return null
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
  const edits = []
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== 'lucide-react') continue
    const direct = [], retained = []
    for (const specifier of statement.specifiers) {
      const name = specifier.type === 'ImportSpecifier' ? specifier.imported.name || specifier.imported.value : null
      const target = exports.get(name)
      if (target) direct.push(`import ${specifier.local.name} from ${JSON.stringify(target)};`)
      else retained.push(source.slice(specifier.start, specifier.end))
    }
    if (!direct.length) continue
    // Leave namespaces, defaults and non-icon exports on the package's public API.
    if (retained.length) {
      const named = statement.specifiers.filter(specifier => specifier.type === 'ImportSpecifier' && !exports.has(specifier.imported.name || specifier.imported.value))
      const other = statement.specifiers.filter(specifier => specifier.type !== 'ImportSpecifier')
      const imports = other.map(specifier => source.slice(specifier.start, specifier.end))
      if (named.length) imports.push(`{${named.map(specifier => source.slice(specifier.start, specifier.end)).join(',')}}`)
      direct.push(`import ${imports.join(',')} from 'lucide-react';`)
    }
    edits.push({ start: statement.start, end: statement.end, text: direct.join('\n') })
  }
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  return edits.length ? source : null
}

export function directIconImportsPlugin() {
  const packagePath = require.resolve('lucide-react/package.json')
  const packageRoot = path.dirname(packagePath)
  const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  const exports = iconExportMap(fs.readFileSync(path.join(packageRoot, metadata.module), 'utf8'))
  return {
    name: 'contractor-direct-icon-imports',
    enforce: 'pre',
    transform(source, id) {
      const filename = id.split('?')[0]
      if (!/\.jsx?$/.test(filename) || /[/\\]node_modules[/\\]/.test(filename)) return null
      const code = rewriteIconImports(source, exports)
      return code ? { code, map: null } : null
    },
  }
}
