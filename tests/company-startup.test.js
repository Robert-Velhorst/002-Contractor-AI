const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { registerCompanyStartupContract } = require('./company-startup-contract');

registerCompanyStartupContract(test, { prefix: 'SQLite company startup', createDatabase(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-company-startup-'));
  const dbFile = path.join(directory, 'ledger.sqlite');
  const db = new DatabaseSync(dbFile);
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { db, options: { dbFile } };
} });
