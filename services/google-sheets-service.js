const { max } = require('date-fns');
const { de } = require('date-fns/locale');
const { google } = require('googleapis');
const path = require('path');

class GoogleSheetsService {
    constructor() {

        console.log('📊 Initializing GoogleSheetsService...');
        console.log('GOOGLE_SHEETS_ID from env:', process.env.GOOGLE_SHEETS_ID);

        this.auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, '../credentials.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        this.sheets = google.sheets({ version: 'v4' });
        this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    }

    async getAllRooms() {
        try {
            const res = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'rooms_tab!A2:I'
            });

            console.log('📊 Raw rooms data:', res.data.values);

            return (res.data.values || []).map((row, i) => {
                // Handle empty rows
                if (!row || row.length === 0) return null;

                // Parse booked dates
                let bookedDates = [];
                if (row[5] && row[5].trim() !== '') {
                    bookedDates = row[5].split(',').map(d => d.trim()).filter(d => {
                        if (!d) return false;
                        const date = new Date(d);
                        return date.toString() !== 'Invalid Date';
                    });
                }

                const roomData = {
                    roomId: row[0] || `R${i + 100}`,
                    name: row[1] || `Room ${i + 1}`,
                    pricePerNight: parseInt(row[2]) || 0,
                    totalRooms: parseInt(row[3]) || 0,
                    availableCount: parseInt(row[4]) || 0,
                    bookedDates: bookedDates,
                    maxGuest: parseInt(row[6]) || 1,
                    amenities: row[7] ? row[7].split(',').map(a => a.trim()) : [],
                    description: row[8] || ''
                };

                console.log(`Room ${i + 1}:`, roomData.name, 'Available:', roomData.availableCount);
                return roomData;
            }).filter(room => room !== null);
        } catch (error) {
            console.error('❌ Error getting rooms:', error);
            return [];
        }
    }

    getDateRange(startDate, nights) {
        const dates = [];
        const start = new Date(startDate);

        for (let i = 0; i < nights; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        return dates;
    }

    parseNights(value) {
        if (!value) return 1;

        if (typeof value === 'string' && value.startsWith('1900')) {
            const day = parseInt(value.split('-')[2]);
            return Math.max(1, day - 1);
        }

        const n = parseInt(value);
        return isNaN(n) || n < 1 ? 1 : n;
    }

    async checkAvailability(roomType, checkInDate, nights = 1) {
        try {
            console.log(`🔍 Checking availability for: ${roomType}, ${checkInDate}, ${nights} nights`);

            const rooms = await this.getAllRooms();
            console.log(`Found ${rooms.length} rooms`);

            // Normalize room type search
            const searchTerm = roomType.toLowerCase().trim();
            const room = rooms.find(r => {
                const roomName = r.name.toLowerCase().trim();
                return roomName.includes(searchTerm) || searchTerm.includes(roomName);
            });

            console.log('Found room:', room ? room.name : 'None');

            if (!room) {
                return {
                    available: false,
                    message: `Room type "${roomType}" not found. Available: ${rooms.map(r => r.name).join(', ')}`,
                    availableCount: 0
                };
            }

            const isAvailable = room.availableCount > 0;
            const result = {
                available: isAvailable,
                availableCount: room.availableCount,
                room: room,
                message: isAvailable
                    ? `✅ ${room.name} is available! ${room.availableCount} room(s) free.`
                    : `❌ ${room.name} is not available. Only ${room.availableCount} room(s) left.`
            };

            console.log(`✅ Availability result:`, result);
            return result;

        } catch (error) {
            console.error('❌ Error checking availability:', error);
            return {
                available: false,
                message: `Error checking availability: ${error.message}`,
                availableCount: 0
            };
        }
    }
    async createBookingRequest(bookingData) {
        try {
            const bookingId = `BK${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
            const {
                customerName,
                customerPhone,
                roomType,
                checkInDate,
                nights = 1,
                guests = 2,
                specialRequests = "None",
                status = 'requested' // Default to requested, not confirmed
            } = bookingData;

            console.log(`📝 Creating booking REQUEST (status: ${status}):`, { customerName, roomType, checkInDate, nights });

            // Check availability
            const availability = await this.checkAvailability(roomType, checkInDate, nights);
            if (!availability.available) {
                throw new Error(`Room not available: ${availability.message}`);
            }

            // Calculate details
            const totalAmount = availability.room.pricePerNight * nights;
            const checkOutDate = this.calculateCheckOutDate(checkInDate, nights);
            const roomId = availability.room.roomId;
            const currentTime = new Date().toISOString();

            console.log(`💰 Total: ${totalAmount}, Check-out: ${checkOutDate}, Room ID: ${roomId}`);

            // Insert into bookings_tab - MAKE SURE status is 'requested'
            const bookingRow = [
                bookingId,                    // A: BookingID
                customerName,                 // B: Customer Name
                customerPhone,                // C: Phone
                roomType,                     // D: Room Type
                roomId,                       // E: Room ID
                checkInDate,                  // F: Check-in
                checkOutDate,                 // G: Check-out
                nights.toString(),           // H: Nights
                guests.toString(),           // I: Guests
                totalAmount.toString(),      // J: Total
                'requested',                 // K: Status - MUST BE 'requested'
                'pending',                   // L: Payment Status
                '',                          // M: Payment Method
                specialRequests,             // N: Special Reqests
                currentTime,                 // O: RequestedAt
                '',                          // P: ConfirmedAt (empty for requests)
                '',                          // Q: Confirmed By (empty for requests)
                '',                          // R: Check-in At
                '',                          // S: Check-out At
                ''                           // T: Notes
            ];

            console.log('📝 Booking row to insert:', bookingRow);

            await this.sheets.spreadsheets.values.append({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'bookings_tab!A:T',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [bookingRow]
                }
            });

            console.log(`✅ Booking REQUEST ${bookingId} inserted into Google Sheets (status: requested)`);

            // IMPORTANT: DO NOT update room availability yet - wait for staff approval
            // Room availability should only be decreased when booking is CONFIRMED by staff

            return {
                success: true,
                booking: {
                    bookingId,
                    customerName,
                    customerPhone,
                    roomType,
                    roomId,
                    checkInDate,
                    checkOutDate,
                    nights,
                    guests,
                    totalAmount,
                    status: 'requested' // Important: return as requested
                },
                message: 'Booking request submitted successfully! Our staff will contact you shortly to confirm.'
            };

        } catch (error) {
            console.error('❌ Booking request error:', error);
            throw error;
        }
    }

    async cancelBooking(bookingId, reason = 'Cancelled by staff') {
        try {
            console.log(`❌ Cancelling booking ${bookingId}: ${reason}`);

            // Get all bookings to find the specific one
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'bookings_tab!A2:T' // Get all columns
            });

            const rows = response.data.values || [];
            console.log(`📊 Found ${rows.length} bookings in sheet`);

            // Find the booking row
            const rowIndex = rows.findIndex(row => row[0] === bookingId);

            if (rowIndex === -1) {
                throw new Error(`Booking ${bookingId} not found in Google Sheets`);
            }

            console.log(`✅ Found booking at row ${rowIndex + 2}`);

            // IMPORTANT: Google Sheets rows start at 1, and we have header row at row 1
            const sheetRow = rowIndex + 2; // +1 for zero-index, +1 for header row

            const bookingRow = rows[rowIndex];
            console.log(`📝 Booking row data:`, bookingRow);

            // Check current status before cancelling
            const currentStatus = bookingRow[10] || ''; // Column K = Status
            console.log(`📊 Current status: ${currentStatus}`);

            // Update status to 'cancelled' (Column K = status column, index 10)
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `bookings_tab!K${sheetRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [['cancelled']]
                }
            });

            console.log(`✅ Updated status to 'cancelled'`);

            // Update notes column (Column T = Notes column, index 19)
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `bookings_tab!T${sheetRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[`Cancelled: ${reason} (${new Date().toLocaleString()})`]]
                }
            });

            console.log(`✅ Added cancellation note`);

            // If booking was confirmed, restore room availability
            if (currentStatus.toLowerCase() === 'confirmed') {
                console.log(`🔄 Booking was confirmed, restoring room availability...`);

                // Get booking details for room restoration
                const roomType = bookingRow[3]; // Column D = Room Type
                const checkInDate = bookingRow[5]; // Column F = Check-in date
                const nights = parseInt(bookingRow[7]) || 1; // Column H = Nights

                console.log(`📊 Restoration details:`, { roomType, checkInDate, nights });

                if (roomType && checkInDate) {
                    try {
                        // Increment room availability (this will remove booked dates)
                        await this.incrementRoomAvailability(bookingRow[4] || roomType, checkInDate, nights);
                        console.log(`✅ Room availability restored for ${roomType}`);
                    } catch (roomError) {
                        console.error(`❌ Error restoring room availability:`, roomError);
                    }
                }
            }

            // Log activity
            await this.logActivity({
                date: new Date().toISOString().split('T')[0],
                bookingId,
                action: 'cancelled',
                performedBy: 'Staff',
                details: `Booking cancelled: ${reason}.`
            });

            console.log(`✅ Booking ${bookingId} cancelled successfully in Google Sheets`);
            return {
                success: true,
                message: 'Booking cancelled successfully',
                bookingId: bookingId
            };

        } catch (error) {
            console.error('❌ Error cancelling booking in Google Sheets:', error);
            throw error;
        }
    }

    async getAllRoomsWithAvailability(checkInDate = null, nights = 1) {
        try {
            const rooms = await this.getAllRooms();
            console.log(`📊 Got ${rooms.length} rooms from Google Sheets`);

            // If checkInDate provided, check availability for specific dates
            if (checkInDate) {
                console.log(`🔍 Checking availability for ${checkInDate}, ${nights} nights`);
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
                        console.error(`Error checking availability for ${room.name}:`, error);
                        return {
                            ...room,
                            isAvailable: false,
                            availableCount: 0,
                            availabilityMessage: `Error checking availability`
                        };
                    }
                }));
            }

            // Just return current availability
            const roomsWithAvailability = rooms.map(room => ({
                ...room,
                isAvailable: room.availableCount > 0,
                availabilityMessage: room.availableCount > 0
                    ? `✅ ${room.availableCount} available`
                    : `❌ Booked`
            }));

            console.log(`📊 Rooms with availability:`, roomsWithAvailability.map(r =>
                `${r.name}: ${r.isAvailable ? 'Available' : 'Booked'} (${r.availableCount})`
            ));

            return roomsWithAvailability;
        } catch (error) {
            console.error('❌ Error getting rooms with availability:', error);
            return [];
        }
    }

    async getPendingBookings() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'bookings_tab!A2:T' // All columns
            });

            const rows = response.data.values || [];

            return rows
                .filter(row => {
                    const status = row[10]; // Column K = status
                    return status === 'requested' || status === 'Requested';
                })
                .map(row => ({
                    bookingId: row[0],
                    customerName: row[1],
                    customerPhone: row[2],
                    roomType: row[3],
                    roomId: row[4],
                    checkInDate: row[5],
                    checkOutDate: row[6],
                    nights: parseInt(row[7]) || 1,
                    guests: parseInt(row[8]) || 2,
                    totalAmount: parseInt(row[9]) || 0,
                    status: row[10],
                    paymentStatus: row[11] || 'pending',
                    paymentMethod: row[12] || "online",
                    specialRequests: row[13] || 'No Special Requests',
                }));
        } catch (error) {
            console.error('Error getting pending bookings:', error);
            return [];
        }
    }

    async approveBooking(bookingId, employeeName = 'Staff') {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'bookings_tab!A2:T'
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[0] === bookingId);

            if (rowIndex === -1) {
                throw new Error('Booking not found');
            }

            const booking = rows[rowIndex];
            const currentRow = rowIndex + 2;
            const currentTime = new Date().toISOString();

            // Update status to confirmed
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `bookings_tab!K${currentRow}`, // Status column
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [['confirmed']]
                }
            });

            // Update confirmation details
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `bookings_tab!P${currentRow}:Q${currentRow}`, // ConfirmedAt and Confirmed By
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[currentTime, employeeName]]
                }
            });

            // Update payment status
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `bookings_tab!L${currentRow}`, // Payment Status column
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [['paid']]
                }
            });

            // NOW decrease room availability
            const roomType = booking[3]; // D: Room Type
            const checkInDate = booking[5]; // F: Check-in
            const nights = parseInt(booking[7]) || 1; // H: Nights
            const totalAmount = parseInt(booking[9]) || 0;

            console.log(`📊 Confirming booking ${bookingId} - decreasing availability for ${roomType}`);
            await this.updateRoomBookedDates(roomType, checkInDate, nights, bookingId, true);

            // Log activity
            await this.logActivity({
                date: new Date().toISOString().split('T')[0],
                bookingId,
                action: 'approved',
                performedBy: employeeName,
                details: `Booking approved by ${employeeName} and payment received: Nu.${totalAmount}`
            });

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

    // Helper methods
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

    calculateCheckOutDate(checkInDate, nights) {
        const date = new Date(checkInDate);
        date.setDate(date.getDate() + nights);
        return date.toISOString().split('T')[0];
    }

    async updateCustomerRecord(phone, name, amount = 0) {
        try {
            // Implementation for customers sheet
            // Similar to previous but for Google Sheets
        } catch (error) {
            console.error('Error updating customer record:', error);
        }
    }

    async markRoomPending(roomType, checkInDate, nights, bookingId) {
        // Optional: Mark room as temporarily pending
        // This prevents double booking between request and confirmation
    }

    async updateRoomBookedDates(roomType, checkInDate, nights, bookingId, shouldBook = true) {
        try {
            // Get current room data
            const rooms = await this.getAllRooms();
            const room = rooms.find(r => r.name && r.name.toLowerCase() === roomType.toLowerCase());

            if (!room) {
                console.warn(`❌ Room ${roomType} not found`);
                return;
            }

            // Calculate dates to book/unbook
            const datesToUpdate = this.getDateRange(checkInDate, parseInt(nights));

            let newBookedDates;
            let newAvailable;

            if (shouldBook) {
                // Add dates to bookedDates (for confirmation)
                newBookedDates = [...room.bookedDates, ...datesToUpdate];
                newAvailable = Math.max(0, room.availableCount - 1);
            } else {
                // Remove dates from bookedDates (for cancellation)
                newBookedDates = room.bookedDates.filter(date =>
                    !datesToUpdate.includes(date)
                );
                newAvailable = Math.min(room.totalRooms, room.availableCount + 1);
            }

            // Find room row index
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'rooms_tab!A2:I'
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[1] && row[1].toLowerCase() === roomType.toLowerCase());

            if (rowIndex === -1) {
                console.warn(`❌ Room ${roomType} not found in sheet rows`);
                return;
            }

            // Update room in Google Sheets
            const sheetRow = rowIndex + 2;
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `rooms_tab!E${sheetRow}:F${sheetRow}`, // Columns E,F
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[
                        newAvailable.toString(),  // Current Available (E)
                        newBookedDates.join(',')  // Booked Dates (F)
                    ]]
                }
            });

            console.log(`✅ Room ${roomType} availability ${shouldBook ? 'decreased' : 'increased'} to ${newAvailable} for booking ${bookingId}`);

        } catch (error) {
            console.error('❌ Error updating room booked dates:', error);
            throw error;
        }
    }

    // Add these methods to GoogleSheetsService class:

    // Check-in a booking (customer arrives)
    async checkInBooking(bookingId, checkInTime = new Date()) {
        try {
            // Find booking
            const bookings = await this.getAllBookings();
            const booking = bookings.find(b => b.bookingId === bookingId);

            if (!booking) throw new Error('Booking not found');
            if (booking.status !== 'confirmed') throw new Error('Booking not confirmed');

            // Update booking status
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'bookings_tab!A2:T'
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[0] === bookingId);

            if (rowIndex === -1) throw new Error('Booking not found in sheet');

            // Update status to checked_in and add check-in time
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `bookings_tab!S${rowIndex + 2}:T${rowIndex + 2}`, // Columns S,T
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[
                        checkInTime.toISOString(), // Check-in At (S)
                        '' // Check-out At empty (T)
                    ]]
                }
            });

            // Log activity
            await this.logActivity({
                date: new Date().toISOString().split('T')[0],
                bookingId,
                action: 'checked_in',
                performedBy: 'System',
                details: `Customer checked in at ${checkInTime.toLocaleTimeString()}`
            });

            console.log(`✅ Booking ${bookingId} checked in`);
            return { success: true, message: 'Check-in recorded' };

        } catch (error) {
            console.error('Error during check-in:', error);
            throw error;
        }
    }

    // Check-out a booking (customer leaves) - INCREMENTS ROOM AVAILABILITY
    async checkOutBooking(bookingId, checkOutTime = new Date()) {
        try {
            // Find booking
            const bookings = await this.getAllBookings();
            const booking = bookings.find(b => b.bookingId === bookingId);

            if (!booking) throw new Error('Booking not found');
            if (booking.status !== 'confirmed') throw new Error('Booking not confirmed');

            // Get current booking row
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'bookings_tab!A2:T'
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[0] === bookingId);

            if (rowIndex === -1) throw new Error('Booking not found in sheet');

            // Update check-out time
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `bookings_tab!T${rowIndex + 2}`, // Column T (Check-out At)
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[checkOutTime.toISOString()]]
                }
            });

            // Update status to checked_out
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `bookings_tab!K${rowIndex + 2}`, // Column K (Status)
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [['checked_out']]
                }
            });

            // MOST IMPORTANT: INCREMENT ROOM AVAILABILITY
            await this.incrementRoomAvailability(booking.roomId, booking.checkInDate, booking.nights);

            // Log activity
            await this.logActivity({
                date: new Date().toISOString().split('T')[0],
                bookingId,
                action: 'checked_out',
                performedBy: 'System',
                details: `Customer checked out at ${checkOutTime.toLocaleTimeString()}, room ${booking.roomType} is now available`
            });

            console.log(`✅ Booking ${bookingId} checked out - Room availability updated`);
            return { success: true, message: 'Check-out completed and room made available' };

        } catch (error) {
            console.error('Error during check-out:', error);
            throw error;
        }
    }

    // Increment room availability after check-out
    async incrementRoomAvailability(roomId, checkInDate, nights) {
        try {
            // Get current room data
            const rooms = await this.getAllRooms();
            const room = rooms.find(r => r.roomId === roomId || r.name.toLowerCase() === roomId.toLowerCase());

            if (!room) {
                console.warn(`Room ${roomId} not found`);
                return;
            }

            // Calculate dates to free up
            const datesToFree = this.getDateRange(checkInDate, nights);

            // Remove these dates from bookedDates
            const newBookedDates = room.bookedDates.filter(date =>
                !datesToFree.includes(date)
            );

            // Increment available count
            const newAvailable = Math.min(room.totalRooms, room.availableCount + 1);

            // Find room row
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'rooms_tab!A2:I'
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[0] === roomId || row[1] && row[1].toLowerCase() === room.name.toLowerCase());

            if (rowIndex === -1) return;

            const sheetRow = rowIndex + 2;



            // Update room in Google Sheets
            await this.sheets.spreadsheets.values.update({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: `rooms_tab!E${rowIndex + 2}:F${rowIndex + 2}`, // Columns E,F
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[
                        newAvailable.toString(), // Current Available (E)
                        newBookedDates.join(',') // Booked Dates (F)
                    ]]
                }
            });

            console.log(`✅ Room ${roomId} availability incremented to ${newAvailable}`);

        } catch (error) {
            console.error('Error incrementing room availability:', error);
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
            console.error('Error logging activity:', error);
        }
    }


    // Auto-checkout expired bookings (run daily)
    async autoCheckoutExpiredBookings() {
        try {
            const today = new Date().toISOString().split('T')[0];

            // Get all confirmed bookings where check-out date is past
            const bookings = await this.getAllBookings({ status: 'confirmed' });
            const expiredBookings = bookings.filter(booking =>
                booking.checkOutDate < today && !booking.checkOutAt
            );

            console.log(`🔄 Found ${expiredBookings.length} bookings to auto-checkout`);

            // Auto check-out each expired booking
            for (const booking of expiredBookings) {
                try {
                    await this.checkOutBooking(booking.bookingId);
                    console.log(`✅ Auto-checked out: ${booking.bookingId}`);
                } catch (error) {
                    console.error(`❌ Failed to auto-checkout ${booking.bookingId}:`, error.message);
                }
            }

            return {
                success: true,
                processed: expiredBookings.length,
                message: `Auto-checked out ${expiredBookings.length} bookings`
            };

        } catch (error) {
            console.error('Error in auto-checkout:', error);
            return { success: false, error: error.message };
        }
    }

    async getAllBookings(filters = {}) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                auth: this.auth,
                spreadsheetId: this.spreadsheetId,
                range: 'bookings_tab!A2:T'
            });

            const rows = response.data.values || [];
            console.log(`📋 Found ${rows.length} bookings in sheet`);

            const bookings = rows.map(row => {
                // Map columns based on your sheet headers
                return {
                    bookingId: row[0] || '',                          // A: BookingID
                    customerName: row[1] || '',                       // B: Customer Name
                    customerPhone: row[2] || '',                      // C: Phone
                    roomType: row[3] || '',                           // D: Room Type
                    roomId: row[4] || '',                             // E: Room ID
                    checkInDate: row[5] || '',                        // F: Check-in
                    checkOutDate: row[6] || '',                       // G: Check-out
                    nights: this.parseNights(row[7]) || 1,           // H: Nights
                    guests: parseInt(row[8]) || 2,                    // I: Guests
                    totalAmount: parseInt(row[9]) || 0,               // J: Total
                    status: (row[10] || '').toLowerCase(),           // K: Status
                    paymentStatus: row[11] || 'pending',              // L: Payment Status
                    paymentMethod: row[12] || '',                     // M: Payment Method
                    specialRequests: row[13] || '',                   // N: Special Reqests
                    requestedAt: row[14] || '',                       // O: RequestedAt
                    confirmedAt: row[15] || '',                       // P: ConfirmedAt
                    confirmedBy: row[16] || '',                       // Q: Confirmed By
                    checkInAt: row[17] || '',                         // R: Check-in At
                    checkOutAt: row[18] || '',                        // S: Check-out At
                    notes: row[19] || ''                              // T: Notes
                };
            });

            console.log('📊 Processed bookings sample:', bookings.slice(0, 2));

            // Apply filters
            let filteredBookings = bookings;

            if (filters.status) {
                filteredBookings = filteredBookings.filter(b =>
                    b.status.toLowerCase() === filters.status.toLowerCase()
                );
            }

            if (filters.date) {
                filteredBookings = filteredBookings.filter(b =>
                    b.checkInDate === filters.date || b.checkOutDate === filters.date
                );
            }

            if (filters.roomType) {
                filteredBookings = filteredBookings.filter(b =>
                    b.roomType.toLowerCase().includes(filters.roomType.toLowerCase())
                );
            }

            if (filters.customerPhone) {
                filteredBookings = filteredBookings.filter(b =>
                    b.customerPhone.includes(filters.customerPhone)
                );
            }

            // Hide cancelled by default
            if (!filters.includeCancelled) {
                filteredBookings = filteredBookings.filter(b => b.status !== 'cancelled');
            }

            console.log(`✅ Returning ${filteredBookings.length} filtered bookings`);
            return filteredBookings;

        } catch (error) {
            console.error('❌ Error getting all bookings:', error);
            return [];
        }
    }

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
    async getBookingsByStatus(status = null) {
        const allBookings = await this.getAllBookings();
        if (status) {
            return allBookings.filter(b => b.status === status);
        }
        return allBookings;
    }
}

module.exports = GoogleSheetsService;