import type { DataRecord, FilterState, ChartDataPoint, HeatmapCell, ComparisonTableRow } from './types'

/**
 * Automatically determine the appropriate aggregation level based on selected segments
 * This hides the complexity from users - they just select segments, we figure out the level
 */
export function determineAggregationLevel(
  records: DataRecord[],
  selectedSegments: string[],
  segmentType: string
): number | null {
  if (selectedSegments.length === 0) {
    // No segments selected - show leaf level (most granular)
    return null // null means "show all levels, prefer leaf records"
  }

  // Analyze the hierarchy depth of selected segments
  const selectedRecords = records.filter(r => 
    r.segment_type === segmentType && 
    selectedSegments.includes(r.segment)
  )

  if (selectedRecords.length === 0) {
    return null
  }

  // Check if selected segments are all at the same level
  const levels = new Set(selectedRecords.map(r => r.aggregation_level))
  const aggregatedLevels = selectedRecords
    .filter(r => r.is_aggregated)
    .map(r => r.aggregation_level)

  // If all selected segments have aggregated records at the same level, use that
  if (aggregatedLevels.length > 0) {
    const mostCommonLevel = aggregatedLevels.reduce((a, b, _, arr) =>
      arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
    )
    return mostCommonLevel ?? null
  }

  // Otherwise, determine level based on hierarchy depth
  // Find the deepest level that contains all selected segments
  const levelsArray = Array.from(levels).filter((l): l is number => l !== null && l !== undefined)
  const maxDepth = levelsArray.length > 0 ? Math.max(...levelsArray) : 0
  
  // If segments are at different levels, prefer showing leaf records (null)
  // This allows mixing levels in one view
  if (levels.size > 1) {
    return null // Show all levels together
  }

  return maxDepth
}

/**
 * Filter data records based on current filter state
 * Now with automatic aggregation level detection
 */
