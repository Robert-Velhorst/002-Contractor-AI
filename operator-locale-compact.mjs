import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx'])
const EXCLUDED_DIRECTORIES = new Set([
  '.git', '.pytest_cache', '.venv', '__pycache__', 'coverage', 'dist', 'e2e', 'frontend-tests',
  'node_modules', 'playwright-report', 'release', 'scripts', 'test-results', 'tests', 'tmp', 'venv',
])
const TRANSLATOR_ARGUMENTS = new Map([
  ['operatorText', 1], ['operatorTranslator', 1], ['t', 0], ['ot', 0],
])

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function parseJavaScript(source, filename) {
  return parse(source, { sourceType: 'unambiguous', sourceFilename: filename, plugins: ['jsx'] })
}

function walk(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') visitor(node, parent)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments') continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor, node)
    } else if (value && typeof value === 'object') walk(value, visitor, node)
  }
}

function listSourceFiles(root, directory = root) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listSourceFiles(root, absolutePath))
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && path.resolve(absolutePath) !== path.resolve(root, 'operator-locale.js')) files.push(absolutePath)
  }
  return files
}

function translatorCall(node, parent) {
  if (parent?.type !== 'CallExpression' || parent.optional) return false
  const name = parent.callee?.type === 'Identifier' ? parent.callee.name : null
  const argumentIndex = TRANSLATOR_ARGUMENTS.get(name)
  return argumentIndex !== undefined && parent.arguments[argumentIndex] === node
}

function applyEdits(source, edits) {
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    source = `${source.slice(0, edit.start)}${edit.text}${source.slice(edit.end)}`
  }
  return source
}

