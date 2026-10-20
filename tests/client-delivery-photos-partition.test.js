const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

test('the shared delivery photo list stays in the existing counted private viewer chunk', async () => {
  const module = await import(pathToFileURL(path.resolve(__dirname, '../vite.config.mjs')).href);
  const config = module.default({ command: 'build', mode: 'production' });
  const partition = config.build.rolldownOptions.output.codeSplitting.groups[0].name;
  for (const prefix of ['/project/components/', 'C:\\project\\components\\']) {
    for (const name of ['ConversationPhoto', 'ClientDeliveryPhotos']) {
      assert.equal(partition(`${prefix}${name}.jsx`), 'ConversationPhoto');
    }
    assert.equal(partition(`${prefix}ClientDeliveryControl.jsx`), null);
    assert.equal(partition(`${prefix}ClientDeliveryResponses.jsx`), null);
    assert.equal(partition(`${prefix}ConversationPhoto.css`), null);
    assert.equal(partition(`${prefix}ClientDeliveryPhotosTest.jsx`), null);
  }
  for (const prefix of ['/project/', 'C:\\project\\']) {
    for (const name of ['reader', 'visibility']) assert.equal(partition(`${prefix}conversation-photo-${name}.mjs`), 'ConversationPhoto');
    assert.equal(partition(`${prefix}conversation-request.mjs`), 'ConversationPhoto');
  }
});