export function filterData(
  data: DataRecord[],
  filters: FilterState & { advancedSegments?: any[] }
): DataRecord[] {
  // AUTOMATIC LEVEL DETECTION: Determine level based on selected segments
  // Hide aggregation level complexity from users
  let effectiveAggregationLevel = filters.aggregationLevel

  // Special handling for "By Region" segment type - it has a flat structure (no hierarchy)
  const isByRegionSegmentType = filters.segmentType === 'By Region'

  // If aggregationLevel is explicitly set to null or undefined, use automatic detection
  if (effectiveAggregationLevel === null || effectiveAggregationLevel === undefined) {
    const selectedSegments = filters.segments || []
    const advancedSegments = filters.advancedSegments || []

    // Check if any selected segments are from the SAME segment type as the current filter
    // If segments are from a different type, they don't affect the aggregation level for this segment type
    const segmentsFromSameType = advancedSegments.filter(
      (seg: any) => seg.type === filters.segmentType
    )
    const hasSegmentsForCurrentType = segmentsFromSameType.length > 0

    if (hasSegmentsForCurrentType) {
      // User has explicitly selected segments - DON'T use automatic level detection
      // Set to null so we show the actual leaf records (sub-segments) not aggregated parent
      // For example: If user selects "Parenteral", show Intravenous, Intramuscular, Subcutaneous
      // NOT the aggregated "Parenteral" record
      effectiveAggregationLevel = null
      console.log('🔍 filterData: User selected segments, setting effectiveAggregationLevel to null to show sub-segments')
    } else {
      // NO SEGMENTS SELECTED FOR THIS SEGMENT TYPE: Default to showing Level 1 segments only (aggregation_level 2)
      // This ensures we don't show sub-segments when no specific segments are chosen for this type
      // For example: Show Oral, Parenteral, Topical, etc. but NOT Intravenous, Intramuscular, etc.
      effectiveAggregationLevel = 2
      console.log('🔍 filterData: No segments selected for segment type', filters.segmentType, ', defaulting to aggregation_level 2 (Level 1 segments)')
    }
  }
  
  console.log('🔍 filterData called with aggregationLevel:', filters.aggregationLevel, 'effectiveLevel:', effectiveAggregationLevel)
  console.log('🔍 Total records:', data.length)
  if (effectiveAggregationLevel !== null && effectiveAggregationLevel !== undefined) {
    const recordsAtLevel = data.filter(r => r.aggregation_level === effectiveAggregationLevel)
    const leafRecordsAtLevel = data.filter(r => r.is_aggregated === false && r.aggregation_level === effectiveAggregationLevel)
    console.log(`🔍 Records at level ${effectiveAggregationLevel}:`, {
      total: recordsAtLevel.length,
      aggregated: recordsAtLevel.filter(r => r.is_aggregated === true).length,
      leaf: leafRecordsAtLevel.length,
      sample: recordsAtLevel.slice(0, 3).map(r => ({
        geo: r.geography,
        segment: r.segment,
        level: r.aggregation_level,
        isAgg: r.is_aggregated,
        hierarchy: r.segment_hierarchy
      }))
    })
  }
  
  const filtered = data.filter((record) => {
    // 1. Geography filter - must match first
    // Support hierarchical geography matching:
    // - Direct match: record.geography matches selected geography
    // - Parent match: record.parent_geography matches selected geography (e.g., "Europe" matches countries like "Germany")
    let geoMatch = filters.geographies.length === 0

    if (!geoMatch) {
      // Check for direct match
      if (filters.geographies.includes(record.geography)) {
        geoMatch = true
      }
      // Check for parent geography match (e.g., user selected "Europe", record is "Germany" with parent "Europe")
      else if (record.parent_geography && filters.geographies.includes(record.parent_geography)) {
        geoMatch = true
      }
    }

    if (!geoMatch) {
      return false
    }
    
    // 2. Aggregation level filter - CRITICAL: Prevent double-counting
    // Use effectiveAggregationLevel (automatically determined or user-selected)
    if (effectiveAggregationLevel !== undefined && effectiveAggregationLevel !== null) {
      // When a specific level is selected, we need to include records that have data at that level
      const recordLevel = record.aggregation_level

      // SPECIAL CASE: For "By Region" segment type, skip aggregation level filtering
      // "By Region" has a flat structure where each country is a separate record
      // We want to include ALL records regardless of aggregation level
      if (isByRegionSegmentType) {
        // Allow all records for By Region - don't filter by aggregation level
      }
      // For Level 2 (first segment level like Parenteral, Oral, etc.):
      // - Include aggregated records at level 2 (if they exist)
      // - Also include leaf records that have a level_1 hierarchy value (to aggregate later)
      else if (effectiveAggregationLevel === 2) {
        // Include records at level 2 (aggregated parent segments)
        if (recordLevel === 2) {
          // Allow aggregated record at level 2
        } else if (record.segment_hierarchy?.level_1 && record.segment_hierarchy.level_1.trim() !== '') {
          // Include leaf records that have level_1 - they will be aggregated by level_1 in chart preparation
          // But we need to mark them somehow or handle in chart data prep
        } else {
          return false
        }
      } else {
        // For other levels, use strict matching
        if (recordLevel !== effectiveAggregationLevel) {
          // For leaf records, check if their hierarchy has a segment at the selected level
          if (record.is_aggregated === false) {
            const hierarchy = record.segment_hierarchy
            let hasSegmentAtLevel = false

            if (effectiveAggregationLevel === 3 && hierarchy.level_2 && hierarchy.level_2.trim() !== '') {
              hasSegmentAtLevel = true
            } else if (effectiveAggregationLevel === 4 && hierarchy.level_3 && hierarchy.level_3.trim() !== '') {
              hasSegmentAtLevel = true
            } else if (effectiveAggregationLevel === 5 && hierarchy.level_4 && hierarchy.level_4.trim() !== '') {
              hasSegmentAtLevel = true
            } else if (effectiveAggregationLevel === 6 && hierarchy.level_5 && hierarchy.level_5.trim() !== '') {
              hasSegmentAtLevel = true
            }

            if (!hasSegmentAtLevel) {
              return false
            }
          } else {
            return false
          }
        }
      }
    } else {
      // When aggregationLevel is null (showing "All Levels"), prevent double-counting
      // Strategy:
      // - If a PARENT segment is selected (like "Parenteral"), show LEAF records (Intravenous, etc.) NOT the aggregated parent
      // - If a LEAF segment is selected directly, show that leaf record
      // - If no segments selected: Only show leaf records (to avoid double-counting)
      // - EXCEPTION: For "By Region" segment type, include all matching records (flat structure)
      const hasSegmentFilter = (filters.advancedSegments && filters.advancedSegments.length > 0) ||
                               (filters.segments && filters.segments.length > 0)

      if (record.is_aggregated === true) {
        // For "By Region" segment type, don't exclude aggregated records
        // because the structure is flat and we need to show country data
        if (isByRegionSegmentType) {
          // Allow aggregated records for By Region - they represent individual countries
        } else {
          // ALWAYS exclude aggregated records when user has selected segments
          // This ensures we show sub-segments (Intravenous, etc.) NOT the parent (Parenteral)
          // The sub-segments will be shown via the hierarchy matching in the segment filter
          return false
        }
      } else {
        // This is a leaf record
        // If segments are selected and this leaf's parent segment is selected,
        // include the leaf record (the segment filter will check hierarchy matching)
        // (The segment filter already checks hierarchy, so it will match correctly)
      }
    }
    
    // 3. Segment type filter - must match
    const segTypeMatch = record.segment_type === filters.segmentType
    if (!segTypeMatch) {
      return false
    }
    
    // 4. Business type filter - only apply if the record actually has B2B/B2C in its hierarchy
    let businessTypeMatch = true
    const recordBusinessType = record.segment_hierarchy?.level_1
    if (recordBusinessType === 'B2B' || recordBusinessType === 'B2C') {
      businessTypeMatch = recordBusinessType === filters.businessType
    }
    
    if (!businessTypeMatch) {
      return false
    }
    
    // 5. Segment filter - handle both advancedSegments and regular segments
    let segmentMatch = true

    // Check if we're using advancedSegments (multi-type selection)
    if (filters.advancedSegments && filters.advancedSegments.length > 0) {
      // Special case: Level 1 uses '__ALL_SEGMENTS__' marker
      if (effectiveAggregationLevel === 1) {
        // Level 1 represents all segments aggregated - don't filter by individual segments
        segmentMatch = true
      } else {
        // First check: Are there any advancedSegments for THIS segment type?
        const segmentsForThisType = filters.advancedSegments.filter(
          seg => seg.type === record.segment_type
        )

        if (segmentsForThisType.length === 0) {
          // No segments selected for this segment type - include all segments of this type
          segmentMatch = true
        } else {
          // Check if this record matches any of the selected segment+type combinations
          segmentMatch = segmentsForThisType.some(seg => {
            // Direct match - exact segment name
            if (seg.segment === record.segment) {
              console.log('🔍 SEGMENT FILTER: Direct match:', { recordSegment: record.segment, selectedSegment: seg.segment })
              return true
            }

            // For "By Region" segment type, only use direct matching (flat structure, no hierarchy)
            if (isByRegionSegmentType) {
              return false // No hierarchy match needed for By Region
            }

            // ALWAYS check hierarchy for parent segment matching
            // This handles cases like: User selects "Parenteral" but records have segment="Intravenous"
            // We need to include records where "Parenteral" is in their hierarchy
            const hierarchy = record.segment_hierarchy

            // Check if the selected segment is at any level in this record's hierarchy
            // This allows selecting a parent segment to include all its children
            const hierarchyMatch = hierarchy.level_1 === seg.segment ||
                hierarchy.level_2 === seg.segment ||
                hierarchy.level_3 === seg.segment ||
                hierarchy.level_4 === seg.segment ||
                (hierarchy.level_5 && hierarchy.level_5 === seg.segment)

            if (hierarchyMatch) {
              console.log('🔍 SEGMENT FILTER: Hierarchy match:', {
                recordSegment: record.segment,
                selectedSegment: seg.segment,
                level_1: hierarchy.level_1,
                level_2: hierarchy.level_2,
                is_aggregated: record.is_aggregated,
                aggregation_level: record.aggregation_level
              })
              return true
            }

            return false
          })
        }
      }
    } else {
      // Regular segment filter (single-type selection)
      if (effectiveAggregationLevel === 1) {
        // Level 1 represents all segments aggregated - don't filter by individual segments
        segmentMatch = true
      } else if (filters.segments.length === 0) {
        // No segments selected - include all
        segmentMatch = true
      } else {
        // Check if any selected segment matches
        segmentMatch = filters.segments.some(selectedSegment => {
          // Direct match
          if (selectedSegment === record.segment) {
            return true
          }

          // ALWAYS check hierarchy for parent segment matching
          // This handles cases like: User selects "Parenteral" but records have segment="Intravenous"
          const hierarchy = record.segment_hierarchy
          // Check if the selected segment is at any level in this record's hierarchy
          return (
            hierarchy.level_1 === selectedSegment ||
            hierarchy.level_2 === selectedSegment ||
            hierarchy.level_3 === selectedSegment ||
            hierarchy.level_4 === selectedSegment ||
            (hierarchy.level_5 && hierarchy.level_5 === selectedSegment)
          )
        })
      }
    }

    return segmentMatch
  })
  
  // Enhanced debug logging
  if (typeof window !== 'undefined') {
    const sampleRecord = data[0]
    if (sampleRecord) {
      const geoMatch = filters.geographies.length === 0 || filters.geographies.includes(sampleRecord.geography)
      const segTypeMatch = sampleRecord.segment_type === filters.segmentType
      const levelMatch = effectiveAggregationLevel === null || sampleRecord.aggregation_level === effectiveAggregationLevel
      
      // Check segment match
      let segmentMatchCheck = true
      if (filters.advancedSegments && filters.advancedSegments.length > 0) {
        if (effectiveAggregationLevel === 1) {
          segmentMatchCheck = true
        } else {
          segmentMatchCheck = filters.advancedSegments.some(seg => 
            seg.type === sampleRecord.segment_type && seg.segment === sampleRecord.segment
          )
        }
      } else {
        if (effectiveAggregationLevel === 1) {
          segmentMatchCheck = true
        } else {
          segmentMatchCheck = filters.segments.length === 0 || filters.segments.includes(sampleRecord.segment)
        }
      }
      
      console.log('🔍 Filter Debug:', {
        totalRecords: data.length,
        filteredRecords: filtered.length,
        filters: {
          geographies: filters.geographies,
          segments: filters.segments,
          segmentType: filters.segmentType,
          aggregationLevel: filters.aggregationLevel,
          advancedSegments: filters.advancedSegments?.map(s => ({ type: s.type, segment: s.segment }))
        },
        sampleRecord: {
          geography: sampleRecord.geography,
          segment: sampleRecord.segment,
          segment_type: sampleRecord.segment_type,
          aggregation_level: sampleRecord.aggregation_level,
          is_aggregated: sampleRecord.is_aggregated
        },
        sampleRecordMatches: {
          geoMatch,
          segTypeMatch,
          levelMatch,
          segmentMatch: segmentMatchCheck
        },
        // Show records at selected level
        recordsAtSelectedLevel: effectiveAggregationLevel !== null 
          ? data
              .filter(r => {
                // First check aggregation level
                if (r.aggregation_level !== effectiveAggregationLevel) {
                  return false
                }
                // Then check segment type
                if (r.segment_type !== filters.segmentType) {
                  return false
                }
                // Then check geography if selected
                if (filters.geographies.length > 0 && !filters.geographies.includes(r.geography)) {
                  return false
                }
                return true
              })
              .slice(0, 10)
              .map(r => ({
                geography: r.geography,
                segment: r.segment,
                segment_type: r.segment_type,
                aggregation_level: r.aggregation_level
              }))
          : [],
        // Show records matching geography and segment type
        recordsMatchingGeoAndType: data
          .filter(r => 
            (filters.geographies.length === 0 || filters.geographies.includes(r.geography)) &&
            r.segment_type === filters.segmentType
          )
          .slice(0, 10)
          .map(r => ({
            geography: r.geography,
            segment: r.segment,
            aggregation_level: r.aggregation_level
          }))
      })
    }
    
    // Additional debug: Log first few records that match aggregation level
    if (effectiveAggregationLevel !== null) {
      const matchingLevelRecords = data.filter(r => 
        r.aggregation_level === effectiveAggregationLevel &&
        r.segment_type === filters.segmentType &&
        (filters.geographies.length === 0 || filters.geographies.includes(r.geography))
      ).slice(0, 5)
      
      console.log('🔍 Records at selected level:', {
        level: effectiveAggregationLevel,
        count: matchingLevelRecords.length,
        samples: matchingLevelRecords.map(r => ({
          geo: r.geography,
          segment: r.segment,
          segType: r.segment_type,
          level: r.aggregation_level
        })),
        selectedSegments: filters.advancedSegments?.map(s => s.segment) || filters.segments
      })
    }
    
    // Enhanced debug for Level 1
    if (effectiveAggregationLevel === 1) {
      console.log('🔍 Level 1 Filter Debug:', {
        totalRecords: data.length,
        filteredRecords: filtered.length,
        filters: {
          geographies: filters.geographies,
          segmentType: filters.segmentType,
          aggregationLevel: effectiveAggregationLevel
        },
        filteredRecordsDetails: filtered.slice(0, 5).map(r => ({
          geo: r.geography,
          segment: r.segment,
          level: r.aggregation_level,
          isAggregated: r.is_aggregated
        })),
        allLevel1Records: data.filter(r => r.aggregation_level === 1).length,
        level1WithCorrectSegmentType: data.filter(r => 
          r.aggregation_level === 1 && r.segment_type === filters.segmentType
        ).length
      })
    }
  }
  
  return filtered
}

