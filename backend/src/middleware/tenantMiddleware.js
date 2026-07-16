const pool = require('../config/db');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every request to a tenant-scoped route must carry an X-Tenant-Id
 * header. This middleware validates it, confirms the tenant actually
 * exists, and attaches it to req.tenantId for controllers to use.
 *
 * This is the FIRST layer of isolation (application-level). The
 * SECOND layer is Row-Level Security in the database itself -- see
 * withTenant.js. Neither layer alone is enough on its own; together
 * they mean a bug in one layer doesn't equal a full breach.
 */
async function resolveTenant(req, res, next) {
    const tenantId = req.header('x-tenant-id');

    if (!tenantId) {
        return res.status(400).json({ error: 'Missing X-Tenant-Id header' });
    }
    if (!UUID_REGEX.test(tenantId)) {
        return res.status(400).json({ error: 'X-Tenant-Id is not a valid UUID' });
    }

    try {
        const result = await pool.query(
            'SELECT id, name, slug, status FROM organizations WHERE id = $1',
            [tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        if (result.rows[0].status !== 'active') {
            return res.status(403).json({ error: 'Tenant is suspended' });
        }

        req.tenantId = tenantId;
        req.tenant = result.rows[0];
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = resolveTenant;