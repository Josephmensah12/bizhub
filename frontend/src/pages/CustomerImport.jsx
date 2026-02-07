import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

/**
 * CustomerImport - Bulk import customers from CSV/Excel
 * Features:
 * - File upload with preview
 * - Column mapping
 * - Validation with error display
 * - Auto-merge duplicates by phone
 */
export default function CustomerImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Wizard state
  const [step, setStep] = useState(1); // 1: Upload, 2: Map, 3: Validate, 4: Commit
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // File state
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  // Mapping state
  const [columnMapping, setColumnMapping] = useState({});

  // Validation state
  const [validationResult, setValidationResult] = useState(null);

  // Commit state
  const [commitResult, setCommitResult] = useState(null);

  // Available fields for mapping
  const mappableFields = [
    { key: 'first_name', label: 'First Name', required: false },
    { key: 'last_name', label: 'Last Name', required: false },
    { key: 'company_name', label: 'Company Name', required: false },
    { key: 'phone_raw', label: 'Phone Number', required: false },
    { key: 'whatsapp_raw', label: 'WhatsApp Number', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'address', label: 'Address', required: false },
    { key: 'notes', label: 'Notes', required: false },
    { key: 'heard_about_us', label: 'Heard About Us', required: false },
    { key: 'tags', label: 'Tags (comma-separated)', required: false }
  ];

  // Step 1: Handle file upload
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await axios.post('/api/v1/customers/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setPreviewData(response.data.data);

      // Auto-map columns based on header names
      const autoMapping = {};
      const headers = response.data.data.headers || [];
      headers.forEach((header, index) => {
        const lowerHeader = header.toLowerCase().trim();

        // Try to auto-detect mappings
        if (lowerHeader.includes('first') && lowerHeader.includes('name')) {
          autoMapping[index] = 'first_name';
        } else if (lowerHeader.includes('last') && lowerHeader.includes('name')) {
          autoMapping[index] = 'last_name';
        } else if (lowerHeader === 'name' || lowerHeader === 'full name' || lowerHeader === 'customer name') {
          autoMapping[index] = 'first_name'; // Will be parsed later
        } else if (lowerHeader.includes('company') || lowerHeader.includes('business')) {
          autoMapping[index] = 'company_name';
        } else if (lowerHeader.includes('phone') || lowerHeader.includes('mobile') || lowerHeader.includes('tel')) {
          if (lowerHeader.includes('whatsapp') || lowerHeader.includes('wa')) {
            autoMapping[index] = 'whatsapp_raw';
          } else if (!Object.values(autoMapping).includes('phone_raw')) {
            autoMapping[index] = 'phone_raw';
          }
        } else if (lowerHeader.includes('whatsapp') || lowerHeader.includes('wa ')) {
          autoMapping[index] = 'whatsapp_raw';
        } else if (lowerHeader.includes('email') || lowerHeader.includes('e-mail')) {
          autoMapping[index] = 'email';
        } else if (lowerHeader.includes('address') || lowerHeader.includes('location')) {
          autoMapping[index] = 'address';
        } else if (lowerHeader.includes('note') || lowerHeader.includes('comment') || lowerHeader.includes('remark')) {
          autoMapping[index] = 'notes';
        } else if (lowerHeader.includes('heard') || lowerHeader.includes('source') || lowerHeader.includes('referral')) {
          autoMapping[index] = 'heard_about_us';
        } else if (lowerHeader.includes('tag') || lowerHeader.includes('label') || lowerHeader.includes('category')) {
          autoMapping[index] = 'tags';
        }
      });

      setColumnMapping(autoMapping);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Handle mapping change
  const handleMappingChange = (columnIndex, fieldKey) => {
    setColumnMapping(prev => {
      const updated = { ...prev };
      if (fieldKey === '') {
        delete updated[columnIndex];
      } else {
        // Remove this field from any other column
        Object.keys(updated).forEach(key => {
          if (updated[key] === fieldKey && key !== String(columnIndex)) {
            delete updated[key];
          }
        });
        updated[columnIndex] = fieldKey;
      }
      return updated;
    });
  };

  // Step 2 -> 3: Validate import
  const handleValidate = async () => {
    setError(null);
    setLoading(true);

    try {
      const response = await axios.post('/api/v1/customers/import/validate', {
        previewId: previewData.previewId,
        columnMapping
      });

      setValidationResult(response.data.data);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 3 -> 4: Commit import
  const handleCommit = async () => {
    setError(null);
    setLoading(true);

    try {
      const response = await axios.post('/api/v1/customers/import/commit', {
        previewId: previewData.previewId,
        columnMapping
      });

      setCommitResult(response.data.data);
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  // Reset wizard
  const handleReset = () => {
    setStep(1);
    setFile(null);
    setPreviewData(null);
    setColumnMapping({});
    setValidationResult(null);
    setCommitResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/customers" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
          &larr; Back to Customers
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Import Customers</h1>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {['Upload File', 'Map Columns', 'Review', 'Complete'].map((label, index) => (
            <div key={index} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step > index + 1 ? 'bg-green-600 text-white' :
                step === index + 1 ? 'bg-blue-600 text-white' :
                'bg-gray-200 text-gray-600'
              }`}>
                {step > index + 1 ? '✓' : index + 1}
              </div>
              <span className={`ml-2 text-sm ${step === index + 1 ? 'font-semibold' : ''}`}>
                {label}
              </span>
              {index < 3 && (
                <div className={`w-12 h-0.5 mx-4 ${step > index + 1 ? 'bg-green-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Upload Customer File</h2>
          <p className="text-gray-600 mb-6">
            Upload a CSV or Excel file containing customer data. The first row should contain column headers.
          </p>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,.xlsx,.xls"
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer"
            >
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mt-2 text-sm text-gray-600">
                <span className="text-blue-600 hover:text-blue-800 font-medium">Click to upload</span>
                {' '}or drag and drop
              </p>
              <p className="mt-1 text-xs text-gray-500">CSV, XLS, or XLSX files</p>
            </label>
          </div>

          {loading && (
            <div className="mt-4 text-center text-gray-600">
              Parsing file...
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">Supported Columns</h3>
            <p className="text-sm text-blue-700">
              First Name, Last Name, Company Name, Phone, WhatsApp, Email, Address, Notes, Heard About Us, Tags
            </p>
            <p className="text-sm text-blue-600 mt-2">
              Phone numbers will be automatically normalized to E.164 format (Ghana default).
              Duplicates will be merged by matching phone number.
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === 2 && previewData && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Map Columns</h2>
          <p className="text-gray-600 mb-6">
            Map your file columns to customer fields. We've auto-detected some mappings.
          </p>

          {/* Mapping Table */}
          <div className="overflow-x-auto mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    File Column
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Sample Data
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Map To Field
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {previewData.headers.map((header, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 font-medium">{header}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {previewData.sampleRows?.slice(0, 2).map((row, rowIdx) => (
                        <div key={rowIdx} className="truncate max-w-xs">
                          {row[index] || '—'}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={columnMapping[index] || ''}
                        onChange={(e) => handleMappingChange(index, e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Skip this column</option>
                        {mappableFields.map(field => (
                          <option
                            key={field.key}
                            value={field.key}
                            disabled={Object.values(columnMapping).includes(field.key) && columnMapping[index] !== field.key}
                          >
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-sm text-gray-600 mb-6">
            <strong>Total rows:</strong> {previewData.totalRows}
          </div>

          <div className="flex justify-between">
            <button
              onClick={handleReset}
              className="btn btn-secondary"
            >
              Start Over
            </button>
            <button
              onClick={handleValidate}
              disabled={loading || Object.keys(columnMapping).length === 0}
              className="btn btn-primary"
            >
              {loading ? 'Validating...' : 'Validate & Preview'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review Validation */}
      {step === 3 && validationResult && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Review Import</h2>

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-green-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">{validationResult.validCount}</div>
              <div className="text-sm text-green-700">Valid Records</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600">{validationResult.newCount || 0}</div>
              <div className="text-sm text-blue-700">New Customers</div>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-yellow-600">{validationResult.mergeCount || 0}</div>
              <div className="text-sm text-yellow-700">To Be Merged</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-600">{validationResult.errorCount || 0}</div>
              <div className="text-sm text-red-700">Errors</div>
            </div>
          </div>

          {/* Errors List */}
          {validationResult.errors && validationResult.errors.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-red-800 mb-2">Errors (will be skipped)</h3>
              <div className="max-h-40 overflow-y-auto border border-red-200 rounded-lg">
                {validationResult.errors.slice(0, 20).map((err, index) => (
                  <div key={index} className="px-3 py-2 text-sm text-red-700 border-b border-red-100 last:border-b-0">
                    <strong>Row {err.row}:</strong> {err.message}
                  </div>
                ))}
                {validationResult.errors.length > 20 && (
                  <div className="px-3 py-2 text-sm text-red-600">
                    ... and {validationResult.errors.length - 20} more errors
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Merges Preview */}
          {validationResult.merges && validationResult.merges.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-yellow-800 mb-2">Duplicate Merges</h3>
              <div className="max-h-40 overflow-y-auto border border-yellow-200 rounded-lg">
                {validationResult.merges.slice(0, 10).map((merge, index) => (
                  <div key={index} className="px-3 py-2 text-sm text-yellow-700 border-b border-yellow-100 last:border-b-0">
                    <strong>Row {merge.row}:</strong> Will merge into existing customer "{merge.existingName}" (matched by {merge.matchedBy})
                  </div>
                ))}
                {validationResult.merges.length > 10 && (
                  <div className="px-3 py-2 text-sm text-yellow-600">
                    ... and {validationResult.merges.length - 10} more merges
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview Table */}
          {validationResult.preview && validationResult.preview.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-gray-800 mb-2">Preview (first 5 records)</h3>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Phone</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {validationResult.preview.map((row, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">
                          {row.first_name} {row.last_name}
                          {row.company_name && <span className="text-gray-500 text-xs block">{row.company_name}</span>}
                        </td>
                        <td className="px-3 py-2">
                          {row.phone_e164 || row.phone_raw || '—'}
                        </td>
                        <td className="px-3 py-2">{row.email || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            row.status === 'new' ? 'bg-green-100 text-green-800' :
                            row.status === 'merge' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="btn btn-secondary"
            >
              Back to Mapping
            </button>
            <button
              onClick={handleCommit}
              disabled={loading || validationResult.validCount === 0}
              className="btn btn-primary"
            >
              {loading ? 'Importing...' : `Import ${validationResult.validCount} Customers`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 4 && commitResult && (
        <div className="card text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-2">Import Complete!</h2>
          <p className="text-gray-600 mb-6">
            Successfully imported customer data.
          </p>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{commitResult.created || 0}</div>
              <div className="text-sm text-green-700">Created</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{commitResult.merged || 0}</div>
              <div className="text-sm text-blue-700">Merged</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{commitResult.skipped || 0}</div>
              <div className="text-sm text-red-700">Skipped</div>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={handleReset}
              className="btn btn-secondary"
            >
              Import More
            </button>
            <Link to="/customers" className="btn btn-primary">
              View Customers
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