export function createOperatorLocaleCompaction(root = process.cwd()) {
  const localePath = path.resolve(root, 'operator-locale.js')
  const localeSource = fs.readFileSync(localePath, 'utf8')
  const localeAst = parseJavaScript(localeSource, localePath)
  let catalogNode = null
  walk(localeAst, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === 'OPERATOR_NL') catalogNode = node.init
  })
  if (catalogNode?.type !== 'ObjectExpression') throw new Error('Could not locate the Dutch operator translation catalog.')

  const entries = new Map()
  for (const property of catalogNode.properties) {
    if (property.type === 'ObjectProperty' && property.key.type === 'StringLiteral' && property.value.type === 'StringLiteral') {
      entries.set(property.key.value, property.value.value)
    }
  }

  const translatedLiterals = new Set()
  const englishFallbackLiterals = new Set()
  const nonTranslationLiterals = new Set()
  for (const filename of listSourceFiles(root)) {
    const source = fs.readFileSync(filename, 'utf8')
    let ast
    try {
      ast = parseJavaScript(source, filename)
    } catch (error) {
      throw new Error(`Cannot classify operator translation literals in ${path.relative(root, filename)}: ${error.message}`, { cause: error })
    }
    walk(ast, (node, parent) => {
      // API statuses become human labels at runtime; their normalized forms
      // must remain addressable even without a literal translator call.
      const runtimeLabel = node.type === 'StringLiteral' ? node.value
        : node.type === 'Identifier' && parent?.type === 'ObjectProperty' && parent.key === node && !parent.computed ? node.name : null
      if (runtimeLabel?.includes('_')) {
        const normalizedLabel = runtimeLabel.replaceAll('_', ' ')
        if (entries.has(normalizedLabel)) nonTranslationLiterals.add(normalizedLabel)
      }
      if (node.type !== 'StringLiteral' || !entries.has(node.value)) return
      if (!translatorCall(node, parent)) {
        nonTranslationLiterals.add(node.value)
      } else {
        const fallbackIndex = ['t', 'ot'].includes(parent.callee.name) ? 2 : 3
        const fallback = parent.arguments[fallbackIndex]
        // A caller-supplied fallback is a separate contract, not a catalog key.
        if (fallback && (fallback.type !== 'StringLiteral' || fallback.value !== node.value)) {
          nonTranslationLiterals.add(node.value)
        } else if (parent.callee.name === 'ot') englishFallbackLiterals.add(node.value)
        else translatedLiterals.add(node.value)
      }
    })
  }

  const compactKeys = [...entries.keys()].filter(key =>
    (translatedLiterals.has(key) || englishFallbackLiterals.has(key)) && !nonTranslationLiterals.has(key))
  const fallbackOnlyKeys = new Set([...englishFallbackLiterals].filter(key =>
    !translatedLiterals.has(key) && !nonTranslationLiterals.has(key)))
  const referencedKeys = new Set([...translatedLiterals, ...englishFallbackLiterals, ...nonTranslationLiterals])
  const unusedKeys = new Set([...entries.keys()].filter(key => !referencedKeys.has(key)))
  const compactTokens = new Map(compactKeys.map((key, index) => [key, `~${index.toString(36)}`]))
  const usedKeys = new Set(entries.keys())
  for (const token of compactTokens.values()) {
    if (usedKeys.has(token)) throw new Error(`Compact translation token collides with a Dutch catalog key: ${token}`)
  }

  function transformCatalog(source) {
    const ast = parseJavaScript(source, localePath)
    let objectNode = null, compactArrayNode = null
    walk(ast, node => {
      if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier') return
      if (node.id.name === 'OPERATOR_NL') objectNode = node.init
      if (node.id.name === 'OPERATOR_NL_COMPACT') compactArrayNode = node.init
    })
    if (!objectNode || !compactArrayNode) throw new Error('Could not locate the operator locale catalogs.')
    const edits = []
    const retainedProperties = []
    const compactEntries = []
    for (const property of objectNode.properties) {
      if (property.type !== 'ObjectProperty' || property.key.type !== 'StringLiteral') continue
      if (unusedKeys.has(property.key.value)) continue
      const key = property.key.value
      if (!compactTokens.has(key)) {
        retainedProperties.push(property)
        continue
      }
      if (property.value.type !== 'StringLiteral') throw new Error(`Operator translation ${key} is not a string.`)
      compactEntries[Number.parseInt(compactTokens.get(key).slice(1), 36)] = property.value.value
    }
    // Group similar bytes offline without reordering any non-literal evaluation.
    if (retainedProperties.every(property => property.value.type === 'StringLiteral')) {
      retainedProperties.sort((left, right) => compareText(left.key.value, right.key.value))
    }
    edits.push({ start: objectNode.start, end: objectNode.end, text: `{${retainedProperties.map(property => source.slice(property.start, property.end)).join(',')}}` })
    edits.push({ start: compactArrayNode.start, end: compactArrayNode.end, text: JSON.stringify(compactEntries) })
    return applyEdits(source, edits)
  }

  function transformCallSites(source, filename) {
    const ast = parseJavaScript(source, filename)
    const edits = []
    walk(ast, (node, parent) => {
      if (node.type !== 'StringLiteral' || !translatorCall(node, parent)) return
      const token = compactTokens.get(node.value)
      if (!token) return
      if (parent.arguments[TRANSLATOR_ARGUMENTS.get(parent.callee.name)] !== node) return
      edits.push({ start: node.start, end: node.end, text: JSON.stringify(token) })
      const fallbackIndex = ['t', 'ot'].includes(parent.callee.name) ? 2 : 3
      if (parent.arguments.length <= fallbackIndex) {
        // Preserve English locally so the Dutch catalog remains a lazy dependency.
        const missingArguments = parent.arguments.length < fallbackIndex ? ', {}, ' : ', '
        edits.push({ start: parent.end - 1, end: parent.end - 1, text: `${missingArguments}${JSON.stringify(node.value)}` })
      }
    })
    walk(ast, node => {
      if (node.type !== 'ArrowFunctionExpression' || node.params.length !== 2) return
      const key = node.params[0]
      const body = node.body
      if (key.type !== 'Identifier' || body.type !== 'CallExpression' || body.callee?.name !== 'operatorText'
        || body.arguments.length !== 3 || body.arguments[1]?.name !== key.name) return
      edits.push({ start: node.params[1].end, end: node.params[1].end, text: `, englishFallback = ${key.name}` })
      edits.push({ start: body.end - 1, end: body.end - 1, text: ', englishFallback' })
    })
    return edits.length ? applyEdits(source, edits) : null
  }

  return { compactTokens, fallbackOnlyKeys, unusedKeys, transformCatalog, transformCallSites }
}

export function operatorLocaleCompactPlugin(root = process.cwd()) {
  const compaction = createOperatorLocaleCompaction(root)
  const absoluteRoot = `${path.resolve(root)}${path.sep}`
  const localePath = path.resolve(root, 'operator-locale.js')

  return {
    name: 'contractor-operator-locale-compaction',
    apply: 'build',
    enforce: 'pre',
    transform(source, id) {
      const filename = path.resolve(id.split('?')[0])
      if (filename === localePath) return { code: compaction.transformCatalog(source), map: null }
      if (!filename.startsWith(absoluteRoot) || !SOURCE_EXTENSIONS.has(path.extname(filename))) return null
      const code = compaction.transformCallSites(source, filename)
      return code ? { code, map: null } : null
    },
  }
}
