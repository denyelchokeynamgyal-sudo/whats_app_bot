// config/sheets-config.js
module.exports = {
    // Column mapping with dynamic discovery
    ROOMS_SHEET: {
        sheetName: 'rooms_tab',
        columns: {
            ROOM_ID: 'Room ID',
            ROOM_NAME: 'Room Name',
            PRICE: 'Price',
            TOTAL_ROOMS: 'Total Rooms',
            CURRENT_AVAILABLE: 'Current Available',
            BOOKED_DATES: 'Booked Dates',
            MAX_GUEST: 'Max Guest',
            AMENITIES: 'Amenities',
            DESCRIPTION: 'Description'
        }
    },

    BOOKINGS_SHEET: {
        sheetName: 'bookings_tab',
        columns: {
            BOOKING_ID: 'Booking ID',
            CUSTOMER_NAME: 'Customer Name',
            PHONE: 'Phone',
            ROOM_TYPE: 'Room Type',
            ROOM_COUNT: 'Room Count',
            TOTAL_ROOMS: 'Total Rooms',
            CHECK_IN: 'Check-in',
            CHECK_OUT: 'Check-out',
            NIGHTS: 'Nights',
            GUESTS: 'Guests',
            TOTAL: 'Total',
            STATUS: 'Status',
            PAYMENT_STATUS: 'Payment Status',
            PAYMENT_METHOD: 'Payment Method',
            SPECIAL_REQUESTS: 'Special Requests',
            REQUESTED_AT: 'RequestedAt',
            CONFIRMED_AT: 'ConfirmedAt',
            CONFIRMED_BY: 'Confirmed By',
            CHECK_IN_AT: 'Check-in At',
            CHECK_OUT_AT: 'Check-out At',
            NOTES: 'Notes'
        }
    }
};