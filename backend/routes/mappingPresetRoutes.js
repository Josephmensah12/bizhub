const express = require('express');
const router = express.Router();
const mappingPresetController = require('../controllers/mappingPresetController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/v1/mapping-presets
router.get('/', mappingPresetController.list);

// GET /api/v1/mapping-presets/:id
router.get('/:id', mappingPresetController.getById);

// POST /api/v1/mapping-presets
router.post('/', mappingPresetController.create);

// PUT /api/v1/mapping-presets/:id
router.put('/:id', mappingPresetController.update);

// DELETE /api/v1/mapping-presets/:id
router.delete('/:id', mappingPresetController.delete);

module.exports = router;
