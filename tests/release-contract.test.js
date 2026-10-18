const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runtimeSourceClosure, verifyRuntimeSourceInventory } = require('../scripts/runtime-source-inventory');
const {
  findApprovalPrincipalPriorityViolations,
  findOperationalPrincipalPriorityViolations,
  findRequestDerivedActorExpressions,
  hasExactOriginListEntry,
  hasExactLockedDependency,
  verifyReleaseContract,
  walkFiles
} = require('../scripts/verify-release-contract');

test('release contract retains only the canonical runtime and mandatory delivery gates', () => {
  const result = verifyReleaseContract();
  assert.equal(result.valid, true, result.failures.join('\n'));
  assert.deepEqual(result.failures, []);
  assert.ok(result.checks.canonicalPaths >= 10);
  assert.ok(result.checks.hostedEnvironmentKeys >= 11);
});

test('release contract permits dependency upgrades only when the exact lockfile version matches', () => {
  const dependency = '@axe-core/playwright';
  const packageJson = { devDependencies: { [dependency]: '4.13.0' } };
  const packageLock = { packages: { [`node_modules/${dependency}`]: { version: '4.13.0' } } };
  assert.equal(hasExactLockedDependency(packageJson, packageLock, dependency), true);
  assert.equal(hasExactLockedDependency(packageJson, { packages: { [`node_modules/${dependency}`]: { version: '4.12.1' } } }, dependency), false);
  assert.equal(hasExactLockedDependency({ devDependencies: { [dependency]: '^4.13.0' } }, packageLock, dependency), false);
});

test('hosted CORS origin checks require an exact allowlist entry', () => {
  const expected = 'https://002contractor-ai.noodzakelijkonline.de';
  assert.equal(hasExactOriginListEntry(expected, expected), true);
  assert.equal(hasExactOriginListEntry(`https://evil.example, ${expected}`, expected), true);
  assert.equal(hasExactOriginListEntry('https://evil.example/https://002contractor-ai.noodzakelijkonline.de', expected), false);
  assert.equal(hasExactOriginListEntry(`${expected}.evil.example`, expected), false);
  assert.equal(hasExactOriginListEntry(`${expected}/extra-path`, expected), false);
});

test('release packages use the exact commit SHA that passed source verification', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/publish-release.yml'), 'utf8');
  assert.equal((workflow.match(/^\s+ref: \$\{\{ needs\.verify-release-source\.outputs\.source_sha \}\}$/gm) || []).length, 2);
  assert.equal((workflow.match(/Verify immutable release source/g) || []).length, 2);
  assert.doesNotMatch(workflow, /^\s+ref: \$\{\{ needs\.verify-release-source\.outputs\.tag \}\}$/m);
});

