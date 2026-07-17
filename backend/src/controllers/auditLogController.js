const withTenant = require('../db/withTenant');

function encodeCursor(row) {
    return Buffer.from(JSON.stringify({ createdAt: row.created_at, id: row.id })).toString('base64');
}

function decodeCursor(cursor) {
    try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
        if (!decoded.createdAt || !decoded.id) return null;
        return decoded;
    } catch {
        return null;
    }
}

async function listAuditLog(req, res, next) {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;

        if (req.query.cursor && !cursor) {
            return res.status(400).json({ error: 'Invalid cursor' });
        }

        const rows = await withTenant(req.tenantId, async (client) => {
            const baseSelect = `
                SELECT id, entity_type, entity_id, action, details, created_at
                FROM audit_logs
                WHERE tenant_id = $1`;

            const result = cursor
                ? await client.query(
                      `${baseSelect} AND (created_at, id) < ($2, $3)
                       ORDER BY created_at DESC, id DESC LIMIT $4`,
                      [req.tenantId, cursor.createdAt, cursor.id, limit]
                  )
                : await client.query(
                      `${baseSelect} ORDER BY created_at DESC, id DESC LIMIT $2`,
                      [req.tenantId, limit]
                  );

            return result.rows;
        });

        const nextCursor = rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null;
        res.json({ auditLog: rows, nextCursor });
    } catch (err) {
        next(err);
    }
}

module.exports = { listAuditLog };