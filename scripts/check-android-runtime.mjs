// Inspect the selected build SDK without installing tools or starting the app.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const profile = JSON.parse(fs.readFileSync(new URL('../android-runtime.json', import.meta.url), 'utf8'));
if (profile.schema_version !== 1 || process.versions.node !== profile.node) {
  throw new Error('Select the exact metadata interpreter from android-runtime.json');
}
for (const version of [profile.java.version, profile.android.build_tools]) {
  if (!/^\d+(?:\.\d+)*$/.test(version)) throw new Error('SDK versions must be stable numeric releases');
}
const android = profile.android;
if (!/^android-\d+\.\d+$/.test(android.platform) || android.platform !== `android-${android.major}.${android.minor}`) {
  throw new Error('Android platform fields must identify the same SDK');
}
if (process.argv.length === 3 && process.argv[2] === '--outputs') {
  for (const [name, value] of Object.entries({
    'java-version': profile.java.version,
    'android-platform': android.platform,
    'android-build-tools': android.build_tools
  })) console.log(`${name}=${value}`);
} else {
  if (process.argv.length !== 2) throw new Error('Only --outputs is supported');
  for (const name of ['JAVA_HOME', 'ANDROID_HOME']) {
    if (!process.env[name]) throw new Error(`Set ${name} to the selected installed SDK`);
  }
  const command = (name, args) => execFileSync(path.join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')), args, {
    encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  const compiler = command('javac', ['--version']);
  // Java writes settings to stderr, so collect both pipes without executing a shell.
  const javaResult = spawnSync(path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), ['-XshowSettings:properties', '-version'], { encoding: 'utf8', timeout: 30000, shell: false });
  if (javaResult.error || javaResult.status !== 0) throw javaResult.error || new Error('Java metadata failed');
  const java = (javaResult.stdout + javaResult.stderr).replace(/\r\n/g, '\n');
  const actual = Object.fromEntries([...java.matchAll(/^[\t ]*(java\.[\w.]+)[\t ]*=[\t ]*(.*?)[\t ]*$/gm)].map(match => [match[1], match[2]]));
  if (compiler !== `javac ${profile.java.version}` || actual['java.runtime.version'] !== profile.java.runtime || actual['java.vendor.version'] !== profile.java.vendor_version) {
    throw new Error('The exact current free Zulu compiler/runtime build is required');
  }
  const packageRoot = path.join(process.env.ANDROID_HOME, 'platforms', android.platform);
  const source = fs.readFileSync(path.join(packageRoot, 'source.properties'), 'utf8');
  const buildSource = fs.readFileSync(path.join(process.env.ANDROID_HOME, 'build-tools', android.build_tools, 'source.properties'), 'utf8');
  const properties = input => Object.fromEntries(input.split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  const values = properties(source);
  if (!fs.statSync(path.join(packageRoot, 'android.jar')).isFile() || values['AndroidVersion.ApiLevel'] !== `${android.major}.${android.minor}` || values['AndroidVersion.PreviewSdkInt'] !== '0' || values['AndroidVersion.CodeName'] || values['AndroidVersion.BetaVersion'] || properties(buildSource)['Pkg.Revision'] !== android.build_tools) {
    throw new Error('Expected the selected final Android platform and build tools');
  }
  console.log(JSON.stringify({ profile, node: process.versions.node, compiler, java_properties: actual, platform_properties: source, build_tools_properties: buildSource, application_started: false, operator_sdk_changed: false }, null, 2));
}
