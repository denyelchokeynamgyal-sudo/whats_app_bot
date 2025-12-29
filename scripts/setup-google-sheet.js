// scripts/setup-google-sheet.js - FIXED VERSION
require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');
const sheetConfig = require('../config/sheets-config');

// Helper function to get sheet ID
async function getSheetId(sheets, auth, spreadsheetId, sheetName) {
    try {
        const spreadsheet = await sheets.spreadsheets.get({
            auth: auth,
            spreadsheetId: spreadsheetId,
            fields: 'sheets.properties'
        });

        const sheet = spreadsheet.data.sheets.find(s =>
            s.properties.title === sheetName
        );

        return sheet ? sheet.properties.sheetId : null;
    } catch (error) {
        console.error(`❌ Error getting sheet ID for ${sheetName}:`, error.message);
        return null;
    }
}

// Add sample room data if sheet is empty
async function addSampleDataIfEmpty(sheets, auth, spreadsheetId) {
    try {
        console.log('\n📝 Checking if sample data needed...');

        // Check rooms_tab
        const roomsResponse = await sheets.spreadsheets.values.get({
            auth: auth,
            spreadsheetId: spreadsheetId,
            range: 'rooms_tab!A2:I' // Start from row 2 (skip header)
        });

        if (!roomsResponse.data.values || roomsResponse.data.values.length === 0) {
            console.log('   Adding sample rooms...');

            const sampleRooms = [
                ['R001', 'Single Room', '800', '10', '10', '', '1', 'WiFi, AC, TV', 'A cozy single room perfect for solo travelers'],
                ['R002', 'Double Room', '1200', '15', '15', '', '2', 'WiFi, AC, TV, Mini-fridge', 'Comfortable room for two people'],
                ['R003', 'Triple Room', '1500', '8', '8', '', '3', 'WiFi, AC, TV, Mini-fridge', 'Spacious room for three people'],
                ['R004', 'Quad Room', '1800', '6', '6', '', '4', 'WiFi, AC, TV, Mini-fridge, Sofa', 'Large room for four people'],
                ['R005', 'Family Suite', '2500', '4', '4', '', '5', 'WiFi, AC, TV, Kitchenette, Balcony', 'Luxurious suite for families or groups']
            ];

            await sheets.spreadsheets.values.append({
                auth: auth,
                spreadsheetId: spreadsheetId,
                range: 'rooms_tab!A2:I',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: sampleRooms }
            });

            console.log('   ✅ Sample rooms added');
        } else {
            console.log(`   ✅ Rooms already have ${roomsResponse.data.values.length} entries`);
        }

        // Format headers (make them bold)
        console.log('   Formatting headers...');
        await formatHeaders(sheets, auth, spreadsheetId);

    } catch (error) {
        console.error('❌ Error adding sample data:', error.message);
    }
}

