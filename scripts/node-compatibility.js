const supportedRange = require('../package.json').engines.node;

function assessNodeCompatibility(actualVersion, requiredRange = supportedRange) {
  const actualMajor = /^v?(\d+)\./.exec(String(actualVersion || ''))?.[1];
  const requiredMajor = /^(\d+)\.x$/.exec(String(requiredRange || '').trim())?.[1];
  if (!actualMajor || !requiredMajor) {
    return { status: 'unknown', supported: false, actual: actualVersion || null, required: requiredRange };
  }
  const supported = actualMajor === requiredMajor;
  return { status: supported ? 'supported' : 'unsupported', supported, actual: actualVersion, required: requiredRange };
}

function nodeCompatibilityIssue(compatibility, { isProduction, runtimeMode }) {
  if ((!isProduction && runtimeMode !== 'hosted') || compatibility.supported) return null;
  return {
    code: 'unsupported_node_version',
    message: `Production requires Node ${compatibility.required}; the running version is ${compatibility.actual || 'unknown'}.`
  };
}

module.exports = { assessNodeCompatibility, nodeCompatibilityIssue };
