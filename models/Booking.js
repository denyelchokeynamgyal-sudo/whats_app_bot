const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    bookingId: {
        type: String,
        required: true,
        unique: true
    },
    customerPhone: {
        type: String,
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    roomType: {
        type: String,
        required: true
    },
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true
    },
    checkInDate: {
        type: Date, // YYYY-MM-DD
        required: true
    },
    checkOutDate: {
        type: Date, // YYYY-MM-DD
        required: true
    },
    nights: {
        type: Number,
        required: true
    },
    guests: {
        type: Number,
        required: true
    },
    totalAmount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'],
        default: 'pending'
    },
    specialRequests: String,
    paymentStatus: {
        type: String,
        enum: ['pending', 'partial', 'paid', 'refunded'],
        default: 'pending'
    },
    notes: String
}, {
    timestamps: true
});


bookingSchema.statics.generateBookingId = function () {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `BK${timestamp}${random}`;
};

module.exports = mongoose.model('Booking', bookingSchema);