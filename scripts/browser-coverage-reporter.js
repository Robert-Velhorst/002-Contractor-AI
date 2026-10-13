const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const identity = item => JSON.stringify([item.file, item.title]);
const description = item => ({ file: path.relative(projectRoot, item.location.file).replace(/\\/g, '/'), title: item.title });

function coverageSummary(expected, discovered) {
  const expectedIds = new Set(expected.map(identity));
  const counts = new Map();
  for (const item of discovered) counts.set(identity(item), (counts.get(identity(item)) || 0) + 1);
  const missingOrDuplicate = expected.filter(item => counts.get(identity(item)) !== 1);
  const unexpected = discovered.filter(item => !expectedIds.has(identity(item)));
  return { valid: expected.length > 0 && expectedIds.size === expected.length
    && missingOrDuplicate.length === 0 && unexpected.length === 0,
  planned: expected.length, discovered: discovered.length, missingOrDuplicate, unexpected };
}

class BrowserCoverageReporter {
  constructor() {
    this.expected = JSON.parse(process.env.CONTRACTOR_AI_BROWSER_EXPECTED_CASES || '[]');
    this.coverage = coverageSummary(this.expected, []);
  }

  printsToStdio() { return true; }

  onBegin(_config, suite) {
    this.results = new Map();
    this.coverage = coverageSummary(this.expected, suite.allTests().map(description));
  }

  onTestEnd(item, result) {
    const key = identity(description(item));
    this.results.set(key, [...(this.results.get(key) || []), result.status]);
  }

  async onEnd() {
    const unexecutedOrRepeated = this.expected.filter(item => {
      const outcomes = this.results?.get(identity(item)) || [];
      return outcomes.length !== 1 || ['skipped', 'interrupted'].includes(outcomes[0]);
    });
    const coverage = { ...this.coverage, executed: this.results?.size || 0, unexecutedOrRepeated };
    coverage.valid = coverage.valid && unexecutedOrRepeated.length === 0 && coverage.executed === this.expected.length;
    console.log(JSON.stringify({ browserCoverage: coverage }));
    if (!coverage.valid) return { status: 'failed' };
  }
}

module.exports = BrowserCoverageReporter;
module.exports.coverageSummary = coverageSummary;
