import { useState } from 'react';
import { createInvoice } from '../api';

const GST_RATES = [0, 5, 12, 18, 28];

function emptyLineItem() {
    return { description: '', quantity: 1, unitPrice: 0, gstRate: 18 };
}

function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
function previewLine(item) {
    const lineTotal = round2(item.quantity * item.unitPrice);
    const totalGst = round2(lineTotal * (item.gstRate / 100));
    const cgst = round2(totalGst / 2);
    const sgst = round2(totalGst - cgst);
    return { lineTotal, cgst, sgst };
}

export default function CreateInvoiceForm({ tenantId, onCreated }) {
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [lineItems, setLineItems] = useState([emptyLineItem()]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    function updateLine(index, field, value) {
        setLineItems((prev) =>
            prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
        );
    }

    function addLine() {
        setLineItems((prev) => [...prev, emptyLineItem()]);
    }

    function removeLine(index) {
        setLineItems((prev) => prev.filter((_, i) => i !== index));
    }

    const previews = lineItems.map(previewLine);
    const totalPreview = previews.reduce(
        (acc, p) => ({
            subtotal: round2(acc.subtotal + p.lineTotal),
            cgst: round2(acc.cgst + p.cgst),
            sgst: round2(acc.sgst + p.sgst),
        }),
        { subtotal: 0, cgst: 0, sgst: 0 }
    );
    const grandPreview = round2(totalPreview.subtotal + totalPreview.cgst + totalPreview.sgst);

    async function handleSubmit(e) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            const created = await createInvoice(tenantId, {
                invoiceNumber,
                customerName,
                lineItems: lineItems.map((li) => ({
                    description: li.description,
                    quantity: Number(li.quantity),
                    unitPrice: Number(li.unitPrice),
                    gstRate: Number(li.gstRate),
                })),
            });
            setSuccess(`Created ${created.invoice_number} — grand total ₹${created.grand_total}`);
            setInvoiceNumber('');
            setCustomerName('');
            setLineItems([emptyLineItem()]);
            onCreated();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    if (!tenantId) return <p className="text-slate-500">Select a tenant first.</p>;

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl">
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Invoice number</label>
                    <input
                        required
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        placeholder="e.g. acme-ca-INV-010"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Customer name</label>
                    <input
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-[1fr_5rem_7rem_7rem_5rem_1.5rem] gap-2 px-2 mb-1 text-xs font-medium text-slate-500">
                <span>Description</span>
                <span>Qty</span>
                <span>Unit price</span>
                <span>GST rate</span>
                <span className="text-right">Amount</span>
                <span></span>
            </div>
            <div className="space-y-2 mb-3">
                {lineItems.map((item, i) => (
                    <div
                        key={i}
                        className="grid grid-cols-[1fr_5rem_7rem_7rem_5rem_1.5rem] gap-2 items-center bg-slate-50 p-2 rounded-md"
                    >
                        <input
                            required
                            aria-label={`Line ${i + 1} description`}
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateLine(i, 'description', e.target.value)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm w-full"
                        />
                        <input
                            required
                            aria-label={`Line ${i + 1} quantity`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm w-full"
                        />
                        <input
                            required
                            aria-label={`Line ${i + 1} unit price`}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Unit price"
                            value={item.unitPrice}
                            onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm w-full"
                        />
                        <select
                            aria-label={`Line ${i + 1} GST rate`}
                            value={item.gstRate}
                            onChange={(e) => updateLine(i, 'gstRate', e.target.value)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm w-full"
                        >
                            {GST_RATES.map((r) => (
                                <option key={r} value={r}>
                                    {r}% GST
                                </option>
                            ))}
                        </select>
                        <span className="text-xs text-slate-500 text-right">
                            ₹{previews[i].lineTotal}
                        </span>
                        {lineItems.length > 1 ? (
                            <button
                                type="button"
                                aria-label={`Remove line ${i + 1}`}
                                onClick={() => removeLine(i)}
                                className="text-slate-400 hover:text-red-600 text-sm justify-self-center"
                            >
                                ✕
                            </button>
                        ) : (
                            <span></span>
                        )}
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={addLine}
                className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-1 mb-4 hover:bg-slate-50"
            >
                + Add line item
            </button>

            <div className="text-sm text-slate-600 border-t border-slate-200 pt-3 mb-4 space-y-1">
                <div className="flex justify-between"><span>Subtotal</span><span>₹{totalPreview.subtotal}</span></div>
                <div className="flex justify-between"><span>CGST</span><span>₹{totalPreview.cgst}</span></div>
                <div className="flex justify-between"><span>SGST</span><span>₹{totalPreview.sgst}</span></div>
                <div className="flex justify-between font-medium text-slate-900">
                    <span>Grand total (preview)</span><span>₹{grandPreview}</span>
                </div>
            </div>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            {success && <p className="text-sm text-emerald-600 mb-3">{success}</p>}

            <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 disabled:opacity-40"
            >
                {submitting ? 'Creating…' : 'Create invoice'}
            </button>
        </form>
    );
}