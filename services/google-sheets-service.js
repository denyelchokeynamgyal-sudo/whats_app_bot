// services/google-sheets-service.js - UPDATED
const { google } = require('googleapis');
const path = require('path');
const SheetColumnMapper = require('../utils/sheet-column-mapper');
const sheetConfig = require('../config/sheets-config');

class GoogleSheetsService {
    constructor() {
        console.log('📊 Initializing GoogleSheetsService...');

        this.auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, '../credentials.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        this.sheets = google.sheets({ version: 'v4' });
        this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;

        // Initialize column mapper
        this.mapper = new SheetColumnMapper(this.sheets, this.auth, this.spreadsheetId);

        // Column maps will be populated on first use
        this.roomsColumnMap = null;
        this.bookingsColumnMap = null;
    }

    async ensureColumnMaps() {
        if (!this.roomsColumnMap) {
            this.roomsColumnMap = await this.mapper.getColumnMap(
                sheetConfig.ROOMS_SHEET.sheetName,
                sheetConfig.ROOMS_SHEET.columns
            );
        }
        if (!this.bookingsColumnMap) {
            this.bookingsColumnMap = await this.mapper.getColumnMap(
                sheetConfig.BOOKINGS_SHEET.sheetName,
                sheetConfig.BOOKINGS_SHEET.columns
            );
        }
    }

