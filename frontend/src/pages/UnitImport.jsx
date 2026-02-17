import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function groupByProduct(rows) {
  const groups = {};
  for (const row of rows) {
    const key = (row.product_name || `${row.make || ''} ${row.model || ''}`.trim()).trim();
    if (!key) continue;
    if (!groups[key]) groups[key] = { name: key, make: row.make || key.split(' ')[0], model: row.model || key.replace(row.make || key.split(' ')[0], '').trim(), units: [] };
    groups[key].units.push(row);
  }
  return Object.values(groups);
}

export default function UnitImport() {
  const [step, setStep] = useState('upload'); // upload | preview | importing | results
  const [file, setFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewGroups, setPreviewGroups] = useState([]);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (selectedFile) => {
    if (!selectedFile) return;

    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Please select a CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setFile(selectedFile);
    setError(null);

    if (ext === 'csv') {
      try {
        const text = await selectedFile.text();
        const rows = parseCSV(text);
        if (rows.length === 0) {
          setError('File contains no data rows');
          return;
        }
        setPreviewRows(rows);
        setPreviewGroups(groupByProduct(rows));
        setStep('preview');
      } catch (e) {
        setError('Failed to parse CSV file: ' + e.message);
      }
    } else {
      // For XLSX, we can't parse client-side without a library, show file info and go to preview
      setPreviewRows([]);
      setPreviewGroups([]);
      setStep('preview');
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, [handleFile]);

  const handleConfirmImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    setStep('importing');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('/api/v1/assets/import-units', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        setResults(response.data.data);
        setStep('results');
      } else {
        setError(response.data.error?.message || 'Import failed');
        setStep('preview');
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Import failed. Please try again.');
      setStep('preview');
    } finally {
      setImporting(false);
    }
  };

  const resetForm = () => {
    setStep('upload');
    setFile(null);
    setPreviewRows([]);
    setPreviewGroups([]);
    setResults(null);
    setError(null);
  };

  const expectedColumns = ['serial_number', 'product_name (or make + model)', 'cpu', 'memory', 'storage', 'cost', 'price', 'condition', 'notes'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Serialized Units</h1>
          <p className="text-sm text-gray-500 mt-1">Upload a CSV or Excel file to bulk-add serialized units to your inventory</p>
        </div>
        <Link to="/inventory" className="btn btn-secondary">Back to Inventory</Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold ml-4">&times;</button>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-6">
          <div
            className={`bg-white rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
              dragOver ? 'border-violet-400 bg-violet-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <svg className="mx-auto w-16 h-16 text-gray-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-lg font-medium text-gray-700 mb-2">Drop your file here or click to browse</p>
            <p className="text-sm text-gray-500 mb-4">Supports CSV, XLS, and XLSX files up to 10MB</p>
            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 cursor-pointer transition-colors font-medium">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Choose File
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Expected Columns</h3>
            <div className="flex flex-wrap gap-2">
              {expectedColumns.map(col => (
                <span key={col} className="px-2.5 py-1 text-xs font-mono bg-gray-100 text-gray-700 rounded-md border border-gray-200">
                  {col}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              <strong>Required:</strong> serial_number and either product_name or make+model. Other columns are optional.
              Duplicate serials are automatically skipped. Existing products are matched by make+model.
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <div className="space-y-6">
          {/* File Info Bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{file?.name}</p>
                <p className="text-xs text-gray-500">{(file?.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Change file</button>
          </div>

          {/* Preview Summary */}
          {previewRows.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900">{previewRows.length}</div>
                  <div className="text-sm text-gray-500">Total Rows</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-2xl font-bold text-violet-600">{previewGroups.length}</div>
                  <div className="text-sm text-gray-500">Products</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {previewRows.filter(r => (r.serial_number || '').trim()).length}
                  </div>
                  <div className="text-sm text-gray-500">Units with Serial #</div>
                </div>
              </div>

              {/* Grouped Preview Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-900">Preview (grouped by product)</h3>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-4 font-medium text-gray-500">Product</th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500">Serial #</th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500">CPU</th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500">Memory</th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500">Storage</th>
                        <th className="text-right py-2 px-4 font-medium text-gray-500">Cost</th>
                        <th className="text-right py-2 px-4 font-medium text-gray-500">Price</th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500">Condition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewGroups.map((group, gi) => (
                        group.units.map((unit, ui) => (
                          <tr key={`${gi}-${ui}`} className={`border-b border-gray-100 hover:bg-gray-50 ${!unit.serial_number?.trim() ? 'bg-red-50' : ''}`}>
                            {ui === 0 ? (
                              <td className="py-2 px-4 font-medium text-gray-900 bg-gray-50 border-r border-gray-100" rowSpan={group.units.length}>
                                <div className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">{group.units.length}</span>
                                  {group.name}
                                </div>
                              </td>
                            ) : null}
                            <td className="py-2 px-4 font-mono text-xs">{unit.serial_number || <span className="text-red-500 italic">missing</span>}</td>
                            <td className="py-2 px-4 text-gray-600">{unit.cpu || '—'}</td>
                            <td className="py-2 px-4 text-gray-600">{unit.memory || '—'}</td>
                            <td className="py-2 px-4 text-gray-600">{unit.storage || '—'}</td>
                            <td className="py-2 px-4 text-right text-gray-600">{unit.cost || '—'}</td>
                            <td className="py-2 px-4 text-right text-gray-600">{unit.price || '—'}</td>
                            <td className="py-2 px-4 text-gray-600">{unit.condition || '—'}</td>
                          </tr>
                        ))
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500">Excel file detected. Preview is not available for .xlsx files.</p>
              <p className="text-sm text-gray-400 mt-1">Click "Confirm Import" to process the file on the server.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button onClick={resetForm} className="btn btn-secondary">Cancel</button>
            <button
              onClick={handleConfirmImport}
              disabled={importing}
              className="px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Confirm Import
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-700">Processing import...</p>
          <p className="text-sm text-gray-500 mt-1">This may take a moment for large files</p>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 'results' && results && (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h3 className="text-lg font-semibold text-green-800">Import Complete</h3>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{results.units_created}</div>
              <div className="text-sm text-gray-500">Units Created</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-violet-600">{results.products_created}</div>
              <div className="text-sm text-gray-500">New Products</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{results.products_existing}</div>
              <div className="text-sm text-gray-500">Existing Products</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-gray-400">{results.units_skipped}</div>
              <div className="text-sm text-gray-500">Duplicates Skipped</div>
            </div>
          </div>

          {results.errors && results.errors.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 p-5">
              <h3 className="text-sm font-semibold text-red-700 mb-3">Errors ({results.errors.length})</h3>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Row</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.errors.map((err, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-mono text-xs">{JSON.stringify(err.row).slice(0, 80)}...</td>
                        <td className="py-2 px-3 text-red-600">{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={resetForm} className="btn btn-secondary">Import More</button>
            <Link to="/inventory" className="px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-medium transition-colors">
              Go to Inventory
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
