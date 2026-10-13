const fs = require('node:fs');
const path = require('node:path');
const { isMainThread } = require('node:worker_threads');

// Native solver/build threads inherit their test process's explicit fixture storage.
if (isMainThread) {
  const root = process.env.CONTRACTOR_AI_NODE_TEST_RUNTIME_DIR;
  const refuse = () => {
    const error = new Error('invalid_node_test_runtime: a runner-created temporary directory is required.');
    error.code = 'invalid_node_test_runtime';
    throw error;
  };
  if (!root || !path.isAbsolute(root) || !path.basename(root).startsWith('contractor-ai-node-tests-')) refuse();
  const resolved = path.resolve(root);
  let stat;
  try { stat = fs.lstatSync(resolved); } catch { refuse(); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) refuse();

  const processDirectory = fs.mkdtempSync(path.join(resolved, `process-${process.pid}-`));
  process.env.STATE_FILE = path.join(processDirectory, 'state.json');
}
