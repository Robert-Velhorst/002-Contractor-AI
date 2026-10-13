const test = require('node:test');
const assert = require('node:assert/strict');

async function loadAssets(bundle) {
  const { offlineShellAssets } = await import('../offline-shell-plugin.mjs');
  return offlineShellAssets(bundle);
}

test('offline shell includes entry assets and the offline route dependency closure only', async () => {
  const chunk = ({ fileName, modules = {}, imports = [], dynamicImports = [], importedCss = [], importedAssets = [], isEntry = false }) => ({
    type: 'chunk', fileName, modules, imports, dynamicImports, isEntry,
    viteMetadata: { importedCss: new Set(importedCss), importedAssets: new Set(importedAssets) },
  });
  const asset = { type: 'asset', source: '' };
  const bundle = {
    'assets/main.js': chunk({ fileName: 'assets/main.js', isEntry: true, modules: { 'src/main.jsx': {} }, imports: ['assets/react.js'], dynamicImports: ['assets/OfflineField.js', 'assets/App.js', 'assets/ClientPortal.js'], importedCss: ['assets/index.css'] }),
    'assets/react.js': chunk({ fileName: 'assets/react.js' }),
    'assets/OfflineField.js': chunk({ fileName: 'assets/OfflineField.js', modules: { 'src/OfflineField.jsx': {} }, imports: ['assets/react.js', 'assets/offline-vault.js'], dynamicImports: ['assets/offline-photo-view.js'], importedCss: ['assets/offline-field.css'] }),
    'assets/offline-vault.js': chunk({ fileName: 'assets/offline-vault.js', importedAssets: ['assets/offline-icon.svg'] }),
    'assets/offline-photo-view.js': chunk({ fileName: 'assets/offline-photo-view.js', importedCss: ['assets/offline-photo.css'] }),
    'assets/App.js': chunk({ fileName: 'assets/App.js', imports: ['assets/office-only.js'], importedCss: ['assets/office.css'] }),
    'assets/ClientPortal.js': chunk({ fileName: 'assets/ClientPortal.js', modules: { 'src/ClientPortal.jsx': {} }, imports: ['assets/react.js', 'assets/portal-shell.js'], dynamicImports: ['assets/Conversation.js', 'assets/ClientDeliveries.js'], importedCss: ['assets/client-portal.css'] }),
    'assets/portal-shell.js': chunk({ fileName: 'assets/portal-shell.js' }),
    'assets/Conversation.js': chunk({ fileName: 'assets/Conversation.js', importedCss: ['assets/conversation.css'] }),
    'assets/ClientDeliveries.js': chunk({ fileName: 'assets/ClientDeliveries.js' }),
    'assets/office-only.js': chunk({ fileName: 'assets/office-only.js' }),
    'assets/index.css': asset,
    'assets/offline-field.css': asset,
    'assets/offline-icon.svg': asset,
    'assets/offline-photo.css': asset,
    'assets/office.css': asset,
    'assets/client-portal.css': asset,
    'assets/conversation.css': asset,
  };

  const assets = await loadAssets(bundle);
  assert.deepEqual(new Set(assets), new Set([
    '/field-offline.html',
    '/client-portal.html',
    '/assets/main.js', '/assets/react.js', '/assets/index.css',
    '/assets/OfflineField.js', '/assets/offline-vault.js', '/assets/offline-icon.svg',
    '/assets/offline-field.css', '/assets/offline-photo-view.js', '/assets/offline-photo.css',
    '/assets/ClientPortal.js', '/assets/portal-shell.js', '/assets/Conversation.js',
    '/assets/ClientDeliveries.js', '/assets/client-portal.css', '/assets/conversation.css',
  ]));
  assert.equal(assets.some(name => name.includes('office')), false);
})

test('offline shell generation fails closed if a route entry is absent', async () => {
  const { offlineShellAssets } = await import('../offline-shell-plugin.mjs');
  assert.throws(() => offlineShellAssets({}), /Could not locate the main, offline field and client portal entry chunks/);
});
