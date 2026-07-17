import { useState } from 'react';

export default function TenantSwitcher({ organizations, activeTenantId, onSwitch, onCreated }) {
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);

    async function handleCreate(e) {
        e.preventDefault();
        if (!newName.trim()) return;
        setCreating(true);
        setError(null);
        try {
            await onCreated(newName.trim());
            setNewName('');
        } catch (err) {
            setError(err.message);
        } finally {
            setCreating(false);
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4 mb-6">
            <label className="text-sm font-medium text-slate-600">Active tenant:</label>
            <select
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white"
                value={activeTenantId || ''}
                onChange={(e) => onSwitch(e.target.value)}
            >
                {organizations.length === 0 && <option value="">No tenants yet</option>}
                {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                        {org.name} ({org.slug})
                    </option>
                ))}
            </select>

            <form onSubmit={handleCreate} className="flex items-center gap-2 ml-auto">
                <input
                    type="text"
                    placeholder="New company name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm w-52"
                />
                <button
                    type="submit"
                    disabled={creating || !newName.trim()}
                    className="rounded-md bg-slate-900 text-white text-sm px-3 py-1.5 disabled:opacity-40"
                >
                    {creating ? 'Adding…' : '+ Add tenant'}
                </button>
            </form>
            {error && <p className="text-sm text-red-600 w-full">{error}</p>}
        </div>
    );
}