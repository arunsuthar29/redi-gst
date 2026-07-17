import { useEffect, useState } from 'react';
import { fetchInvoice } from '../api';

export default function InvoiceDetailModal({ tenantId, invoiceId, onClose }) {
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchInvoice(tenantId, invoiceId)
            .then((data) => {
                if (!cancelled) setInvoice(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, invoiceId]);

    useEffect(() => {
        function handleKey(e) {
            if (e.key === 'Escape') onClose();
        }
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const totalQuantity = invoice?.lineItems?.reduce((sum, li) => sum + Number(li.quantity), 0) ?? 0;
    const itemCount = invoice?.lineItems?.length ?? 0;

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">
                            {loading ? 'Loading…' : invoice?.invoice_number}
                        </h2>
                        {invoice && (
                            <p className="text-sm text-slate-500">{invoice.customer_name}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1"
                    >
                        ✕
                    </button>
                </div>

                <div className="px-5 py-4">
                    {loading && <p className="text-sm text-slate-400">Loading invoice details…</p>}
                    {error && <p className="text-sm text-red-600">{error}</p>}

                    {invoice && (
                        <>
                            <div className="grid grid-cols-3 gap-3 mb-5">
                                <div className="bg-slate-50 rounded-md p-3 text-center">
                                    <div className="text-xl font-semibold text-slate-900">{itemCount}</div>
                                    <div className="text-xs text-slate-500">line item{itemCount === 1 ? '' : 's'}</div>
                                </div>
                                <div className="bg-slate-50 rounded-md p-3 text-center">
                                    <div className="text-xl font-semibold text-slate-900">{totalQuantity}</div>
                                    <div className="text-xs text-slate-500">total quantity</div>
                                </div>
                                <div className="bg-slate-50 rounded-md p-3 text-center">
                                    <div className="text-xl font-semibold text-slate-900">₹{invoice.grand_total}</div>
                                    <div className="text-xs text-slate-500">grand total</div>
                                </div>
                            </div>

                            <table className="w-full text-sm mb-4">
                                <thead>
                                    <tr className="text-left text-slate-500 border-b border-slate-200">
                                        <th className="py-1.5 pr-3">Description</th>
                                        <th className="py-1.5 pr-3 text-right">Qty</th>
                                        <th className="py-1.5 pr-3 text-right">Unit price</th>
                                        <th className="py-1.5 pr-3 text-right">GST rate</th>
                                        <th className="py-1.5 text-right">Line total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoice.lineItems.map((li) => (
                                        <tr key={li.id} className="border-b border-slate-100">
                                            <td className="py-1.5 pr-3">{li.description}</td>
                                            <td className="py-1.5 pr-3 text-right">{li.quantity}</td>
                                            <td className="py-1.5 pr-3 text-right">₹{li.unit_price}</td>
                                            <td className="py-1.5 pr-3 text-right">{li.gst_rate}%</td>
                                            <td className="py-1.5 text-right">₹{li.line_total}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="text-sm text-slate-600 space-y-1 border-t border-slate-200 pt-3">
                                <div className="flex justify-between"><span>Subtotal</span><span>₹{invoice.subtotal}</span></div>
                                <div className="flex justify-between"><span>CGST</span><span>₹{invoice.cgst_total}</span></div>
                                <div className="flex justify-between"><span>SGST</span><span>₹{invoice.sgst_total}</span></div>
                                <div className="flex justify-between font-medium text-slate-900">
                                    <span>Grand total</span><span>₹{invoice.grand_total}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}