import { useEffect, useState, useCallback } from 'react';
import { fetchInvoices, voidInvoice } from '../api';
import InvoiceDetailModal from './InvoiceDetailModal';

export default function InvoiceList({ tenantId, refreshSignal }) {
    const [invoices, setInvoices] = useState([]);
    const [cursor, setCursor] = useState(null);
    const [nextCursor, setNextCursor] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

    const load = useCallback(
        async (useCursor, append) => {
            if (!tenantId) return;
            setLoading(true);
            setError(null);
            try {
                const data = await fetchInvoices(tenantId, useCursor);
                setInvoices((prev) => (append ? [...prev, ...data.invoices] : data.invoices));
                setNextCursor(data.nextCursor);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        },
        [tenantId]
    );

    useEffect(() => {
        setCursor(null);
        load(null, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, refreshSignal]);

    async function handleVoid(id) {
        if (!confirm('Void this invoice? This cannot be undone.')) return;
        try {
            await voidInvoice(tenantId, id);
            load(null, false);
        } catch (err) {
            setError(err.message);
        }
    }

    function loadMore() {
        setCursor(nextCursor);
        load(nextCursor, true);
    }

    if (!tenantId) return <p className="text-slate-500">Select a tenant to view invoices.</p>;

    return (
        <div>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            {invoices.length === 0 && !loading && (
                <p className="text-slate-500 text-sm py-6 text-center border border-dashed border-slate-300 rounded-md">
                    No invoices yet for this tenant.
                </p>
            )}

            {invoices.length > 0 && (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-200">
                            <th className="py-2 pr-4">Invoice #</th>
                            <th className="py-2 pr-4">Customer</th>
                            <th className="py-2 pr-4">Status</th>
                            <th className="py-2 pr-4 text-right">CGST</th>
                            <th className="py-2 pr-4 text-right">SGST</th>
                            <th className="py-2 pr-4 text-right">Total</th>
                            <th className="py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoices.map((inv) => (
                            <tr key={inv.id} className="border-b border-slate-100">
                                <td className="py-2 pr-4 font-mono text-xs">{inv.invoice_number}</td>
                                <td className="py-2 pr-4">
    <button
        onClick={() => setSelectedInvoiceId(inv.id)}
        className="text-slate-900 hover:text-blue-600 hover:underline text-left"
    >
        {inv.customer_name}
    </button>
</td>
                                <td className="py-2 pr-4">
                                    <span
                                        className={
                                            'px-2 py-0.5 rounded-full text-xs ' +
                                            (inv.status === 'cancelled'
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-emerald-100 text-emerald-700')
                                        }
                                    >
                                        {inv.status}
                                    </span>
                                </td>
                                <td className="py-2 pr-4 text-right">₹{inv.cgst_total}</td>
                                <td className="py-2 pr-4 text-right">₹{inv.sgst_total}</td>
                                <td className="py-2 pr-4 text-right font-medium">₹{inv.grand_total}</td>
                                <td className="py-2 text-right">
                                    {inv.status !== 'cancelled' && (
                                        <button
                                            onClick={() => handleVoid(inv.id)}
                                            className="text-xs text-red-600 hover:underline"
                                        >
                                            Void
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {loading && <p className="text-sm text-slate-400 mt-3">Loading…</p>}

            {nextCursor && !loading && (
                <button
                    onClick={loadMore}
                    className="mt-4 text-sm text-slate-700 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50"
                >
                    Load more
                </button>
            )}
            {selectedInvoiceId && (
    <InvoiceDetailModal
        tenantId={tenantId}
        invoiceId={selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
    />
)}
        </div>
    );
}