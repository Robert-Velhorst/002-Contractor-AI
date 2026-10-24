const supportedRange = require('../package.json').engines.node;
const semver = require('semver');
const windowsNodeVersion = '26.12.1';

function assessNodeCompatibility(actualVersion, requiredRange = supportedRange) {
  const actual = typeof actualVersion === 'string' ? semver.valid(actualVersion) : null;
  const required = typeof requiredRange === 'string' && requiredRange.trim()
    ? semver.validRange(requiredRange) : null;
  if (!actual || !required || required === '*') {
    return { status: 'unknown', supported: false, actual: actualVersion || null, required: requiredRange };
  }
  const supported = semver.satisfies(actual, required);
  return { status: supported ? 'supported' : 'unsupported', supported, actual: actualVersion, required: requiredRange };
}

function nodeCompatibilityIssue(compatibility, { isProduction, runtimeMode }) {
  if ((!isProduction && runtimeMode !== 'hosted') || compatibility.supported) return null;
  return {
    code: 'unsupported_node_version',
    message: `Production requires Node ${compatibility.required}; the running version is ${compatibility.actual || 'unknown'}.`
  };
}

module.exports = { assessNodeCompatibility, nodeCompatibilityIssue, windowsNodeVersion };
