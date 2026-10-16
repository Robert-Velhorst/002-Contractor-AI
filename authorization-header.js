function authorizationPayload(authorization, scheme, maximumLength = 8192) {
  if (typeof authorization !== 'string' || authorization.length > maximumLength) return '';
  const schemeLength = scheme.length;
  if (authorization.slice(0, schemeLength).toLowerCase() !== scheme.toLowerCase()) return '';
  let cursor = schemeLength;
  if (cursor >= authorization.length || authorization.charCodeAt(cursor) > 32) return '';
  while (cursor < authorization.length && authorization.charCodeAt(cursor) <= 32) cursor += 1;
  return authorization.slice(cursor).trim();
}

module.exports = { authorizationPayload };
