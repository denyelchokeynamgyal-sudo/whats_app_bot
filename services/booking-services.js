// services/booking-services.js - UPDATED
const GoogleSheetsService = require('./google-sheets-service');

class BookingService {
    constructor() {
        this.GoogleSheets = new GoogleSheetsService();

        // Room capacities
        this.roomCapacities = {
            'Single Room': 1,
            'Double Room': 2,
            'Triple Room': 3,
            'Quad Room': 4,
            'Family Suite': 5
        };
    }

    // New method to get room capacities
    getRoomCapacities() {
        return this.roomCapacities;
    }

    // New method to validate room booking against 3-room limit
    validateRoomBooking(roomType, roomCount) {
        const errors = [];

        // Check if roomCount exceeds 3
        if (roomCount > 3) {
            errors.push(`Maximum 3 rooms per booking. You requested ${roomCount} rooms.`);
        }

        // Check if room type exists
        if (!this.roomCapacities[roomType]) {
            errors.push(`Room type "${roomType}" not found. Available: ${Object.keys(this.roomCapacities).join(', ')}`);
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            capacity: roomCount * (this.roomCapacities[roomType] || 0)
        };
    }

    // New method to validate combination booking
    validateCombinationBooking(rooms) {
        // rooms format: { 'Double Room': 2, 'Single Room': 1 }
        let totalRooms = 0;
        let totalCapacity = 0;
        const errors = [];

        for (const [roomType, count] of Object.entries(rooms)) {
            totalRooms += count;

            if (!this.roomCapacities[roomType]) {
                errors.push(`Room type "${roomType}" not found.`);
            } else {
                totalCapacity += count * this.roomCapacities[roomType];
            }
        }

        if (totalRooms > 3) {
            errors.push(`Maximum 3 rooms per booking. Total rooms requested: ${totalRooms}`);
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            totalRooms: totalRooms,
            totalCapacity: totalCapacity,
            rooms: rooms
        };
    }

    // Updated createBookingRequest to handle new fields
    async createBookingRequest(bookingData) {
        try {
            const { nights = 1, roomCount = 1, totalRooms = roomCount, guests = 1, ...rest } = bookingData;

            const validatedNights = Math.max(1, Math.min(30, parseInt(nights) || 1));
            const validatedRoomCount = Math.max(1, Math.min(3, parseInt(roomCount) || 1));
            const validatedTotalRooms = Math.max(1, Math.min(3, parseInt(totalRooms) || validatedRoomCount));
            const validatedGuests = Math.max(1, parseInt(guests) || 1);

            // Calculate total people based on room capacity if guests not specified
            let calculatedGuests = validatedGuests;
            if (bookingData.roomType && this.roomCapacities[bookingData.roomType]) {
                const maxCapacity = validatedRoomCount * this.roomCapacities[bookingData.roomType];
                calculatedGuests = Math.min(validatedGuests, maxCapacity);
            }

            const bookingDataWithFixedFields = {
                ...rest,
                nights: validatedNights,
                roomCount: validatedRoomCount,
                totalRooms: validatedTotalRooms,
                guests: calculatedGuests,
                status: 'requested',
                createdAt: new Date().toISOString()
            };

            return await this.GoogleSheets.createBookingRequest(bookingDataWithFixedFields);
        } catch (error) {
            console.error('Error creating booking request:', error);
            throw error;
        }
    }

    // Keep all existing methods...
    async checkAvailability(roomType, checkInDate, nights = 1) {
        return await this.GoogleSheets.checkAvailability(roomType, checkInDate, nights);
    }

    async getAllRoomsWithAvailability(checkInDate = null, nights = 1) {
        return await this.GoogleSheets.getAllRoomsWithAvailability(checkInDate, nights);
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

        if (guests && (!Number.isInteger(guests) || guests < 1 || guests > 20)) {
            throw new Error('Invalid number of guests (1-20)');
        }
    }
}

module.exports = BookingService;