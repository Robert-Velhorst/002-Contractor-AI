function parseTrustedProxyConfiguration(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;

  const entries = raw.split(',').map(entry => entry.trim()).filter(Boolean);
  const unsafeShortcut = entries.some(entry => /^(?:true|false|\d+|\*)$/i.test(entry) || /\/0+$/.test(entry));
  if (!entries.length || unsafeShortcut) {
    const error = new Error('Use explicit proxy IP addresses, CIDR ranges, or Express subnet names instead of a universal or hop-count trust rule.');
    error.code = 'invalid_trusted_proxy';
    throw error;
  }

  return entries.join(', ');
}

module.exports = { parseTrustedProxyConfiguration };
