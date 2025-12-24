// direct-booking.js - Create booking requests directly
require('dotenv').config();
const GoogleSheetsService = require('./services/google-sheets-service');
const path = require('path');

class DirectBooking {
    constructor() {
        console.log('📊 Initializing Direct Booking System...');
        this.sheetsService = new GoogleSheetsService();
    }

    // Create a booking request directly
    async createDirectBooking(bookingData) {
        try {
            console.log('📝 Creating direct booking request...');

            // Default values
            const bookingDetails = {
                customerName: bookingData.customerName || 'Guest',
                customerPhone: bookingData.customerPhone || '',
                roomType: bookingData.roomType || 'Double Room',
                checkInDate: bookingData.checkInDate || this.getTomorrowDate(),
                nights: parseInt(bookingData.nights) || 1,
                guests: parseInt(bookingData.guests) || 2,
                specialRequests: bookingData.specialRequests || 'None',
                status: 'requested' // Always requested, needs staff approval
            };

            console.log('📋 Booking Details:', bookingDetails);

            // Generate booking ID
            const bookingId = `BK${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

            // Check availability
            const availability = await this.sheetsService.checkAvailability(
                bookingDetails.roomType,
                bookingDetails.checkInDate,
                bookingDetails.nights
            );

            if (!availability.available) {
                throw new Error(`Room not available: ${availability.message}`);
            }

            // Calculate total amount
            const totalAmount = availability.room.pricePerNight * bookingDetails.nights;

            // Calculate check-out date
            const checkOutDate = this.calculateCheckOutDate(bookingDetails.checkInDate, bookingDetails.nights);

            // Current time for requestedAt
            const currentTime = new Date().toISOString();

            console.log(`💰 Total Amount: Nu.${totalAmount}`);
            console.log(`📅 Check-out: ${checkOutDate}`);
            console.log(`🏨 Room: ${availability.room.name}`);

            // Prepare booking row for Google Sheets
            const bookingRow = [
                bookingId,                    // A: BookingID
                bookingDetails.customerName,  // B: Customer Name
                bookingDetails.customerPhone, // C: Phone
                bookingDetails.roomType,      // D: Room Type
                availability.room.roomId,     // E: Room ID
                bookingDetails.checkInDate,   // F: Check-in
                checkOutDate,                 // G: Check-out
                bookingDetails.nights.toString(), // H: Nights
                bookingDetails.guests.toString(), // I: Guests
                totalAmount.toString(),       // J: Total
                'requested',                  // K: Status (requested, not confirmed)
                'pending',                    // L: Payment Status
                '',                           // M: Payment Method
                bookingDetails.specialRequests, // N: Special Requests
                currentTime,                  // O: RequestedAt
                '',                           // P: ConfirmedAt (empty for requests)
                '',                           // Q: Confirmed By (empty for requests)
                '',                           // R: Check-in At
                '',                           // S: Check-out At
                ''                            // T: Notes
            ];

            console.log('📝 Inserting into Google Sheets...');

            // Insert into Google Sheets
            await this.sheetsService.sheets.spreadsheets.values.append({
                auth: this.sheetsService.auth,
                spreadsheetId: this.sheetsService.spreadsheetId,
                range: 'bookings_tab!A:T',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [bookingRow]
                }
            });

            console.log(`✅ Booking REQUEST created successfully!`);
            console.log(`📋 Booking ID: ${bookingId}`);

            // Return success response
            return {
                success: true,
                booking: {
                    bookingId,
                    customerName: bookingDetails.customerName,
                    customerPhone: bookingDetails.customerPhone,
                    roomType: bookingDetails.roomType,
                    roomId: availability.room.roomId,
                    checkInDate: bookingDetails.checkInDate,
                    checkOutDate: checkOutDate,
                    nights: bookingDetails.nights,
                    guests: bookingDetails.guests,
                    totalAmount: totalAmount,
                    status: 'requested'
                },
                message: 'Booking request submitted successfully! Staff will contact you to confirm.',
                nextSteps: [
                    'Our staff will call you within 30 minutes',
                    'We will confirm availability and take payment',
                    'You will receive final confirmation via WhatsApp'
                ]
            };

        } catch (error) {
            console.error('❌ Error creating direct booking:', error);
            throw error;
        }
    }

    // Helper method to get tomorrow's date
    getTomorrowDate() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    }

    // Helper method to calculate check-out date
    calculateCheckOutDate(checkInDate, nights) {
        const date = new Date(checkInDate);
        date.setDate(date.getDate() + parseInt(nights));
        return date.toISOString().split('T')[0];
    }

    // Get all pending bookings
    async getPendingBookings() {
        try {
            return await this.sheetsService.getPendingBookings();
        } catch (error) {
            console.error('Error getting pending bookings:', error);
            return [];
        }
    }

    // Get room availability
    async getRoomAvailability(roomType = null, checkInDate = null, nights = 1) {
        try {
            if (roomType && checkInDate) {
                const availability = await this.sheetsService.checkAvailability(roomType, checkInDate, nights);
                return availability;
            } else {
                const rooms = await this.sheetsService.getAllRoomsWithAvailability();
                return rooms;
            }
        } catch (error) {
            console.error('Error getting room availability:', error);
            throw error;
        }
    }
}

// Command line interface
async function runDirectBooking() {
    const directBooking = new DirectBooking();

    console.log(`
╔══════════════════════════════════════════╗
║    🏨 DIRECT BOOKING REQUEST CREATOR    ║
╚══════════════════════════════════════════╝
    `);

    // Example booking data
    const bookingData = {
        customerName: 'Tashi Tenzin',
        customerPhone: '917585051277',
        roomType: 'Double Room',
        checkInDate: '2024-12-25',
        nights: 2,
        guests: 2,
        specialRequests: 'Early check-in requested'
    };

    console.log('📋 Creating booking with data:');
    console.log(JSON.stringify(bookingData, null, 2));

    try {
        // Create the booking
        const result = await directBooking.createDirectBooking(bookingData);

        console.log('\n✅ SUCCESS! Booking created:');
        console.log(JSON.stringify(result.booking, null, 2));

        console.log('\n📞 Next Steps:');
        result.nextSteps.forEach((step, i) => {
            console.log(`${i + 1}. ${step}`);
        });

        // Show pending bookings
        console.log('\n📊 Current Pending Bookings:');
        const pending = await directBooking.getPendingBookings();
        console.log(`Total pending: ${pending.length}`);

        if (pending.length > 0) {
            console.log('Recent pending bookings:');
            pending.slice(0, 3).forEach(booking => {
                console.log(`  • ${booking.bookingId}: ${booking.customerName} - ${booking.roomType}`);
            });
        }

    } catch (error) {
        console.error('\n❌ Failed to create booking:', error.message);
    }
}

// If running directly from command line
if (require.main === module) {
    runDirectBooking().catch(console.error);
}

module.exports = DirectBooking;