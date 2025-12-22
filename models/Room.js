const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: String,
    pricePerNight: {
        type: Number,
        required: true
    },
    totalRooms: {
        type: Number,
        required: true,
        default: 10
    },
    bookedDates: [{
        date: String,
        bookingId: mongoose.Schema.Types.ObjectId,
        customerPhone: String
    }],
    amenities: [String],
    images: [String],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

roomSchema.methods.isAvailable = function (checkInDate, nights = 1) {
    try {
        if (!checkInDate) {
            checkInDate = new Date().toISOString().split('T')[0];
        }

        const dates = this.getDateRange(checkInDate, nights);

        for (const date of dates) {
            if (!date || typeof date !== 'string') continue;

            const bookedCount = this.bookedDates.filter(bd => bd.date === date).length;
            if (bookedCount >= this.totalRooms) {
                return false;
            }
        }
        return true;
    } catch (error) {
        console.error('Error in isAvailable:', error.message);
        return false;
    }
};

roomSchema.methods.getDateRange = function (startDate, nights) {
    try {
        const dates = [];

        if (!startDate) {
            startDate = new Date().toISOString().split('T')[0];
        }

        const start = new Date(startDate);

        if (isNaN(start.getTime())) {
            start.setTime(Date.now());
        }

        start.setHours(0, 0, 0, 0);

        for (let i = 0; i < nights; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);

            const formattedDate = date.toISOString().split('T')[0];
            dates.push(formattedDate);
        }
        return dates;
    } catch (error) {
        console.error('Error in getDateRange:', error.message, 'startDate:', startDate);

        return [new Date().toISOString().split('T')[0]];
    }
};

roomSchema.methods.bookRoom = function (bookingId, customerPhone, checkInDate, nights, session = null) {
    const dates = this.getDateRange(checkInDate, nights);

    dates.forEach(date => {
        this.bookedDates.push({
            date,
            bookingId,
            customerPhone
        });
    });

    return this.save();
};

roomSchema.methods.cancelBooking = function (bookingId, session = null) {
    this.bookedDates = this.bookedDates.filter(bd =>
        bd.bookingId.toString() !== bookingId.toString()
    );
    return this.save();
};


roomSchema.methods.getAvailableCountForRange = function (checkInDate, nights) {
    try {
        const dates = this.getDateRange(checkInDate, nights);

        if (!dates || dates.length === 0) {
            return 0;
        }

        let minAvailable = this.totalRooms;

        for (const date of dates) {
            // Validate date format
            if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                console.warn(`Invalid date format in getAvailableCountForRange: ${date}`);
                continue;
            }

            const bookedCount = this.bookedDates.filter(bd => bd.date === date).length;
            minAvailable = Math.min(minAvailable, this.totalRooms - bookedCount);
        }

        return Math.max(minAvailable, 0); // Ensure non-negative
    } catch (error) {
        console.error('Error in getAvailableCountForRange:', error.message);
        return 0; // Return 0 on error
    }
};


module.exports = mongoose.model('Room', roomSchema);