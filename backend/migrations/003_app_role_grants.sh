#!/bin/bash
# Migration 003: least-privilege application role
#
# The Express app should never connect as the postgres superuser or as
# whichever role ran these migrations. It connects as app_user, which
# can only do exactly what the application needs -- nothing more.
# This is defense-in-depth on top of FORCE ROW LEVEL SECURITY: even if
# someone later changes app_user's grants by mistake, RLS still applies.
#
# This is a .sh file (not .sql) so it can read APP_USER_PASSWORD from
# the environment instead of a hardcoded placeholder. Postgres's
# official image runs any .sql/.sh file dropped in
# /docker-entrypoint-initdb.d/ automatically -- but only the FIRST time
# the container starts against an empty data volume.

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$func\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
            CREATE ROLE app_user LOGIN PASSWORD '$APP_USER_PASSWORD';
        END IF;
    END
    \$func\$;

    GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO app_user;
    GRANT USAGE ON SCHEMA public TO app_user;

    GRANT SELECT, INSERT, UPDATE ON organizations TO app_user;
    GRANT SELECT, INSERT, UPDATE ON invoices TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_line_items TO app_user;
    -- No DELETE on invoices: we void, we don't delete (see voided_at).
    -- Line items can be deleted while an invoice is still a draft being edited.
EOSQL