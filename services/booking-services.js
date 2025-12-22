const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');

class BookingService {

    // Check room availability
    async checkAvailability(roomType, checkInDate, nights = 1) {
        try {
            const room = await Room.findOne({ name: roomType });

            if (!room) {
                return { available: false, message: 'Room type not found' };
            }

            const isAvailable = room.isAvailable(checkInDate, nights);
            const availableCount = room.getAvailableCountForRange(checkInDate, nights);

            return {
                available: isAvailable,
                availableCount,
                room,
                message: isAvailable
                    ? `✅ Available! ${availableCount} ${roomType}(s) free for those dates.`
                    : `❌ Not available. Only ${availableCount} ${roomType}(s) left for ${checkInDate}.`
            };
        } catch (error) {
            console.error('Error checking availability:', error);
            throw error;
        }
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


    // Create booking - AUTO-UPDATES DATABASE
    async createBooking(bookingData) {
        const session = await Room.startSession();
        session.startTransaction();

        try {
            const {
                customerPhone,
                customerName,
                roomType,
                checkInDate,
                nights,
                guests,
                specialRequests
            } = bookingData;

            this.validateBookingInput({ roomType, checkInDate, nights, guests });




            // 1. Check availability
            const availability = await this.checkAvailability(roomType, checkInDate, nights);

            if (!availability.available) {
                throw new Error(availability.message);
            }

            const room = availability.room;
            const totalAmount = room.pricePerNight * nights;

            // 2. Generate booking ID
            const bookingId = Booking.generateBookingId();

            // 3. Create booking record
            const checkOutDate = this.calculateCheckOutDate(checkInDate, nights);

            const booking = new Booking({
                bookingId,
                customerPhone,
                customerName,
                roomType,
                roomId: room._id,
                checkInDate,
                checkOutDate,
                nights,
                guests,
                totalAmount,
                specialRequests,
                status: 'confirmed'
            });

            // 4. AUTO-UPDATE: Book the room dates with session
            await room.bookRoom(booking._id, customerPhone, checkInDate, nights, session);

            // 5. Save booking with session
            await booking.save({ session });

            // 6. Update customer record with session
            await this.updateCustomerRecord(customerPhone, customerName, totalAmount, session);


            // 7. Commit transaction
            await session.commitTransaction();
            session.endSession();

            console.log(`✅ Booking created: ${bookingId}. Room availability updated.`);

            return {
                success: true,
                booking,
                message: `Booking confirmed! ID: ${bookingId}`
            };

        } catch (error) {
            // Rollback on error
            await session.abortTransaction();
            session.endSession();

            console.error('Booking failed:', error.message);
            throw error;
        }
    }

    // Calculate check-out date
    calculateCheckOutDate(checkInDate, nights) {
        const date = new Date(checkInDate);
        date.setDate(date.getDate() + nights);
        return date;
    }

    // Update customer record
    async updateCustomerRecord(phone, name, amount, session = null) {
        try {
            const customer = await Customer.findOneAndUpdate(
                { phone },
                {
                    $set: { name, lastBookingDate: new Date() },
                    $inc: {
                        totalBookings: 1,
                        totalSpent: amount
                    }
                },
                {
                    upsert: true,
                    new: true
                }
            );
            return customer;
        } catch (error) {
            console.error('Error updating customer:', error);
        }
    }

    // Cancel booking - AUTO-UPDATES availability
    async cancelBooking(bookingId) {
        const session = await Room.startSession();
        session.startTransaction();

        try {
            // 1. Find booking
            const booking = await Booking.findOne({ bookingId });
            if (!booking) {
                throw new Error('Booking not found');
            }

            // 2. Find room
            const room = await Room.findById(booking.roomId);
            if (!room) {
                throw new Error('Room not found');
            }

            // 3. AUTO-UPDATE: Remove booked dates
            await room.cancelBooking(booking._id, session);

            // 4. Update booking status
            booking.status = 'cancelled';
            booking.paymentStatus = 'refunded';
            await booking.save();

            // 5. Commit
            await session.commitTransaction();
            session.endSession();

            console.log(`✅ Booking cancelled: ${bookingId}. Room availability restored.`);

            return {
                success: true,
                message: `Booking ${bookingId} cancelled successfully.`
            };

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // Get all rooms with real-time availability
    // Get all rooms with real-time availability
async getAllRoomsWithAvailability(checkInDate, nights = 1) {
    try {
        const rooms = await Room.find({ isActive: true });
        
        // Validate and set default date if needed
        let dateToUse;
        if (checkInDate && !isNaN(new Date(checkInDate).getTime())) {
            dateToUse = new Date(checkInDate);
        } else {
            dateToUse = new Date(); // Default to today
        }
        
        // Format as YYYY-MM-DD
        const formattedDate = dateToUse.toISOString().split('T')[0];

        const roomsWithAvailability = await Promise.all(
            rooms.map(async (room) => {
                try {
                    const availableCount = room.getAvailableCountForRange(formattedDate, nights);
                    const isAvailable = room.isAvailable(formattedDate, nights);

                    return {
                        ...room.toObject(),
                        availableCount,
                        isAvailable,
                        availableText: isAvailable
                            ? `✅ ${availableCount} available`
                            : `❌ Only ${availableCount} left`
                    };
                } catch (error) {
                    console.error(`Error processing room ${room.name}:`, error.message);
                    return {
                        ...room.toObject(),
                        availableCount: 0,
                        isAvailable: false,
                        availableText: '❌ Error checking availability'
                    };
                }
            })
        );

        return roomsWithAvailability;
    } catch (error) {
        console.error('Error in getAllRoomsWithAvailability:', error);
        return [];
    }
}
}

module.exports = new BookingService();