'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Check, ChevronDown, ChevronRight, Plus } from 'lucide-react'

// Define the hierarchical geography structure based on the reference image
interface RegionHierarchy {
  name: string
  children?: RegionHierarchy[]
}

// Standard geography hierarchy mapping
const REGION_HIERARCHY: RegionHierarchy[] = [
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

interface HierarchicalRegionSelectProps {
  availableSegments: string[]  // The segments from the data (geographies in this case)
  onSelect: (segment: string) => void
  placeholder?: string
}

export function HierarchicalRegionSelect({
  availableSegments,
  onSelect,
  placeholder = 'Select Level 1...'
}: HierarchicalRegionSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set())
  const [selectedRegion, setSelectedRegion] = useState<string>('')
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

  // Build hierarchical geography structure from available segments
  const { hierarchicalRegions, unmatchedRegions } = useMemo(() => {
    if (!availableSegments || availableSegments.length === 0) {
      return { hierarchicalRegions: [], unmatchedRegions: [] }
    }

    const matchedGeos = new Set<string>()

    // Build hierarchy with actual geography names from data
    const buildHierarchy = (template: RegionHierarchy[]): RegionHierarchy[] => {
      return template.map(region => {
        // Find matching region name in data
        const matchedRegionName = findMatchingGeo(region.name, availableSegments)

        // Build children
        const matchedChildren: RegionHierarchy[] = []
        if (region.children) {
          region.children.forEach(child => {
            const matchedChildName = findMatchingGeo(child.name, availableSegments)
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
      }).filter((region: any) => region.existsInData) as RegionHierarchy[]
    }

    const hierarchical = buildHierarchy(REGION_HIERARCHY)

    // Find any geographies not matched to the hierarchy
    const unmatched = availableSegments.filter(geo => !matchedGeos.has(geo))

    return {
      hierarchicalRegions: hierarchical,
      unmatchedRegions: unmatched
    }
  }, [availableSegments])

  const toggleRegionExpand = (regionName: string, e: React.MouseEvent) => {
    e.stopPropagation()
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

  const handleSelect = (segment: string) => {
    setSelectedRegion(segment)
    setIsOpen(false)
    onSelect(segment)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-left bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
      >
        <span className="text-sm text-black">
          {selectedRegion || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-80 overflow-hidden" style={{ minWidth: '280px' }}>
          {/* Hierarchical Region List */}
          <div className="overflow-y-auto max-h-72">
            {hierarchicalRegions.length === 0 && unmatchedRegions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-black text-center">
                No regions available
              </div>
            ) : (
              <>
                {/* Hierarchical regions */}
                {hierarchicalRegions.map((region) => (
                  <div key={region.name} className="border-b border-gray-100 last:border-b-0">
                    {/* Region header */}
                    <div
                      className="flex items-center px-3 py-2 bg-gray-50 hover:bg-gray-100 cursor-pointer"
                      onClick={(e) => {
                        if (region.children && region.children.length > 0) {
                          toggleRegionExpand(region.name, e)
                        } else if (availableSegments.includes(region.name)) {
                          handleSelect(region.name)
                        }
                      }}
                    >
                      {/* Expand/Collapse icon */}
                      {region.children && region.children.length > 0 ? (
                        <span
                          className="mr-2 text-gray-500"
                          onClick={(e) => toggleRegionExpand(region.name, e)}
                        >
                          {expandedRegions.has(region.name) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                      ) : (
                        <span className="mr-2 w-4" />
                      )}

                      <span className="text-sm font-medium text-black flex-1">{region.name}</span>

                      {/* Select button for regions that exist in data */}
                      {availableSegments.includes(region.name) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSelect(region.name)
                          }}
                          className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          Select
                        </button>
                      )}
                    </div>

                    {/* Children (countries) */}
                    {region.children && region.children.length > 0 && expandedRegions.has(region.name) && (
                      <div className="bg-white">
                        {region.children.map((child) => (
                          <div
                            key={child.name}
                            className="flex items-center pl-10 pr-3 py-2 hover:bg-blue-50 cursor-pointer border-t border-gray-50"
                            onClick={() => handleSelect(child.name)}
                          >
                            <span className="text-sm text-gray-700 flex-1">{child.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSelect(child.name)
                              }}
                              className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              Select
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Unmatched regions (not in hierarchy) */}
                {unmatchedRegions.length > 0 && (
                  <div className="border-t border-gray-200">
                    <div className="px-3 py-2 bg-gray-100 text-xs font-medium text-gray-600">
                      Other Regions
                    </div>
                    {unmatchedRegions.map((region) => (
                      <div
                        key={region}
                        className="flex items-center px-3 py-2 hover:bg-blue-50 cursor-pointer border-t border-gray-50"
                        onClick={() => handleSelect(region)}
                      >
                        <span className="mr-2 w-4" />
                        <span className="text-sm text-black flex-1">{region}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSelect(region)
                          }}
                          className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          Select
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
