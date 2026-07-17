import { useEffect, useState, useCallback } from 'react';
import { fetchAuditLog } from '../api';

export default function AuditLog({ tenantId, tenant, refreshSignal }) {
    const [entries, setEntries] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(
        async (cursor, append) => {
            if (!tenantId) return;
            setLoading(true);
            setError(null);
            try {
                const data = await fetchAuditLog(tenantId, cursor);
                setEntries((prev) => (append ? [...prev, ...data.auditLog] : data.auditLog));
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
        load(null, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, refreshSignal]);

    if (!tenantId) return <p className="text-slate-500">Select a tenant to view history.</p>;

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-sm font-semibold text-slate-800">
                        History for {tenant ? tenant.name : '…'}
                    </h2>
                    <p className="text-xs text-slate-500">
                        Scoped entirely to this tenant — switch tenants above and this feed changes completely.
                    </p>
                </div>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-mono">
                    tenant_id: {tenantId.slice(0, 8)}…
                </span>
            </div>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            {entries.length === 0 && !loading && (
                <p className="text-slate-500 text-sm py-6 text-center border border-dashed border-slate-300 rounded-md">
                    No activity yet for this tenant.
                </p>
            )}

            <ul className="space-y-2">
                {entries.map((entry) => (
                    <li
                        key={entry.id}
                        className="flex items-center gap-3 text-sm border border-slate-100 rounded-md px-3 py-2 bg-slate-50"
                    >
                        <span
                            className={
                                'px-2 py-0.5 rounded-full text-xs shrink-0 font-medium ' +
                                (entry.action === 'voided'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-blue-100 text-blue-700')
                            }
                        >
                            {entry.action}
                        </span>
                        <span className="text-slate-700">
                            {entry.entity_type}{' '}
                            <span className="font-mono text-xs text-slate-500">
                                {entry.details?.invoiceNumber || entry.entity_id.slice(0, 8)}
                            </span>
                        </span>
                        {entry.details?.grandTotal != null && (
                            <span className="text-slate-500 text-xs">₹{entry.details.grandTotal}</span>
                        )}
                        <span className="text-slate-400 text-xs ml-auto shrink-0">
                            {new Date(entry.created_at).toLocaleString()}
                        </span>
                    </li>
                ))}
            </ul>

            {loading && <p className="text-sm text-slate-400 mt-3">Loading…</p>}

            {nextCursor && !loading && (
                <button
                    onClick={() => load(nextCursor, true)}
                    className="mt-4 text-sm text-slate-700 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50"
                >
                    Load more
                </button>
            )}
        </div>
    );
}