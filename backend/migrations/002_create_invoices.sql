CREATE TABLE invoices (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES organizations(id),
    invoice_number TEXT NOT NULL,
    customer_name  TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'issued', 'paid', 'cancelled')),

    subtotal    NUMERIC(12,2) NOT NULL DEFAULT 0,
    cgst_total  NUMERIC(12,2) NOT NULL DEFAULT 0,
    sgst_total  NUMERIC(12,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_at   TIMESTAMPTZ,

    UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX idx_invoices_tenant_created
    ON invoices (tenant_id, created_at DESC);

CREATE TRIGGER trg_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_line_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    tenant_id    UUID NOT NULL REFERENCES organizations(id),

    description  TEXT NOT NULL,
    quantity     NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit_price   NUMERIC(12,2) NOT NULL,
    gst_rate     NUMERIC(4,2) NOT NULL CHECK (gst_rate IN (0, 5, 12, 18, 28)),
    sort_order   INT NOT NULL DEFAULT 0,

    line_total   NUMERIC(12,2) NOT NULL,
    cgst_amount  NUMERIC(12,2) NOT NULL,
    sgst_amount  NUMERIC(12,2) NOT NULL
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items (invoice_id);
CREATE INDEX idx_line_items_tenant ON invoice_line_items (tenant_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_invoices ON invoices
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_line_items ON invoice_line_items
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items FORCE ROW LEVEL SECURITY;
