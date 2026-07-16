require('dotenv').config();
const express = require('express');
const cors = require('cors');

const pool = require('./config/db');
const resolveTenant = require('./middleware/tenantMiddleware');
const invoiceRoutes = require('./routes/invoiceRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Used by the React tenant switcher to list available tenants.
// Not tenant-scoped itself -- it's the list OF tenants, not tenant data.
app.get('/api/organizations', async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT id, name, slug FROM organizations WHERE status = $1 ORDER BY name',
            ['active']
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

app.use('/api/invoices', resolveTenant, invoiceRoutes);

// Centralized error handler -- keeps controllers free of repeated
// try/catch boilerplate for the "something unexpected happened" case.
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;