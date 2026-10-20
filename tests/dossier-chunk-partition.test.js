const { test } = require('node:test');
const assert = require('node:assert/strict');

test('dossier grouping assigns only explicit controls and leaves field assurance independent', async () => {
  const { default: configure } = await import('../vite.config.mjs');
  const output = configure({ command: 'build', mode: 'test' }).build.rolldownOptions.output;
  const group = output.codeSplitting.groups[0];
  assert.equal(group.includeDependenciesRecursively, false);
  for (const name of ['CloseoutRegister', 'CommercialControl', 'DayworkControl',
    'FieldRiskControl', 'InspectionChecklistControl', 'NonconformanceControl',
    'PhotoEvidenceControl', 'ProductionControl', 'ProjectControls', 'TakeoffControl', 'WorkPlanControl']) {
    assert.equal(group.name(`/source/components/${name}.jsx`), 'job-controls');
  }
  for (const file of ['components/FieldAssuranceWorkspace.jsx', 'components/ClientsWorkspace.jsx',
    'components/AutomationControl.jsx', 'dashboard-format.js', 'operator-locale.js']) {
    assert.equal(group.name(`/source/${file}`), null);
  }
  assert.equal(group.name('/source/node_modules/react/index.js'), 'react');
});
