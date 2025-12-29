class SheetColumnMapper {
    constructor(sheets, auth, spreadsheetId) {
        this.sheets = sheets;
        this.auth = auth;
        this.spreadsheetId = spreadsheetId;
        this.columnMaps = {}; // Cache column positions
    }

    async getColumnMap(sheetName, expectedColumns) {
        // Return cached map if available
        const cacheKey = `${this.spreadsheetId}:${sheetName}`;
        if (this.columnMaps[cacheKey]) {
            return this.columnMaps[cacheKey];
        }

        try {
            console.log(`📊 Building column map for ${sheetName}...`);

            // Get header row (first row of sheet)
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!1:1` // Get first row only
            });

            const headers = response.data.values[0] || [];
            console.log(`Found headers:`, headers);

            // Build column index map
            const columnMap = {};
            headers.forEach((header, index) => {
                const cleanHeader = (header || '').toString().trim();
                columnMap[cleanHeader] = index;

                // Also map common variations
                if (cleanHeader.toLowerCase().includes('booking id')) {
                    columnMap.BOOKING_ID = index;
                }
                if (cleanHeader.toLowerCase().includes('customer name')) {
                    columnMap.CUSTOMER_NAME = index;
                }
                // Add more variations as needed
            });

            // Also map by our expected column names
            Object.entries(expectedColumns).forEach(([key, expectedName]) => {
                // Try exact match first
                if (columnMap[expectedName] !== undefined) {
                    columnMap[key] = columnMap[expectedName];
                } else {
                    // Try case-insensitive partial match
                    for (const [header, index] of Object.entries(columnMap)) {
                        if (header.toLowerCase().includes(expectedName.toLowerCase())) {
                            columnMap[key] = index;
                            console.log(`Matched "${expectedName}" to "${header}" at column ${index}`);
                            break;
                        }
                    }
                }
            });

            // Cache the map
            this.columnMaps[cacheKey] = columnMap;
            console.log(`✅ Column map built for ${sheetName}:`, columnMap);

            return columnMap;

        } catch (error) {
            console.error(`❌ Error building column map for ${sheetName}:`, error);

            // Fallback: Use default positions
            const defaultMap = {};
            Object.keys(expectedColumns).forEach((key, index) => {
                defaultMap[key] = index;
            });

            console.log(`⚠️ Using default column positions for ${sheetName}`);
            return defaultMap;
        }
    }

    // Helper to get cell address from column name
    getColumnLetter(index) {
        let letter = '';
        while (index >= 0) {
            letter = String.fromCharCode(65 + (index % 26)) + letter;
            index = Math.floor(index / 26) - 1;
        }
        return letter;
    }
}

module.exports = SheetColumnMapper;