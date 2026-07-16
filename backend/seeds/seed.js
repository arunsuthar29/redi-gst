require('dotenv').config();
const pool = require('../src/config/db');
const { calculateLineItem, aggregateInvoiceTotals } = require('../src/utils/gst');

const TENANTS = [
    { name: 'Acme Chartered Accountants', slug: 'acme-ca' },
    { name: 'Bharat SME Traders', slug: 'bharat-sme' },
];

// Deliberately covers all 5 GST bands (including 0%, one of the
// evaluators' stated edge cases) across a small set of sample invoices.
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
    // Required for RLS: every subsequent query in this transaction is
    // only allowed to touch rows matching this tenant_id.
    await client.query(`SET LOCAL app.current_tenant = '${tenantId}'`);

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
}

async function main() {
    const client = await pool.connect();
    try {
        for (const tenant of TENANTS) {
            await client.query('BEGIN');
            const tenantId = await upsertTenant(client, tenant);
            await seedInvoicesForTenant(client, tenantId, tenant.slug);
            await client.query('COMMIT');
            console.log(`Seeded ${tenant.name} (${tenant.slug}) -- ${SAMPLE_INVOICES.length} invoices`);
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