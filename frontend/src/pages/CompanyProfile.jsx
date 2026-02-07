import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

export default function CompanyProfile() {
  const [profile, setProfile] = useState({
    companyName: '',
    tagline: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    regionState: '',
    country: 'Ghana',
    phone: '',
    whatsapp: '',
    email: '',
    website: '',
    taxIdOrTin: '',
    notesFooter: ''
  });

  const [logoUrl, setLogoUrl] = useState(null);
  const [hasLogo, setHasLogo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isNew, setIsNew] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/v1/company-profile');
      const data = response.data.data;

      if (data.profile) {
        setProfile({
          companyName: data.profile.companyName || '',
          tagline: data.profile.tagline || '',
          addressLine1: data.profile.addressLine1 || '',
          addressLine2: data.profile.addressLine2 || '',
          city: data.profile.city || '',
          regionState: data.profile.regionState || '',
          country: data.profile.country || 'Ghana',
          phone: data.profile.phone || '',
          whatsapp: data.profile.whatsapp || '',
          email: data.profile.email || '',
          website: data.profile.website || '',
          taxIdOrTin: data.profile.taxIdOrTin || '',
          notesFooter: data.profile.notesFooter || ''
        });
        setLogoUrl(data.profile.logoUrl);
        setHasLogo(data.profile.hasLogo);
      }

      setIsNew(data.isNew);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load company profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!profile.companyName.trim()) {
      setError('Company name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await axios.put('/api/v1/company-profile', profile);

      if (response.data.success) {
        setSuccess('Company profile saved successfully');
        setIsNew(false);

        // Update logo info if returned
        if (response.data.data?.profile) {
          setLogoUrl(response.data.data.profile.logoUrl);
          setHasLogo(response.data.data.profile.hasLogo);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save company profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoClick = () => {
    fileInputRef.current?.click();
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only PNG, JPG, and SVG images are allowed');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Logo file must be less than 5MB');
      return;
    }

    try {
      setUploadingLogo(true);
      setError(null);

      const formData = new FormData();
      formData.append('logo', file);

      const response = await axios.post('/api/v1/company-profile/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        setLogoUrl(response.data.data.logoUrl);
        setHasLogo(true);
        setSuccess('Logo uploaded successfully');
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteLogo = async () => {
    if (!window.confirm('Are you sure you want to remove the logo?')) {
      return;
    }

    try {
      setUploadingLogo(true);
      setError(null);

      const response = await axios.delete('/api/v1/company-profile/logo');

      if (response.data.success) {
        setLogoUrl(null);
        setHasLogo(false);
        setSuccess('Logo removed successfully');
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to remove logo');
    } finally {
      setUploadingLogo(false);
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
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Company Profile</h1>
        <p className="mt-1 text-gray-500">
          Configure your company information for branded invoices and documents
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Logo Section */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Company Logo</h2>

            <div className="flex flex-col items-center">
              {/* Logo Preview */}
              <div
                className="w-40 h-40 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-primary-500 transition-colors overflow-hidden bg-gray-50"
                onClick={handleLogoClick}
              >
                {hasLogo && logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Company Logo"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-4">
                    <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-500">Click to upload</p>
                  </div>
                )}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                onChange={handleLogoChange}
                className="hidden"
              />

              {/* Logo Actions */}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleLogoClick}
                  disabled={uploadingLogo || isNew}
                  className="btn btn-secondary text-sm"
                >
                  {uploadingLogo ? 'Uploading...' : hasLogo ? 'Replace Logo' : 'Upload Logo'}
                </button>

                {hasLogo && (
                  <button
                    type="button"
                    onClick={handleDeleteLogo}
                    disabled={uploadingLogo}
                    className="btn btn-secondary text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>

              <p className="mt-3 text-xs text-gray-500 text-center">
                PNG, JPG, or SVG. Max 5MB.
                {isNew && <span className="block text-yellow-600 mt-1">Save profile first to enable logo upload</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="card">
            <h2 className="text-lg font-semibold mb-4">Business Information</h2>

            <div className="space-y-4">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="companyName"
                  value={profile.companyName}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Your Company Name"
                  required
                />
              </div>

              {/* Tagline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  name="tagline"
                  value={profile.tagline}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Your company tagline or slogan"
                />
              </div>

              <hr className="my-4" />
              <h3 className="font-medium text-gray-900">Address</h3>

              {/* Address */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    name="addressLine1"
                    value={profile.addressLine1}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Street address"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address Line 2
                  </label>
                  <input
                    type="text"
                    name="addressLine2"
                    value={profile.addressLine2}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Building, suite, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={profile.city}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="City"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Region/State
                  </label>
                  <input
                    type="text"
                    name="regionState"
                    value={profile.regionState}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Region or State"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    name="country"
                    value={profile.country}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Country"
                  />
                </div>
              </div>

              <hr className="my-4" />
              <h3 className="font-medium text-gray-900">Contact Information</h3>

              {/* Contact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={profile.phone}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="+233 XX XXX XXXX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    WhatsApp
                  </label>
                  <input
                    type="tel"
                    name="whatsapp"
                    value={profile.whatsapp}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="+233 XX XXX XXXX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={profile.email}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="info@company.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    name="website"
                    value={profile.website}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="https://www.company.com"
                  />
                </div>
              </div>

              <hr className="my-4" />
              <h3 className="font-medium text-gray-900">Additional Details</h3>

              {/* Tax ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tax ID / TIN
                </label>
                <input
                  type="text"
                  name="taxIdOrTin"
                  value={profile.taxIdOrTin}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Tax Identification Number"
                />
              </div>

              {/* Invoice Footer Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Footer Notes
                </label>
                <textarea
                  name="notesFooter"
                  value={profile.notesFooter}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Thank you for your business! Payment is due within 30 days."
                />
                <p className="mt-1 text-xs text-gray-500">
                  This text will appear at the bottom of generated invoices
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
