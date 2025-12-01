'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useDashboardStore } from '@/lib/store'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'

// Define the hierarchical geography structure based on the reference image
interface GeographyHierarchy {
  name: string
  children?: GeographyHierarchy[]
}

// Standard geography hierarchy mapping
const GEOGRAPHY_HIERARCHY: GeographyHierarchy[] = [
  {
    name: 'North America',
    children: [
      { name: 'U.S.' },
      { name: 'Canada' }
    ]
  },
  {
    name: 'Europe',
    children: [
      { name: 'U.K.' },
      { name: 'Germany' },
      { name: 'Italy' },
      { name: 'France' },
      { name: 'Spain' },
      { name: 'Russia' }
    ]
  },
  {
    name: 'Rest of Europe',
    children: []
  },
  {
    name: 'Asia Pacific',
    children: [
      { name: 'China' },
      { name: 'India' },
      { name: 'Japan' },
      { name: 'South Korea' },
      { name: 'ASEAN' },
      { name: 'Australia' }
    ]
  },
  {
    name: 'Rest of Asia Pacific',
    children: []
  },
  {
    name: 'Latin America',
    children: [
      { name: 'Brazil' },
      { name: 'Argentina' },
      { name: 'Mexico' }
    ]
  },
  {
    name: 'Rest of Latin America',
    children: []
  },
  {
    name: 'Middle East',
    children: [
      { name: 'GCC' },
      { name: 'Israel' }
    ]
  },
  {
    name: 'Rest of Middle East',
    children: []
  },
  {
    name: 'Africa',
    children: [
      { name: 'North Africa' }
    ]
  }
]

// Helper function to normalize geography names for matching
function normalizeGeoName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
}

// Helper function to find matching geography from data
function findMatchingGeo(geoName: string, allGeographies: string[]): string | null {
  const normalized = normalizeGeoName(geoName)
  return allGeographies.find(geo => normalizeGeoName(geo) === normalized) || null
}