/**
 * Prepare data for grouped bar chart (Recharts format) with stacking support
 */
export function prepareGroupedBarData(
  records: DataRecord[],
  filters: FilterState & { advancedSegments?: any[] }
): ChartDataPoint[] {
  const { yearRange, viewMode, geographies, segments, aggregationLevel } = filters
  const [startYear, endYear] = yearRange

  // Special handling for "By Region" segment type - flat structure
  const isByRegionSegmentType = filters.segmentType === 'By Region'

  // Get selected segments for aggregation
  const advancedSegments = filters.advancedSegments || []
  const selectedSegmentNames = advancedSegments
    .filter((seg: any) => seg.type === filters.segmentType)
    .map((seg: any) => seg.segment)

  // Determine effective aggregation level (same logic as filterData)
  // This ensures chart data preparation uses the same level detection
  let effectiveAggregationLevel = aggregationLevel

  // IMPORTANT: When user has EXPLICITLY selected segments (via Add Segment button),
  // we should NOT apply automatic Level 2 aggregation - we want to show the sub-segments individually
  const hasUserSelectedSegments = selectedSegmentNames.length > 0

  if (effectiveAggregationLevel === null || effectiveAggregationLevel === undefined) {
    const segmentsFromSameType = advancedSegments.filter(
      (seg: any) => seg.type === filters.segmentType
    )
    const hasSegmentsForCurrentType = segmentsFromSameType.length > 0

    if (!hasSegmentsForCurrentType) {
      // No segments selected for this segment type - default to Level 2 (show parent segments)
      effectiveAggregationLevel = 2
    } else {
      // User selected specific segments - don't force Level 2 aggregation
      // This allows showing sub-segments when a parent is selected
      effectiveAggregationLevel = null
    }
  }

  // For "By Region", always use null aggregation level to show individual countries
  if (isByRegionSegmentType && hasUserSelectedSegments) {
    effectiveAggregationLevel = null
  }

  // Generate year range
  const years: number[] = []
  for (let year = startYear; year <= endYear; year++) {
    years.push(year)
  }

  // Special handling for Level 1: Show total aggregation, not individual segments
  // When Level 1 is selected, all records should have segment === '__ALL_SEGMENTS__'
  // We should group by geography (or show a single total) instead of by segment
  const isLevel1 = effectiveAggregationLevel === 1

  // Special handling for Level 2: Aggregate by Level 1 segment (e.g., Parenteral, Oral, Topical)
  // This groups sub-segments under their parent segment
  const isLevel2 = effectiveAggregationLevel === 2

  // Check if user selected a parent segment (like "Parenteral")
  // If so, we need to aggregate all child records under that parent
  const shouldAggregateBySelectedSegment = selectedSegmentNames.length > 0 && viewMode === 'segment-mode'

  // Determine if we need stacked bars
  const needsStacking = (viewMode === 'segment-mode' && geographies.length > 1) ||
                        (viewMode === 'geography-mode' && segments.length > 1)
  
  // Transform into Recharts format
  return years.map(year => {
    const dataPoint: ChartDataPoint = { year }

    // Special case: "By Region" segment type - show each country as separate series
    if (isByRegionSegmentType && hasUserSelectedSegments) {
      const aggregatedData: Record<string, number> = {}

      records.forEach(record => {
        // For By Region, use segment name (which is the country name like "Germany", "Canada")
        const key = record.segment

        if (!aggregatedData[key]) {
          aggregatedData[key] = 0
        }
        aggregatedData[key] += record.time_series[year] || 0
      })

      Object.entries(aggregatedData).forEach(([key, value]) => {
        dataPoint[key] = value
      })

      return dataPoint
    }

    // Special case: Level 1 aggregation
    if (isLevel1) {
      // For Level 1, group by geography (or show single total)
      // All records have segment === '__ALL_SEGMENTS__', so grouping by segment makes no sense
      const aggregatedData: Record<string, number> = {}

      records.forEach(record => {
        // Group by geography for Level 1
        const key = record.geography
        if (!aggregatedData[key]) {
          aggregatedData[key] = 0
        }
        aggregatedData[key] += record.time_series[year] || 0
      })

      Object.entries(aggregatedData).forEach(([key, value]) => {
        dataPoint[key] = value
      })

      return dataPoint
    }

    // Special case: Level 2 aggregation - aggregate by Level 1 segment (e.g., Parenteral, Oral)
    // This ensures we show parent segments, not sub-segments
    // BUT: Skip this when user has explicitly selected segments - show sub-segments individually
    if (isLevel2 && !hasUserSelectedSegments) {
      const aggregatedData: Record<string, number> = {}

      // Build a child-to-parent mapping from all records
      // This maps sub-segments to their parent (e.g., "Intravenous" -> "Parenteral")
      const childToParentMap = new Map<string, string>()

      // First pass: identify parent-child relationships from the segment_hierarchy
      // For sub-segments like Intravenous, level_1 should be the parent (Parenteral)
      // But we need to verify this by checking which segments have children
      const segmentsWithChildren = new Set<string>()
      const allSegments = new Set<string>()

      records.forEach(record => {
        const segment = record.segment
        allSegments.add(segment)

        // Check segment_hierarchy - level_1 is the first segment in the path
        // level_2 would be the second segment (sub-segment)
        const level1 = record.segment_hierarchy?.level_1
        const level2 = record.segment_hierarchy?.level_2

        // If this record has both level_1 and level_2, then level_1 is a parent
        if (level1 && level2 && level1.trim() !== '' && level2.trim() !== '') {
          segmentsWithChildren.add(level1)
          // Map the current segment to its level_1 parent if it's different
          if (segment !== level1) {
            childToParentMap.set(segment, level1)
          }
        }
      })

      // Debug logging for Level 2 aggregation
      if (year === years[0]) {
        console.log('🔄 Level 2 Aggregation Debug:', {
          recordCount: records.length,
          allSegments: Array.from(allSegments),
          segmentsWithChildren: Array.from(segmentsWithChildren),
          childToParentMap: Object.fromEntries(childToParentMap),
          sampleRecords: records.slice(0, 5).map(r => ({
            segment: r.segment,
            level1: r.segment_hierarchy?.level_1,
            level2: r.segment_hierarchy?.level_2,
            isAggregated: r.is_aggregated,
            aggLevel: r.aggregation_level
          }))
        })
      }

      records.forEach(record => {
        let key: string
        const segment = record.segment

        // If this segment has a parent mapping, use the parent
        if (childToParentMap.has(segment)) {
          key = childToParentMap.get(segment)!
        } else if (record.is_aggregated && record.aggregation_level === 2) {
          // If record is already at level 2 (aggregated parent), use its segment name
          key = segment
        } else {
          // For segments without parents (like Oral, Topical), use their own name
          key = segment
        }

        if (!aggregatedData[key]) {
          aggregatedData[key] = 0
        }
        aggregatedData[key] += record.time_series[year] || 0
      })

      // Debug the final aggregated keys
      if (year === years[0]) {
        console.log('🔄 Level 2 Aggregated Keys:', Object.keys(aggregatedData))
      }

      Object.entries(aggregatedData).forEach(([key, value]) => {
        dataPoint[key] = value
      })

      return dataPoint
    }

    if (needsStacking) {
      // Stacked bar chart logic
      if (viewMode === 'segment-mode') {
        // Stack geographies within each segment bar
        // Primary grouping: segments (each becomes a bar)
        // Secondary grouping: geographies (stacked within each bar)
        
        // When aggregationLevel is null, prevent double-counting by preferring aggregated records
        const segmentAggregatedMap = new Map<string, Set<string>>() // segment -> set of geographies with aggregated records
        if (aggregationLevel === null) {
          records.forEach(record => {
            if (record.is_aggregated === true) {
              if (!segmentAggregatedMap.has(record.segment)) {
                segmentAggregatedMap.set(record.segment, new Set())
              }
              segmentAggregatedMap.get(record.segment)!.add(record.geography)
            }
          })
        }
        
        const segmentMap = new Map<string, Map<string, number>>()
    
    records.forEach(record => {
          const segment = record.segment
          const geography = record.geography
          
          // Prevent double-counting: if this segment+geography has an aggregated record, skip leaf records
          if (aggregationLevel === null && segmentAggregatedMap.has(segment)) {
            const geoSet = segmentAggregatedMap.get(segment)!
            if (geoSet.has(geography) && record.is_aggregated === false) {
              return // Skip this leaf record, use the aggregated one instead
            }
          }
          
          if (!segmentMap.has(segment)) {
            segmentMap.set(segment, new Map())
          }
          
          const geoMap = segmentMap.get(segment)!
          const currentValue = geoMap.get(geography) || 0
          const recordValue = record.time_series[year] || 0
          geoMap.set(geography, currentValue + recordValue)
        })
        
        // Create stacked data keys: segment_geography
        segmentMap.forEach((geoMap, segment) => {
          geoMap.forEach((value, geography) => {
            const key = `${segment}::${geography}`
            dataPoint[key] = value
          })
        })
        
      } else if (viewMode === 'geography-mode') {
        // Stack segments within each geography bar
        // Primary grouping: geographies (each becomes a bar)
        // Secondary grouping: segments (stacked within each bar)

        // When aggregationLevel is null, prevent double-counting by preferring aggregated records
        const geoSegmentAggregatedMap = new Map<string, Set<string>>() // geography -> set of segments with aggregated records
        if (aggregationLevel === null) {
          records.forEach(record => {
            if (record.is_aggregated === true) {
              if (!geoSegmentAggregatedMap.has(record.geography)) {
                geoSegmentAggregatedMap.set(record.geography, new Set())
              }
              geoSegmentAggregatedMap.get(record.geography)!.add(record.segment)
            }
          })
        }

        const geoMap = new Map<string, Map<string, number>>()

        records.forEach(record => {
          // Determine the geography key
          // For "By Region" segment type: geography is the region, segment is the country
          // For other types: check for parent geography or use geography directly
          let geoKey: string
          if (isByRegionSegmentType) {
            // Check if specific regions are selected
            if (geographies.length > 0) {
              // User selected specific regions - show individual countries (segments)
              geoKey = record.segment // Use country name as key
            } else {
              // No regions selected - aggregate under region
              geoKey = record.geography
            }
          } else if (record.parent_geography && geographies.includes(record.parent_geography)) {
            geoKey = record.parent_geography
          } else {
            geoKey = record.geography
          }
          const segment = record.segment

          // Prevent double-counting: if this geography+segment has an aggregated record, skip leaf records
          if (aggregationLevel === null && geoSegmentAggregatedMap.has(record.geography)) {
            const segmentSet = geoSegmentAggregatedMap.get(record.geography)!
            if (segmentSet.has(segment) && record.is_aggregated === false) {
              return // Skip this leaf record, use the aggregated one instead
            }
          }

          if (!geoMap.has(geoKey)) {
            geoMap.set(geoKey, new Map())
          }

          const segmentMap = geoMap.get(geoKey)!
          const currentValue = segmentMap.get(segment) || 0
          const recordValue = record.time_series[year] || 0
          segmentMap.set(segment, currentValue + recordValue)
          })

        // Create stacked data keys: geography_segment
        geoMap.forEach((segmentMap, geography) => {
          segmentMap.forEach((value, segment) => {
            const key = `${geography}::${segment}`
            dataPoint[key] = value
          })
        })
          }
        } else {
      // Original non-stacked logic
      const aggregatedData: Record<string, number> = {}
      
      // When aggregationLevel is null and grouping by segment, prevent double-counting
      // by preferring aggregated records over leaf records for the same segment
      const segmentAggregatedMap = new Map<string, boolean>()
      if (aggregationLevel === null && viewMode === 'segment-mode') {
        // First pass: identify which segments have aggregated records
        records.forEach(record => {
          if (record.is_aggregated === true) {
            segmentAggregatedMap.set(record.segment, true)
          }
        })
      }
      
      records.forEach(record => {
        let key: string
        
        // For Level 1, always group by geography (total aggregation per geography)
        if (isLevel1) {
          key = record.geography
        } else if (viewMode === 'segment-mode') {
          key = record.segment
          
          // Prevent double-counting: if this segment has an aggregated record, skip leaf records
          if (aggregationLevel === null && segmentAggregatedMap.has(key) && record.is_aggregated === false) {
            return // Skip this leaf record, use the aggregated one instead
          }
        } else if (viewMode === 'geography-mode') {
          // In geography mode, group by geography
          // For "By Region" segment type: geography is already the region (North America, Europe, etc.)
          // and segment is the country
          if (isByRegionSegmentType) {
            // Check if specific regions are selected
            if (geographies.length > 0) {
              // User selected specific regions - show individual countries (segments) within those regions
              // key = country name (record.segment)
              key = record.segment
            } else {
              // No regions selected - aggregate all countries under their region
              // key = region name (record.geography)
              key = record.geography
            }
          } else if (record.parent_geography && geographies.includes(record.parent_geography)) {
            // For other segment types with parent geography, aggregate to parent region
            key = record.parent_geography
          } else {
            // Default: use the geography field directly
            key = record.geography
          }
        } else if (viewMode === 'matrix') {
          key = `${record.geography}::${record.segment}`
        } else {
          key = record.geography
        }
        
        if (!aggregatedData[key]) {
          aggregatedData[key] = 0
        }
        aggregatedData[key] += record.time_series[year] || 0
      })
      
      Object.entries(aggregatedData).forEach(([key, value]) => {
        dataPoint[key] = value
      })
    }
    
    return dataPoint
  })
}

