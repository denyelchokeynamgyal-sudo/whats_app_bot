const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        unique: true
    },
    name: String,
    email: String,
    totalBookings: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    preferences: {
        roomType: String,
        floor: String,
        amenities: [String]
    },
    lastBookingDate: Date,
    isVIP: {
        type: Boolean,
        default: false
    },
    notes: String
}, {
    timestamps: true
});

module.exports = mongoose.model('Customer', customerSchema);