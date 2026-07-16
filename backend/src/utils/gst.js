// Pure GST calculation logic. No DB, no Express -- easy to unit test,
// and reused by both the seed script and the real invoice controller
// so the math is never duplicated (and never drifts out of sync).

const VALID_GST_RATES = [0, 5, 12, 18, 28];

function round2(n) {
    // Avoids classic floating point drift (e.g. 0.1 + 0.2 !== 0.3)
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Computes line_total, cgst_amount, sgst_amount for one line item.
 * cgst + sgst is guaranteed to equal the total GST exactly (no
 * rounding mismatch), because sgst is derived as the remainder
 * rather than rounded independently.
 */
function calculateLineItem({ quantity, unitPrice, gstRate }) {
    if (!VALID_GST_RATES.includes(gstRate)) {
        throw new Error(
            `Invalid GST rate: ${gstRate}. Must be one of ${VALID_GST_RATES.join(', ')}`
        );
    }

    const lineTotal = round2(quantity * unitPrice);
    const totalGst = round2(lineTotal * (gstRate / 100));
    const cgstAmount = round2(totalGst / 2);
    const sgstAmount = round2(totalGst - cgstAmount); // remainder, not re-rounded independently

    return { lineTotal, cgstAmount, sgstAmount };
}

/**
 * Sums computed line items into invoice-level totals.
 * computedLineItems: array of { lineTotal, cgstAmount, sgstAmount }
 */
function aggregateInvoiceTotals(computedLineItems) {
    const subtotal = round2(computedLineItems.reduce((s, li) => s + li.lineTotal, 0));
    const cgstTotal = round2(computedLineItems.reduce((s, li) => s + li.cgstAmount, 0));
    const sgstTotal = round2(computedLineItems.reduce((s, li) => s + li.sgstAmount, 0));
    const grandTotal = round2(subtotal + cgstTotal + sgstTotal);

    return { subtotal, cgstTotal, sgstTotal, grandTotal };
}

module.exports = { calculateLineItem, aggregateInvoiceTotals, round2, VALID_GST_RATES };