/**
 * Prepare data for line chart (multi-series)
 */
export function prepareLineChartData(
  records: DataRecord[],
  filters: FilterState & { advancedSegments?: any[] }
): ChartDataPoint[] {
  const { yearRange, viewMode, aggregationLevel } = filters
  const [startYear, endYear] = yearRange

  // Special handling for "By Region" segment type - flat structure
  const isByRegionSegmentType = filters.segmentType === 'By Region'

  // Get selected segments for aggregation
  const advancedSegments = filters.advancedSegments || []
  const selectedSegmentNames = advancedSegments
    .filter((seg: any) => seg.type === filters.segmentType)
    .map((seg: any) => seg.segment)

  // IMPORTANT: When user has EXPLICITLY selected segments (via Add Segment button),
  // we should NOT apply automatic Level 2 aggregation - we want to show the sub-segments individually
  const hasUserSelectedSegments = selectedSegmentNames.length > 0

  // Determine effective aggregation level (same logic as filterData and prepareGroupedBarData)
  let effectiveAggregationLevel = aggregationLevel
  if (effectiveAggregationLevel === null || effectiveAggregationLevel === undefined) {
    const segmentsFromSameType = advancedSegments.filter(
      (seg: any) => seg.type === filters.segmentType
    )
    const hasSegmentsForCurrentType = segmentsFromSameType.length > 0

    if (!hasSegmentsForCurrentType) {
      // No segments selected for this segment type - default to Level 2 (show parent segments)
      effectiveAggregationLevel = 2
    } else {
      // User selected specific segments - don't force Level 2 aggregation
      // This allows showing sub-segments when a parent is selected
      effectiveAggregationLevel = null
    }
  }

  // Only apply Level 2 aggregation when user hasn't explicitly selected segments
  const isLevel2 = effectiveAggregationLevel === 2 && !hasUserSelectedSegments
  const shouldAggregateBySelectedSegment = false // Disabled - we want to show sub-segments individually

  // For "By Region", always use null aggregation level to show individual countries
  if (isByRegionSegmentType && hasUserSelectedSegments) {
    // No special aggregation needed for By Region
  }

  // Build child-to-parent mapping for Level 2 aggregation
  const childToParentMap = new Map<string, string>()
  if (isLevel2 && viewMode === 'segment-mode') {
    records.forEach(record => {
      const level1 = record.segment_hierarchy?.level_1
      const level2 = record.segment_hierarchy?.level_2
      const segment = record.segment

      if (level1 && level2 && level1.trim() !== '' && level2.trim() !== '') {
        if (segment !== level1) {
          childToParentMap.set(segment, level1)
        }
      }
    })
  }

  // Generate year range
  const years: number[] = []
  for (let year = startYear; year <= endYear; year++) {
    years.push(year)
  }

  // Transform into Recharts format for line charts
  // Line charts always aggregate data by the primary dimension
  return years.map(year => {
    const dataPoint: ChartDataPoint = { year }

    // Special case: "By Region" segment type - show each country as separate line
    if (isByRegionSegmentType && hasUserSelectedSegments) {
      records.forEach(record => {
        // For By Region, use segment name (which is the country name)
        const key = record.segment
        const value = record.time_series[year] || 0
        dataPoint[key] = (dataPoint[key] as number || 0) + value
      })
      return dataPoint
    }

    // Group data by the dimension we want to show as lines
    const aggregated = new Map<string, number>()

    records.forEach(record => {
      let key: string

      if (viewMode === 'segment-mode') {
        // If user selected specific segment(s), aggregate by those
        if (shouldAggregateBySelectedSegment && !isLevel2) {
          const hierarchy = record.segment_hierarchy
          let matchedSegment: string | null = null

          for (const selectedSeg of selectedSegmentNames) {
            if (record.segment === selectedSeg ||
                hierarchy.level_1 === selectedSeg ||
                hierarchy.level_2 === selectedSeg ||
                hierarchy.level_3 === selectedSeg ||
                hierarchy.level_4 === selectedSeg ||
                hierarchy.level_5 === selectedSeg) {
              matchedSegment = selectedSeg
              break
            }
          }

          key = matchedSegment || record.segment
        } else if (isLevel2 && childToParentMap.has(record.segment)) {
          // For Level 2, map sub-segments to their parent
          key = childToParentMap.get(record.segment)!
        } else {
          key = record.segment
        }
      } else if (viewMode === 'geography-mode') {
        // Lines represent geographies (aggregate across segments)
        // For "By Region" segment type: geography is the region, segment is the country
        if (isByRegionSegmentType) {
          // Check if specific regions are selected
          if (filters.geographies.length > 0) {
            // User selected specific regions - show individual countries (segments)
            key = record.segment // Use country name as key
          } else {
            // No regions selected - aggregate all countries under their region
            key = record.geography
          }
        } else if (record.parent_geography && filters.geographies.includes(record.parent_geography)) {
          // Check if a parent region is selected - aggregate to region level
          key = record.parent_geography
        } else {
          key = record.geography
        }
      } else if (viewMode === 'matrix') {
        // Lines represent geography-segment combinations
        key = `${record.geography}::${record.segment}`
      } else {
        // Default to geography
        key = record.geography
      }

      const currentValue = aggregated.get(key) || 0
      const recordValue = record.time_series[year] || 0
      aggregated.set(key, currentValue + recordValue)
    })

    // Add aggregated values to dataPoint
    aggregated.forEach((value, key) => {
      dataPoint[key] = value
    })

    return dataPoint
  })
}

