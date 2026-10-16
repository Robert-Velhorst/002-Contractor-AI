const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const wrapper = path.join(root, 'deploy', 'contractor-ai-deploy');
const bash = process.env.BASH || (process.platform === 'win32' && fs.existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : 'bash');

function runBash(args) {
  return spawnSync(bash, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
}

test('root deployment wrapper has valid Bash syntax', () => {
  const result = runBash(['-n', 'deploy/contractor-ai-deploy']);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

test('root deployment wrapper rejects missing and unknown actions before privileged work', () => {
  const missing = runBash(['deploy/contractor-ai-deploy']);
  assert.equal(missing.status, 64);
  assert.match(missing.stderr, /Usage:/);

  const unknown = runBash(['deploy/contractor-ai-deploy', 'shell']);
  assert.equal(unknown.status, 64);
  assert.match(unknown.stderr, /Usage:/);
});

test('deployment wrapper and sudoers policy fail closed on mutable deployment inputs', () => {
  const script = fs.readFileSync(wrapper, 'utf8');
  const sudoers = fs.readFileSync(path.join(root, 'deploy', 'contractor-ai-deploy.sudoers'), 'utf8');
  assert.match(script, /\[\[ "\$\(id -u\)" -eq 0 \]\]/);
  assert.match(script, /stat -c '%u' "\$file"/);
  assert.match(script, /check_file "\$ENV_FILE" 600/);
  assert.match(script, /check_environment_keys\r?\n/);
  assert.match(script, /contains a duplicate or invalid assignment/);
  assert.match(script, /line !~ \/\^\[A-Za-z_\]\[A-Za-z0-9_\]\*=\//);
  assert.match(script, /setting must appear exactly once/);
  assert.match(script, /CORS_ORIGINS must include the exact/);
  assert.match(script, /CONTRACTOR_AI_S3_PREFIX must stay within/);
  assert.match(script, /CONTRACTOR_AI_EVIDENCE_STORAGE_MAX_BYTES must be a positive integer/);
  assert.match(script, /unrestricted or hop-count rule/);
  assert.match(script, /! "\$proxy" =~ \/0\+\(\[,\[:space:\]\]\|\$\)/);
  assert.match(script, /@sha256:\[a-f0-9\]\{64\}/);
  assert.match(script, /readonly ENV_BIN=\/usr\/bin\/env/);
  assert.match(script, /"\$ENV_BIN" -i "PATH=\$SAFE_PATH" HOME=\/root "\$DOCKER" compose/);
  assert.match(script, /run_compose config --quiet/);
  assert.match(script, /run_compose config --images/);
  assert.match(script, /resolved Compose image does not exactly match/);
  assert.match(script, /run_compose up --detach --no-build contractor-ai/);
  assert.match(script, /stat -c '%u' \/opt/);
  assert.doesNotMatch(script, /\b(?:source|eval)\b/);
  assert.match(script, /up --detach --no-build contractor-ai/);
  assert.equal(sudoers.trim(), 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/contractor-ai-deploy');
});
