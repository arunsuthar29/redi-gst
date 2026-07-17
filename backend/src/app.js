require('dotenv').config();
const express = require('express');
const cors = require('cors');

const resolveTenant = require('./middleware/tenantMiddleware');
const invoiceRoutes = require('./routes/invoiceRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/invoices', resolveTenant, invoiceRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/audit-log', resolveTenant, auditLogRoutes);

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