/**
 * Prepare data for heatmap
 */
export function prepareHeatmapData(
  records: DataRecord[],
  year: number
): HeatmapCell[] {
  const cells: HeatmapCell[] = []
  
  records.forEach(record => {
    // time_series uses number keys (years as numbers)
    const value = record.time_series[year] || 0
    
    cells.push({
      geography: record.geography,
      segment: record.segment,
      value,
      displayValue: value.toFixed(2)
    })
  })
  
  return cells
}

/**
 * Prepare data for comparison table
 */
export function prepareTableData(
  records: DataRecord[],
  filters: FilterState & { advancedSegments?: any[] }
): ComparisonTableRow[] {
  const { yearRange, viewMode, aggregationLevel } = filters
  const [startYear, endYear] = yearRange

  // Get selected segments
  const advancedSegments = filters.advancedSegments || []
  const selectedSegmentNames = advancedSegments
    .filter((seg: any) => seg.type === filters.segmentType)
    .map((seg: any) => seg.segment)

  // IMPORTANT: When user has EXPLICITLY selected segments (via Add Segment button),
  // we should NOT apply automatic Level 2 aggregation - we want to show the sub-segments individually
  const hasUserSelectedSegments = selectedSegmentNames.length > 0

  // Determine effective aggregation level
  let effectiveAggregationLevel = aggregationLevel
  if (effectiveAggregationLevel === null || effectiveAggregationLevel === undefined) {
    const segmentsFromSameType = advancedSegments.filter(
      (seg: any) => seg.type === filters.segmentType
    )
    const hasSegmentsForCurrentType = segmentsFromSameType.length > 0

    if (!hasSegmentsForCurrentType) {
      effectiveAggregationLevel = 2
    } else {
      // User selected specific segments - don't force Level 2 aggregation
      effectiveAggregationLevel = null
    }
  }

  // Only apply Level 2 aggregation when user hasn't explicitly selected segments
  const isLevel2 = effectiveAggregationLevel === 2 && !hasUserSelectedSegments

  // Build child-to-parent mapping for Level 2 aggregation
  const childToParentMap = new Map<string, string>()
  if (isLevel2 && viewMode === 'segment-mode') {
    records.forEach(record => {
      const level1 = record.segment_hierarchy?.level_1
      const level2 = record.segment_hierarchy?.level_2
      const segment = record.segment

      if (level1 && level2 && level1.trim() !== '' && level2.trim() !== '') {
        if (segment !== level1) {
          childToParentMap.set(segment, level1)
        }
      }
    })
  }

  // If Level 2 aggregation in segment mode, aggregate data by parent segment
  if (isLevel2 && viewMode === 'segment-mode' && childToParentMap.size > 0) {
    // Aggregate records by geography + parent segment
    const aggregatedMap = new Map<string, {
      geography: string
      segment: string
      timeSeries: Record<number, number>
      cagrSum: number
      count: number
    }>()

    records.forEach(record => {
      let segmentKey = record.segment
      if (childToParentMap.has(segmentKey)) {
        segmentKey = childToParentMap.get(segmentKey)!
      }

      const key = `${record.geography}::${segmentKey}`

      if (!aggregatedMap.has(key)) {
        aggregatedMap.set(key, {
          geography: record.geography,
          segment: segmentKey,
          timeSeries: {},
          cagrSum: 0,
          count: 0
        })
      }

      const agg = aggregatedMap.get(key)!
      // Sum up time series values
      for (let year = startYear; year <= endYear; year++) {
        agg.timeSeries[year] = (agg.timeSeries[year] || 0) + (record.time_series[year] || 0)
      }
      agg.cagrSum += record.cagr
      agg.count++
    })

    // Convert aggregated data to table rows
    return Array.from(aggregatedMap.values()).map(agg => {
      const baseValue = agg.timeSeries[startYear] || 0
      const forecastValue = agg.timeSeries[endYear] || 0
      const growth = baseValue > 0
        ? ((forecastValue - baseValue) / baseValue) * 100
        : 0

      const timeSeries: number[] = []
      for (let year = startYear; year <= endYear; year++) {
        timeSeries.push(agg.timeSeries[year] || 0)
      }

      return {
        geography: agg.geography,
        segment: agg.segment,
        baseYear: baseValue,
        forecastYear: forecastValue,
        cagr: agg.count > 0 ? agg.cagrSum / agg.count : 0, // Average CAGR
        growth,
        timeSeries
      }
    })
  }

  // Default: return records as-is
  return records.map(record => {
    // time_series uses number keys (years as numbers)
    const baseValue = record.time_series[filters.yearRange[0]] || 0
    const forecastValue = record.time_series[filters.yearRange[1]] || 0
    const growth = baseValue > 0
      ? ((forecastValue - baseValue) / baseValue) * 100
      : 0

    // Extract time series for sparkline
    const timeSeries: number[] = []
    for (let year = startYear; year <= endYear; year++) {
      timeSeries.push(record.time_series[year] || 0)
    }

    return {
      geography: record.geography,
      segment: record.segment,
      baseYear: baseValue,
      forecastYear: forecastValue,
      cagr: record.cagr,
      growth,
      timeSeries
    }
  })
}

