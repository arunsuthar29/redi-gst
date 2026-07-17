const pool = require('../config/db');

function slugify(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

async function listOrganizations(req, res, next) {
    try {
        const result = await pool.query(
            'SELECT id, name, slug, status, created_at FROM organizations ORDER BY name'
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
}

/**
 * Creates a new tenant. This is deliberately NOT behind resolveTenant
 * middleware -- you can't require an existing tenant header to create
 * a brand new tenant. Slug is auto-derived from name and de-duplicated
 * (acme -> acme, acme -> acme-2 on a second collision) so the caller
 * never has to think about it.
 */
async function createOrganization(req, res, next) {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }

        const baseSlug = slugify(name);
        if (!baseSlug) {
            return res.status(400).json({ error: 'name must contain at least one alphanumeric character' });
        }

        let slug = baseSlug;
        let attempt = 1;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const existing = await pool.query('SELECT 1 FROM organizations WHERE slug = $1', [slug]);
            if (existing.rows.length === 0) break;
            attempt += 1;
            slug = `${baseSlug}-${attempt}`;
        }

        const result = await pool.query(
            `INSERT INTO organizations (name, slug)
             VALUES ($1, $2)
             RETURNING id, name, slug, status, created_at`,
            [name.trim(), slug]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
}

module.exports = { listOrganizations, createOrganization };