    async getAllRooms() {
        await this.ensureColumnMaps();

        try {
            const res = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.ROOMS_SHEET.sheetName}!A:I`
            });

            const rows = res.data.values || [];
            const headers = rows[0] || [];
            const dataRows = rows.slice(1);

            console.log(`📊 Found ${dataRows.length} room rows`);

            return dataRows.map((row, i) => {
                const map = this.roomsColumnMap;

                const get = (key, defaultValue = '') => {
                    const index = map[key];
                    return index !== undefined && row[index] !== undefined
                        ? row[index]
                        : defaultValue;
                };

                let bookedDates = [];
                const bookedDatesStr = get('BOOKED_DATES');
                if (bookedDatesStr && bookedDatesStr.trim() !== '') {
                    bookedDates = bookedDatesStr.split(',')
                        .map(d => d.trim())
                        .filter(d => d && !d.includes('#ERROR!'));
                }

                // Get max guest capacity
                let maxGuest = 1;
                const maxGuestStr = get('MAX_GUEST');
                if (maxGuestStr) {
                    maxGuest = parseInt(maxGuestStr) || 1;
                } else {
                    // Fallback based on room name
                    const roomName = get('ROOM_NAME', '').toLowerCase();
                    if (roomName.includes('single')) maxGuest = 1;
                    else if (roomName.includes('double')) maxGuest = 2;
                    else if (roomName.includes('triple')) maxGuest = 3;
                    else if (roomName.includes('quad')) maxGuest = 4;
                    else if (roomName.includes('family') || roomName.includes('suite')) maxGuest = 5;
                }

                return {
                    roomId: get('ROOM_ID', `R${i + 100}`),
                    name: get('ROOM_NAME', `Room ${i + 1}`),
                    pricePerNight: parseInt(get('PRICE')) || 0,
                    totalRooms: parseInt(get('TOTAL_ROOMS')) || 0,
                    availableCount: parseInt(get('CURRENT_AVAILABLE')) || 0,
                    bookedDates: bookedDates,
                    maxGuest: maxGuest,
                    amenities: get('AMENITIES') ?
                        get('AMENITIES').split(',').map(a => a.trim()) : [],
                    description: get('DESCRIPTION', '')
                };
            }).filter(room => room !== null);

        } catch (error) {
            console.error('❌ Error getting rooms:', error);
            return [];
        }
    }

    async createBookingRequest(bookingData) {
        await this.ensureColumnMaps();

        try {
            const bookingId = `BK${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
            const map = this.bookingsColumnMap;

            // Get header row to know how many columns to fill
            const headerRes = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!1:1`
            });

            const totalColumns = headerRes.data.values[0].length;
            const bookingRow = new Array(totalColumns).fill('');

            // Map data to correct columns
            if (map.BOOKING_ID !== undefined) bookingRow[map.BOOKING_ID] = bookingId;
            if (map.CUSTOMER_NAME !== undefined) bookingRow[map.CUSTOMER_NAME] = bookingData.customerName;
            if (map.PHONE !== undefined) bookingRow[map.PHONE] = bookingData.customerPhone;
            if (map.ROOM_TYPE !== undefined) bookingRow[map.ROOM_TYPE] = bookingData.roomType;
            if (map.ROOM_COUNT !== undefined) bookingRow[map.ROOM_COUNT] = bookingData.roomCount || 1;
            if (map.TOTAL_ROOMS !== undefined) bookingRow[map.TOTAL_ROOMS] = bookingData.totalRooms || (bookingData.roomCount || 1);
            if (map.CHECK_IN !== undefined) bookingRow[map.CHECK_IN] = bookingData.checkInDate;
            if (map.CHECK_OUT !== undefined) bookingRow[map.CHECK_OUT] = bookingData.checkOutDate;
            if (map.NIGHTS !== undefined) bookingRow[map.NIGHTS] = bookingData.nights.toString();
            if (map.GUESTS !== undefined) bookingRow[map.GUESTS] = bookingData.guests.toString();

            // Calculate total amount based on room price
            let totalAmount = 0;
            if (bookingData.totalAmount) {
                totalAmount = bookingData.totalAmount;
            } else {
                // Try to calculate based on room type
                const rooms = await this.getAllRooms();
                const room = rooms.find(r => r.name === bookingData.roomType);
                if (room) {
                    totalAmount = room.pricePerNight * (bookingData.nights || 1) * (bookingData.roomCount || 1);
                }
            }

            if (map.TOTAL !== undefined) bookingRow[map.TOTAL] = totalAmount.toString();
            if (map.STATUS !== undefined) bookingRow[map.STATUS] = 'requested';
            if (map.PAYMENT_STATUS !== undefined) bookingRow[map.PAYMENT_STATUS] = 'pending';
            if (map.SPECIAL_REQUESTS !== undefined) bookingRow[map.SPECIAL_REQUESTS] = bookingData.specialRequests || 'None';
            if (map.REQUESTED_AT !== undefined) bookingRow[map.REQUESTED_AT] = new Date().toISOString();

            console.log('📝 Booking row (with room count):', bookingRow);

            await this.sheets.spreadsheets.values.append({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!A:Z`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [bookingRow] }
            });

            console.log(`✅ Booking request ${bookingId} inserted with room count`);

            return {
                success: true,
                booking: {
                    bookingId,
                    customerName: bookingData.customerName,
                    customerPhone: bookingData.customerPhone,
                    roomType: bookingData.roomType,
                    roomCount: bookingData.roomCount || 1,
                    totalRooms: bookingData.totalRooms || (bookingData.roomCount || 1),
                    checkInDate: bookingData.checkInDate,
                    checkOutDate: bookingData.checkOutDate,
                    nights: bookingData.nights,
                    guests: bookingData.guests,
                    totalAmount: totalAmount,
                    status: 'requested'
                }
            };

        } catch (error) {
            console.error('❌ Dynamic booking creation error:', error);
            throw error;
        }
    }

    async getAllBookings(filters = {}) {
        await this.ensureColumnMaps();

        try {
            // Get all data (with wide range)
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!A:Z`
            });

            const rows = response.data.values || [];
            const headers = rows[0] || [];
            const dataRows = rows.slice(1);

            console.log(`📋 Found ${dataRows.length} booking rows with ${headers.length} columns`);

            const map = this.bookingsColumnMap;

            const bookings = dataRows.map(row => {
                // Helper function with dynamic mapping
                const get = (key, defaultValue = '') => {
                    const index = map[key];
                    return index !== undefined && row[index] !== undefined
                        ? row[index]
                        : defaultValue;
                };

                return {
                    bookingId: get('BOOKING_ID'),
                    customerName: get('CUSTOMER_NAME'),
                    customerPhone: get('PHONE'),
                    roomType: get('ROOM_TYPE'),
                    roomId: get('ROOM_ID'),
                    checkInDate: get('CHECK_IN'),
                    checkOutDate: get('CHECK_OUT'),
                    nights: this.parseNights(get('NIGHTS')),
                    guests: parseInt(get('GUESTS')) || 1,
                    totalAmount: parseInt(get('TOTAL')) || 0,
                    status: (get('STATUS') || '').toLowerCase(),
                    paymentStatus: get('PAYMENT_STATUS') || 'pending',
                    paymentMethod: get('PAYMENT_METHOD') || '',
                    specialRequests: get('SPECIAL_REQUESTS') || '',
                    requestedAt: get('REQUESTED_AT') || '',
                    confirmedAt: get('CONFIRMED_AT') || '',
                    confirmedBy: get('CONFIRMED_BY') || '',
                    checkInAt: get('CHECK_IN_AT') || '',
                    checkOutAt: get('CHECK_OUT_AT') || '',
                    notes: get('NOTES') || '',

                    // Store raw row for debugging
                    _rawRow: row,
                    _columnMap: map
                };
            });

            // Apply filters dynamically
            let filtered = bookings;

            if (filters.status) {
                filtered = filtered.filter(b =>
                    b.status.toLowerCase() === filters.status.toLowerCase()
                );
            }

            if (filters.date) {
                filtered = filtered.filter(b =>
                    b.checkInDate === filters.date || b.checkOutDate === filters.date
                );
            }

            if (filters.roomType) {
                filtered = filtered.filter(b =>
                    b.roomType.toLowerCase().includes(filters.roomType.toLowerCase())
                );
            }

            if (!filters.includeCancelled) {
                filtered = filtered.filter(b => b.status !== 'cancelled');
            }

            return filtered;

        } catch (error) {
            console.error('❌ Dynamic booking fetch error:', error);
            return [];
        }
    }

    // Updated approveBooking with dynamic columns
    // Add these methods to GoogleSheetsService class:

    async approveBooking(bookingId, employeeName = 'Staff') {
        await this.ensureColumnMaps();

        try {
            // Find booking
            const bookings = await this.getAllBookings({ includeCancelled: true });
            const booking = bookings.find(b => b.bookingId === bookingId);

            if (!booking) throw new Error('Booking not found');
            if (booking.status !== 'requested') {
                throw new Error(`Booking is ${booking.status}, cannot approve`);
            }

            // Get the actual row in sheet
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!A:Z`
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row =>
                row[this.bookingsColumnMap.BOOKING_ID] === bookingId
            );

            if (rowIndex === -1) throw new Error('Booking not found in sheet');

            const sheetRow = rowIndex + 1; // +1 because sheet rows start at 1
            const map = this.bookingsColumnMap;
            const currentTime = new Date().toISOString();

            // 1. Update status to 'confirmed'
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!${this.getColumnLetter(map.STATUS)}${sheetRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['confirmed']] }
            });

            // 2. Update payment status to 'paid'
            if (map.PAYMENT_STATUS !== undefined) {
                await this.sheets.spreadsheets.values.update({
                    auth: this.auth,
                    spreadsheetId: this.spreadsheetId,
                    range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!${this.getColumnLetter(map.PAYMENT_STATUS)}${sheetRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [['paid']] }
                });
            }

            // 3. Add confirmation timestamp
            if (map.CONFIRMED_AT !== undefined) {
                await this.sheets.spreadsheets.values.update({
                    auth: this.auth,
                    spreadsheetId: this.spreadsheetId,
                    range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!${this.getColumnLetter(map.CONFIRMED_AT)}${sheetRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[currentTime]] }
                });
            }

            // 4. Add confirmed by
            if (map.CONFIRMED_BY !== undefined) {
                await this.sheets.spreadsheets.values.update({
                    auth: this.auth,
                    spreadsheetId: this.spreadsheetId,
                    range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!${this.getColumnLetter(map.CONFIRMED_BY)}${sheetRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[employeeName]] }
                });
            }

            // 5. MOST IMPORTANT: DECREASE ROOM AVAILABILITY
            console.log(`📊 Decreasing room availability for ${booking.roomType}...`);
            await this.updateRoomAvailability(booking.roomType, booking.checkInDate, booking.nights, true);

            // 6. Log activity
            await this.logActivity({
                date: new Date().toISOString().split('T')[0],
                bookingId: bookingId,
                action: 'approved',
                performedBy: employeeName,
                details: `Booking approved by ${employeeName}. Total: Nu.${booking.totalAmount}`
            });

            // 7. Send WhatsApp confirmation (optional)
            const confirmationMessage = `🎉 *BOOKING CONFIRMED!*\n\nYour booking ${bookingId} has been confirmed!\n\n📋 Details:\n• Room: ${booking.roomType}\n• Check-in: ${booking.checkInDate}\n• Check-out: ${booking.checkOutDate}\n• Total: Nu.${booking.totalAmount}\n\n🏨 We look forward to hosting you at our hotel!`;

            // Uncomment if you want to send WhatsApp confirmation
            // await this.sendWhatsAppConfirmation(booking.customerPhone, confirmationMessage);

            console.log(`✅ Booking ${bookingId} approved by ${employeeName}`);
            return {
                success: true,
                message: `Booking ${bookingId} confirmed successfully!`
            };

        } catch (error) {
            console.error('❌ Error approving booking:', error);
            throw error;
        }
    }

    // Add this helper method to get column letter
    getColumnLetter(index) {
        let letter = '';
        while (index >= 0) {
            letter = String.fromCharCode(65 + (index % 26)) + letter;
            index = Math.floor(index / 26) - 1;
        }
        return letter;
    }

    // Update room availability (increase or decrease)
    async updateRoomAvailability(roomType, checkInDate, nights, shouldDecrease = true) {
        try {
            console.log(`🔄 ${shouldDecrease ? 'Decreasing' : 'Increasing'} availability for ${roomType}...`);

            const rooms = await this.getAllRooms();
            const room = rooms.find(r => r.name.toLowerCase() === roomType.toLowerCase());

            if (!room) {
                console.warn(`❌ Room ${roomType} not found`);
                return;
            }

            // Calculate dates affected
            const datesToUpdate = this.getDateRange(checkInDate, nights);

            // Update booked dates
            let newBookedDates = [...room.bookedDates];
            if (shouldDecrease) {
                // Add dates when booking is confirmed
                newBookedDates = [...newBookedDates, ...datesToUpdate];
                // Remove duplicates
                newBookedDates = [...new Set(newBookedDates)];
            } else {
                // Remove dates when booking is cancelled or checked out
                newBookedDates = newBookedDates.filter(date => !datesToUpdate.includes(date));
            }

            // Update available count
            let newAvailable = room.availableCount;
            if (shouldDecrease) {
                newAvailable = Math.max(0, room.availableCount - 1);
            } else {
                newAvailable = Math.min(room.totalRooms, room.availableCount + 1);
            }

            console.log(`📊 Room ${room.name}: ${room.availableCount} → ${newAvailable} available`);

            // Find room row in sheet
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.ROOMS_SHEET.sheetName}!A:I`
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row =>
                row[this.roomsColumnMap.ROOM_NAME] &&
                row[this.roomsColumnMap.ROOM_NAME].toLowerCase() === roomType.toLowerCase()
            );

            if (rowIndex === -1) {
                console.warn(`❌ Room ${roomType} not found in sheet`);
                return;
            }

            const sheetRow = rowIndex + 1; // +1 for header row

            // Update in Google Sheets
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.ROOMS_SHEET.sheetName}!E${sheetRow}:F${sheetRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[
                        newAvailable.toString(),  // Current Available
                        newBookedDates.join(',')  // Booked Dates
                    ]]
                }
            });

            console.log(`✅ Room ${roomType} availability updated to ${newAvailable}`);

        } catch (error) {
            console.error('❌ Error updating room availability:', error);
            throw error;
        }
    }

    // Check-in a booking
    async checkInBooking(bookingId, checkInTime = new Date()) {
        await this.ensureColumnMaps();

        try {
            const bookings = await this.getAllBookings({ includeCancelled: true });
            const booking = bookings.find(b => b.bookingId === bookingId);

            if (!booking) throw new Error('Booking not found');
            if (booking.status !== 'confirmed') {
                throw new Error(`Booking is ${booking.status}, cannot check-in. Must be confirmed first.`);
            }

            // Get the actual row
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!A:Z`
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row =>
                row[this.bookingsColumnMap.BOOKING_ID] === bookingId
            );

            if (rowIndex === -1) throw new Error('Booking not found in sheet');

            const sheetRow = rowIndex + 1;
            const map = this.bookingsColumnMap;

            // 1. Update status to 'checked_in'
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!${this.getColumnLetter(map.STATUS)}${sheetRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['checked_in']] }
            });

            // 2. Add check-in timestamp
            if (map.CHECK_IN_AT !== undefined) {
                await this.sheets.spreadsheets.values.update({
                    auth: this.auth,
                    spreadsheetId: this.spreadsheetId,
                    range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!${this.getColumnLetter(map.CHECK_IN_AT)}${sheetRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[checkInTime.toISOString()]] }
                });
            }

            // 3. Log activity
            await this.logActivity({
                date: new Date().toISOString().split('T')[0],
                bookingId: bookingId,
                action: 'checked_in',
                performedBy: 'Staff',
                details: `Customer checked in at ${checkInTime.toLocaleTimeString()}`
            });

            console.log(`✅ Booking ${bookingId} checked in`);
            return {
                success: true,
                message: 'Check-in recorded successfully'
            };

        } catch (error) {
            console.error('❌ Error during check-in:', error);
            throw error;
        }
    }

    // Check-out a booking (THIS INCREASES ROOM AVAILABILITY!)
    async checkOutBooking(bookingId, checkOutTime = new Date()) {
        await this.ensureColumnMaps();

        try {
            const bookings = await this.getAllBookings({ includeCancelled: true });
            const booking = bookings.find(b => b.bookingId === bookingId);

            if (!booking) throw new Error('Booking not found');
            if (booking.status !== 'checked_in') {
                throw new Error(`Booking is ${booking.status}, cannot check-out. Must be checked in first.`);
            }

            // Get the actual row
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!A:Z`
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row =>
                row[this.bookingsColumnMap.BOOKING_ID] === bookingId
            );

            if (rowIndex === -1) throw new Error('Booking not found in sheet');

            const sheetRow = rowIndex + 1;
            const map = this.bookingsColumnMap;

            // 1. Update status to 'checked_out'
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!${this.getColumnLetter(map.STATUS)}${sheetRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['checked_out']] }
            });

            // 2. Add check-out timestamp
            if (map.CHECK_OUT_AT !== undefined) {
                await this.sheets.spreadsheets.values.update({
                    auth: this.auth,
                    spreadsheetId: this.spreadsheetId,
                    range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!${this.getColumnLetter(map.CHECK_OUT_AT)}${sheetRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[checkOutTime.toISOString()]] }
                });
            }

            // 3. MOST IMPORTANT: INCREASE ROOM AVAILABILITY
            console.log(`📊 Increasing room availability for ${booking.roomType} after check-out...`);
            await this.updateRoomAvailability(booking.roomType, booking.checkInDate, booking.nights, false);

            // 4. Log activity
            await this.logActivity({
                date: new Date().toISOString().split('T')[0],
                bookingId: bookingId,
                action: 'checked_out',
                performedBy: 'Staff',
                details: `Customer checked out at ${checkOutTime.toLocaleTimeString()}. Room ${booking.roomType} is now available.`
            });

            console.log(`✅ Booking ${bookingId} checked out. Room availability increased.`);
            return {
                success: true,
                message: 'Check-out completed and room made available'
            };

        } catch (error) {
            console.error('❌ Error during check-out:', error);
            throw error;
        }
    }

    // Auto-checkout expired bookings (run this daily)
    async autoCheckoutExpiredBookings() {
        try {
            const today = new Date().toISOString().split('T')[0];
            console.log(`🔄 Running auto-checkout for ${today}...`);

            // Get all checked-in bookings
            const checkedInBookings = await this.getAllBookings({ status: 'checked_in' });

            // Find bookings where check-out date is in the past
            const expiredBookings = checkedInBookings.filter(booking => {
                return booking.checkOutDate < today && !booking.checkOutAt;
            });

            console.log(`📊 Found ${expiredBookings.length} bookings to auto-checkout`);

            const results = [];

            // Auto check-out each expired booking
            for (const booking of expiredBookings) {
                try {
                    console.log(`   Auto-checking out: ${booking.bookingId} (Check-out: ${booking.checkOutDate})`);
                    await this.checkOutBooking(booking.bookingId);
                    results.push({
                        bookingId: booking.bookingId,
                        success: true,
                        message: 'Auto-checked out successfully'
                    });
                    console.log(`   ✅ Auto-checked out: ${booking.bookingId}`);
                } catch (error) {
                    console.error(`   ❌ Failed to auto-checkout ${booking.bookingId}:`, error.message);
                    results.push({
                        bookingId: booking.bookingId,
                        success: false,
                        error: error.message
                    });
                }
            }

            return {
                success: true,
                processed: expiredBookings.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                results: results,
                message: `Auto-checkout completed. Processed: ${expiredBookings.length} bookings`
            };

        } catch (error) {
            console.error('❌ Error in auto-checkout:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Log activity to daily_log sheet
    async logActivity(activity) {
        try {
            await this.sheets.spreadsheets.values.append({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'daily_log!A:E',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [[
                        activity.date,
                        activity.bookingId || '',
                        activity.action,
                        activity.performedBy,
                        activity.details
                    ]]
                }
            });
        } catch (error) {
            console.error('❌ Error logging activity:', error);
        }
    }

    // Helper to get sheet ID by name
    async getSheetId(sheetName) {
        const spreadsheet = await this.sheets.spreadsheets.get({
            auth: this.auth,
            spreadsheetId: this.spreadsheetId
        });

        const sheet = spreadsheet.data.sheets.find(s =>
            s.properties.title === sheetName
        );

        return sheet ? sheet.properties.sheetId : null;
    }

    // Add these methods to your GoogleSheetsService class:

    async getPendingBookings() {
        await this.ensureColumnMaps();

        try {
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!A:Z`
            });

            const rows = response.data.values || [];
            const dataRows = rows.slice(1); // Skip header
            const map = this.bookingsColumnMap;

            return dataRows
                .filter(row => {
                    const status = row[map.STATUS] || '';
                    return status.toLowerCase() === 'requested';
                })
                .map(row => {
                    const get = (key, defaultValue = '') => {
                        const index = map[key];
                        return index !== undefined && row[index] !== undefined
                            ? row[index]
                            : defaultValue;
                    };

                    return {
                        bookingId: get('BOOKING_ID'),
                        customerName: get('CUSTOMER_NAME'),
                        customerPhone: get('PHONE'),
                        roomType: get('ROOM_TYPE'),
                        roomId: get('ROOM_ID'),
                        checkInDate: get('CHECK_IN'),
                        checkOutDate: get('CHECK_OUT'),
                        nights: this.parseNights(get('NIGHTS')),
                        guests: parseInt(get('GUESTS')) || 1,
                        totalAmount: parseInt(get('TOTAL')) || 0,
                        status: get('STATUS'),
                        paymentStatus: get('PAYMENT_STATUS') || 'pending',
                        paymentMethod: get('PAYMENT_METHOD') || '',
                        specialRequests: get('SPECIAL_REQUESTS') || 'No Special Requests',
                        requestedAt: get('REQUESTED_AT')
                    };
                });
        } catch (error) {
            console.error('❌ Error getting pending bookings:', error);
            return [];
        }
    }

    async checkAvailability(roomType, checkInDate, nights = 1) {
        try {
            console.log(`🔍 Checking availability for: ${roomType}, ${checkInDate}, ${nights} nights`);

            const rooms = await this.getAllRooms();
            const room = rooms.find(r => {
                const roomName = r.name.toLowerCase().trim();
                const searchTerm = roomType.toLowerCase().trim();
                return roomName.includes(searchTerm) || searchTerm.includes(roomName);
            });

            if (!room) {
                return {
                    available: false,
                    message: `Room type "${roomType}" not found.`,
                    availableCount: 0
                };
            }

            const isAvailable = room.availableCount > 0;
            return {
                available: isAvailable,
                availableCount: room.availableCount,
                room: room,
                message: isAvailable
                    ? `✅ ${room.name} is available! ${room.availableCount} room(s) free.`
                    : `❌ ${room.name} is not available. Only ${room.availableCount} room(s) left.`
            };

        } catch (error) {
            console.error('❌ Error checking availability:', error);
            return {
                available: false,
                message: `Error checking availability: ${error.message}`,
                availableCount: 0
            };
        }
    }

    async getAllRoomsWithAvailability(checkInDate = null, nights = 1) {
        try {
            const rooms = await this.getAllRooms();

            if (checkInDate) {
                return await Promise.all(rooms.map(async (room) => {
                    try {
                        const availability = await this.checkAvailability(room.name, checkInDate, nights);
                        return {
                            ...room,
                            isAvailable: availability.available,
                            availableCount: availability.availableCount,
                            availabilityMessage: availability.message
                        };
                    } catch (error) {
                        return {
                            ...room,
                            isAvailable: false,
                            availableCount: 0,
                            availabilityMessage: `Error checking availability`
                        };
                    }
                }));
            }

            return rooms.map(room => ({
                ...room,
                isAvailable: room.availableCount > 0,
                availabilityMessage: room.availableCount > 0
                    ? `✅ ${room.availableCount} available`
                    : `❌ Booked`
            }));
        } catch (error) {
            console.error('❌ Error getting rooms with availability:', error);
            return [];
        }
    }

    async cancelBooking(bookingId, reason = 'Cancelled by staff') {
        await this.ensureColumnMaps();

        try {
            console.log(`❌ Cancelling booking ${bookingId}: ${reason}`);

            // Find booking
            const bookings = await this.getAllBookings({ includeCancelled: true });
            const booking = bookings.find(b => b.bookingId === bookingId);

            if (!booking) throw new Error(`Booking ${bookingId} not found`);

            // Get the actual row
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!A:Z`
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row =>
                row[this.bookingsColumnMap.BOOKING_ID] === bookingId
            );

            if (rowIndex === -1) throw new Error('Booking not found in sheet');

            const sheetRow = rowIndex + 1;
            const map = this.bookingsColumnMap;

            // Update status to 'cancelled'
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!${this.getColumnLetter(map.STATUS)}${sheetRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['cancelled']] }
            });

            // Update notes
            if (map.NOTES !== undefined) {
                const note = `Cancelled: ${reason} (${new Date().toLocaleString()})`;
                await this.sheets.spreadsheets.values.update({
                    auth: this.auth,
                    spreadsheetId: this.spreadsheetId,
                    range: `${sheetConfig.BOOKINGS_SHEET.sheetName}!${this.getColumnLetter(map.NOTES)}${sheetRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[note]] }
                });
            }

            // If booking was confirmed, restore room availability
            if (booking.status === 'confirmed') {
                console.log(`🔄 Restoring room availability for ${booking.roomType}...`);
                await this.updateRoomAvailability(booking.roomType, booking.checkInDate, booking.nights, false);
            }

            // Log activity
            await this.logActivity({
                date: new Date().toISOString().split('T')[0],
                bookingId: bookingId,
                action: 'cancelled',
                performedBy: 'Staff',
                details: `Booking cancelled: ${reason}.`
            });

            console.log(`✅ Booking ${bookingId} cancelled successfully`);
            return {
                success: true,
                message: 'Booking cancelled successfully',
                bookingId: bookingId
            };

        } catch (error) {
            console.error('❌ Error cancelling booking:', error);
            throw error;
        }
    }

    // Helper method to parse nights (already used but not defined)
    parseNights(nightsValue) {
        if (!nightsValue) return 1;

        if (typeof nightsValue === 'string' && nightsValue.includes('1900')) {
            const day = parseInt(nightsValue.split('-')[2]);
            if (!isNaN(day)) {
                return day - 1;
            }
        }

        const nights = parseInt(nightsValue);
        return isNaN(nights) || nights < 1 || nights > 30 ? 1 : nights;
    }

    // Helper method to get date range (already used but not defined)
    getDateRange(startDate, nights) {
        const dates = [];
        const start = new Date(startDate);

        for (let i = 0; i < nights; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            dates.push(date.toISOString().split('T')[0]);
        }

        return dates;
    }

    // Calculate check-out date
    calculateCheckOutDate(checkInDate, nights) {
        const date = new Date(checkInDate);
        date.setDate(date.getDate() + nights);
        return date.toISOString().split('T')[0];
    }


}

module.exports = GoogleSheetsService;