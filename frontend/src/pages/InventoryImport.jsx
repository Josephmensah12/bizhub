import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function InventoryImport() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState('skip-errors');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];

      if (!validTypes.includes(selectedFile.type)) {
        setError('Please select a valid CSV or Excel file (.csv, .xls, .xlsx)');
        setFile(null);
        return;
      }

      // Validate file size (10MB max)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await axios.get('/api/v1/assets/export/template?format=csv', {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'asset-import-template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to download template: ' + (err.response?.data?.error?.message || err.message));
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Please select a file to import');
      return;
    }

    try {
      setImporting(true);
      setError(null);
      setResult(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('importMode', importMode);

      const response = await axios.post('/api/v1/assets/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setResult(response.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Import failed');
      if (err.response?.data?.error?.details) {
        setResult({
          validationErrorDetails: err.response.data.error.details
        });
      }
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const downloadErrorReport = () => {
    if (!result?.validationErrorDetails) return;

    const errorText = result.validationErrorDetails.join('\n');
    const blob = new Blob([errorText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'import-errors.txt');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/inventory')}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
        >
          ← Back to Inventory
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Bulk Import Assets</h1>
        <p className="text-gray-600 mt-2">
          Import multiple assets from a CSV or Excel file
        </p>
      </div>

      {/* Instructions */}
      <div className="card mb-6 bg-blue-50 border-blue-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Import Instructions</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Download the import template to see required columns and format</li>
          <li>Fill in your asset data (required: assetType, serialNumber, make, model)</li>
          <li>Save as CSV or Excel file (.csv, .xls, .xlsx)</li>
          <li>Upload the file below</li>
          <li>Review validation errors (if any) and fix them</li>
          <li>Re-upload and import</li>
        </ol>

        <button
          onClick={handleDownloadTemplate}
          className="mt-4 btn btn-secondary"
        >
          📥 Download Template
        </button>
      </div>

      {/* Upload Section */}
      {!result && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload File</h2>

          {/* Import Mode Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Import Mode
            </label>
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
                  <strong>Skip Errors</strong> - Import valid rows, skip invalid ones (Recommended)
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="all-or-nothing"
                  checked={importMode === 'all-or-nothing'}
                  onChange={(e) => setImportMode(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">
                  <strong>All-or-Nothing</strong> - Fail entire import if any row has errors
                </span>
              </label>
            </div>
          </div>

          {/* File Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select File
            </label>
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded">
              {error}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? 'Importing...' : '📤 Import Assets'}
          </button>
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Import Results</h2>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{result.imported || 0}</div>
              <div className="text-sm text-gray-600">Successfully Imported</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{result.failed || 0}</div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-600">{result.validationErrors || 0}</div>
              <div className="text-sm text-gray-600">Validation Errors</div>
            </div>
          </div>

          {/* Imported Assets */}
          {result.importedAssets && result.importedAssets.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">✅ Successfully Imported Assets</h3>
              <div className="bg-gray-50 rounded p-3 max-h-40 overflow-y-auto">
                {result.importedAssets.map((asset, idx) => (
                  <div key={idx} className="text-sm text-gray-700">
                    Row {asset.rowNumber}: {asset.assetTag}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed Rows */}
          {result.failedRows && result.failedRows.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">❌ Failed Rows</h3>
              <div className="bg-red-50 border border-red-200 rounded p-3 max-h-40 overflow-y-auto">
                {result.failedRows.map((row, idx) => (
                  <div key={idx} className="text-sm text-red-700">
                    Row {row.rowNumber}: {row.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation Errors */}
          {result.validationErrorDetails && result.validationErrorDetails.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-gray-900">⚠️ Validation Errors</h3>
                <button
                  onClick={downloadErrorReport}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  📥 Download Error Report
                </button>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 max-h-60 overflow-y-auto">
                {result.validationErrorDetails.map((error, idx) => (
                  <div key={idx} className="text-sm text-gray-700 mb-1">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="btn btn-secondary"
            >
              Import Another File
            </button>
            <button
              onClick={() => navigate('/inventory')}
              className="btn btn-primary"
            >
              View Inventory
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
