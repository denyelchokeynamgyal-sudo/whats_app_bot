const mongoose = require('mongoose');
require('dotenv').config();

const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');

async function seedDatabase() {
    try {
        console.log('🌱 Seeding database...');

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Clear existing data
        await Room.deleteMany({});
        await Booking.deleteMany({});
        await Customer.deleteMany({});

        // Seed rooms
        const rooms = [
            {
                name: 'Single Room',
                description: 'Cozy room for one person',
                pricePerNight: 800,
                totalRooms: 10,
                bookedDates: [],
                amenities: ['WiFi', 'TV']
            },
            {
                name: 'Double Room',
                description: 'Spacious room for two people',
                pricePerNight: 1200,
                totalRooms: 8,
                bookedDates: [],
                amenities: ['WiFi', 'AC', 'TV', 'Balcony']
            },
            {
                name: 'Family Room',
                description: 'Large room suitable for families',
                pricePerNight: 1500,
                totalRooms: 4,
                bookedDates: [],
                amenities: ['WiFi', 'AC', 'TV']
            }
        ];

        await Room.insertMany(rooms);

        await mongoose.disconnect();
        console.log('✅ Database seeded and disconnected');

    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seedDatabase();