test('release packages produce and verify repository-bound provenance attestations', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/publish-release.yml'), 'utf8');
  assert.equal((workflow.match(/uses: actions\/attest@1e69f48acb82d1966a394da916b4c1698aa569d6 # v4\.2\.2/g) || []).length, 2);
  assert.match(workflow, /subject-path: release\/ContractorAI-windows-x64\.zip/);
  assert.match(workflow, /subject-name: \$\{\{ needs\.verify-release-source\.outputs\.image \}\}/);
  assert.match(workflow, /push-to-registry: true/);
  assert.match(workflow, /containerimage\.digest/);
  assert.equal((workflow.match(/gh attestation verify/g) || []).length, 2);
  assert.equal((workflow.match(/--source-ref \$env:ATTESTATION_REF|--source-ref "\$ATTESTATION_REF"/g) || []).length, 2);
});

test('manual release recovery cannot attest a different commit than the current main source', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/publish-release.yml'), 'utf8');
  assert.match(workflow, /if \[\[ "\$release_sha" != "\$main_sha" \]\]; then/);
  assert.match(workflow, /attestation_ref="refs\/heads\/main"/);
  assert.doesNotMatch(workflow, /git merge-base --is-ancestor/);
});

test('production image includes the current work allocation and work-board runtime modules', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
  const buildStage = dockerfile.split('AS runtime')[0];
  assert.match(buildStage, /^RUN npm run build && npm run verify:bundle -- --report \/app\/BUNDLE_BUDGET\.json\r?$/m);
  const runtimeStage = dockerfile.split('AS runtime')[1];
  assert.ok(runtimeStage, 'The production runtime stage must exist.');
  assert.match(runtimeStage, /^COPY --from=build \/app\/BUNDLE_BUDGET\.json \.\/BUNDLE_BUDGET\.json\r?$/m);
  for (const module of ['company-runtime.js', 'work-balance.js', 'client-date-commitments.js', 'work-board.js', 'work-board-routes.js', 'docs/WORK_BALANCE.md', 'identity-registry.js', 'identity-runtime.js', 'identity-server.js', 'identity-oidc-adapter.js', 'identity-recovery.js', 'scripts/identity-maintenance.js', 'scripts/runtime-healthcheck.js']) {
    const copies = runtimeStage.split(/\r?\n/).filter(line => line.startsWith('COPY '));
    assert.ok(copies.some(line => line.split(/\s+/).includes(module)), `${module} must be copied into the runtime image.`);
  }
  assert.match(runtimeStage, /HEALTHCHECK[^\r\n]+node scripts\/runtime-healthcheck\.js/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', '.dockerignore'), 'utf8'), /^identity-companies\.json$/m);
});

test('both deployment manifests include the full literal module and worker dependency closure', () => {
  const root = path.join(__dirname, '..');
  const result = verifyRuntimeSourceInventory(root);
  assert.equal(result.valid, true, result.failures.join('\n'));
  assert.ok(result.counts.Docker >= 55);
  assert.ok(result.counts.Windows >= 60);
});

test('runtime inventory follows nested dependencies and worker files without executing source', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-runtime-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'entry.js'), "const path = require('node:path'); require('./child'); new Worker(path.join(__dirname, 'worker.js')); throw Error('Do not execute inventory sources');");
  fs.writeFileSync(path.join(root, 'child.js'), "require('./rules.json'); require('./entry');");
  fs.writeFileSync(path.join(root, 'worker.js'), "require('./child');");
  fs.writeFileSync(path.join(root, 'rules.json'), '{}');
  assert.deepEqual(runtimeSourceClosure(root, ['entry.js']), ['child.js', 'entry.js', 'rules.json', 'worker.js']);
  fs.unlinkSync(path.join(root, 'worker.js'));
  assert.throws(() => runtimeSourceClosure(root, ['entry.js']), /worker\.js/);
});

