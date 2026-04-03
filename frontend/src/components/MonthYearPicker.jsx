import { useState, useRef, useEffect } from 'react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function MonthYearPicker({ value, onChange, placeholder = 'Pick month...' }) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Parse current value to highlight selected month
  const selectedMonth = value ? new Date(value + '-01').getMonth() : null
  const selectedYear = value ? new Date(value + '-01').getFullYear() : null

  const handleSelect = (monthIdx) => {
    const mm = String(monthIdx + 1).padStart(2, '0')
    onChange(`${year}-${mm}`)
    setOpen(false)
  }

  const handleClear = (e) => {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  const label = value
    ? `${MONTHS[selectedMonth]} ${selectedYear}`
    : placeholder

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="border rounded-lg px-3 py-2 text-sm w-full text-left flex items-center justify-between gap-2 bg-white hover:border-gray-400 transition-colors"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
        <span className="flex items-center gap-1">
          {value && (
            <span onClick={handleClear} className="text-gray-400 hover:text-gray-600 cursor-pointer text-xs">x</span>
          )}
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-white border rounded-xl shadow-lg p-3 w-64">
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setYear(y => y - 1)}
              className="p-1 hover:bg-gray-100 rounded text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-700">{year}</span>
            <button type="button" onClick={() => setYear(y => y + 1)}
              className="p-1 hover:bg-gray-100 rounded text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((m, i) => {
              const isSelected = selectedMonth === i && selectedYear === year
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelect(i)}
                  className={`px-2 py-2 text-xs font-medium rounded-lg transition-colors
                    ${isSelected
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
