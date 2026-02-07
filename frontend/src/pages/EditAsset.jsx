import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function EditAsset() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [taxonomy, setTaxonomy] = useState(null);
  const [otherCategory, setOtherCategory] = useState('');
  const [otherAssetType, setOtherAssetType] = useState('');
  const [formData, setFormData] = useState({
    category: '',
    asset_type: '',
    serial_number: '',
    make: '',
    model: '',
    status: '',
    condition: '',
    quantity: 1,
    product_category: '',
    subcategory: '',
    specs: '',
    ram_gb: '',
    storage_gb: '',
    storage_type: '',
    cpu: '',
    gpu: '',
    screen_size_inches: '',
    resolution: '',
    battery_health_percent: '',
    major_characteristics: '',
    cost_amount: '',
    cost_currency: 'USD',
    price_amount: '',
    price_currency: 'GHS'
  });

  // Serial number is required only when quantity = 1
  const isSerialRequired = parseInt(formData.quantity) === 1;

  // Get asset types for selected category
  const assetTypesForCategory = taxonomy?.taxonomy?.[formData.category] || [];

  useEffect(() => {
    // Fetch taxonomy and asset in parallel
    const fetchData = async () => {
      try {
        setLoading(true);
        const [taxonomyRes, assetRes] = await Promise.all([
          axios.get('/api/v1/assets/taxonomy'),
          axios.get(`/api/v1/assets/${id}`)
        ]);

        setTaxonomy(taxonomyRes.data.data);
        const asset = assetRes.data.data.asset;

        // Populate form with existing data
        setFormData({
          category: asset.category || '',
          asset_type: asset.asset_type || '',
          serial_number: asset.serial_number || '',
          make: asset.make || '',
          model: asset.model || '',
          status: asset.status || 'In Stock',
          condition: asset.condition || '',
          quantity: asset.quantity || 1,
          product_category: asset.product_category || '',
          subcategory: asset.subcategory || '',
          specs: asset.specs || '',
          ram_gb: asset.ram_gb || '',
          storage_gb: asset.storage_gb || '',
          storage_type: asset.storage_type || '',
          cpu: asset.cpu || '',
          gpu: asset.gpu || '',
          screen_size_inches: asset.screen_size_inches || '',
          resolution: asset.resolution || '',
          battery_health_percent: asset.battery_health_percent || '',
          major_characteristics: asset.major_characteristics ? asset.major_characteristics.join(', ') : '',
          cost_amount: asset.cost_amount || '',
          cost_currency: asset.cost_currency || 'USD',
          price_amount: asset.price_amount || '',
          price_currency: asset.price_currency || 'GHS'
        });

        setError(null);
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // When category changes, reset asset_type to first valid option
    if (name === 'category' && taxonomy) {
      if (value === '__other__') {
        setFormData(prev => ({ ...prev, category: '__other__', asset_type: '__other__' }));
        setOtherAssetType('');
      } else {
        setOtherCategory('');
        const assetTypes = taxonomy.taxonomy[value] || [];
        setFormData(prev => ({
          ...prev,
          category: value,
          asset_type: assetTypes[0] || ''
        }));
      }
    } else if (name === 'asset_type') {
      if (value !== '__other__') {
        setOtherAssetType('');
      }
      setFormData(prev => ({ ...prev, [name]: value }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Resolve __other__ values first
      let resolvedCategory = formData.category;
      let resolvedAssetType = formData.asset_type;

      if (resolvedCategory === '__other__') {
        const text = otherCategory.trim();
        if (!text) { setError('Please enter a custom category'); setSubmitting(false); return; }
        const res = await axios.post('/api/v1/assets/taxonomy/custom', { value_type: 'category', value: text });
        resolvedCategory = res.data.data.value;
      }

      if (resolvedAssetType === '__other__') {
        const text = otherAssetType.trim();
        if (!text) { setError('Please enter a custom asset type'); setSubmitting(false); return; }
        const res = await axios.post('/api/v1/assets/taxonomy/custom', {
          value_type: 'asset_type',
          value: text,
          parent_category: resolvedCategory
        });
        resolvedAssetType = res.data.data.value;
      }

      // Transform form data - convert empty strings to null for optional fields
      const payload = {
        category: resolvedCategory,
        asset_type: resolvedAssetType,
        serial_number: formData.serial_number,
        make: formData.make,
        model: formData.model,
        status: formData.status || 'In Stock',
        condition: formData.condition || null,
        quantity: parseInt(formData.quantity) || 1,
        product_category: formData.product_category || null,
        subcategory: formData.subcategory || null,
        specs: formData.specs || null,
        ram_gb: formData.ram_gb ? parseInt(formData.ram_gb) : null,
        storage_gb: formData.storage_gb ? parseInt(formData.storage_gb) : null,
        storage_type: formData.storage_type || null,
        cpu: formData.cpu || null,
        gpu: formData.gpu || null,
        screen_size_inches: formData.screen_size_inches ? parseFloat(formData.screen_size_inches) : null,
        resolution: formData.resolution || null,
        battery_health_percent: formData.battery_health_percent ? parseInt(formData.battery_health_percent) : null,
        major_characteristics: formData.major_characteristics
          ? formData.major_characteristics.split(',').map(c => c.trim()).filter(c => c)
          : [],
        cost_amount: formData.cost_amount ? parseFloat(formData.cost_amount) : null,
        cost_currency: formData.cost_currency || 'USD',
        price_amount: formData.price_amount ? parseFloat(formData.price_amount) : null,
        price_currency: formData.price_currency || 'GHS'
      };

      await axios.put(`/api/v1/assets/${id}`, payload);

      // Success - navigate to asset detail
      navigate(`/inventory/${id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update asset');
      if (err.response?.data?.error?.details) {
        const details = err.response.data.error.details.map(d => d.msg).join(', ');
        setError(`Validation error: ${details}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate(`/inventory/${id}`)}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
        >
          ← Back to Asset Details
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Edit Asset</h1>
        <p className="text-gray-600 mt-2">
          Update asset information
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Category</option>
                {taxonomy?.categories?.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="__other__">Other...</option>
              </select>
              {formData.category === '__other__' && (
                <div className="mt-2">
                  <input
                    type="text"
                    maxLength={60}
                    value={otherCategory}
                    onChange={(e) => setOtherCategory(e.target.value)}
                    placeholder="Enter new category"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-green-600 mt-1">New value will be saved for future use</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Asset Type <span className="text-red-500">*</span>
              </label>
              {formData.category === '__other__' ? (
                <div>
                  <input
                    type="text"
                    maxLength={60}
                    value={otherAssetType}
                    onChange={(e) => setOtherAssetType(e.target.value)}
                    placeholder="Enter new asset type"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-green-600 mt-1">New value will be saved for future use</p>
                </div>
              ) : (
                <>
                  <select
                    name="asset_type"
                    value={formData.asset_type}
                    onChange={handleChange}
                    required
                    disabled={!formData.category}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  >
                    <option value="">Select Asset Type</option>
                    {assetTypesForCategory.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                    <option value="__other__">Other...</option>
                  </select>
                  {formData.asset_type === '__other__' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        maxLength={60}
                        value={otherAssetType}
                        onChange={(e) => setOtherAssetType(e.target.value)}
                        placeholder="Enter new asset type"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-green-600 mt-1">New value will be saved for future use</p>
                    </div>
                  )}
                </>
              )}
              {!formData.category && (
                <p className="text-xs text-gray-500 mt-1">Select a category first</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                min="1"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Number of units (min: 1)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Serial Number {isSerialRequired && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                name="serial_number"
                value={formData.serial_number}
                onChange={handleChange}
                required={isSerialRequired}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {!isSerialRequired && (
                <p className="text-xs text-gray-500 mt-1">Optional when quantity {'>'} 1</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Make <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="make"
                value={formData.make}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="model"
                value={formData.model}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="In Stock">In Stock</option>
                <option value="Processing">Processing</option>
                <option value="Reserved">Reserved</option>
                <option value="Sold">Sold</option>
                <option value="In Repair">In Repair</option>
                <option value="Returned">Returned</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condition
              </label>
              <select
                name="condition"
                value={formData.condition}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Condition</option>
                <option value="New">New</option>
                <option value="Open Box">Open Box</option>
                <option value="Renewed">Renewed</option>
                <option value="Used">Used</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Category
              </label>
              <input
                type="text"
                name="product_category"
                value={formData.product_category}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Business Laptops, Gaming"
              />
              <p className="text-xs text-gray-500 mt-1">Optional freeform category</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subcategory
              </label>
              <input
                type="text"
                name="subcategory"
                value={formData.subcategory}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Ultrabook, Entry-level"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Specifications
            </label>
            <textarea
              name="specs"
              value={formData.specs}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Technical Specs */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Technical Specifications</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                RAM (GB)
              </label>
              <input
                type="number"
                name="ram_gb"
                value={formData.ram_gb}
                onChange={handleChange}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Storage (GB)
              </label>
              <input
                type="number"
                name="storage_gb"
                value={formData.storage_gb}
                onChange={handleChange}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Storage Type
              </label>
              <select
                name="storage_type"
                value={formData.storage_type}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Type</option>
                <option value="HDD">HDD</option>
                <option value="SSD">SSD</option>
                <option value="NVMe">NVMe</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Screen Size (inches)
              </label>
              <input
                type="number"
                name="screen_size_inches"
                value={formData.screen_size_inches}
                onChange={handleChange}
                step="0.1"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CPU
              </label>
              <input
                type="text"
                name="cpu"
                value={formData.cpu}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                GPU
              </label>
              <input
                type="text"
                name="gpu"
                value={formData.gpu}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resolution
              </label>
              <input
                type="text"
                name="resolution"
                value={formData.resolution}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Battery Health (%)
              </label>
              <input
                type="number"
                name="battery_health_percent"
                value={formData.battery_health_percent}
                onChange={handleChange}
                min="0"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Major Characteristics
            </label>
            <input
              type="text"
              name="major_characteristics"
              value={formData.major_characteristics}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Comma separated: Touchscreen, Backlit keyboard, Fingerprint"
            />
            <p className="text-xs text-gray-500 mt-1">Separate multiple characteristics with commas</p>
          </div>
        </div>

        {/* Pricing */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cost */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">Cost (Purchase Price)</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    name="cost_amount"
                    value={formData.cost_amount}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Currency
                  </label>
                  <select
                    name="cost_currency"
                    value={formData.cost_currency}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="USD">USD — US Dollar</option>
                    <option value="GHS">GHS — Ghana Cedi</option>
                    <option value="GBP">GBP — British Pound</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">Selling Price</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    name="price_amount"
                    value={formData.price_amount}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Currency
                  </label>
                  <select
                    name="price_currency"
                    value={formData.price_currency}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="USD">USD — US Dollar</option>
                    <option value="GHS">GHS — Ghana Cedi</option>
                    <option value="GBP">GBP — British Pound</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate(`/inventory/${id}`)}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Updating...' : 'Update Asset'}
          </button>
        </div>
      </form>
    </div>
  );
}
