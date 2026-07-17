const express = require('express');
const router = express.Router();
const controller = require('../controllers/invoiceController');

router.get('/', controller.listInvoices);
router.post('/', controller.createInvoice);
router.get('/:id', controller.getInvoice);
router.patch('/:id/void', controller.voidInvoice);

module.exports = router;