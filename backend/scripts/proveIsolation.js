require('dotenv').config();
const pool = require('../src/config/db');
const withTenant = require('../src/db/withTenant');

const results = [];

function check(label, passed, detail = '') {
    results.push({ label, passed });
    console.log(`${passed ? 'PASS' : 'FAIL'} - ${label}${detail ? ` (${detail})` : ''}`);
}

async function main() {
    const tenantsRes = await pool.query(
        `SELECT id, slug FROM organizations WHERE slug IN ('acme-ca', 'bharat-sme')`
    );
    const acme = tenantsRes.rows.find((r) => r.slug === 'acme-ca');
    const bharat = tenantsRes.rows.find((r) => r.slug === 'bharat-sme');

    if (!acme || !bharat) {
        console.error('Seed data not found. Run `npm run seed` first.');
        process.exitCode = 1;
        return;
    }

    console.log(`Using tenants: acme-ca=${acme.id}, bharat-sme=${bharat.id}\n`);

    // --- Check 1: cross-tenant SELECT ----------------------------------
    const crossRead = await withTenant(bharat.id, (client) =>
        client.query('SELECT * FROM invoices WHERE tenant_id = $1', [acme.id])
    );
    check(
        "Cross-tenant SELECT (as Bharat, querying Acme's invoices)",
        crossRead.rows.length === 0,
        `expected 0 rows, got ${crossRead.rows.length}`
    );

    // --- Check 2: forged INSERT -----------------------------------------
    let forgedInsertBlocked = false;
    try {
        await withTenant(bharat.id, (client) =>
            client.query(
                `INSERT INTO invoices (tenant_id, invoice_number, customer_name)
                 VALUES ($1, 'FORGED-001', 'Attacker')`,
                [acme.id]
            )
        );
    } catch (err) {
        forgedInsertBlocked = err.code === '42501' || /row-level security/i.test(err.message || '');
    }
    check('Forged INSERT blocked (Bharat session, Acme tenant_id)', forgedInsertBlocked);

    // --- Check 3: no tenant context at all --------------------------------
    const client = await pool.connect();
    let noContextRows;
    try {
        await client.query('BEGIN');
        const result = await client.query('SELECT * FROM invoices');
        noContextRows = result.rows.length;
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }
    check('No tenant context set -> zero rows (safe default, not a leak)', noContextRows === 0, `got ${noContextRows}`);

    // --- Check 4: audit log isolation --------------------------------------
    const crossAudit = await withTenant(bharat.id, (client) =>
        client.query('SELECT * FROM audit_logs WHERE tenant_id = $1', [acme.id])
    );
    check(
        "Cross-tenant audit log read (as Bharat, querying Acme's history)",
        crossAudit.rows.length === 0,
        `expected 0 rows, got ${crossAudit.rows.length}`
    );

    const allPassed = results.every((r) => r.passed);
    console.log(allPassed ? '\nAll isolation checks passed.' : '\nSOME CHECKS FAILED -- isolation is not fully enforced.');
    process.exitCode = allPassed ? 0 : 1;
}

main()
    .catch((err) => {
        console.error('Script error:', err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());