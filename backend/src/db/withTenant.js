const pool = require('../config/db');

/**
 * Runs `fn(client)` inside a transaction with app.current_tenant set
 * for the duration of that transaction only (the `true` third arg to
 * set_config means "local to this transaction" -- it's automatically
 * unset on COMMIT/ROLLBACK, so it can never leak into a later request
 * that reuses this connection from the pool).
 *
 * We use set_config() with a bound parameter instead of a raw
 * `SET LOCAL app.current_tenant = '${tenantId}'` string -- SET does
 * not support query parameters in Postgres, so string interpolation
 * is the tempting shortcut, but set_config() is the parameterized,
 * injection-safe equivalent.
 */
async function withTenant(tenantId, fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = withTenant;