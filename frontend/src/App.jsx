import { useEffect, useState } from 'react';
import { fetchOrganizations, createOrganization } from './api';
import TenantSwitcher from './components/TenantSwitcher';
import InvoiceList from './components/InvoiceList';
import CreateInvoiceForm from './components/CreateInvoiceForm';
import AuditLog from './components/AuditLog';

const TABS = ['Invoices', 'Create invoice', 'History'];

export default function App() {
    const [organizations, setOrganizations] = useState([]);
    const [activeTenantId, setActiveTenantId] = useState(null);
    const [tab, setTab] = useState('Invoices');
    const [refreshSignal, setRefreshSignal] = useState(0);
    const [loadError, setLoadError] = useState(null);

    async function loadOrganizations() {
        try {
            const orgs = await fetchOrganizations();
            setOrganizations(orgs);
            setActiveTenantId((prev) => prev || (orgs[0] && orgs[0].id));
        } catch (err) {
            setLoadError(err.message);
        }
    }

    useEffect(() => {
        loadOrganizations();
    }, []);

    async function handleCreateTenant(name) {
        await createOrganization(name);
        await loadOrganizations();
    }

    function handleInvoiceCreated() {
        setRefreshSignal((n) => n + 1);
        setTab('Invoices');
    }

    return (
        <div className="min-h-screen bg-white text-slate-900">
            <header className="border-b border-slate-200 px-6 py-4">
                <h1 className="text-lg font-semibold">Redi GST — Invoicing</h1>
                <p className="text-sm text-slate-500">Multi-tenant invoice management with GST computation</p>
            </header>

            <main className="px-6 py-6 max-w-4xl mx-auto">
                {loadError && (
                    <p className="text-sm text-red-600 mb-4">
                        Couldn't reach the backend ({loadError}). Is `npm start` running in /backend?
                    </p>
                )}

                <TenantSwitcher
                    organizations={organizations}
                    activeTenantId={activeTenantId}
                    onSwitch={setActiveTenantId}
                    onCreated={handleCreateTenant}
                />

                <nav className="flex gap-1 mb-6 border-b border-slate-200">
                    {TABS.map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={
                                'px-3 py-2 text-sm border-b-2 -mb-px ' +
                                (tab === t
                                    ? 'border-slate-900 text-slate-900 font-medium'
                                    : 'border-transparent text-slate-500 hover:text-slate-700')
                            }
                        >
                            {t}
                        </button>
                    ))}
                </nav>

                {tab === 'Invoices' && <InvoiceList tenantId={activeTenantId} refreshSignal={refreshSignal} />}
{tab === 'Create invoice' && (
    <CreateInvoiceForm tenantId={activeTenantId} onCreated={handleInvoiceCreated} />
)}
{tab === 'History' && (
    <AuditLog
        tenantId={activeTenantId}
        tenant={organizations.find((o) => o.id === activeTenantId)}
        refreshSignal={refreshSignal}
    />
)}
            </main>
        </div>
    );
}