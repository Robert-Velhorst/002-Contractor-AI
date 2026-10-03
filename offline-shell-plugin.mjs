import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function offlineShellAssets(bundle) {
  const chunks = Object.values(bundle).filter(item => item.type === 'chunk');
  const mainEntry = chunks.find(chunk => chunk.isEntry
    && Object.keys(chunk.modules).some(id => id.replaceAll('\\', '/').endsWith('/main.jsx')));
  const offlineEntry = chunks.find(chunk => Object.keys(chunk.modules)
    .some(id => id.replaceAll('\\', '/').endsWith('/OfflineField.jsx')));
  const clientPortalEntry = chunks.find(chunk => Object.keys(chunk.modules)
    .some(id => id.replaceAll('\\', '/').endsWith('/ClientPortal.jsx')));
  if (!mainEntry || !offlineEntry || !clientPortalEntry) throw new Error('Could not locate the main, offline field and client portal entry chunks for the offline shell.');

  const assets = new Set(['/field-offline.html', '/client-portal.html']);
  const visited = new Set();
  function includeChunk(fileName, includeDynamicImports) {
    if (visited.has(fileName)) return;
    visited.add(fileName);
    const chunk = bundle[fileName];
    if (!chunk || chunk.type !== 'chunk') return;
    assets.add(`/${fileName}`);
    for (const asset of [
      ...(chunk.viteMetadata?.importedCss || []),
      ...(chunk.viteMetadata?.importedAssets || []),
    ]) {
      if (bundle[asset]) assets.add(`/${asset}`);
    }
    for (const dependency of chunk.imports || []) includeChunk(dependency, false);
    if (includeDynamicImports) {
      for (const dependency of chunk.dynamicImports || []) includeChunk(dependency, true);
    }
  }

  includeChunk(mainEntry.fileName, false);
  includeChunk(offlineEntry.fileName, true);
  includeChunk(clientPortalEntry.fileName, true);
  return [...assets];
}

export function offlineShellPlugin() {
  return { name: 'contractor-offline-shell', apply: 'build', enforce: 'post', generateBundle(_options, bundle) {
    const assets = offlineShellAssets(bundle);
    const cache = `contractor-field-shell-${createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16)}`;
    const source = readFileSync(new URL('./field-service-worker.js', import.meta.url), 'utf8')
      .replace('self.__FIELD_ASSETS__', JSON.stringify(assets)).replace('self.__FIELD_CACHE__', JSON.stringify(cache));
    this.emitFile({ type: 'asset', fileName: 'field-sw.js', source });
  } };
}