/**
 * Get unique geographies from filtered data
 * When selectedGeographies is provided, aggregates to parent region level if applicable
 * For "By Region" segment type with selected geographies, returns countries (segments) instead
 */
export function getUniqueGeographies(
  records: DataRecord[],
  selectedGeographies?: string[],
  segmentType?: string
): string[] {
  const geos = new Set<string>()
  const isByRegionSegmentType = segmentType === 'By Region'

  records.forEach(record => {
    // Special handling for "By Region" segment type
    if (isByRegionSegmentType) {
      if (selectedGeographies && selectedGeographies.length > 0) {
        // When specific regions are selected, return countries (segments) within those regions
        geos.add(record.segment)
      } else {
        // When no regions selected, return regions (geographies)
        geos.add(record.geography)
      }
    }
    // For other segment types, use parent geography logic
    else if (selectedGeographies && selectedGeographies.length > 0 &&
        record.parent_geography && selectedGeographies.includes(record.parent_geography)) {
      geos.add(record.parent_geography)
    } else {
      geos.add(record.geography)
    }
  })
  return Array.from(geos)
}

/**
 * Get unique segments from filtered data
 * Returns only parent segments if they exist, otherwise returns leaf segments
 */
export function getUniqueSegments(records: DataRecord[]): string[] {
  const segments = new Set<string>()
  const parentSegments = new Set<string>()
  const childSegments = new Map<string, string[]>() // parent -> children mapping
  
  // First pass: identify all parent and leaf segments
  records.forEach(record => {
    if (record.segment_level === 'parent') {
      parentSegments.add(record.segment)
    } else {
      // Check if this leaf has a parent in the hierarchy
      const parentInHierarchy = record.segment_hierarchy.level_2
      if (parentInHierarchy && parentInHierarchy !== record.segment) {
        if (!childSegments.has(parentInHierarchy)) {
          childSegments.set(parentInHierarchy, [])
        }
        childSegments.get(parentInHierarchy)!.push(record.segment)
      }
    }
  })
  
  // Second pass: add segments to the result
  records.forEach(record => {
    // If this is a parent segment, always include it
    if (record.segment_level === 'parent') {
      segments.add(record.segment)
    } else {
      // For leaf segments, only add if their parent is NOT in the parent segments set
      const parentInHierarchy = record.segment_hierarchy.level_2
      if (!parentSegments.has(parentInHierarchy)) {
        segments.add(record.segment)
      }
    }
  })
  
  return Array.from(segments)
}

