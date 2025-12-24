// services/booking-services.js - UPDATED EXPORT
const GoogleSheetsService = require('./google-sheets-service');

class BookingService {

    constructor() {
        this.GoogleSheets = new GoogleSheetsService();
    }
    async checkAvailability(roomType, checkInDate, nights = 1) {
        return await this.GoogleSheets.checkAvailability(roomType, checkInDate, nights);
    }
    async getAllRoomsWithAvailability(checkInDate = null, nights = 1) {
        return await this.GoogleSheets.getAllRoomsWithAvailability(checkInDate, nights);
    }
    async createBooking(bookingData) {
        return await this.GoogleSheets.createBookingRequest(bookingData);
    }
    async getPendingBookings() {
        return await this.GoogleSheets.getPendingBookings();
    }
    async approveBooking(bookingId, employeeName = 'Staff') {
        return await this.GoogleSheets.approveBooking(bookingId, employeeName);
    }
    async getAllRooms() {
        return await this.GoogleSheets.getAllRooms();
    }

    async getAllBookings(status = null) {
        try {
            return await this.GoogleSheets.getAllBookings({ status: status });
        } catch (error) {
            console.error('Error getting all bookings:', error);
            return [];
        }
    }
    async cancelBooking(bookingId, reason = 'Cancelled by staff') {
        console.log(`📝 [BookingService] Cancelling booking ${bookingId}`);

        try {
            // Delegate to GoogleSheetsService.cancelBooking
            return await this.GoogleSheets.cancelBooking(bookingId, reason);
        } catch (error) {
            console.error('❌ [BookingService] Error cancelling booking:', error);
            throw error;
        }
    }

    async checkInBooking(bookingId, checkInTime = new Date()) {
        try {
            return await this.GoogleSheets.checkInBooking(bookingId, checkInTime);
        } catch (error) {
            console.error('Error checking in:', error);
            throw error;
        }
    }
    async checkOutBooking(bookingId, checkOutTime = new Date()) {
        try {
            return await this.GoogleSheets.checkOutBooking(bookingId, checkOutTime);
        } catch (error) {
            console.error('Error checking out:', error);
            throw error;
        }
    }
    async getBookings(filters = {}) {
        try {
            return await this.GoogleSheets.getAllBookings(filters);
        } catch (error) {
            console.error('Error getting bookings:', error);
            return [];
        }
    }

    async autoCheckoutExpiredBookings() {
        try {
            return await this.GoogleSheets.autoCheckoutExpiredBookings();
        } catch (error) {
            console.error('Error in auto-checkout:', error);
            return { success: false, error: error.message };
        }
    }

    async getTodayCheckIns() {
        const today = new Date().toISOString().split('T')[0];
        const allBookings = await this.getBookings({ status: 'confirmed' });
        return allBookings.filter(b => b.checkInDate === today);
    }

    async getTodayCheckOuts() {
        const today = new Date().toISOString().split('T')[0];
        const allBookings = await this.getBookings({ status: 'checked_in' });
        return allBookings.filter(b => b.checkOutDate === today);
    }

    validateBookingInput({ roomType, checkInDate, nights, guests }) {
        if (!roomType || typeof roomType !== 'string') {
            throw new Error('Invalid room type');
        }

        if (!checkInDate || isNaN(Date.parse(checkInDate))) {
            throw new Error('Invalid check-in date');
        }

        const checkIn = new Date(checkInDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (checkIn < today) {
            throw new Error('Check-in date cannot be in the past');
        }

        if (!Number.isInteger(nights) || nights < 1 || nights > 30) {
            throw new Error('Number of nights must be between 1 and 30');
        }

        if (guests && (!Number.isInteger(guests) || guests < 1 || guests > 10)) {
            throw new Error('Invalid number of guests');
        }
    }
    async createBookingRequest(bookingData) {
        try {
            const { nights = 1, ...rest } = bookingData;

            const validatedNights = Math.max(1, Math.min(30, parseInt(nights) || 1));

            const bookingDataWithFixedNights = {
                ...rest,
                nights: validatedNights
            };

            return await this.GoogleSheets.createBookingRequest(bookingDataWithFixedNights);
        } catch (error) {
            console.error('Error creating booking request:', error);
            throw error;
        }
    }
}

module.exports = BookingService;  