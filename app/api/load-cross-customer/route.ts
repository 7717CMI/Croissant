import { NextResponse } from 'next/server'

// Force this route to be dynamic (not static)
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Dynamically import modules that use Node.js APIs
    const XLSX = await import('xlsx')
    const fs = await import('fs')
    const path = await import('path')

    // Try to load from the root directory
    const filePath = path.join(process.cwd(), 'Cros-customer.xlsx')

    if (!fs.existsSync(filePath)) {
      console.error('File not found at:', filePath)
      return NextResponse.json(
        { error: 'Cross-customer data file not found', path: filePath },
        { status: 404 }
      )
    }

    // Read the Excel file
    const fileBuffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // Convert to JSON with headers
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

    if (rawData.length < 2) {
      return NextResponse.json(
        { error: 'Excel file is empty or has no data rows' },
        { status: 400 }
      )
    }

    // Extract headers from first row
    const headers = rawData[0] as string[]

    // Convert rows to objects
    const rows = rawData.slice(1).map((row) => {
      const obj: Record<string, any> = {}
      headers.forEach((header, index) => {
        obj[header] = row[index] ?? ''
      })
      return obj
    }).filter(row => {
      // Filter out empty rows
      return Object.values(row).some(val => val !== '' && val !== null && val !== undefined)
    })

    console.log('Successfully loaded cross-customer data:', rows.length, 'rows')

    return NextResponse.json({
      headers,
      rows,
      totalRows: rows.length
    })
  } catch (error) {
    console.error('Error loading cross-customer data:', error)
    return NextResponse.json(
      { error: 'Failed to load cross-customer data', details: String(error) },
      { status: 500 }
    )
  }
}
