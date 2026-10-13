const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => visit(child, callback));
    else if (value && typeof value === 'object') visit(value, callback);
  }
}

function sourceTree(filename) {
  return parse(fs.readFileSync(filename, 'utf8'), { sourceType: 'unambiguous' });
}

function runtimeSourceClosure(root, entries) {
  const pending = [...entries];
  const files = new Set();
  while (pending.length) {
    const relative = pending.pop();
    if (files.has(relative)) continue;
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`Runtime dependency leaves the source directory: ${relative}`);
    if (!fs.existsSync(filename)) throw new Error(`Runtime source is missing: ${relative}`);
    files.add(relative);
    if (!/\.[cm]?js$/.test(filename)) continue;
    const tree = sourceTree(filename);
    const references = [];
    visit(tree, node => {
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
        const reference = node.arguments[0];
        if (reference?.type === 'StringLiteral' && reference.value.startsWith('.')) references.push(reference.value);
      }
      if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'Worker') {
        const argument = node.arguments[0];
        if (argument?.type === 'CallExpression' && argument.callee.type === 'MemberExpression'
          && argument.callee.object.name === 'path' && argument.callee.property.name === 'join'
          && argument.arguments[0]?.name === '__dirname' && argument.arguments.slice(1).every(part => part.type === 'StringLiteral')) {
          references.push(`./${argument.arguments.slice(1).map(part => part.value).join('/')}`);
        }
      }
    });
    for (const reference of references) {
      const resolved = require.resolve(path.resolve(path.dirname(filename), reference));
      pending.push(path.relative(root, resolved).split(path.sep).join('/'));
    }
  }
  return [...files].sort();
}

function dockerRuntimeFiles(root) {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const runtime = dockerfile.split(/\bAS runtime\b/i)[1];
  if (!runtime) throw new Error('The production Docker runtime stage is missing.');
  return runtime.split(/\r?\n/).filter(line => /^COPY\s/.test(line) && !line.includes('--from='))
    .flatMap(line => line.trim().split(/\s+/).slice(1, -1))
    .flatMap(relative => relative === 'package*.json' ? ['package.json', 'package-lock.json'] : relative)
    .filter(relative => /\.(?:[cm]?js|json)$/.test(relative) && !relative.includes('*'));
}

function windowsRuntimeFiles(root) {
  let files;
  visit(sourceTree(path.join(root, 'scripts', 'build-windows-standalone.js')), node => {
    if (node.type === 'VariableDeclarator' && node.id.name === 'runtimeFiles' && node.init?.type === 'ArrayExpression') {
      if (!node.init.elements.every(item => item?.type === 'StringLiteral')) throw new Error('Windows runtimeFiles must contain explicit file paths.');
      files = node.init.elements.map(item => item.value);
    }
  });
  if (!files?.length) throw new Error('The Windows runtime file inventory is missing.');
  return files;
}

function verifyRuntimeSourceInventory(root) {
  const failures = [];
  const counts = {};
  for (const [label, manifest] of [['Docker', dockerRuntimeFiles(root)], ['Windows', windowsRuntimeFiles(root)]]) {
    const copies = new Set(manifest);
    const closure = runtimeSourceClosure(root, manifest.filter(file => /\.[cm]?js$/.test(file)));
    counts[label] = closure.length;
    for (const file of closure) if (!copies.has(file)) failures.push(`${label} runtime is missing a required source file: ${file}`);
  }
  return { valid: failures.length === 0, failures, counts };
}

module.exports = { dockerRuntimeFiles, runtimeSourceClosure, verifyRuntimeSourceInventory, windowsRuntimeFiles };
