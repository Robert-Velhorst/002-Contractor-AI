const { test } = require('node:test');
const assert = require('node:assert/strict');

test('dossier grouping assigns only explicit controls and leaves field assurance independent', async () => {
  const { default: configure } = await import('../vite.config.js');
  const output = configure({ command: 'build', mode: 'test' }).build.rollupOptions.output;
  assert.equal(output.onlyExplicitManualChunks, true);
  for (const name of ['CloseoutRegister', 'CommercialControl', 'DayworkControl',
    'FieldRiskControl', 'InspectionChecklistControl', 'NonconformanceControl',
    'PhotoEvidenceControl', 'ProductionControl', 'ProjectControls', 'TakeoffControl', 'WorkPlanControl']) {
    assert.equal(output.manualChunks(`/source/components/${name}.jsx`), 'job-controls');
  }
  for (const file of ['components/FieldAssuranceWorkspace.jsx', 'components/ClientsWorkspace.jsx',
    'components/AutomationControl.jsx', 'dashboard-format.js', 'operator-locale.js']) {
    assert.equal(output.manualChunks(`/source/${file}`), undefined);
  }
  assert.equal(output.manualChunks('/source/node_modules/react/index.js'), 'react');
});