// Format headers to be bold and colored
async function formatHeaders(sheets, auth, spreadsheetId) {
    try {
        const requests = [
            {
                repeatCell: {
                    range: {
                        sheetId: await getSheetId(sheets, auth, spreadsheetId, 'rooms_tab'),
                        startRowIndex: 0,
                        endRowIndex: 1,
                        startColumnIndex: 0,
                        endColumnIndex: 9
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 0.2, green: 0.6, blue: 0.8 },
                            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            },
            {
                repeatCell: {
                    range: {
                        sheetId: await getSheetId(sheets, auth, spreadsheetId, 'bookings_tab'),
                        startRowIndex: 0,
                        endRowIndex: 1,
                        startColumnIndex: 0,
                        endColumnIndex: 21
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 0.2, green: 0.6, blue: 0.8 },
                            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            }
        ];

        await sheets.spreadsheets.batchUpdate({
            auth: auth,
            spreadsheetId: spreadsheetId,
            resource: { requests }
        });

        console.log('   ✅ Headers formatted');

    } catch (error) {
        console.log('   ⚠️  Could not format headers (non-critical):', error.message);
    }
}

async function setupSheetForClient() {
    console.log(`
╔══════════════════════════════════════════════╗
║     GOOGLE SHEETS SETUP                      ║
╚══════════════════════════════════════════════╝
    `);

    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, '../credentials.json'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4' });

    if (!process.env.GOOGLE_SHEETS_ID) {
        console.error('❌ ERROR: GOOGLE_SHEETS_ID not found in .env file!');
        console.log('\n📝 Add this to your .env file:');
        console.log('GOOGLE_SHEETS_ID=your_google_sheet_id_here');
        console.log('\n💡 Get sheet ID from URL: docs.google.com/spreadsheets/d/YOUR_ID_HERE/edit');
        process.exit(1);
    }

    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    try {
        console.log(`🔗 Connecting to Google Sheet: ${spreadsheetId.substring(0, 15)}...`);

        // 1. Check if sheets exist
        const spreadsheet = await sheets.spreadsheets.get({
            auth: auth,
            spreadsheetId: spreadsheetId
        });

        const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
        console.log(`📋 Found sheets: ${existingSheets.join(', ')}`);

        // 2. Create missing sheets with headers
        const sheetsToCreate = [
            {
                name: sheetConfig.ROOMS_SHEET.sheetName,
                headers: Object.values(sheetConfig.ROOMS_SHEET.columns)
            },
            {
                name: sheetConfig.BOOKINGS_SHEET.sheetName,
                headers: Object.values(sheetConfig.BOOKINGS_SHEET.columns)
            }
        ];

        const requests = [];
        let createdSheets = 0;

        for (const sheet of sheetsToCreate) {
            if (!existingSheets.includes(sheet.name)) {
                console.log(`   ➕ Creating sheet: "${sheet.name}"`);

                requests.push({
                    addSheet: {
                        properties: { title: sheet.name }
                    }
                });
                createdSheets++;
            }
        }

        if (requests.length > 0) {
            await sheets.spreadsheets.batchUpdate({
                auth: auth,
                spreadsheetId: spreadsheetId,
                resource: { requests }
            });
            console.log(`✅ Created ${createdSheets} new sheet(s)`);
        } else {
            console.log('✅ All required sheets already exist');
        }

        // 3. Add headers to all sheets (even if they exist, ensure headers are correct)
        console.log('\n📋 Ensuring headers are correct...');
        for (const sheet of sheetsToCreate) {
            await ensureHeaders(sheets, auth, spreadsheetId, sheet.name, sheet.headers);
        }

        // 4. Add sample data if needed
        await addSampleDataIfEmpty(sheets, auth, spreadsheetId);

        // 5. Show sheet URL
        console.log('\n══════════════════════════════════════════════');
        console.log('🎉 SETUP COMPLETE!');
        console.log(`📊 Open your sheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
        console.log('\n📋 Next steps:');
        console.log('1. Verify the tabs "rooms_tab" and "bookings_tab" exist');
        console.log('2. Check sample room data was added');
        console.log('3. Start your chatbot: npm start');
        console.log('══════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ SETUP FAILED:', error.message);
        console.log('\n🔧 Common issues:');
        console.log('1. Is the Google Sheet shared with your service account?');
        console.log('2. Check credentials.json exists in project root');
        console.log('3. Is GOOGLE_SHEETS_ID correct in .env file?');
        console.log('\n📝 To find service account email:');
        console.log('   cat credentials.json | grep client_email');
        process.exit(1);
    }
}

// Helper to ensure headers are correct
async function ensureHeaders(sheets, auth, spreadsheetId, sheetName, expectedHeaders) {
    try {
        // Get current headers
        const response = await sheets.spreadsheets.values.get({
            auth: auth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!1:1`
        });

        const currentHeaders = response.data.values ? response.data.values[0] : [];

        // If no headers or different headers, update them
        if (currentHeaders.length === 0 || JSON.stringify(currentHeaders) !== JSON.stringify(expectedHeaders)) {
            console.log(`   📝 Updating headers for ${sheetName}...`);

            await sheets.spreadsheets.values.update({
                auth: auth,
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!1:1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [expectedHeaders] }
            });

            console.log(`   ✅ Headers updated for ${sheetName}`);
        } else {
            console.log(`   ✅ ${sheetName} headers are correct`);
        }

    } catch (error) {
        console.error(`   ❌ Error updating headers for ${sheetName}:`, error.message);
    }
}

// Run setup
if (require.main === module) {
    setupSheetForClient();
}

module.exports = { setupSheetForClient };