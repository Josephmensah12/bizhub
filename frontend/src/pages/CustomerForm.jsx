import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import debounce from 'lodash/debounce';

/**
 * CustomerForm - Add/Edit Customer
 * Features:
 * - Phone input with live E.164 preview
 * - WhatsApp same-as-phone toggle
 * - Live duplicate warning
 * - Validation: firstName required unless companyName filled
 */
export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState({
    heardAboutUsOptions: [],
    existingTags: []
  });

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    phone_raw: '',
    whatsapp_raw: '',
    whatsapp_same_as_phone: true,
    email: '',
    address: '',
    notes: '',
    heard_about_us: '',
    heard_about_us_other_text: '',
    tags: []
  });

  // Phone preview state
  const [phonePreview, setPhonePreview] = useState({ e164: null, formatted: null, isValid: false, error: null });
  const [whatsappPreview, setWhatsappPreview] = useState({ e164: null, formatted: null, isValid: false, error: null });

  // Duplicate warning state
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // Validation errors
  const [validationErrors, setValidationErrors] = useState({});

  // New tag input
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    fetchOptions();
    if (isEdit) {
      fetchCustomer();
    }
  }, [id]);

  const fetchOptions = async () => {
    try {
      const response = await axios.get('/api/v1/customers/options');
      setOptions(response.data.data);
    } catch (err) {
      console.error('Error fetching options:', err);
    }
  };

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/v1/customers/${id}`);
      const customer = response.data.data.customer;
      setFormData({
        first_name: customer.first_name || '',
        last_name: customer.last_name || '',
        company_name: customer.company_name || '',
        phone_raw: customer.phone_raw || '',
        whatsapp_raw: customer.whatsapp_raw || '',
        whatsapp_same_as_phone: customer.whatsapp_same_as_phone || false,
        email: customer.email || '',
        address: customer.address || '',
        notes: customer.notes || '',
        heard_about_us: customer.heard_about_us || '',
        heard_about_us_other_text: customer.heard_about_us_other_text || '',
        tags: customer.tags || []
      });
      // Set initial phone previews
      if (customer.phone_e164) {
        setPhonePreview({ e164: customer.phone_e164, formatted: customer.phone_e164, isValid: true });
      }
      if (customer.whatsapp_e164) {
        setWhatsappPreview({ e164: customer.whatsapp_e164, formatted: customer.whatsapp_e164, isValid: true });
      }
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch customer');
    } finally {
      setLoading(false);
    }
  };

  // Debounced phone normalization preview
  const debouncedNormalizePhone = useCallback(
    debounce(async (phone, field) => {
      if (!phone || phone.length < 3) {
        if (field === 'phone') {
          setPhonePreview({ e164: null, formatted: null, isValid: false, error: null });
        } else {
          setWhatsappPreview({ e164: null, formatted: null, isValid: false, error: null });
        }
        return;
      }

      try {
        const response = await axios.post('/api/v1/customers/normalize-phone', { phone });
        const result = response.data.data;
        if (field === 'phone') {
          setPhonePreview({
            e164: result.e164,
            formatted: result.formatted,
            isValid: result.isValid,
            error: result.error
          });
        } else {
          setWhatsappPreview({
            e164: result.e164,
            formatted: result.formatted,
            isValid: result.isValid,
            error: result.error
          });
        }
      } catch (err) {
        console.error('Phone normalization error:', err);
        // Set error state on API failure
        const errorState = { e164: null, formatted: null, isValid: false, error: 'Failed to validate phone' };
        if (field === 'phone') {
          setPhonePreview(errorState);
        } else {
          setWhatsappPreview(errorState);
        }
      }
    }, 300),
    []
  );

  // Debounced duplicate check
  const debouncedCheckDuplicate = useCallback(
    debounce(async (phone, email, excludeId) => {
      if (!phone && !email) {
        setDuplicateWarning(null);
        return;
      }

      try {
        setCheckingDuplicate(true);
        const response = await axios.post('/api/v1/customers/check-duplicate', {
          phone,
          email,
          excludeId
        });

        if (response.data.data.isDuplicate) {
          setDuplicateWarning(response.data.data);
        } else {
          setDuplicateWarning(null);
        }
      } catch (err) {
        console.error('Duplicate check error:', err);
      } finally {
        setCheckingDuplicate(false);
      }
    }, 500),
    []
  );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    setFormData(prev => {
      const updated = { ...prev, [name]: newValue };

      // If toggling whatsapp_same_as_phone ON, copy phone to whatsapp
      if (name === 'whatsapp_same_as_phone' && checked) {
        updated.whatsapp_raw = prev.phone_raw;
        setWhatsappPreview(phonePreview);
      }

      // If changing phone and whatsapp_same_as_phone is on, also update whatsapp
      if (name === 'phone_raw' && prev.whatsapp_same_as_phone) {
        updated.whatsapp_raw = value;
      }

      return updated;
    });

    // Trigger phone normalization preview
    if (name === 'phone_raw') {
      debouncedNormalizePhone(value, 'phone');
      if (formData.whatsapp_same_as_phone) {
        debouncedNormalizePhone(value, 'whatsapp');
      }
      // Check for duplicates
      debouncedCheckDuplicate(value, formData.email, isEdit ? id : null);
    }

    if (name === 'whatsapp_raw' && !formData.whatsapp_same_as_phone) {
      debouncedNormalizePhone(value, 'whatsapp');
    }

    if (name === 'email') {
      debouncedCheckDuplicate(formData.phone_raw, value, isEdit ? id : null);
    }

    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  const handleAddTag = () => {
    const tag = newTag.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
    }
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tagToRemove)
    }));
  };

  const handleTagKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // Simple client-side phone validation (Ghana format)
  const isValidGhanaPhone = (phone) => {
    if (!phone) return true; // Empty is OK
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    // Accept: 10 digits starting with 0, or 9 digits (without leading 0), or with +233/233 prefix
    if (/^0[235]\d{8}$/.test(cleaned)) return true; // 0241234567
    if (/^[235]\d{8}$/.test(cleaned)) return true;  // 241234567
    if (/^\+?233[235]\d{8}$/.test(cleaned)) return true; // +233241234567 or 233241234567
    return false;
  };

  const validate = () => {
    const errors = {};

    // firstName required unless companyName filled
    if (!formData.first_name.trim() && !formData.company_name.trim()) {
      errors.first_name = 'First name is required unless company name is provided';
    }

    // Phone validation (if provided) - use client-side check as fallback
    if (formData.phone_raw) {
      // If preview loaded and invalid, show error
      // If preview not loaded yet, do basic client-side validation
      const hasPreviewResult = phonePreview.e164 !== null || phonePreview.error;
      if (hasPreviewResult && !phonePreview.isValid) {
        errors.phone_raw = phonePreview.error || 'Invalid phone number format';
      } else if (!hasPreviewResult && !isValidGhanaPhone(formData.phone_raw)) {
        errors.phone_raw = 'Invalid phone number format';
      }
    }

    // WhatsApp validation (if provided and not same as phone)
    if (!formData.whatsapp_same_as_phone && formData.whatsapp_raw) {
      const hasPreviewResult = whatsappPreview.e164 !== null || whatsappPreview.error;
      if (hasPreviewResult && !whatsappPreview.isValid) {
        errors.whatsapp_raw = whatsappPreview.error || 'Invalid WhatsApp number format';
      } else if (!hasPreviewResult && !isValidGhanaPhone(formData.whatsapp_raw)) {
        errors.whatsapp_raw = 'Invalid WhatsApp number format';
      }
    }

    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        ...formData,
        // Clean up the data
        first_name: formData.first_name.trim() || null,
        last_name: formData.last_name.trim() || null,
        company_name: formData.company_name.trim() || null,
        phone_raw: formData.phone_raw.trim() || null,
        whatsapp_raw: formData.whatsapp_same_as_phone ? formData.phone_raw.trim() || null : formData.whatsapp_raw.trim() || null,
        email: formData.email.trim().toLowerCase() || null,
        address: formData.address.trim() || null,
        notes: formData.notes.trim() || null,
        heard_about_us: formData.heard_about_us || null,
        heard_about_us_other_text: formData.heard_about_us === 'Other' ? formData.heard_about_us_other_text.trim() || null : null
      };

      if (isEdit) {
        await axios.put(`/api/v1/customers/${id}`, payload);
        navigate(`/customers/${id}`);
      } else {
        const response = await axios.post('/api/v1/customers', payload);
        navigate(`/customers/${response.data.data.customer.id}`);
      }
    } catch (err) {
      // Check if it's a duplicate error with merge option
      if (err.response?.data?.error?.code === 'DUPLICATE_EXISTS') {
        const duplicates = err.response.data.error.duplicates;
        if (duplicates && duplicates.length > 0) {
          const firstDupe = duplicates[0];
          setDuplicateWarning({
            isDuplicate: true,
            matchedBy: firstDupe.matchedOn?.join(', ') || 'contact info',
            existingCustomer: {
              id: firstDupe.id,
              displayName: firstDupe.displayName,
              phone_e164: firstDupe.phone,
              email: firstDupe.email
            }
          });
        }
        setError('A customer with this phone or email already exists. You can merge the data or go back to edit.');
      } else {
        setError(err.response?.data?.error?.message || 'Failed to save customer');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleMerge = async () => {
    if (!duplicateWarning?.existingCustomer?.id) return;

    try {
      setSaving(true);
      setError(null);

      const payload = {
        first_name: formData.first_name.trim() || null,
        last_name: formData.last_name.trim() || null,
        company_name: formData.company_name.trim() || null,
        phone_raw: formData.phone_raw.trim() || null,
        whatsapp_raw: formData.whatsapp_same_as_phone ? formData.phone_raw.trim() || null : formData.whatsapp_raw.trim() || null,
        whatsapp_same_as_phone: formData.whatsapp_same_as_phone,
        email: formData.email.trim().toLowerCase() || null,
        address: formData.address.trim() || null,
        notes: formData.notes.trim() || null,
        heard_about_us: formData.heard_about_us || null,
        heard_about_us_other_text: formData.heard_about_us === 'Other' ? formData.heard_about_us_other_text.trim() || null : null,
        tags: formData.tags
      };

      await axios.post(`/api/v1/customers/${duplicateWarning.existingCustomer.id}/merge`, payload);
      navigate(`/customers/${duplicateWarning.existingCustomer.id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to merge customer');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/customers" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
          &larr; Back to Customers
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Customer' : 'Add Customer'}
        </h1>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Duplicate Warning */}
      {duplicateWarning && duplicateWarning.isDuplicate && (
        <div className="mb-6 p-4 bg-yellow-100 border border-yellow-400 rounded-lg">
          <h3 className="font-semibold text-yellow-800 mb-2">Possible Duplicate Found</h3>
          <p className="text-yellow-700 mb-2">
            Matched by: <strong>{duplicateWarning.matchedBy}</strong>
          </p>
          <div className="text-sm text-yellow-700 mb-3">
            <p><strong>Existing Customer:</strong> {duplicateWarning.existingCustomer?.displayName}</p>
            {duplicateWarning.existingCustomer?.phone_e164 && (
              <p>Phone: {duplicateWarning.existingCustomer.phone_e164}</p>
            )}
            {duplicateWarning.existingCustomer?.email && (
              <p>Email: {duplicateWarning.existingCustomer.email}</p>
            )}
          </div>
          <div className="flex gap-3">
            <Link
              to={`/customers/${duplicateWarning.existingCustomer?.id}`}
              className="btn btn-secondary text-sm"
            >
              View Existing
            </Link>
            <button
              onClick={handleMerge}
              disabled={saving}
              className="btn btn-primary text-sm"
            >
              {saving ? 'Merging...' : 'Merge Into Existing'}
            </button>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="card">
        {/* Identity Section */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">Identity</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name {!formData.company_name && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  validationErrors.first_name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {validationErrors.first_name && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.first_name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name
              </label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="If company, first name is optional"
              />
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">Contact</h2>
          <div className="space-y-4">
            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                name="phone_raw"
                value={formData.phone_raw}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  validationErrors.phone_raw ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., 024 123 4567 or +233 24 123 4567"
              />
              {phonePreview.e164 && (
                <p className="text-green-600 text-xs mt-1">
                  Will be saved as: {phonePreview.e164} ({phonePreview.formatted})
                </p>
              )}
              {formData.phone_raw && !phonePreview.isValid && !phonePreview.e164 && !phonePreview.error && (
                <p className="text-yellow-600 text-xs mt-1">
                  Checking format...
                </p>
              )}
              {formData.phone_raw && phonePreview.error && !validationErrors.phone_raw && (
                <p className="text-orange-600 text-xs mt-1">
                  {phonePreview.error}
                </p>
              )}
              {validationErrors.phone_raw && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.phone_raw}</p>
              )}
            </div>

            {/* WhatsApp */}
            <div>
              <label className="flex items-center mb-2">
                <input
                  type="checkbox"
                  name="whatsapp_same_as_phone"
                  checked={formData.whatsapp_same_as_phone}
                  onChange={handleChange}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">WhatsApp same as phone</span>
              </label>
              {!formData.whatsapp_same_as_phone && (
                <>
                  <input
                    type="text"
                    name="whatsapp_raw"
                    value={formData.whatsapp_raw}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      validationErrors.whatsapp_raw ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="e.g., 024 123 4567 or +233 24 123 4567"
                  />
                  {whatsappPreview.e164 && (
                    <p className="text-green-600 text-xs mt-1">
                      Will be saved as: {whatsappPreview.e164}
                    </p>
                  )}
                  {validationErrors.whatsapp_raw && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.whatsapp_raw}</p>
                  )}
                </>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  validationErrors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="customer@example.com"
              />
              {validationErrors.email && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.email}</p>
              )}
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* CRM Section */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">CRM Details</h2>
          <div className="space-y-4">
            {/* Heard About Us */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                How did they hear about us?
              </label>
              <select
                name="heard_about_us"
                value={formData.heard_about_us}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                {options.heardAboutUsOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {formData.heard_about_us === 'Other' && (
                <input
                  type="text"
                  name="heard_about_us_other_text"
                  value={formData.heard_about_us_other_text}
                  onChange={handleChange}
                  placeholder="Please specify..."
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 text-blue-600 hover:text-blue-800"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={handleTagKeyPress}
                  placeholder="Add a tag..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  list="existing-tags"
                />
                <datalist id="existing-tags">
                  {options.existingTags.filter(t => !formData.tags.includes(t)).map(tag => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="btn btn-secondary"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Internal notes about this customer..."
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Link to="/customers" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || checkingDuplicate}
            className="btn btn-primary"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Customer'}
          </button>
        </div>
      </form>
    </div>
  );
}