export function GeographyMultiSelect() {
  const { data, filters, updateFilters } = useDashboardStore()
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Build hierarchical geography structure from data
  const { hierarchicalGeographies, unmatchedGeographies, allGeographies } = useMemo(() => {
    if (!data || !data.dimensions?.geographies) {
      return { hierarchicalGeographies: [], unmatchedGeographies: [], allGeographies: [] }
    }

    const allGeos = data.dimensions.geographies.all_geographies || []
    const matchedGeos = new Set<string>()

    // Build hierarchy with actual geography names from data
    const buildHierarchy = (template: GeographyHierarchy[]): GeographyHierarchy[] => {
      return template.map(region => {
        // Find matching region name in data
        const matchedRegionName = findMatchingGeo(region.name, allGeos)

        // Build children
        const matchedChildren: GeographyHierarchy[] = []
        if (region.children) {
          region.children.forEach(child => {
            const matchedChildName = findMatchingGeo(child.name, allGeos)
            if (matchedChildName) {
              matchedGeos.add(matchedChildName)
              matchedChildren.push({ name: matchedChildName })
            }
          })
        }

        // Also check if region itself exists in data
        if (matchedRegionName) {
          matchedGeos.add(matchedRegionName)
        }

        return {
          name: matchedRegionName || region.name,
          children: matchedChildren.length > 0 ? matchedChildren : undefined,
          // Track if this region actually exists in data
          existsInData: !!matchedRegionName || matchedChildren.length > 0
        }
      }).filter((region: any) => region.existsInData) as GeographyHierarchy[]
    }

    const hierarchical = buildHierarchy(GEOGRAPHY_HIERARCHY)

    // Find any geographies not matched to the hierarchy
    const unmatched = allGeos.filter(geo => !matchedGeos.has(geo))

    return {
      hierarchicalGeographies: hierarchical,
      unmatchedGeographies: unmatched,
      allGeographies: allGeos
    }
  }, [data])

  // Filter geographies based on search term
  const filteredHierarchy = useMemo(() => {
    if (!searchTerm) {
      return {
        hierarchy: hierarchicalGeographies,
        unmatched: unmatchedGeographies
      }
    }

    const search = searchTerm.toLowerCase()

    // Filter hierarchy
    const filterHierarchy = (items: GeographyHierarchy[]): GeographyHierarchy[] => {
      return items.map(region => {
        const regionMatches = region.name.toLowerCase().includes(search)
        const matchingChildren = region.children?.filter(child =>
          child.name.toLowerCase().includes(search)
        ) || []

        if (regionMatches || matchingChildren.length > 0) {
          return {
            name: region.name,
            children: regionMatches ? region.children : matchingChildren
          }
        }
        return null
      }).filter(Boolean) as GeographyHierarchy[]
    }

    // Filter unmatched
    const filteredUnmatched = unmatchedGeographies.filter(geo =>
      geo.toLowerCase().includes(search)
    )

    return {
      hierarchy: filterHierarchy(hierarchicalGeographies),
      unmatched: filteredUnmatched
    }
  }, [hierarchicalGeographies, unmatchedGeographies, searchTerm])

  const toggleRegionExpand = (regionName: string) => {
    setExpandedRegions(prev => {
      const next = new Set(prev)
      if (next.has(regionName)) {
        next.delete(regionName)
      } else {
        next.add(regionName)
      }
      return next
    })
  }

  const handleToggle = (geography: string) => {
    const current = filters.geographies
    const updated = current.includes(geography)
      ? current.filter(g => g !== geography)
      : [...current, geography]

    updateFilters({ geographies: updated })
  }

  const handleSelectRegion = (region: GeographyHierarchy) => {
    const current = new Set(filters.geographies)
    const regionGeos: string[] = []

    // Add region itself if it exists in data
    if (allGeographies.includes(region.name)) {
      regionGeos.push(region.name)
    }

    // Add all children
    if (region.children) {
      region.children.forEach(child => {
        if (allGeographies.includes(child.name)) {
          regionGeos.push(child.name)
        }
      })
    }

    // Check if all are selected
    const allSelected = regionGeos.every(geo => current.has(geo))

    if (allSelected) {
      // Deselect all
      regionGeos.forEach(geo => current.delete(geo))
    } else {
      // Select all
      regionGeos.forEach(geo => current.add(geo))
    }

    updateFilters({ geographies: Array.from(current) })
  }

  const isRegionFullySelected = (region: GeographyHierarchy): boolean => {
    const regionGeos: string[] = []
    if (allGeographies.includes(region.name)) {
      regionGeos.push(region.name)
    }
    if (region.children) {
      region.children.forEach(child => {
        if (allGeographies.includes(child.name)) {
          regionGeos.push(child.name)
        }
      })
    }
    return regionGeos.length > 0 && regionGeos.every(geo => filters.geographies.includes(geo))
  }

  const isRegionPartiallySelected = (region: GeographyHierarchy): boolean => {
    const regionGeos: string[] = []
    if (allGeographies.includes(region.name)) {
      regionGeos.push(region.name)
    }
    if (region.children) {
      region.children.forEach(child => {
        if (allGeographies.includes(child.name)) {
          regionGeos.push(child.name)
        }
      })
    }
    const selectedCount = regionGeos.filter(geo => filters.geographies.includes(geo)).length
    return selectedCount > 0 && selectedCount < regionGeos.length
  }

  const handleSelectAll = () => {
    if (!data) return
    updateFilters({
      geographies: data.dimensions.geographies.all_geographies
    })
  }

  const handleClearAll = () => {
    updateFilters({ geographies: [] })
  }

  // Expand all regions when searching
  useEffect(() => {
    if (searchTerm) {
      const allRegionNames = hierarchicalGeographies.map(r => r.name)
      setExpandedRegions(new Set(allRegionNames))
    }
  }, [searchTerm, hierarchicalGeographies])

  if (!data) return null

  const selectedCount = filters.geographies.length

  return (
    <div className="relative" ref={dropdownRef}>

      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 text-left bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
      >
        <span className="text-sm text-black">
          {selectedCount === 0
            ? 'Select Level 1...'
            : `${selectedCount} selected`}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-hidden" style={{ minWidth: '280px' }}>
          {/* Search */}
          <div className="p-3 border-b">
            <input
              type="text"
              placeholder="Search geographies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="px-3 py-2 bg-gray-50 border-b flex gap-2">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              Select All
            </button>
            <button
              onClick={handleClearAll}
              className="px-3 py-1 text-xs bg-gray-100 text-black rounded hover:bg-gray-200"
            >
              Clear All
            </button>
          </div>

          {/* Hierarchical Geography List */}
          <div className="overflow-y-auto max-h-64">
            {filteredHierarchy.hierarchy.length === 0 && filteredHierarchy.unmatched.length === 0 ? (
              <div className="px-3 py-4 text-sm text-black text-center">
                {searchTerm ? 'No geographies found matching your search' : 'No geographies available'}
              </div>
            ) : (
              <>
                {/* Hierarchical regions */}
                {filteredHierarchy.hierarchy.map((region) => (
                  <div key={region.name} className="border-b border-gray-100 last:border-b-0">
                    {/* Region header */}
                    <div
                      className="flex items-center px-3 py-2 bg-gray-50 hover:bg-gray-100 cursor-pointer"
                      onClick={() => region.children && region.children.length > 0 && toggleRegionExpand(region.name)}
                    >
                      {/* Expand/Collapse icon */}
                      {region.children && region.children.length > 0 ? (
                        <span className="mr-2 text-gray-500">
                          {expandedRegions.has(region.name) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                      ) : (
                        <span className="mr-2 w-4" />
                      )}

                      {/* Region checkbox */}
                      <input
                        type="checkbox"
                        checked={isRegionFullySelected(region)}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = isRegionPartiallySelected(region)
                          }
                        }}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleSelectRegion(region)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-black flex-1">{region.name}</span>
                      {isRegionFullySelected(region) && (
                        <Check className="h-4 w-4 text-blue-600" />
                      )}
                    </div>

                    {/* Children (countries) */}
                    {region.children && region.children.length > 0 && expandedRegions.has(region.name) && (
                      <div className="bg-white">
                        {region.children.map((child) => (
                          <label
                            key={child.name}
                            className="flex items-center pl-10 pr-3 py-2 hover:bg-blue-50 cursor-pointer border-t border-gray-50"
                          >
                            <input
                              type="checkbox"
                              checked={filters.geographies.includes(child.name)}
                              onChange={() => handleToggle(child.name)}
                              className="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 flex-1">{child.name}</span>
                            {filters.geographies.includes(child.name) && (
                              <Check className="h-4 w-4 text-blue-600" />
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Unmatched geographies (not in hierarchy) */}
                {filteredHierarchy.unmatched.length > 0 && (
                  <div className="border-t border-gray-200">
                    <div className="px-3 py-2 bg-gray-100 text-xs font-medium text-gray-600">
                      Other Geographies
                    </div>
                    {filteredHierarchy.unmatched.map((geography) => (
                      <label
                        key={geography}
                        className="flex items-center px-3 py-2 hover:bg-blue-50 cursor-pointer border-t border-gray-50"
                      >
                        <span className="mr-2 w-4" />
                        <input
                          type="checkbox"
                          checked={filters.geographies.includes(geography)}
                          onChange={() => handleToggle(geography)}
                          className="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-black flex-1">{geography}</span>
                        {filters.geographies.includes(geography) && (
                          <Check className="h-4 w-4 text-blue-600" />
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Selected Count Badge */}
      {selectedCount > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="text-xs text-black">
            {selectedCount} {selectedCount === 1 ? 'geography' : 'geographies'} selected
          </span>
        </div>
      )}
    </div>
  )
}