test('native Android client binds login, encrypted work packs, and API requests to the server company scope', () => {
  const root = path.join(__dirname, '..');
  const store = fs.readFileSync(path.join(root, 'android/app/src/main/java/nl/contractorai/field/FieldStore.java'), 'utf8');
  const activity = fs.readFileSync(path.join(root, 'android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /companyId: operatingLedger\.company\.id/);
  assert.match(server, /ledgerId: operatingLedger\.company\.ledgerId/);
  assert.match(server, /worker: fieldIdentity \? \{ id: fieldIdentity\.workerId/);
  assert.match(store, /JSONObject worker = operator\.optJSONObject\("worker"\)/);
  assert.match(store, /operator\.optString\("companyId", ""\)/);
  assert.match(store, /operator\.optString\("ledgerId", ""\)/);
  assert.match(store, /X-Contractor-Company/);
  assert.match(store, /X-Contractor-Ledger/);
  assert.match(activity, /store\.companyId = operator\.getString\("companyId"\)/);
  assert.match(activity, /store\.ledgerId = operator\.getString\("ledgerId"\)/);
  assert.match(activity, /\.put\("companyId", store\.companyId\)\.put\("ledgerId", store\.ledgerId\)/);
});

test('native Android photo capture is private, encrypted offline, ordered, and uses governed idempotent uploads', () => {
  const root = path.join(__dirname, '..');
  const store = fs.readFileSync(path.join(root, 'android/app/src/main/java/nl/contractorai/field/FieldStore.java'), 'utf8');
  const activity = fs.readFileSync(path.join(root, 'android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const paths = fs.readFileSync(path.join(root, 'android/app/src/main/res/xml/file_paths.xml'), 'utf8');
  assert.match(manifest, /androidx\.core\.content\.FileProvider/);
  assert.match(manifest, /android:exported="false" android:grantUriPermissions="true"/);
  assert.match(paths, /<cache-path[^>]+path="photo-capture\/"/);
  assert.match(store, /static final int MAX_PHOTO = 2 \* 1024 \* 1024/);
  assert.match(store, /file\.length\(\) > 40L \* 1024 \* 1024/);
  assert.match(store, /nextPhotoPhase\(JSONObject pack, String setId\)/);
  assert.match(store, /nextPhotoPhase\(JSONObject pack, String setId, JSONArray queuedEntries\)/);
  assert.match(store, /setId\.equals\(payload\.optString\("setId"\)\)/);
  assert.match(store, /put\("fileBase64", android\.util\.Base64\.encodeToString\(photo, android\.util\.Base64\.NO_WRAP\)\)/);
  assert.match(store, /Content-Disposition: form-data; name=\\"evidenceFile\\"/);
  assert.match(store, /X-Contractor-Company/);
  assert.match(store, /X-Contractor-Ledger/);
  assert.match(store, /Idempotency-Key/);
  assert.match(activity, /MediaStore\.ACTION_IMAGE_CAPTURE/);
  assert.doesNotMatch(activity, /resolveActivity\(getPackageManager\(\)\)/);
  assert.match(activity, /private void clearStaleCameraFiles\(\)/);
  assert.match(activity, /final long capturedAt = System\.currentTimeMillis\(\)/);
  assert.match(activity, /store\.queuePhoto\(updated, target/);
  assert.match(activity, /store\.uploadPhoto\("\/api\/ledger\/upload"/);
  assert.match(activity, /markPhotoCaptured\(updated/);
  assert.match(activity, /removePendingPhotoPhase\(updated/);
});

test('native Android work packs queue site delivery receipts with optimistic guards and sync them after source-bound work', () => {
  const root = path.join(__dirname, '..');
  const store = fs.readFileSync(path.join(root, 'android/app/src/main/java/nl/contractorai/field/FieldStore.java'), 'utf8');
  const activity = fs.readFileSync(path.join(root, 'android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  assert.match(store, /void queueSiteReceipt\(JSONObject data, JSONObject pack, String issueId/);
  assert.match(store, /accepted \+ damaged > received/);
  assert.match(store, /expectedDispatchReference/);
  assert.match(store, /expectedRemainingQuantity/);
  assert.match(store, /"kind", "site_receipt"/);
  assert.match(activity, /siteIssueControls\(pack\)/);
  assert.match(activity, /"\/material-stock-site-issues\/" \+ FieldStore\.encode\(issueId\) \+ "\/receipts"/);
  assert.match(activity, /syncPriority\(left\.optString\("kind"\)\), syncPriority\(right\.optString\("kind"\)\)/);
  assert.match(activity, /"site_receipt"\.equals\(kind\) \? 2/);
  assert.match(activity, /catch \(FieldStore\.ApiError error\) \{ if \(error\.status == 409\)/);
  assert.match(activity, /retainSiteIssue\(updated, jobId, issueId, response\.optJSONObject\("issue"\)\)/);
});

test('native Android safety briefing acknowledgements are worker-scoped, encrypted, revision-bound, and never a start release', () => {
  const root = path.join(__dirname, '..');
  const store = fs.readFileSync(path.join(root, 'android/app/src/main/java/nl/contractorai/field/FieldStore.java'), 'utf8');
  const activity = fs.readFileSync(path.join(root, 'android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  const ledger = fs.readFileSync(path.join(root, 'operating-ledger.js'), 'utf8');
  assert.match(store, /void queueSafetyBriefingAcknowledgement\(JSONObject data, JSONObject pack, JSONObject meeting/);
  assert.match(store, /briefingContentHash/);
  assert.match(store, /workerId\.equals\(attendee\.optString\("workerId"\)\)/);
  assert.match(store, /"kind", "safety_briefing_acknowledgement"/);
  assert.match(store, /pendingLocalAcknowledgement/);
  assert.match(activity, /safety-briefings\?jobId=/);
  assert.match(activity, /safetyBriefingControls\(pack\)/);
  assert.match(activity, /safety-meetings\/" \+ FieldStore\.encode\(meetingId\) \+ "\/acknowledgments/);
  assert.match(activity, /markSafetyBriefingConflict\(updated/);
  assert.match(activity, /geen starttoestemming of veiligheidsvrijgave/i);
  assert.match(ledger, /safety_briefing_source_changed/);
});

test('native Android build uses a checksum-pinned Gradle wrapper without accepting SDK licenses', () => {
  const root = path.join(__dirname, '..');
  const wrapperJar = fs.readFileSync(path.join(root, 'android/gradle/wrapper/gradle-wrapper.jar'));
  const properties = fs.readFileSync(path.join(root, 'android/gradle/wrapper/gradle-wrapper.properties'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'scripts/build-android.ps1'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'android/README.md'), 'utf8');
  assert.equal(crypto.createHash('sha256').update(wrapperJar).digest('hex'), '3b8a25775a69158b5ad2b1d17a80a88dc7b40a352a73eb27d06c612a7ce68e98');
  assert.match(properties, /gradle-9\.8\.1-bin\.zip/);
  assert.match(properties, /distributionSha256Sum=dce76f55f8e251a3a1f130eb120f30b3d271de2b76c9b0729d316b5a1b6dc01f/);
  assert.match(fs.readFileSync(path.join(root, 'android/build.gradle'), 'utf8'), /com\.android\.application' version '9\.4\.1'/);
  assert.match(build, /gradlew\.bat/);
  assert.match(build, /No licenses are accepted by this script/);
  assert.doesNotMatch(build, /sdkmanager.*--licenses/i);
  assert.match(readme, /separate Gradle installation is not\s+required/);
});

test('release source inventory excludes generated runtime and browser-report directories', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-release-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ['src', 'release', 'storage', 'tmp', 'uploads', 'test-results', 'playwright-report', 'coverage', '.vite']) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
    fs.writeFileSync(path.join(root, directory, 'marker.js'), directory);
  }
  assert.deepEqual(walkFiles(root), ['src/marker.js']);
});

test('release actor guard rejects request-derived identities and accepts the trusted boundary', () => {
  const unsafe = findRequestDerivedActorExpressions(`
    operation({ actor: req.body?.actor || 'dashboard' });
    operation({ actor: actorFromRequest(req, payload.actor || 'dashboard') });
    const actor = input.actor || 'dashboard';
  `);
  assert.equal(unsafe.length, 3);
  assert.deepEqual(unsafe.map(finding => finding.line), [2, 3, 4]);
  assert.deepEqual(findRequestDerivedActorExpressions(`
    operation({ actor: trustedRequestActor(req) });
    const actor = trustedRequestActor(req);
  `), []);
});

test('release approval-principal guard rejects submitted-first requester and resolver expressions', () => {
  const unsafe = findApprovalPrincipalPriorityViolations(`
    const requester = payload.requestedBy || payload.requested_by || options.actor || 'Contractor.AI';
    const resolver = payload.resolvedBy || payload.actor || options.actor || 'user';
  `);
  assert.equal(unsafe.length, 2);
  assert.deepEqual(unsafe.map(finding => finding.line), [2, 3]);
  assert.deepEqual(findApprovalPrincipalPriorityViolations(`
    const requester = options.actor || payload.actor || payload.requestedBy || payload.requested_by;
    const resolver = options.actor || payload.actor || payload.resolvedBy || payload.resolved_by;
  `), []);
});

test('release operational-principal guard rejects submitted-first audit identities', () => {
  const unsafe = findOperationalPrincipalPriorityViolations(`
    const createdBy = payload.createdBy || options.actor || 'Contractor.AI';
    releasedBy: payload.releasedBy || actor,
    submittedBy: normalizeText(payload.submittedBy || payload.submitted_by, actor),
    reviewedBy: payload.reviewedBy || payload.reviewed_by || actor;
    const issuedBy = normalizeText(
      payload.issuedBy ||
      payload.issued_by ||
      options.actor,
      'Contractor.AI'
    );
  `);
  assert.equal(unsafe.length, 5);
  assert.deepEqual(unsafe.map(finding => finding.line), [2, 3, 4, 5, 7]);
  assert.deepEqual(findOperationalPrincipalPriorityViolations(`
    const createdBy = options.actor || payload.createdBy || 'Contractor.AI';
    releasedBy: actor,
    submittedBy: actor,
    reviewedBy: actor
  `), []);
});
