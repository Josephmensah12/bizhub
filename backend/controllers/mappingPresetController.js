const { MappingPreset, User } = require('../models');

// Async handler wrapper
const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * GET /api/v1/mapping-presets
 * List all presets for the authenticated user
 */
exports.list = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const presets = await MappingPreset.findAll({
    where: { user_id: userId },
    include: [
      {
        model: User,
        as: 'owner',
        attributes: ['id', 'full_name', 'username']
      }
    ],
    order: [['created_at', 'DESC']]
  });

  res.json({
    success: true,
    data: presets
  });
});

/**
 * GET /api/v1/mapping-presets/:id
 * Get a single preset by ID
 */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const preset = await MappingPreset.findOne({
    where: {
      id,
      user_id: userId
    },
    include: [
      {
        model: User,
        as: 'owner',
        attributes: ['id', 'full_name', 'username']
      }
    ]
  });

  if (!preset) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Preset not found'
      }
    });
  }

  res.json({
    success: true,
    data: preset
  });
});

/**
 * POST /api/v1/mapping-presets
 * Create a new preset
 */
exports.create = asyncHandler(async (req, res) => {
  const { preset_name, notes, file_type, mapping_config, constant_values, transform_rules } = req.body;
  const userId = req.user.id;

  if (!preset_name) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_REQUIRED',
        message: 'preset_name is required'
      }
    });
  }

  if (!mapping_config && !constant_values) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_REQUIRED',
        message: 'Either mapping_config or constant_values must be provided'
      }
    });
  }

  // Check for duplicate preset name for this user
  const existing = await MappingPreset.findOne({
    where: {
      preset_name,
      user_id: userId
    }
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'DUPLICATE_PRESET',
        message: 'A preset with this name already exists'
      }
    });
  }

  const preset = await MappingPreset.create({
    preset_name,
    notes: notes || null,
    file_type: file_type || null,
    mapping_config: mapping_config || {},
    constant_values: constant_values || {},
    transform_rules: transform_rules || {},
    user_id: userId
  });

  res.status(201).json({
    success: true,
    data: preset,
    message: 'Preset created successfully'
  });
});

/**
 * PUT /api/v1/mapping-presets/:id
 * Update an existing preset
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { preset_name, notes, file_type, mapping_config, constant_values, transform_rules } = req.body;
  const userId = req.user.id;

  const preset = await MappingPreset.findOne({
    where: {
      id,
      user_id: userId
    }
  });

  if (!preset) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Preset not found'
      }
    });
  }

  // Check for duplicate name (excluding current preset)
  if (preset_name && preset_name !== preset.preset_name) {
    const existing = await MappingPreset.findOne({
      where: {
        preset_name,
        user_id: userId,
        id: { [require('sequelize').Op.ne]: id }
      }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_PRESET',
          message: 'A preset with this name already exists'
        }
      });
    }
  }

  // Update fields
  if (preset_name !== undefined) preset.preset_name = preset_name;
  if (notes !== undefined) preset.notes = notes;
  if (file_type !== undefined) preset.file_type = file_type;
  if (mapping_config !== undefined) preset.mapping_config = mapping_config;
  if (constant_values !== undefined) preset.constant_values = constant_values;
  if (transform_rules !== undefined) preset.transform_rules = transform_rules;

  await preset.save();

  res.json({
    success: true,
    data: preset,
    message: 'Preset updated successfully'
  });
});

/**
 * DELETE /api/v1/mapping-presets/:id
 * Delete a preset
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const preset = await MappingPreset.findOne({
    where: {
      id,
      user_id: userId
    }
  });

  if (!preset) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Preset not found'
      }
    });
  }

  await preset.destroy();

  res.json({
    success: true,
    message: 'Preset deleted successfully'
  });
});

module.exports = exports;
