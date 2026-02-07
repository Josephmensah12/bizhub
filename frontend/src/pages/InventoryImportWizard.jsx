import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function InventoryImportWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [mapping, setMapping] = useState({});
  const [constantValues, setConstantValues] = useState({});
  const [mappingMode, setMappingMode] = useState({}); // 'column' | 'constant' | 'ignore'
  const [validationResult, setValidationResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importMode, setImportMode] = useState('skip-errors');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [otherValues, setOtherValues] = useState({}); // { field: 'typed text' }
  const [presets, setPresets] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [showSavePreset, setShowSavePreset] = useState(false);

  // Step 1: Upload and Preview
  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    // Validate file
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!validTypes.includes(selectedFile.type)) {
      setError('Please select a valid CSV or Excel file (.csv, .xls, .xlsx)');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await axios.post('/api/v1/assets/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setFileData(response.data.data);
      setMapping(response.data.data.suggestedMappings);

      // Initialize mapping modes based on suggested mappings
      const initialModes = {};
      Object.keys(response.data.data.suggestedMappings).forEach(field => {
        initialModes[field] = 'column';
      });
      setMappingMode(initialModes);

      setCurrentStep(2);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to upload file');
    } finally {
      setLoading(false);
    }
  };

  // Resolve __other__ constant values by creating custom taxonomy values via API
  const resolveOtherValues = async () => {
    const resolved = { ...constantValues };
    const fieldsWithOther = Object.entries(resolved).filter(([, v]) => v === '__other__');

    if (fieldsWithOther.length === 0) return resolved;

    // Resolve category FIRST (if __other__), so we can use it as parent for asset_type
    if (resolved.category === '__other__') {
      const text = (otherValues.category || '').trim();
      if (!text) {
        setError('Please enter a custom category value');
        return null;
      }
      try {
        const res = await axios.post('/api/v1/assets/taxonomy/custom', {
          value_type: 'category',
          value: text
        });
        resolved.category = res.data.data.value;
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to create custom category');
        return null;
      }
    }

    // Resolve asset_type (if __other__)
    if (resolved.asset_type === '__other__') {
      const text = (otherValues.asset_type || '').trim();
      if (!text) {
        setError('Please enter a custom asset type value');
        return null;
      }
      try {
        const parentCategory = resolved.category || '';
        const res = await axios.post('/api/v1/assets/taxonomy/custom', {
          value_type: 'asset_type',
          value: text,
          parent_category: parentCategory
        });
        resolved.asset_type = res.data.data.value;
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to create custom asset type');
        return null;
      }
    }

    return resolved;
  };

  // Step 2: Validate with mapping
  const handleValidate = async () => {
    // Check if required fields are mapped or have constant values
    const requiredFields = fileData.requiredFields;
    const missingRequired = requiredFields.filter(field => {
      const isMapped = mapping[field] && mapping[field] !== '__ignore__';
      const hasConstant = constantValues[field] != null && constantValues[field] !== '';
      return !isMapped && !hasConstant;
    });

    if (missingRequired.length > 0) {
      setError(`Required fields not mapped or set as constant: ${missingRequired.join(', ')}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Resolve any __other__ values first
      const resolvedConstants = await resolveOtherValues();
      if (!resolvedConstants) {
        setLoading(false);
        return;
      }
      setConstantValues(resolvedConstants);

      const response = await axios.post('/api/v1/assets/import/validate', {
        fileId: fileData.fileId,
        mapping,
        constantValues: resolvedConstants
      });

      setValidationResult(response.data.data);
      setCurrentStep(3);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Commit import
  const handleImport = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/v1/assets/import/commit', {
        fileId: fileData.fileId,
        mapping,
        constantValues,
        importMode
      });

      setImportResult(response.data.data);
      setCurrentStep(4);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setFile(null);
    setFileData(null);
    setMapping({});
    setConstantValues({});
    setOtherValues({});
    setMappingMode({});
    setValidationResult(null);
    setImportResult(null);
    setError(null);
  };

  // Preset Management
  const handleSavePreset = async (presetName, notes) => {
    try {
      await axios.post('/api/v1/mapping-presets', {
        preset_name: presetName,
        notes: notes || '',
        file_type: file?.type || 'CSV',
        mapping_config: mapping,
        constant_values: constantValues,
        transform_rules: {}
      });
      setShowSavePreset(false);
      alert('Preset saved successfully!');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to save preset');
    }
  };

  const loadPreset = async (presetId) => {
    try {
      const response = await axios.get(`/api/v1/mapping-presets/${presetId}`);
      const preset = response.data.data;

      // Apply the preset
      setMapping(preset.mapping_config || {});
      setConstantValues(preset.constant_values || {});

      // Update mapping modes based on what's set
      const modes = {};
      Object.keys(preset.mapping_config || {}).forEach(field => {
        if (preset.mapping_config[field] && preset.mapping_config[field] !== '__ignore__') {
          modes[field] = 'column';
        }
      });
      Object.keys(preset.constant_values || {}).forEach(field => {
        modes[field] = 'constant';
      });
      setMappingMode(modes);

      setSelectedPreset(presetId);
      alert('Preset loaded successfully!');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to load preset');
    }
  };

  const loadPresets = async () => {
    try {
      const response = await axios.get('/api/v1/mapping-presets');
      setPresets(response.data.data || []);
    } catch (err) {
      console.error('Failed to load presets:', err);
    }
  };

  // Load presets on mount
  useEffect(() => {
    loadPresets();
  }, []);

  const downloadErrorReport = () => {
    if (!validationResult?.validationErrors) return;

    const errors = validationResult.validationErrors.map(err => ({
      'Row Number': err.rowNumber,
      'Errors': err.errors.join('; '),
      'Original Data': JSON.stringify(err.originalData)
    }));

    const csv = [
      Object.keys(errors[0]).join(','),
      ...errors.map(row => Object.values(row).map(v => `"${v}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'import-errors.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/inventory')}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
        >
          ← Back to Inventory
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Import Assets - Smart Wizard</h1>
        <p className="text-gray-600 mt-2">
          Upload any CSV or Excel file and map columns to import assets
        </p>
      </div>

      {/* Progress Steps */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          {[
            { num: 1, label: 'Upload File' },
            { num: 2, label: 'Map Columns' },
            { num: 3, label: 'Validate' },
            { num: 4, label: 'Import' }
          ].map((step, idx) => (
            <div key={step.num} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 ${idx > 0 ? 'ml-4' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                  currentStep >= step.num
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {step.num}
                </div>
                <span className={`text-sm ${
                  currentStep >= step.num ? 'text-gray-900 font-medium' : 'text-gray-500'
                }`}>
                  {step.label}
                </span>
              </div>
              {idx < 3 && (
                <div className={`flex-1 h-0.5 mx-2 ${
                  currentStep > step.num ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {currentStep === 1 && (
        <Step1Upload
          file={file}
          loading={loading}
          onFileChange={handleFileUpload}
        />
      )}

      {/* Step 2: Column Mapping */}
      {currentStep === 2 && fileData && (
        <Step2Mapping
          fileData={fileData}
          mapping={mapping}
          setMapping={setMapping}
          constantValues={constantValues}
          setConstantValues={setConstantValues}
          otherValues={otherValues}
          setOtherValues={setOtherValues}
          mappingMode={mappingMode}
          setMappingMode={setMappingMode}
          loading={loading}
          onValidate={handleValidate}
          onBack={() => setCurrentStep(1)}
          onSavePreset={() => setShowSavePreset(true)}
        />
      )}

      {/* Step 3: Validation Preview */}
      {currentStep === 3 && validationResult && (
        <Step3Validation
          validationResult={validationResult}
          importMode={importMode}
          setImportMode={setImportMode}
          loading={loading}
          onImport={handleImport}
          onBack={() => setCurrentStep(2)}
          onDownloadErrors={downloadErrorReport}
        />
      )}

      {/* Step 4: Results */}
      {currentStep === 4 && importResult && (
        <Step4Results
          importResult={importResult}
          onReset={handleReset}
          onViewInventory={() => navigate('/inventory')}
        />
      )}

      {/* Save Preset Dialog */}
      {showSavePreset && (
        <SavePresetDialog
          onSave={handleSavePreset}
          onCancel={() => setShowSavePreset(false)}
        />
      )}

      {/* Preset Selector (on Step 2) */}
      {currentStep === 2 && presets.length > 0 && (
        <div className="fixed bottom-6 right-6 bg-white shadow-lg rounded-lg p-4 border border-gray-200 max-w-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Load Saved Preset</h3>
          <select
            value={selectedPreset || ''}
            onChange={(e) => loadPreset(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">-- Select a preset --</option>
            {presets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.preset_name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// Save Preset Dialog Component
function SavePresetDialog({ onSave, onCancel }) {
  const [presetName, setPresetName] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!presetName.trim()) {
      alert('Please enter a preset name');
      return;
    }
    onSave(presetName, notes);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Save Mapping Preset</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preset Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g., TechLiquidators Format"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Format used by warehouse team for laptop imports"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save Preset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Step 1: Upload Component
function Step1Upload({ file, loading, onFileChange }) {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 1: Upload Your File</h2>

      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="font-semibold text-gray-900 mb-2">No Template Required!</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li>Upload any CSV or Excel file with your asset data</li>
          <li>Column names don't need to match exactly</li>
          <li>We'll help you map your columns in the next step</li>
          <li>Required fields: Make, Model, Serial Number, Asset Type</li>
        </ul>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select File (CSV, XLS, XLSX)
        </label>
        <input
          type="file"
          accept=".csv,.xls,.xlsx"
          onChange={onFileChange}
          disabled={loading}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
        {file && !loading && (
          <p className="mt-2 text-sm text-gray-600">
            Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB)
          </p>
        )}
        {loading && (
          <p className="mt-2 text-sm text-blue-600">Uploading and analyzing file...</p>
        )}
      </div>
    </div>
  );
}

// Step 2: Column Mapping Component (Enhanced with Constant Values)
function Step2Mapping({ fileData, mapping, setMapping, constantValues, setConstantValues, otherValues, setOtherValues, mappingMode, setMappingMode, loading, onValidate, onBack, onSavePreset }) {
  const handleMappingChange = (bizHubField, sourceColumn) => {
    setMapping(prev => ({ ...prev, [bizHubField]: sourceColumn }));
    setMappingMode(prev => ({ ...prev, [bizHubField]: 'column' }));
    // Clear constant if switching to column
    setConstantValues(prev => {
      const updated = { ...prev };
      delete updated[bizHubField];
      return updated;
    });
  };

  const handleConstantChange = (bizHubField, value) => {
    setConstantValues(prev => ({ ...prev, [bizHubField]: value }));
  };

  const toggleMode = (bizHubField, newMode) => {
    setMappingMode(prev => ({ ...prev, [bizHubField]: newMode }));
    if (newMode === 'column') {
      // Clear constant
      setConstantValues(prev => {
        const updated = { ...prev };
        delete updated[bizHubField];
        return updated;
      });
    } else if (newMode === 'constant') {
      // Clear column mapping
      setMapping(prev => {
        const updated = { ...prev };
        delete updated[bizHubField];
        return updated;
      });
    } else if (newMode === 'ignore') {
      // Clear both
      setMapping(prev => ({ ...prev, [bizHubField]: '__ignore__' }));
      setConstantValues(prev => {
        const updated = { ...prev };
        delete updated[bizHubField];
        return updated;
      });
    }
  };

  const requiredFields = fileData.requiredFields || [];

  return (
    <div className="space-y-6">
      {/* Preview */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">File Preview</h2>
        <div className="text-sm text-gray-600 mb-4">
          <strong>File:</strong> {fileData.fileName} | <strong>Total Rows:</strong> {fileData.totalRows}
        </div>
        <div className="overflow-x-auto max-h-64 border rounded">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {fileData.headers.map(header => (
                  <th key={header} className="px-2 py-2 text-left font-medium text-gray-700 whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {fileData.preview.slice(0, 5).map((row, idx) => (
                <tr key={idx}>
                  {fileData.headers.map(header => (
                    <td key={header} className="px-2 py-2 text-gray-900 whitespace-nowrap">
                      {row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Column Mapping */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Step 2: Map Your Columns</h2>
            <p className="text-sm text-gray-600 mt-1">
              Map file columns, set constant values, or leave fields empty.
            </p>
          </div>
          <button
            onClick={onSavePreset}
            className="btn btn-secondary text-sm"
          >
            Save as Preset
          </button>
        </div>

        <div className="space-y-4">
          {Object.entries(fileData.fieldMetadata).map(([field, meta]) => {
            const currentMode = mappingMode[field] || (mapping[field] && mapping[field] !== '__ignore__' ? 'column' : 'ignore');
            const isRequired = requiredFields.includes(field);

            return (
              <div key={field} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <div className="w-1/4">
                    <label className="text-sm font-medium text-gray-700 block">
                      {meta.label}
                      {isRequired && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {meta.type === 'enum' && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Options: {meta.options.join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    {/* Mode Toggle */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleMode(field, 'column')}
                        className={`px-3 py-1 text-xs rounded ${
                          currentMode === 'column'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        From Column
                      </button>
                      <button
                        onClick={() => toggleMode(field, 'constant')}
                        className={`px-3 py-1 text-xs rounded ${
                          currentMode === 'constant'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Constant Value
                      </button>
                      {!isRequired && (
                        <button
                          onClick={() => toggleMode(field, 'ignore')}
                          className={`px-3 py-1 text-xs rounded ${
                            currentMode === 'ignore'
                              ? 'bg-gray-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Leave Empty
                        </button>
                      )}
                    </div>

                    {/* Mode A: Column Selection */}
                    {currentMode === 'column' && (
                      <div>
                        <select
                          value={mapping[field] || ''}
                          onChange={(e) => handleMappingChange(field, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="">-- Select Column --</option>
                          {fileData.headers.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </select>
                        {mapping[field] && fileData.preview[0] && (
                          <div className="text-xs text-gray-500 mt-1">
                            Sample: "{fileData.preview[0][mapping[field]]}"
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mode B: Constant Value */}
                    {currentMode === 'constant' && (
                      <div>
                        {meta.type === 'enum' ? (
                          <>
                            <select
                              value={constantValues[field] || ''}
                              onChange={(e) => {
                                handleConstantChange(field, e.target.value);
                                if (e.target.value !== '__other__') {
                                  setOtherValues(prev => { const u = { ...prev }; delete u[field]; return u; });
                                }
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            >
                              <option value="">-- Select Value --</option>
                              {meta.options.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                              {meta.allowOther && <option value="__other__">Other...</option>}
                            </select>
                            {constantValues[field] === '__other__' && (
                              <div className="mt-2">
                                <input
                                  type="text"
                                  maxLength={60}
                                  value={otherValues[field] || ''}
                                  onChange={(e) => setOtherValues(prev => ({ ...prev, [field]: e.target.value }))}
                                  placeholder={`Enter new ${meta.label.toLowerCase()}`}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                                <div className="text-xs text-green-600 mt-1">
                                  New value will be saved for future imports
                                </div>
                              </div>
                            )}
                          </>
                        ) : meta.type === 'number' ? (
                          <input
                            type="number"
                            value={constantValues[field] || ''}
                            onChange={(e) => handleConstantChange(field, e.target.value)}
                            placeholder={`Enter ${meta.label.toLowerCase()}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        ) : (
                          <input
                            type="text"
                            value={constantValues[field] || ''}
                            onChange={(e) => handleConstantChange(field, e.target.value)}
                            placeholder={`Enter ${meta.label.toLowerCase()}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        )}
                        <div className="text-xs text-blue-600 mt-1">
                          This value will be applied to all {fileData.totalRows} rows
                        </div>
                        {field === 'serial_number' && constantValues[field] && (
                          <div className="text-xs text-red-600 mt-1">
                            ⚠️ Warning: serial_number must be unique - constant values will cause errors
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mode C: Ignore */}
                    {currentMode === 'ignore' && (
                      <div className="text-sm text-gray-500 italic">
                        This field will be left empty
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onBack} className="btn btn-secondary">
          Back
        </button>
        <button
          onClick={onValidate}
          disabled={loading}
          className="btn btn-primary disabled:opacity-50"
        >
          {loading ? 'Validating...' : 'Validate & Continue'}
        </button>
      </div>
    </div>
  );
}

// Step 3: Validation Preview Component
function Step3Validation({ validationResult, importMode, setImportMode, loading, onImport, onBack, onDownloadErrors }) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 3: Validation Results</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{validationResult.totalRows}</div>
            <div className="text-sm text-gray-600">Total Rows</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">{validationResult.validRows}</div>
            <div className="text-sm text-gray-600">Valid Rows</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600">{validationResult.invalidRows}</div>
            <div className="text-sm text-gray-600">Invalid Rows</div>
          </div>
        </div>
      </div>

      {/* Preview of Valid Data */}
      {validationResult.validPreview.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3">Preview of Valid Data (first 20 rows)</h3>
          <div className="overflow-x-auto max-h-64 border rounded">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-gray-700">Row</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-700">Make</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-700">Model</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-700">Serial Number</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-700">Type</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {validationResult.validPreview.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-2 py-2 text-gray-500">{row.rowNumber}</td>
                    <td className="px-2 py-2 text-gray-900">{row.make}</td>
                    <td className="px-2 py-2 text-gray-900">{row.model}</td>
                    <td className="px-2 py-2 text-gray-900 font-mono">{row.serial_number}</td>
                    <td className="px-2 py-2 text-gray-900">{row.asset_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {validationResult.validationErrors.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-900">Validation Errors</h3>
            <button
              onClick={onDownloadErrors}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              📥 Download Error Report
            </button>
          </div>
          <div className="bg-red-50 border border-red-200 rounded p-3 max-h-64 overflow-y-auto">
            {validationResult.validationErrors.slice(0, 20).map((err, idx) => (
              <div key={idx} className="text-sm text-gray-700 mb-2">
                <strong>Row {err.rowNumber}:</strong> {err.errors.join(', ')}
              </div>
            ))}
            {validationResult.validationErrors.length > 20 && (
              <div className="text-sm text-gray-500 mt-2">
                ... and {validationResult.validationErrors.length - 20} more errors (download full report)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Options */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-3">Import Options</h3>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="radio"
              value="skip-errors"
              checked={importMode === 'skip-errors'}
              onChange={(e) => setImportMode(e.target.value)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">
              <strong>Import Valid Only</strong> - Import {validationResult.validRows} valid rows, skip invalid ones (Recommended)
            </span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="all-or-nothing"
              checked={importMode === 'all-or-nothing'}
              onChange={(e) => setImportMode(e.target.value)}
              className="mr-2"
              disabled={validationResult.invalidRows > 0}
            />
            <span className="text-sm text-gray-700">
              <strong>All-or-Nothing</strong> - Import only if all rows are valid
              {validationResult.invalidRows > 0 && ' (disabled - fix errors first)'}
            </span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onBack} className="btn btn-secondary">
          Back to Mapping
        </button>
        <button
          onClick={onImport}
          disabled={loading || (importMode === 'all-or-nothing' && validationResult.invalidRows > 0)}
          className="btn btn-primary disabled:opacity-50"
        >
          {loading ? 'Importing...' : `Import ${validationResult.validRows} Assets`}
        </button>
      </div>
    </div>
  );
}

// Step 4: Results Component
function Step4Results({ importResult, onReset, onViewInventory }) {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 4: Import Complete!</h2>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{importResult.imported}</div>
          <div className="text-sm text-gray-600">Successfully Imported</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
          <div className="text-sm text-gray-600">Failed</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-600">{importResult.validationErrors}</div>
          <div className="text-sm text-gray-600">Validation Errors</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{importResult.skippedDuplicates || 0}</div>
          <div className="text-sm text-gray-600">Duplicates Skipped</div>
        </div>
      </div>

      {/* Imported Assets */}
      {importResult.importedAssets && importResult.importedAssets.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-2">✅ Successfully Imported Assets</h3>
          <div className="bg-gray-50 rounded p-3 max-h-40 overflow-y-auto">
            {importResult.importedAssets.slice(0, 20).map((asset, idx) => (
              <div key={idx} className="text-sm text-gray-700">
                Row {asset.rowNumber}: <strong>{asset.assetTag}</strong> - {asset.serialNumber}
              </div>
            ))}
            {importResult.importedAssets.length > 20 && (
              <div className="text-sm text-gray-500 mt-2">
                ... and {importResult.importedAssets.length - 20} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onReset} className="btn btn-secondary">
          Import Another File
        </button>
        <button onClick={onViewInventory} className="btn btn-primary">
          View Inventory
        </button>
      </div>
    </div>
  );
}
