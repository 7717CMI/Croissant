'use client'

import { useEffect, useState, useMemo } from 'react'
import { useDashboardStore } from '@/lib/store'
import { Search, Download, ChevronDown, ChevronUp, X } from 'lucide-react'

interface CrossCustomerData {
  headers: string[]
  rows: Record<string, any>[]
  totalRows: number
}

interface CrossCustomerTableProps {
  height?: number
}

export function CrossCustomerTable({ height = 600 }: CrossCustomerTableProps) {
  const [data, setData] = useState<CrossCustomerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [selectedOpportunityScore, setSelectedOpportunityScore] = useState<string>('all')

  const { setCompetitiveIntelligenceData } = useDashboardStore()

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const response = await fetch('/api/load-cross-customer')

        if (!response.ok) {
          throw new Error('Failed to load cross-customer data')
        }

        const result = await response.json()
        setData(result)

        // Also store in the dashboard store for other components
        setCompetitiveIntelligenceData({
          headers: result.headers,
          rows: result.rows
        })
      } catch (err) {
        console.error('Error loading cross-customer data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [setCompetitiveIntelligenceData])

  // Get unique regions and opportunity scores for filtering
  const filterOptions = useMemo(() => {
    if (!data) return { regions: [], opportunityScores: [] }

    const regions = new Set<string>()
    const opportunityScores = new Set<string>()

    data.rows.forEach(row => {
      if (row['Region'] && row['Region'] !== 'xx') regions.add(row['Region'])
      if (row['Trivi Opportunity Score (High / Medium / Emerging)'] && row['Trivi Opportunity Score (High / Medium / Emerging)'] !== 'xx') {
        opportunityScores.add(row['Trivi Opportunity Score (High / Medium / Emerging)'])
      }
    })

    return {
      regions: Array.from(regions).sort(),
      opportunityScores: Array.from(opportunityScores).sort()
    }
  }, [data])

  // Filter and sort data
  const filteredAndSortedRows = useMemo(() => {
    if (!data) return []

    let filtered = data.rows.filter(row => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const matchesSearch = Object.values(row).some(val =>
          String(val).toLowerCase().includes(searchLower)
        )
        if (!matchesSearch) return false
      }

      // Region filter
      if (selectedRegion !== 'all' && row['Region'] !== selectedRegion) {
        return false
      }

      // Opportunity score filter
      if (selectedOpportunityScore !== 'all' && row['Trivi Opportunity Score (High / Medium / Emerging)'] !== selectedOpportunityScore) {
        return false
      }

      return true
    })

    // Sort
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn] ?? ''
        const bVal = b[sortColumn] ?? ''

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        }

        const comparison = String(aVal).localeCompare(String(bVal))
        return sortDirection === 'asc' ? comparison : -comparison
      })
    }

    return filtered
  }, [data, searchTerm, selectedRegion, selectedOpportunityScore, sortColumn, sortDirection])

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const handleExportCSV = () => {
    if (!data) return

    const csvContent = [
      data.headers.join(','),
      ...filteredAndSortedRows.map(row =>
        data.headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cross-customer-intelligence.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Get cell background color based on column type
  const getCellStyle = (header: string, value: any): string => {
    if (header === 'S.No.') return 'bg-gray-100'
    if (header === 'Company Name') return 'bg-green-50'
    if (header === 'Region') return 'bg-blue-50'
    if (header === 'Country') return 'bg-blue-50'
    if (header.includes('Parent Group')) return 'bg-gray-50'
    if (header.includes('Type of Producer')) return 'bg-orange-50'
    if (header.includes('Croissant Product Focus')) return 'bg-yellow-50'
    if (header.includes('Primary Sales Channels')) return 'bg-amber-50'
    if (header.includes('Export Orientation')) return 'bg-lime-50'
    if (header.includes('Main Production Site')) return 'bg-cyan-50'
    if (header.includes('Estimated Croissant Volume')) return 'bg-teal-50'
    if (header.includes('Volume Tier')) return 'bg-emerald-50'
    if (header.includes('Recent CAPEX')) return 'bg-sky-50'
    if (header.includes('Existing Line')) return 'bg-indigo-50'
    if (header.includes('Switching')) return 'bg-violet-50'
    if (header.includes('Trivi Opportunity Type')) return 'bg-purple-50'
    if (header.includes('Trivi Opportunity Score')) return 'bg-pink-50'
    if (header.includes('Primary Contact')) return 'bg-rose-50'
    if (header.includes('Decision Role')) return 'bg-red-50'
    if (header.includes('Email')) return 'bg-orange-50'
    if (header.includes('Website')) return 'bg-amber-50'
    if (header.includes('Telephone')) return 'bg-yellow-50'
    return 'bg-white'
  }

  // Get header background color
  const getHeaderStyle = (header: string): string => {
    if (header === 'S.No.') return 'bg-gray-300'
    if (header === 'Company Name') return 'bg-green-200'
    if (header === 'Region') return 'bg-blue-200'
    if (header === 'Country') return 'bg-blue-200'
    if (header.includes('Parent Group')) return 'bg-gray-200'
    if (header.includes('Type of Producer')) return 'bg-orange-200'
    if (header.includes('Croissant Product Focus')) return 'bg-yellow-200'
    if (header.includes('Primary Sales Channels')) return 'bg-amber-200'
    if (header.includes('Export Orientation')) return 'bg-lime-200'
    if (header.includes('Main Production Site')) return 'bg-cyan-200'
    if (header.includes('Estimated Croissant Volume')) return 'bg-teal-200'
    if (header.includes('Volume Tier')) return 'bg-emerald-200'
    if (header.includes('Recent CAPEX')) return 'bg-sky-200'
    if (header.includes('Existing Line')) return 'bg-indigo-200'
    if (header.includes('Switching')) return 'bg-violet-200'
    if (header.includes('Trivi Opportunity Type')) return 'bg-purple-200'
    if (header.includes('Trivi Opportunity Score')) return 'bg-pink-200'
    if (header.includes('Primary Contact')) return 'bg-rose-200'
    if (header.includes('Decision Role')) return 'bg-red-200'
    if (header.includes('Email')) return 'bg-orange-200'
    if (header.includes('Website')) return 'bg-amber-200'
    if (header.includes('Telephone')) return 'bg-yellow-200'
    return 'bg-gray-200'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#52B69A] mx-auto mb-4"></div>
          <p className="text-black">Loading cross-customer data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-red-50 rounded-lg">
        <div className="text-center">
          <p className="text-red-600 font-medium">Error loading data</p>
          <p className="text-red-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-black">No cross-customer data available</p>
          <p className="text-sm text-gray-500 mt-1">Please ensure Cros-customer.xlsx is in the project root</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-black">Cross-Customer Intelligence</h3>
          <p className="text-sm text-gray-600">{filteredAndSortedRows.length} of {data.totalRows} customers</p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-3 py-2 bg-[#52B69A] text-white rounded-lg hover:bg-[#34A0A4] transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#52B69A] focus:border-transparent text-black placeholder:text-gray-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
        </div>

        {/* Region Filter */}
        <div className="min-w-[150px]">
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#52B69A] focus:border-transparent bg-white text-black"
          >
            <option value="all">All Regions</option>
            {filterOptions.regions.map(region => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
        </div>

        {/* Opportunity Score Filter */}
        <div className="min-w-[180px]">
          <select
            value={selectedOpportunityScore}
            onChange={(e) => setSelectedOpportunityScore(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#52B69A] focus:border-transparent bg-white text-black"
          >
            <option value="all">All Opportunity Scores</option>
            {filterOptions.opportunityScores.map(score => (
              <option key={score} value={score}>{score}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table with ALL columns */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg" style={{ maxHeight: height }}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              {data.headers.map((header) => (
                <th
                  key={header}
                  onClick={() => handleSort(header)}
                  className={`px-3 py-2 text-left text-xs font-semibold text-black cursor-pointer hover:opacity-80 transition-colors border border-gray-300 min-w-[120px] ${getHeaderStyle(header)}`}
                >
                  <div className="flex items-center gap-1">
                    <span className="whitespace-normal leading-tight" style={{ fontSize: '10px' }}>
                      {header}
                    </span>
                    {sortColumn === header && (
                      sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:opacity-90 transition-colors">
                {data.headers.map((header) => (
                  <td
                    key={header}
                    className={`px-3 py-2 text-xs text-black border border-gray-300 ${getCellStyle(header, row[header])}`}
                  >
                    {row[header] === '' || row[header] === null || row[header] === undefined ? 'xx' : row[header]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#52B69A] to-[#34A0A4] rounded-lg p-4 text-white">
          <div className="text-sm opacity-90">Total Customers</div>
          <div className="text-2xl font-bold">{data.totalRows}</div>
        </div>
        <div className="bg-gradient-to-br from-[#168AAD] to-[#1A759F] rounded-lg p-4 text-white">
          <div className="text-sm opacity-90">Regions Covered</div>
          <div className="text-2xl font-bold">{filterOptions.regions.length}</div>
        </div>
        <div className="bg-gradient-to-br from-[#D9ED92] to-[#B5E48C] rounded-lg p-4 text-black">
          <div className="text-sm opacity-80">High Opportunity</div>
          <div className="text-2xl font-bold">
            {data.rows.filter(r => r['Trivi Opportunity Score (High / Medium / Emerging)'] === 'High').length}
          </div>
        </div>
        <div className="bg-gradient-to-br from-[#184E77] to-[#1E6091] rounded-lg p-4 text-white">
          <div className="text-sm opacity-90">Filtered Results</div>
          <div className="text-2xl font-bold">{filteredAndSortedRows.length}</div>
        </div>
      </div>
    </div>
  )
}

export default CrossCustomerTable
