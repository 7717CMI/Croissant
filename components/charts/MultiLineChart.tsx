'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { CHART_THEME, getChartColor } from '@/lib/chart-theme'
import { filterData, prepareLineChartData, prepareIntelligentMultiLevelData, getUniqueGeographies, getUniqueSegments } from '@/lib/data-processor'
import { useDashboardStore } from '@/lib/store'

interface MultiLineChartProps {
  title?: string
  height?: number
}

export function MultiLineChart({ title, height = 400 }: MultiLineChartProps) {
  const { data, filters, currency } = useDashboardStore()

  const chartData = useMemo(() => {
    if (!data) return { data: [], series: [] }

    const dataset = filters.dataType === 'value'
      ? data.data.value.geography_segment_matrix
      : data.data.volume.geography_segment_matrix

    // Determine effective aggregation level for chart preparation
    // When no segments are selected for the current segment type, default to Level 2
    const advancedSegments = filters.advancedSegments || []
    const segmentsFromSameType = advancedSegments.filter(
      (seg: any) => seg.type === filters.segmentType
    )
    const hasUserSelectedSegments = segmentsFromSameType.length > 0

    let effectiveAggregationLevel: number | null = filters.aggregationLevel ?? null
    if (!hasUserSelectedSegments && effectiveAggregationLevel === null) {
      // No segments selected - use Level 2 to show parent segments aggregated
      effectiveAggregationLevel = 2
    } else if (hasUserSelectedSegments) {
      // User selected segments - show individual records
      effectiveAggregationLevel = null
    }

    // Create modified filters with the effective aggregation level
    const modifiedFilters = {
      ...filters,
      aggregationLevel: effectiveAggregationLevel
    }

    const filtered = filterData(dataset, modifiedFilters)

    // Use prepareLineChartData when:
    // 1. We have an effective aggregation level (handles Level 2 aggregation)
    // 2. Geography mode with segments selected (need to aggregate by geography)
    const useLineChartData = effectiveAggregationLevel !== null ||
      (filters.viewMode === 'geography-mode' && hasUserSelectedSegments)

    const prepared = useLineChartData
      ? prepareLineChartData(filtered, modifiedFilters)
      : prepareIntelligentMultiLevelData(filtered, modifiedFilters)

    // Extract series from prepared data keys instead of from filtered records
    // This ensures we use the aggregated keys (e.g., "Parenteral") not the original segment names
    const extractSeriesFromPreparedData = (): string[] => {
      if (prepared.length === 0) return []

      // Get all unique keys from prepared data (excluding 'year')
      const allKeys = new Set<string>()
      prepared.forEach(dataPoint => {
        Object.keys(dataPoint).forEach(key => {
          if (key !== 'year') {
            allKeys.add(key)
          }
        })
      })

      return Array.from(allKeys)
    }

    // Determine series based on view mode and selections
    let series: string[] = []

    if (filters.viewMode === 'segment-mode') {
      // For segment mode with Level 2 aggregation, extract keys from prepared data
      // This ensures we get "Parenteral" instead of "Intravenous", "Intramuscular", etc.
      series = extractSeriesFromPreparedData()
    } else if (filters.viewMode === 'geography-mode') {
      if (hasUserSelectedSegments) {
        // Geography mode with segments selected - extract keys from prepared data
        // This ensures we get all geographies that have data for the selected segments
        series = extractSeriesFromPreparedData()
      } else {
        // Geography mode without segment selection - use geographies
        series = getUniqueGeographies(filtered, filters.geographies, filters.segmentType)
      }
    } else if (filters.viewMode === 'matrix') {
      // Matrix view - combine geography and segment
      const uniquePairs = new Set<string>()
      filtered.forEach(record => {
        uniquePairs.add(`${record.geography}::${record.segment}`)
      })
      series = Array.from(uniquePairs)
    }

    // Log for debugging
    console.log('📈 Line Chart Data:', {
      filteredCount: filtered.length,
      preparedLength: prepared.length,
      series: series,
      viewMode: filters.viewMode,
      geographies: filters.geographies,
      segments: filters.segments,
      effectiveAggregationLevel
    })

    return { data: prepared, series }
  }, [data, filters])

  if (!data || chartData.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-black">No data to display</p>
          <p className="text-sm text-black mt-1">
            Try adjusting your filters
          </p>
        </div>
      </div>
    )
  }

  const selectedCurrency = currency || data.metadata.currency || 'USD'
  const isINR = selectedCurrency === 'INR'
  const currencySymbol = isINR ? '₹' : '$'
  const unitLabel = isINR ? '' : (data.metadata.value_unit || 'Million')
  
  const yAxisLabel = filters.dataType === 'value'
    ? isINR 
      ? `Market Value (${currencySymbol})`
      : `Market Value (${selectedCurrency} ${unitLabel})`
    : `Market Volume (${data.metadata.volume_unit})`

  // Matrix view should use heatmap instead
  if (filters.viewMode === 'matrix') {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-black text-lg font-medium">Matrix View Active</p>
          <p className="text-sm text-black mt-2">
            Please switch to the Heatmap tab to see the matrix visualization
          </p>
          <p className="text-xs text-black mt-1">
            Line charts work best with Segment Mode or Geography Mode
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-lg font-semibold mb-4 text-black">{title}</h3>
      )}
      
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData.data}>
          <CartesianGrid {...CHART_THEME.grid} />
          <XAxis 
            dataKey="year" 
            tick={{ fontSize: 12 }}
            label={{ value: 'Year', position: 'insideBottom', offset: -5 }}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
          />
          <Tooltip 
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const year = label
                const selectedCurrency = currency || data.metadata.currency || 'USD'
                const isINR = selectedCurrency === 'INR'
                const currencySymbol = isINR ? '₹' : '$'
                const unitText = isINR ? '' : (data.metadata.value_unit || 'Million')
                
                const unit = filters.dataType === 'value'
                  ? isINR 
                    ? currencySymbol
                    : `${selectedCurrency} ${unitText}`
                  : data.metadata.volume_unit
                
                return (
                  <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg min-w-[250px]">
                    <p className="font-semibold text-black mb-3 pb-2 border-b border-gray-200">
                      Year: <span className="text-blue-600">{year}</span>
                    </p>
                    <div className="space-y-2">
                      {payload.map((entry: any, index: number) => {
                        const value = entry.value as number
                        const name = entry.name as string
                        const color = entry.color
                        
                        return (
                          <div key={index} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: color }}
                              ></div>
                              <span className="text-sm font-medium text-black">
                                {name}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-semibold text-black">
                                {value.toLocaleString(undefined, { 
                                  minimumFractionDigits: 2, 
                                  maximumFractionDigits: 2 
                                })}
                              </span>
                              <span className="text-xs text-black ml-1">
                                {unit}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-3 pt-2 border-t border-gray-200 text-xs text-black">
                      Trend analysis from {filters.yearRange[0]} to {filters.yearRange[1]}
                    </div>
                  </div>
                )
              }
              return null
            }}
          />
          <Legend 
            {...CHART_THEME.legend}
            wrapperStyle={{ ...CHART_THEME.legend.wrapperStyle, color: '#000000' }}
            formatter={(value) => <span style={{ color: '#000000' }}>{value}</span>}
          />
          
          {chartData.series.map((seriesName, index) => (
            <Line
              key={seriesName}
              type="monotone"
              dataKey={seriesName}
              stroke={getChartColor(index)}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              name={seriesName}
              connectNulls={true}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {chartData.series.length > 0 && (
        <div className="mt-4 text-sm text-black text-center">
          {filters.viewMode === 'segment-mode' && filters.geographies.length > 1 ? (
            <>
              Trend comparison of {chartData.series.length} segments
              {' '}(aggregated across {filters.geographies.length} geographies)
              {' '}from {filters.yearRange[0]} to {filters.yearRange[1]}
            </>
          ) : filters.viewMode === 'geography-mode' && filters.segments.length > 1 ? (
            <>
              Trend comparison of {chartData.series.length} geographies
              {' '}(aggregated across {filters.segments.length} segments)
              {' '}from {filters.yearRange[0]} to {filters.yearRange[1]}
            </>
          ) : (
            <>
              Trend comparison of {chartData.series.length} {filters.viewMode === 'segment-mode' ? 'segments' : 'geographies'}
          {' '}from {filters.yearRange[0]} to {filters.yearRange[1]}
            </>
          )}
        </div>
      )}
    </div>
  )
}

