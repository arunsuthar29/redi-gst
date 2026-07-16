const withTenant = require('../db/withTenant');
const { calculateLineItem, aggregateInvoiceTotals } = require('../utils/gst');

// --- Keyset pagination helpers -------------------------------------
// We paginate on (created_at, id) rather than OFFSET/LIMIT. OFFSET
// forces Postgres to scan and discard every prior row on each page --
// fine at 50 rows, ruinous at 50,000. Keyset pagination instead says
// "give me rows strictly after this exact point," which the
// (tenant_id, created_at DESC) index answers directly, in constant
// time regardless of how deep into the list you are.
//
// We compare (created_at, id) as a tuple, not created_at alone,
// because two invoices can share the same created_at timestamp --
// id breaks the tie so no row is ever skipped or duplicated across
// pages.

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

async function listInvoices(req, res, next) {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;

        if (req.query.cursor && !cursor) {
            return res.status(400).json({ error: 'Invalid cursor' });
        }

        const rows = await withTenant(req.tenantId, async (client) => {
            const baseSelect = `
                SELECT id, invoice_number, customer_name, status,
                       subtotal, cgst_total, sgst_total, grand_total, created_at
                FROM invoices
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
        res.json({ invoices: rows, nextCursor });
    } catch (err) {
        next(err);
    }
}

async function createInvoice(req, res, next) {
    try {
        const { invoiceNumber, customerName, lineItems } = req.body;

        if (!invoiceNumber || !customerName) {
            return res.status(400).json({ error: 'invoiceNumber and customerName are required' });
        }
        if (!Array.isArray(lineItems) || lineItems.length === 0) {
            return res.status(400).json({ error: 'At least one line item is required' });
        }

        let computed;
        try {
            computed = lineItems.map((item) => ({ ...item, ...calculateLineItem(item) }));
        } catch (calcErr) {
            // e.g. a malformed GST rate -- caught here at the app layer,
            // and the gst_rate CHECK constraint in the DB backs this up
            // as a second line of defense.
            return res.status(400).json({ error: calcErr.message });
        }

        const totals = aggregateInvoiceTotals(computed);

        const invoice = await withTenant(req.tenantId, async (client) => {
            const invoiceRes = await client.query(
                `INSERT INTO invoices
                    (tenant_id, invoice_number, customer_name, status,
                     subtotal, cgst_total, sgst_total, grand_total)
                 VALUES ($1, $2, $3, 'issued', $4, $5, $6, $7)
                 RETURNING *`,
                [
                    req.tenantId,
                    invoiceNumber,
                    customerName,
                    totals.subtotal,
                    totals.cgstTotal,
                    totals.sgstTotal,
                    totals.grandTotal,
                ]
            );
            const invoiceRow = invoiceRes.rows[0];

            for (let i = 0; i < computed.length; i++) {
                const li = computed[i];
                await client.query(
                    `INSERT INTO invoice_line_items
                        (invoice_id, tenant_id, description, quantity, unit_price,
                         gst_rate, sort_order, line_total, cgst_amount, sgst_amount)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                        invoiceRow.id,
                        req.tenantId,
                        li.description,
                        li.quantity,
                        li.unitPrice,
                        li.gstRate,
                        i,
                        li.lineTotal,
                        li.cgstAmount,
                        li.sgstAmount,
                    ]
                );
            }

            return { ...invoiceRow, lineItems: computed };
        });

        res.status(201).json(invoice);
    } catch (err) {
        if (err.code === '23505') {
            // unique_violation: (tenant_id, invoice_number) already exists
            return res.status(409).json({ error: 'Invoice number already exists for this tenant' });
        }
        if (err.code === '23514') {
            // check_violation: e.g. a gst_rate the DB constraint rejects
            return res.status(400).json({ error: 'Invalid data: violates a database constraint' });
        }
        next(err);
    }
}

async function getInvoice(req, res, next) {
    try {
        const { id } = req.params;

        const result = await withTenant(req.tenantId, async (client) => {
            const invoiceRes = await client.query(
                `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`,
                [id, req.tenantId]
            );
            if (invoiceRes.rows.length === 0) return null;

            const lineItemsRes = await client.query(
                `SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order`,
                [id]
            );
            return { ...invoiceRes.rows[0], lineItems: lineItemsRes.rows };
        });

        if (!result) return res.status(404).json({ error: 'Invoice not found' });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = { listInvoices, createInvoice, getInvoice };