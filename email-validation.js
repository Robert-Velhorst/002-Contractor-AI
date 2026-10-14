const { domainToASCII } = require('node:url');

function isValidEmailAddress(value) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 254 || /\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@') || at > 64) return false;

  const local = value.slice(0, at);
  const domain = domainToASCII(value.slice(at + 1));
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..') || domain.length > 253) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  return labels.every(label => label.length > 0 && label.length <= 63
    && /^[a-z\d]/i.test(label) && /[a-z\d]$/i.test(label)
    && [...label].every(character => /[a-z\d-]/i.test(character)));
}

module.exports = { isValidEmailAddress };
