const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const COMPANY_MARKER = '.contractor-company.json';
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const LEDGER_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function companyError(code, message) {
  return Object.assign(new Error(message), { code, statusCode: 409 });
}

function normalizeCompanyId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw companyError('invalid_company_id', 'Company id must contain 3-64 lowercase letters, digits, underscores or hyphens.');
  }
  return value;
}

function migrateCompanyRuntime(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_runtime (
      id TEXT PRIMARY KEY CHECK(id = 'current'),
      company_id TEXT NOT NULL UNIQUE,
      ledger_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
}

function readCompanyRuntime(db) {
  const exists = db.prepare(typeof db.query === 'function'
    ? "SELECT pg_catalog.to_regclass('company_runtime') AS name"
    : "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'company_runtime'").get();
  if (!exists?.name) return null;
  const rows = db.prepare('SELECT * FROM company_runtime').all();
  if (!rows.length) return null;
  const row = rows[0];
  if (rows.length !== 1 || row.id !== 'current' || !ID_PATTERN.test(row.company_id) || !LEDGER_PATTERN.test(row.ledger_id) || !Number.isFinite(Date.parse(row.created_at))) {
    throw companyError('company_runtime_invalid', 'The retained company environment identity is invalid.');
  }
  return Object.freeze({ id: row.company_id, ledgerId: row.ledger_id, createdAt: row.created_at });
}

function assertSameCompany(expected, actual) {
  if (!expected || !actual || expected.id !== actual.id || expected.ledgerId !== actual.ledgerId) {
    throw companyError('company_runtime_mismatch', 'This database or directory belongs to another company environment. Use a separate environment; no business records were reassigned.');
  }
}

function bindCompanyRuntime(db, configuredId) {
  const requestedId = normalizeCompanyId(configuredId);
  db.prepare(`INSERT INTO company_runtime (id, company_id, ledger_id, created_at)
    VALUES ('current', ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .run(requestedId || `company_${crypto.randomUUID()}`, crypto.randomUUID(), new Date().toISOString());
  const company = readCompanyRuntime(db);
  if (requestedId && company.id !== requestedId) {
    throw companyError('company_runtime_mismatch', 'The configured company does not own this ledger. Existing data has not been reassigned.');
  }
  normalizeCompanyId(company.id);
  return company;
}

function readDirectoryCompany(directory) {
  const file = path.join(path.resolve(directory), COMPANY_MARKER);
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw companyError('company_marker_invalid', 'Company directory marker is unsafe or invalid.');
  let marker;
  try { marker = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {
    throw companyError('company_marker_invalid', 'Company directory marker is damaged; restore the original marker before starting.');
  }
  if (marker.format !== 'contractor-company-directory/v1' || !marker.company) throw companyError('company_marker_invalid', 'Company directory marker is invalid.');
  return marker.company;
}

function bindCompanyDirectories(company, directories) {
  const roots = [...new Set(directories.map(directory => path.resolve(directory)))];
  // Check every existing binding before creating any new one.
  for (const root of roots) {
    const current = readDirectoryCompany(root);
    if (current) assertSameCompany(company, current);
  }
  for (const root of roots) {
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, COMPANY_MARKER);
    try {
      fs.writeFileSync(file, JSON.stringify({ format: 'contractor-company-directory/v1', company }), { flag: 'wx', mode: 0o600 });
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    assertSameCompany(company, readDirectoryCompany(root));
  }
}

function inspectCompanyDirectories(configuredId, directories) {
  const companies = directories.map(readDirectoryCompany).filter(Boolean);
  for (const company of companies) {
    assertSameCompany(companies[0], company);
    if (configuredId && company.id !== configuredId) throw companyError('company_runtime_mismatch', 'The configured company does not own this data or upload directory.');
  }
  return companies[0] || null;
}

function companyScopeKey(company) {
  return `company:${company.id}:ledger:${company.ledgerId}`;
}

module.exports = {
  COMPANY_MARKER, assertSameCompany, bindCompanyDirectories, bindCompanyRuntime,
  companyScopeKey, inspectCompanyDirectories, migrateCompanyRuntime, normalizeCompanyId, readCompanyRuntime, readDirectoryCompany
};
