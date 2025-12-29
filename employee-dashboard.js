// employee-dashboard.js - COMPLETE VERSION WITH CANCEL FUNCTIONALITY
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Simple auth
const authenticate = (req, res, next) => {
    const authToken = req.headers.authorization;
    if (authToken === process.env.DASHBOARD_AUTH_TOKEN) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Get pending bookings
app.get('/api/bookings/pending', authenticate, async (req, res) => {
    try {
        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        const pendingBookings = await bookingService.getPendingBookings();
        res.json({ success: true, bookings: pendingBookings });
    } catch (error) {
        console.error('Error fetching pending bookings:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            bookings: []
        });
    }
});

// Approve booking
app.post('/api/bookings/:bookingId/approve', authenticate, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { employeeName = 'Hotel Staff' } = req.body;

        console.log(`✅ Approving booking ${bookingId} by ${employeeName}`);

        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        const result = await bookingService.approveBooking(bookingId, employeeName);

        res.json({
            success: true,
            message: `Booking ${bookingId} confirmed successfully!`,
            details: result
        });

    } catch (error) {
        console.error('Error approving booking:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cancel booking - REAL IMPLEMENTATION
app.post('/api/bookings/:bookingId/cancel', authenticate, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { reason = 'Cancelled by staff' } = req.body;

        console.log(`❌ Cancelling booking ${bookingId}: ${reason}`);

        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        // Call the cancelBooking method
        const result = await bookingService.cancelBooking(bookingId, reason);

        res.json({
            success: true,
            message: 'Booking cancelled successfully',
            details: result
        });
    } catch (error) {
        console.error('Error cancelling booking:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Check-in booking
app.post('/api/bookings/:bookingId/checkin', authenticate, async (req, res) => {
    try {
        const { bookingId } = req.params;

        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        const result = await bookingService.checkInBooking(bookingId);
        res.json(result);
    } catch (error) {
        console.error('Error checking in:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check-out booking
app.post('/api/bookings/:bookingId/checkout', authenticate, async (req, res) => {
    try {
        const { bookingId } = req.params;

        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        const result = await bookingService.checkOutBooking(bookingId);
        res.json(result);
    } catch (error) {
        console.error('Error checking out:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all bookings with filter
app.get('/api/bookings', authenticate, async (req, res) => {
    try {
        const { status } = req.query;

        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        let bookings;
        if (status) {
            bookings = await bookingService.getBookings({ status: status });
        } else {
            // Get all bookings without filter
            const allBookings = await bookingService.getBookings();
            bookings = allBookings;
        }

        res.json({
            success: true,
            bookings: bookings
        });
    } catch (error) {
        console.error('Error getting all bookings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get today's activities
app.get('/api/today-activities', authenticate, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        // Get all bookings
        const allBookings = await bookingService.getBookings();

        // Filter for today's check-ins (confirmed bookings with today's check-in date)
        const todayCheckIns = allBookings.filter(b =>
            b.status === 'confirmed' && b.checkInDate === today
        );

        // Filter for today's check-outs (checked_in bookings with today's check-out date)
        const todayCheckOuts = allBookings.filter(b =>
            b.status === 'checked_in' && b.checkOutDate === today
        );

        // Calculate revenue for today's check-ins
        const todayRevenue = todayCheckIns.reduce((sum, booking) =>
            sum + (parseInt(booking.totalAmount) || 0), 0
        );


        const rooms = await bookingService.getAllRoomsWithAvailability();
        const totalRooms = rooms.reduce((sum, room) => sum + (room.totalRooms || 0), 0);
        const availableRooms = rooms.reduce((sum, room) => sum + (room.availableCount || 0), 0);
        const occupiedRooms = totalRooms - availableRooms;
        const occupancyRate = totalRooms > 0 ?
            Math.round((occupiedRooms / totalRooms) * 100) : 0;

        res.json({
            success: true,
            today: today,
            stats: {
                checkIns: todayCheckIns.length,
                checkOuts: todayCheckOuts.length,
                revenue: todayRevenue,
                occupancyRate: occupancyRate
            },
            checkIns: todayCheckIns,
            checkOuts: todayCheckOuts
        });
    } catch (error) {
        console.error('Error getting today activities:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/rooms', authenticate, async (req, res) => {
    try {
        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        const rooms = await bookingService.getAllRoomsWithAvailability();
        res.json({
            success: true,
            rooms: rooms
        });
    } catch (error) {
        console.error('Error getting rooms:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            rooms: []
        });
    }
});

app.get('/api/today-revenue', authenticate, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        // Get all bookings
        const allBookings = await bookingService.getBookings({ hideCancelled: false });

        // Calculate revenue for TODAY'S approved bookings (confirmed status)
        const todayRevenue = allBookings
            .filter(b => {
                // Check if booking was confirmed today OR has today's date and is confirmed
                const isConfirmedToday = b.status === 'confirmed' &&
                    b.confirmedAt &&
                    b.confirmedAt.includes(today);

                const isTodayCheckIn = b.checkInDate === today && b.status === 'confirmed';

                return isConfirmedToday || isTodayCheckIn;
            })
            .reduce((sum, booking) => {
                return sum + (parseInt(booking.totalAmount) || 0);
            }, 0);

        console.log(`💰 Today's revenue calculation:`);
        console.log(`   - Total bookings: ${allBookings.length}`);
        console.log(`   - Today's confirmed bookings: ${allBookings.filter(b => b.status === 'confirmed' && (b.confirmedAt?.includes(today) || b.checkInDate === today)).length}`);
        console.log(`   - Today's revenue: Nu.${todayRevenue}`);

        res.json({
            success: true,
            revenue: todayRevenue,
            today: today,
            details: `Revenue from today's confirmed bookings`
        });
    } catch (error) {
        console.error('Error getting today revenue:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            revenue: 0
        });
    }
});

// Get detailed revenue statistics
app.get('/api/revenue-stats', authenticate, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        // Get all bookings (including cancelled for accurate accounting)
        const allBookings = await bookingService.getBookings({ hideCancelled: false });

        // Calculate different revenue metrics
        const stats = {
            today: {
                date: today,
                confirmed: allBookings.filter(b =>
                    b.status === 'confirmed' &&
                    b.confirmedAt &&
                    b.confirmedAt.includes(today)
                ).length,
                revenue: allBookings
                    .filter(b => b.status === 'confirmed' && b.confirmedAt && b.confirmedAt.includes(today))
                    .reduce((sum, b) => sum + (parseInt(b.totalAmount) || 0), 0)
            },
            yesterday: {
                date: yesterdayStr,
                confirmed: allBookings.filter(b =>
                    b.status === 'confirmed' &&
                    b.confirmedAt &&
                    b.confirmedAt.includes(yesterdayStr)
                ).length,
                revenue: allBookings
                    .filter(b => b.status === 'confirmed' && b.confirmedAt && b.confirmedAt.includes(yesterdayStr))
                    .reduce((sum, b) => sum + (parseInt(b.totalAmount) || 0), 0)
            },
            thisMonth: {
                month: new Date().getMonth() + 1,
                confirmed: allBookings.filter(b =>
                    b.status === 'confirmed' &&
                    b.confirmedAt &&
                    new Date(b.confirmedAt).getMonth() === new Date().getMonth()
                ).length,
                revenue: allBookings
                    .filter(b => b.status === 'confirmed' && b.confirmedAt && new Date(b.confirmedAt).getMonth() === new Date().getMonth())
                    .reduce((sum, b) => sum + (parseInt(b.totalAmount) || 0), 0)
            },
            pendingRevenue: {
                count: allBookings.filter(b => b.status === 'requested').length,
                potential: allBookings
                    .filter(b => b.status === 'requested')
                    .reduce((sum, b) => sum + (parseInt(b.totalAmount) || 0), 0)
            }
        };

        console.log(`📊 Revenue Stats:`);
        console.log(`   Today: Nu.${stats.today.revenue} (${stats.today.confirmed} bookings)`);
        console.log(`   Yesterday: Nu.${stats.yesterday.revenue} (${stats.yesterday.confirmed} bookings)`);
        console.log(`   This Month: Nu.${stats.thisMonth.revenue} (${stats.thisMonth.confirmed} bookings)`);
        console.log(`   Pending Potential: Nu.${stats.pendingRevenue.potential} (${stats.pendingRevenue.count} bookings)`);

        res.json({
            success: true,
            stats: stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error getting revenue stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/maintenance/auto-checkout', authenticate, async (req, res) => {
    try {
        const BookingService = require('./services/booking-services');
        const bookingService = new BookingService();

        const result = await bookingService.autoCheckoutExpiredBookings();
        res.json(result);
    } catch (error) {
        console.error('Error in auto-checkout:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        backend: 'Google Sheets',
        timestamp: new Date().toISOString(),
        sheetsConnected: !!process.env.GOOGLE_SHEETS_ID
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.EMPLOYEE_PORT || 3001;
app.listen(PORT, () => {
    console.log(`👨‍💼 Employee dashboard running on http://localhost:${PORT}`);
    console.log(`📊 Google Sheets ID: ${process.env.GOOGLE_SHEETS_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`🔐 Auth token: 'hotel-staff-2024'`);
    console.log(`📁 Serving static files from: ${path.join(__dirname, 'public')}`);
});