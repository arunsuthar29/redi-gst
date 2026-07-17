const express = require('express');
const router = express.Router();
const controller = require('../controllers/organizationController');

router.get('/', controller.listOrganizations);
router.post('/', controller.createOrganization);

module.exports = router;