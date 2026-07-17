require('dotenv').config();
const pool = require('../src/config/db');
const { calculateLineItem, aggregateInvoiceTotals } = require('../src/utils/gst');

const TENANTS = [
    { name: 'Mohit traders', slug: 'mohit-jsm' },
    { name: 'Bharat SME Traders', slug: 'bharat-sme' },
];

const SAMPLE_INVOICES = [
    [
        { description: 'Consulting services', quantity: 10, unitPrice: 1500, gstRate: 18 },
        { description: 'Software license', quantity: 1, unitPrice: 5000, gstRate: 18 },
    ],
    [
        { description: 'Export goods (zero-rated)', quantity: 5, unitPrice: 2000, gstRate: 0 },
    ],
    [
        { description: 'Office supplies', quantity: 20, unitPrice: 250, gstRate: 12 },
        { description: 'Printer maintenance', quantity: 2, unitPrice: 800, gstRate: 28 },
        { description: 'Cleaning service', quantity: 1, unitPrice: 1200, gstRate: 5 },
    ],
];

async function upsertTenant(client, tenant) {
    const res = await client.query(
        `INSERT INTO organizations (name, slug)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tenant.name, tenant.slug]
    );
    return res.rows[0].id;
}

async function seedInvoicesForTenant(client, tenantId, tenantSlug) {
    await client.query(`SET LOCAL app.current_tenant = '${tenantId}'`);

    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < SAMPLE_INVOICES.length; i++) {
        const rawItems = SAMPLE_INVOICES[i];
        const computed = rawItems.map((item) => ({ ...item, ...calculateLineItem(item) }));
        const totals = aggregateInvoiceTotals(computed);
        const invoiceNumber = `${tenantSlug}-INV-${String(i + 1).padStart(3, '0')}`;

        const invoiceRes = await client.query(
            `INSERT INTO invoices
                (tenant_id, invoice_number, customer_name, status,
                 subtotal, cgst_total, sgst_total, grand_total)
             VALUES ($1, $2, $3, 'issued', $4, $5, $6, $7)
             ON CONFLICT (tenant_id, invoice_number) DO NOTHING
             RETURNING id`,
            [
                tenantId,
                invoiceNumber,
                `Sample Customer ${i + 1}`,
                totals.subtotal,
                totals.cgstTotal,
                totals.sgstTotal,
                totals.grandTotal,
            ]
        );

        // ON CONFLICT DO NOTHING returns zero rows when the invoice
        // already exists -- meaning this script has run before against
        // this database. Skip its line items too and move on, so the
        // whole script is safe to run any number of times (this matters
        // now that it runs automatically in Docker on every startup).
        if (invoiceRes.rows.length === 0) {
            skipped += 1;
            continue;
        }
        inserted += 1;

        const invoiceId = invoiceRes.rows[0].id;

        for (let j = 0; j < computed.length; j++) {
            const li = computed[j];
            await client.query(
                `INSERT INTO invoice_line_items
                    (invoice_id, tenant_id, description, quantity, unit_price,
                     gst_rate, sort_order, line_total, cgst_amount, sgst_amount)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    invoiceId,
                    tenantId,
                    li.description,
                    li.quantity,
                    li.unitPrice,
                    li.gstRate,
                    j,
                    li.lineTotal,
                    li.cgstAmount,
                    li.sgstAmount,
                ]
            );
        }
    }

    return { inserted, skipped };
}

async function main() {
    const client = await pool.connect();
    try {
        for (const tenant of TENANTS) {
            await client.query('BEGIN');
            const tenantId = await upsertTenant(client, tenant);
            const { inserted, skipped } = await seedInvoicesForTenant(client, tenantId, tenant.slug);
            await client.query('COMMIT');
            console.log(
                `${tenant.name} (${tenant.slug}): ${inserted} invoice(s) created` +
                    (skipped > 0 ? `, ${skipped} already existed (skipped)` : '')
            );
        }
        console.log('Seed complete.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Seed failed:', err);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();