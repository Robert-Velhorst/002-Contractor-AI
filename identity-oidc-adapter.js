const { fail } = require('./identity-registry');

function registryAdapter(registry) {
  return class RegistryAdapter {
    constructor(model) { this.model = model; }
    async upsert(id, payload, expiresIn) {
      registry.transaction(() => {
        const previous = registry.db.prepare('SELECT sealed_payload FROM registry_oidc_models WHERE model = ? AND id = ?').get(this.model, id);
        // A competing save must never make a consumed authorization code usable again.
        const retained = previous && registry.open(previous.sealed_payload, `oidc:${this.model}:${id}`);
        const next = retained?.consumed ? { ...payload, consumed: retained.consumed } : payload;
        const expiresAt = new Date(Date.now() + Math.min(Number(expiresIn) || 28800, 86400) * 1000).toISOString();
        registry.db.prepare('DELETE FROM registry_oidc_models WHERE expires_at <= ?').run(new Date().toISOString());
        registry.db.prepare(`INSERT INTO registry_oidc_models
          (model, id, sealed_payload, expires_at, uid, user_code, grant_id, account_id, client_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(model, id) DO UPDATE SET
          sealed_payload = excluded.sealed_payload, expires_at = excluded.expires_at,
          uid = excluded.uid, user_code = excluded.user_code, grant_id = excluded.grant_id,
          account_id = excluded.account_id, client_id = excluded.client_id`)
          .run(this.model, id, registry.seal(next, `oidc:${this.model}:${id}`), expiresAt,
            payload.uid || null, payload.userCode || null, payload.grantId || null, payload.accountId || null, payload.clientId || null);
      });
    }
    payload(row) { registry.assertCurrent({ forServing: true }); return row && registry.open(row.sealed_payload, `oidc:${this.model}:${row.id}`); }
    async find(id) {
      return this.payload(registry.db.prepare('SELECT id, sealed_payload FROM registry_oidc_models WHERE model = ? AND id = ? AND expires_at > ?')
        .get(this.model, id, new Date().toISOString()));
    }
    async findByUid(uid) {
      return this.payload(registry.db.prepare('SELECT id, sealed_payload FROM registry_oidc_models WHERE model = ? AND uid = ? AND expires_at > ?')
        .get(this.model, uid, new Date().toISOString()));
    }
    async findByUserCode(userCode) {
      return this.payload(registry.db.prepare('SELECT id, sealed_payload FROM registry_oidc_models WHERE model = ? AND user_code = ? AND expires_at > ?')
        .get(this.model, userCode, new Date().toISOString()));
    }
    async consume(id) {
      registry.transaction(() => {
        const row = registry.db.prepare('SELECT id, sealed_payload FROM registry_oidc_models WHERE model = ? AND id = ? AND expires_at > ?')
          .get(this.model, id, new Date().toISOString());
        const payload = this.payload(row);
        if (!payload || payload.consumed) fail('invalid_grant', 'The authorization was already used or expired.', 400);
        payload.consumed = Math.floor(Date.now() / 1000);
        registry.db.prepare('UPDATE registry_oidc_models SET sealed_payload = ? WHERE model = ? AND id = ?')
          .run(registry.seal(payload, `oidc:${this.model}:${id}`), this.model, id);
      });
    }
    async destroy(id) { registry.transaction(() => registry.db.prepare('DELETE FROM registry_oidc_models WHERE model = ? AND id = ?').run(this.model, id)); }
    async revokeByGrantId(id) {
      registry.transaction(() => registry.db.prepare('DELETE FROM registry_oidc_models WHERE grant_id = ? OR (model = ? AND id = ?)').run(id, 'Grant', id));
    }
  };
}

module.exports = { registryAdapter };
