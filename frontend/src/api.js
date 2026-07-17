const API_BASE = 'http://localhost:4000/api';

async function handleResponse(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const message = data.error || `Request failed (${res.status})`;
        throw new Error(message);
    }
    return data;
}

export function fetchOrganizations() {
    return fetch(`${API_BASE}/organizations`).then(handleResponse);
}

export function createOrganization(name) {
    return fetch(`${API_BASE}/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    }).then(handleResponse);
}

export function fetchInvoices(tenantId, cursor) {
    const params = new URLSearchParams({ limit: '20' });
    if (cursor) params.set('cursor', cursor);
    return fetch(`${API_BASE}/invoices?${params}`, {
        headers: { 'X-Tenant-Id': tenantId },
    }).then(handleResponse);
}

export function createInvoice(tenantId, payload) {
    return fetch(`${API_BASE}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify(payload),
    }).then(handleResponse);
}

export function voidInvoice(tenantId, invoiceId) {
    return fetch(`${API_BASE}/invoices/${invoiceId}/void`, {
        method: 'PATCH',
        headers: { 'X-Tenant-Id': tenantId },
    }).then(handleResponse);
}

export function fetchAuditLog(tenantId, cursor) {
    const params = new URLSearchParams({ limit: '20' });
    if (cursor) params.set('cursor', cursor);
    return fetch(`${API_BASE}/audit-log?${params}`, {
        headers: { 'X-Tenant-Id': tenantId },
    }).then(handleResponse);
}
export function fetchInvoice(tenantId, invoiceId) {
    return fetch(`${API_BASE}/invoices/${invoiceId}`, {
        headers: { 'X-Tenant-Id': tenantId },
    }).then(handleResponse);
}