/**
 * Prepare data for waterfall chart
 * Shows contribution breakdown from start to end value
 */
export function prepareWaterfallData(
  records: DataRecord[],
  filters: FilterState & { advancedSegments?: any[] }
): Array<{ name: string; value: number; type: 'start' | 'positive' | 'negative' | 'end' }> {
  const [startYear, endYear] = filters.yearRange

  // Get selected segments
  const advancedSegments = filters.advancedSegments || []
  const selectedSegmentNames = advancedSegments
    .filter((seg: any) => seg.type === filters.segmentType)
    .map((seg: any) => seg.segment)

  // IMPORTANT: When user has EXPLICITLY selected segments (via Add Segment button),
  // we should NOT apply automatic Level 2 aggregation - we want to show the sub-segments individually
  const hasUserSelectedSegments = selectedSegmentNames.length > 0

  // Determine effective aggregation level
  let effectiveAggregationLevel = filters.aggregationLevel
  if (effectiveAggregationLevel === null || effectiveAggregationLevel === undefined) {
    const segmentsFromSameType = advancedSegments.filter(
      (seg: any) => seg.type === filters.segmentType
    )
    const hasSegmentsForCurrentType = segmentsFromSameType.length > 0

    if (!hasSegmentsForCurrentType) {
      effectiveAggregationLevel = 2
    } else {
      // User selected specific segments - don't force Level 2 aggregation
      effectiveAggregationLevel = null
    }
  }

  // Only apply Level 2 aggregation when user hasn't explicitly selected segments
  const isLevel2 = effectiveAggregationLevel === 2 && !hasUserSelectedSegments

  // Build child-to-parent mapping for Level 2 aggregation
  const childToParentMap = new Map<string, string>()
  if (isLevel2 && filters.viewMode === 'segment-mode') {
    records.forEach(record => {
      const level1 = record.segment_hierarchy?.level_1
      const level2 = record.segment_hierarchy?.level_2
      const segment = record.segment

      if (level1 && level2 && level1.trim() !== '' && level2.trim() !== '') {
        if (segment !== level1) {
          childToParentMap.set(segment, level1)
        }
      }
    })
  }

  // Group records by the dimension we're analyzing
  const groupKey = filters.viewMode === 'segment-mode' ? 'segment' : 'geography'

  // Calculate starting total
  let startTotal = 0
  records.forEach(record => {
    startTotal += record.time_series[startYear] || 0
  })

  // Group and calculate contributions
  const grouped = new Map<string, number>()
  records.forEach(record => {
    let key = record[groupKey]

    // For Level 2 segment mode, map sub-segments to their parent
    if (isLevel2 && groupKey === 'segment' && childToParentMap.has(key)) {
      key = childToParentMap.get(key)!
    }

    const startValue = record.time_series[startYear] || 0
    const endValue = record.time_series[endYear] || 0
    const change = endValue - startValue

    grouped.set(key, (grouped.get(key) || 0) + change)
  })
  
  // Build waterfall data
  const waterfallData: Array<{ name: string; value: number; type: 'start' | 'positive' | 'negative' | 'end' }> = []
  
  // Starting value
  waterfallData.push({
    name: `Start (${startYear})`,
    value: startTotal,
    type: 'start'
  })
  
  // Sort contributions by absolute value (largest first)
  const sortedContributions = Array.from(grouped.entries())
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  
  // Add positive contributions
  sortedContributions.forEach(([name, change]) => {
    if (change > 0) {
      waterfallData.push({
        name,
        value: change,
        type: 'positive'
      })
    }
  })
  
  // Add negative contributions
  sortedContributions.forEach(([name, change]) => {
    if (change < 0) {
      waterfallData.push({
        name,
        value: Math.abs(change),
        type: 'negative'
      })
    }
  })
  
  // Calculate ending total
  let endTotal = 0
  records.forEach(record => {
    endTotal += record.time_series[endYear] || 0
  })
  
  // Ending value
  waterfallData.push({
    name: `End (${endYear})`,
    value: endTotal,
    type: 'end'
  })
  
  return waterfallData
}

/**
 * Prepare data for charts with multiple aggregation levels
 * Shows the most granular level available for each segment without double-counting
 * This allows displaying data from different levels together on one graph
 */
export function prepareMultiLevelChartData(
  records: DataRecord[],
  filters: FilterState
): ChartDataPoint[] {
  const { yearRange, viewMode } = filters
  const [startYear, endYear] = yearRange
  
  const years: number[] = []
  for (let year = startYear; year <= endYear; year++) {
    years.push(year)
  }

  return years.map(year => {
    const dataPoint: ChartDataPoint = { year }
    
    // Group records by their display key (segment or geography)
    const displayMap = new Map<string, {
      bestRecord: DataRecord | null
      bestLevel: number
      allRecords: DataRecord[]
    }>()
    
    records.forEach(record => {
      // Determine display key based on view mode
      const displayKey = viewMode === 'segment-mode' 
        ? record.segment 
        : record.geography
      
      if (!displayMap.has(displayKey)) {
        displayMap.set(displayKey, {
          bestRecord: null,
          bestLevel: Infinity,
          allRecords: []
        })
      }
      
      const group = displayMap.get(displayKey)!
      group.allRecords.push(record)
      
      // Prefer leaf records (most granular) over aggregated records
      // If multiple records exist, use the one with the lowest aggregation level
      // (lower level = more granular = better for display)
      const recordLevel = record.aggregation_level ?? 0
      if (record.is_aggregated === false) {
        // Leaf record - always prefer this
        if (!group.bestRecord || (group.bestLevel ?? 0) > recordLevel) {
          group.bestRecord = record
          group.bestLevel = recordLevel
        }
      } else {
        // Aggregated record - only use if no leaf record exists
        if (!group.bestRecord && (group.bestLevel ?? 0) > recordLevel) {
          group.bestRecord = record
          group.bestLevel = recordLevel
        }
      }
    })
    
    // Build data point from best records
    displayMap.forEach((group, key) => {
      if (group.bestRecord) {
        dataPoint[key] = group.bestRecord.time_series[year] || 0
      } else if (group.allRecords.length > 0) {
        // Fallback: sum all records if no best record found
        const sum = group.allRecords.reduce((acc, r) => 
          acc + (r.time_series[year] || 0), 0
        )
        dataPoint[key] = sum
      }
    })
    
    return dataPoint
  })
}

/**
 * Enhanced version that allows mixing levels intelligently
 * Shows aggregated data when segments are selected at parent level,
 * Shows leaf data when segments are selected at leaf level
 * This is the recommended function for displaying multiple levels together
 */
export function prepareIntelligentMultiLevelData(
  records: DataRecord[],
  filters: FilterState
): ChartDataPoint[] {
  const { yearRange, viewMode, segments } = filters
  const [startYear, endYear] = yearRange

  const years: number[] = []
  for (let year = startYear; year <= endYear; year++) {
    years.push(year)
  }

  // DEBUG: Log what records we received
  console.log('📊 prepareIntelligentMultiLevelData received:', {
    recordCount: records.length,
    viewMode,
    recordSegments: records.map(r => r.segment),
    recordDetails: records.slice(0, 5).map(r => ({
      segment: r.segment,
      is_aggregated: r.is_aggregated,
      aggregation_level: r.aggregation_level,
      level_1: r.segment_hierarchy?.level_1,
      level_2: r.segment_hierarchy?.level_2
    }))
  })

  // Group records by segment (or geography) and find the best representation
  const segmentGroups = new Map<string, DataRecord[]>()

  records.forEach(record => {
    const key = viewMode === 'segment-mode' ? record.segment : record.geography
    if (!segmentGroups.has(key)) {
      segmentGroups.set(key, [])
    }
    segmentGroups.get(key)!.push(record)
  })

  // DEBUG: Log the grouping keys
  console.log('📊 prepareIntelligentMultiLevelData grouping keys:', Array.from(segmentGroups.keys()))

  return years.map(year => {
    const dataPoint: ChartDataPoint = { year }
    
    segmentGroups.forEach((groupRecords, key) => {
      // Strategy: Use the most appropriate record for this segment
      // 1. If leaf record exists, use it (most accurate)
      // 2. If only aggregated records exist, use the one that matches selected segments
      // 3. If multiple aggregated records, prefer the one at the level of selected segments
      
      const leafRecord = groupRecords.find(r => !r.is_aggregated)
      
      if (leafRecord) {
        // Use leaf record - most granular and accurate
        dataPoint[key] = leafRecord.time_series[year] || 0
      } else {
        // No leaf record - find best aggregated record
        // If segments are selected, prefer aggregated records that match
        let bestRecord: DataRecord | null = null
        
        if (segments.length > 0) {
          // Find aggregated record that matches selected segment level
          const selectedSegmentLevel = determineAggregationLevel(
            records,
            segments,
            filters.segmentType
          )
          
          if (selectedSegmentLevel !== null) {
            bestRecord = groupRecords.find(r => 
              r.aggregation_level === selectedSegmentLevel
            ) || null
          }
        }
        
        // Fallback: use the most granular aggregated record
        if (!bestRecord) {
          bestRecord = groupRecords.reduce((best, current) => {
            if (!best) return current
            // Prefer lower aggregation level (more granular)
            const currentLevel = current.aggregation_level ?? 0
            const bestLevel = best.aggregation_level ?? 0
            return currentLevel < bestLevel ? current : best
          }, null as DataRecord | null)
        }
        
        if (bestRecord) {
          dataPoint[key] = bestRecord.time_series[year] || 0
        } else {
          // Last resort: sum all records
          dataPoint[key] = groupRecords.reduce((sum, r) => 
            sum + (r.time_series[year] || 0), 0
          )
        }
      }
    })
    
    return dataPoint
  })
}

/**
 * Calculate aggregated totals
 */
export function calculateTotals(
  records: DataRecord[],
  year: number
): { total: number; count: number; average: number } {
  let total = 0
  let count = 0
  
  records.forEach(record => {
    const value = record.time_series[year] || 0
    total += value
    count++
  })
  
  return {
    total,
    count,
    average: count > 0 ? total / count : 0
  }
}

/**
 * Find top performers
 */
export function findTopPerformers(
  records: DataRecord[],
  year: number,
  limit: number = 5
): Array<{ name: string; value: number }> {
  const performers = records.map(record => ({
    name: `${record.geography} - ${record.segment}`,
    value: record.time_series[year] || 0
  }))
  
  return performers
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

/**
 * Find fastest growing
 */
export function findFastestGrowing(
  records: DataRecord[],
  limit: number = 5
): Array<{ name: string; cagr: number }> {
  const growing = records.map(record => ({
    name: `${record.geography} - ${record.segment}`,
    cagr: record.cagr
  }))
  
  return growing
    .sort((a, b) => b.cagr - a.cagr)
    .slice(0, limit)
}


