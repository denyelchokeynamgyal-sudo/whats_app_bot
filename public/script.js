console.log('🏨 Hotel Dashboard Initializing...');

class HotelDashboard {
    constructor() {
        this.API_URL = 'http://localhost:3001/api';
        this.AUTH_TOKEN = 'hotel-staff-2024';
        this.autoRefreshInterval = null;
        this.lastUpdate = null;
        this.isServerRunning = false;

        console.log('🚀 Dashboard constructor called');
        console.log(`🔗 API URL: ${this.API_URL}`);
        console.log(`🔐 Auth Token: ${this.AUTH_TOKEN}`);

        this.init();
    }

    async init() {
        console.log('⚡ Initializing dashboard...');

        // First check if server is running
        await this.checkServerStatus();

        if (this.isServerRunning) {
            this.bindEvents();
            this.loadDashboardStats();
            this.startAutoRefresh();
        } else {
            this.showServerError();
        }
    }

    async checkServerStatus() {
        try {
            console.log('🔍 Checking server status...');
            const response = await fetch(`${this.API_URL}/health`, {
                headers: {
                    'Authorization': this.AUTH_TOKEN
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Server is running:', data);
                this.isServerRunning = true;
            } else {
                console.warn('⚠️ Server responded with error:', response.status);
                this.isServerRunning = false;
            }
        } catch (error) {
            console.error('❌ Server is not reachable:', error.message);
            this.isServerRunning = false;
        }
    }

    showServerError() {
        console.error('🚨 Server not reachable!');

        document.querySelectorAll('.tab-content').forEach(tab => {
            const container = tab.querySelector('.bookings-container') || tab;
            container.innerHTML = `
                <div class="no-bookings" style="padding: 40px; text-align: center;">
                    <i style="font-size: 48px;">🚨</i>
                    <h3 style="color: #ef4444; margin: 20px 0;">Dashboard Server Not Reachable</h3>
                    <p>Please make sure the employee dashboard server is running:</p>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; margin: 20px 0; text-align: left;">
                        <code style="color: #333;">
                            node employee-dashboard.js
                        </code>
                    </div>
                    <p>Server URL: <strong>${this.API_URL}</strong></p>
                    <button onclick="location.reload()" class="refresh-btn" style="margin-top: 20px;">
                        <i>🔄</i> Retry Connection
                    </button>
                </div>
            `;
        });

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
    }

    bindEvents() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.showTab(e.target.dataset.tab));
        });

        // Refresh buttons
        document.getElementById('refresh-pending').addEventListener('click', () => this.loadPendingBookings());
        document.getElementById('refresh-today').addEventListener('click', () => this.loadTodayActivities());
        document.getElementById('refresh-all').addEventListener('click', () => this.loadAllBookings());
        document.getElementById('refresh-rooms').addEventListener('click', () => this.loadRooms());

        // Status filter change
        document.getElementById('status-filter').addEventListener('change', () => this.loadAllBookings());
    }

    showTab(tabName) {
        // Remove active class from all buttons and tabs
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => {
            el.classList.remove('active');
        });

        // Add active class to clicked button
        const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeButton) activeButton.classList.add('active');

        // Show selected tab
        const activeTab = document.getElementById(`${tabName}-tab`);
        if (activeTab) activeTab.classList.add('active');

        // Load data for the selected tab
        switch (tabName) {
            case 'pending':
                this.loadPendingBookings();
                break;
            case 'today':
                this.loadTodayActivities();
                break;
            case 'all':
                this.loadAllBookings();
                break;
            case 'rooms':
                this.loadRooms();
                break;
        }
    }

    // Formatting helpers
    formatDate(dateString) {
        if (!dateString || dateString === 'N/A') return 'N/A';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return dateString;
        }
    }

    formatTime(dateString) {
        if (!dateString || dateString === 'N/A') return 'N/A';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    }

    updateLastUpdateTime() {
        const now = new Date();
        this.lastUpdate = now;
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const element = document.getElementById('last-update');
        if (element) {
            element.textContent = `Last updated: ${timeString}`;
        }
    }

    getStatusBadgeClass(status) {
        if (!status) return 'status-requested';
        switch (status.toLowerCase()) {
            case 'requested': return 'status-requested';
            case 'confirmed': return 'status-confirmed';
            case 'checked_in': return 'status-checked_in';
            case 'checked_out': return 'status-checked_out';
            case 'cancelled': return 'status-cancelled';
            default: return 'status-requested';
        }
    }

    formatPhoneForDisplay(phone) {
        if (!phone || phone === 'N/A') return 'N/A';

        // Convert to string and remove non-digits
        const digits = phone.toString().replace(/\D/g, '');

        // Handle the WhatsApp internal ID case
        if (digits === '181076576194630') {
            return '+91 75850 51277';
        }

        // Format Indian numbers (91XXXXXXXXXX)
        if (digits.length === 12 && digits.startsWith('91')) {
            return `+${digits.substring(0, 2)} ${digits.substring(2, 7)} ${digits.substring(7)}`;
        }
        // Format 10-digit numbers (assume Indian)
        else if (digits.length === 10) {
            return `+91 ${digits.substring(0, 5)} ${digits.substring(5)}`;
        }
        // Format other numbers
        else if (digits.length > 0) {
            return `+${digits}`;
        }

        return phone;
    }

    fixNightsDisplay(nights) {
        if (!nights) return 1;

        const numNights = parseInt(nights);

        // Fix invalid values
        if (isNaN(numNights) || numNights > 30 || numNights < 1) {
            console.log(`Fixed invalid nights: ${nights} → 1`);
            return 1;
        }

        return numNights;
    }

    async fetchAPI(endpoint, options = {}) {
        const defaultOptions = {
            headers: {
                'Authorization': this.AUTH_TOKEN,
                'Content-Type': 'application/json'
            }
        };

        const mergedOptions = { ...defaultOptions, ...options };

        try {
            const response = await fetch(`${this.API_URL}${endpoint}`, mergedOptions);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    async loadPendingBookings() {
        try {
            const data = await this.fetchAPI('/bookings/pending');
            const bookings = data.bookings || data || [];

            // Update counts
            document.getElementById('pending-count').textContent = bookings.length;

            const today = new Date().toISOString().split('T')[0];
            const todayRequests = bookings.filter(b =>
                b.requestedAt && b.requestedAt.includes(today)
            );
            document.getElementById('today-count').textContent = todayRequests.length;

            // Update list
            this.renderPendingBookings(bookings);
            this.updateLastUpdateTime();

        } catch (error) {
            this.showError('pending-bookings-list', 'Error loading pending bookings', error);
        }
    }

    renderPendingBookings(bookings) {
        const bookingsList = document.getElementById('pending-bookings-list');

        if (bookings.length === 0) {
            bookingsList.innerHTML = `
                <div class="no-bookings">
                    <i>📭</i>
                    <h3>No pending bookings</h3>
                    <p>All booking requests have been processed</p>
                </div>
            `;
            return;
        }

        const html = bookings.map(booking => {
            const fixedNights = this.fixNightsDisplay(booking.nights);
            const formattedPhone = this.formatPhoneForDisplay(booking.customerPhone);
            const status = (booking.status || 'requested').toLowerCase();

            return `
                <div class="booking-card" id="booking-${booking.bookingId}">
                    <div class="booking-header">
                        <div class="customer-info">
                            <h3>${booking.customerName || 'Unknown Customer'}</h3>
                            <p><i>📞</i> ${formattedPhone}</p>
                        </div>
                        <div>
                            <span class="booking-id">${booking.bookingId || 'N/A'}</span>
                            <span class="status-badge ${this.getStatusBadgeClass(status)}">
                                ${status.toUpperCase()}
                            </span>
                        </div>
                    </div>
                    
                    <div class="booking-details">
                        <div class="detail-item">
                            <i>🏨</i>
                            <div>
                                <span>Room Type</span>
                                <strong>${booking.roomType || 'N/A'}</strong>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i>📅</i>
                            <div>
                                <span>Check-in</span>
                                <strong>${this.formatDate(booking.checkInDate)}</strong>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i>🌙</i>
                            <div>
                                <span>Nights</span>
                                <strong>${fixedNights}</strong>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i>💰</i>
                            <div>
                                <span>Total Amount</span>
                                <strong>Nu.${booking.totalAmount || '0'}</strong>
                            </div>
                        </div>
                    </div>
                    
                    ${booking.specialRequests && booking.specialRequests !== 'None' ? `
                        <div class="special-requests">
                            <strong>Special Requests:</strong> ${booking.specialRequests}
                        </div>
                    ` : ''}
                    
                    <div class="action-buttons">
                        <button class="btn btn-call" onclick="dashboard.callCustomer('${booking.customerPhone}')">
                            <i>📞</i> Call Now
                        </button>
                        ${status === 'requested' ? `
                            <button class="btn btn-approve" onclick="dashboard.approveBooking('${booking.bookingId}')">
                                <i>✅</i> Approve Booking
                            </button>
                        ` : ''}
                        ${status === 'confirmed' ? `
                            <button class="btn btn-checkin" onclick="dashboard.checkInBooking('${booking.bookingId}')">
                                <i>✅</i> Check In
                            </button>
                        ` : ''}
                        <button class="btn btn-cancel" onclick="dashboard.cancelBooking('${booking.bookingId}')">
                            <i>❌</i> Cancel
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        bookingsList.innerHTML = html;
    }

    async loadTodayActivities() {
        try {
            const data = await this.fetchAPI('/today-activities');

            // Update check-ins
            const checkins = data.checkIns || [];
            document.getElementById('today-checkins-count').textContent = checkins.length;
            this.renderTodayList('checkins-list', checkins, 'checkin');

            // Update check-outs
            const checkouts = data.checkOuts || [];
            document.getElementById('today-checkouts-count').textContent = checkouts.length;
            this.renderTodayList('checkouts-list', checkouts, 'checkout');

            // Update stats
            if (data.stats) {
                document.getElementById('today-revenue-tab').textContent = `Nu.${data.stats.revenue || '0'}`;
                document.getElementById('occupancy-rate').textContent = `${data.stats.occupancyRate || '0'}%`;
            }

            this.updateLastUpdateTime();

        } catch (error) {
            console.error('Error loading today activities:', error);
            this.showError('checkins-list', 'Error loading today activities', error);
            this.showError('checkouts-list', 'Error loading today activities', error);
        }
    }

    renderTodayList(elementId, items, type) {
        const element = document.getElementById(elementId);

        if (!items.length) {
            element.innerHTML = `<p style="color: #666; text-align: center; padding: 20px;">
                No ${type === 'checkin' ? 'check-ins' : 'check-outs'} today
            </p>`;
            return;
        }

        const html = items.map(item => {
            const formattedPhone = this.formatPhoneForDisplay(item.customerPhone);
            const status = (item.status || '').toLowerCase();
            const buttonText = type === 'checkin' ? 'Check In' : 'Check Out';
            const buttonClass = type === 'checkin' ? 'btn-checkin' : 'btn-checkout';
            const buttonAction = type === 'checkin' ? `dashboard.checkInBooking('${item.bookingId}')` : `dashboard.checkOutBooking('${item.bookingId}')`;
            const showButton = (type === 'checkin' && status === 'confirmed') ||
                (type === 'checkout' && status === 'checked_in');

            return `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <strong>${item.customerName || 'Unknown'}</strong>
                            <p style="color: #666; font-size: 12px; margin-top: 5px;">
                                ${item.roomType || 'N/A'} • ${formattedPhone}
                            </p>
                            <p style="color: #666; font-size: 12px; margin-top: 2px;">
                                ${this.formatDate(type === 'checkin' ? item.checkInDate : item.checkOutDate)} • 
                                ${this.fixNightsDisplay(item.nights)} nights
                            </p>
                        </div>
                        ${showButton ? `
                            <button class="btn ${buttonClass}" 
                                    style="padding: 8px 15px; font-size: 12px;" 
                                    onclick="${buttonAction}">
                                ${buttonText}
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        element.innerHTML = html;
    }

    async loadAllBookings() {
        try {
            const statusFilter = document.getElementById('status-filter').value;
            const endpoint = statusFilter ? `/bookings?status=${statusFilter}` : '/bookings';

            const data = await this.fetchAPI(endpoint);
            const bookings = data.bookings || [];

            this.renderAllBookings(bookings);
            this.updateLastUpdateTime();

        } catch (error) {
            this.showError('all-bookings-list', 'Error loading all bookings', error);
        }
    }

    renderAllBookings(bookings) {
        const bookingsList = document.getElementById('all-bookings-list');

        if (bookings.length === 0) {
            bookingsList.innerHTML = `
                <div class="no-bookings">
                    <i>📊</i>
                    <h3>No bookings found</h3>
                    <p>Try different filters or check back later</p>
                </div>
            `;
            return;
        }

        const html = bookings.map(booking => {
            const fixedNights = this.fixNightsDisplay(booking.nights);
            const formattedPhone = this.formatPhoneForDisplay(booking.customerPhone);
            const status = (booking.status || 'unknown').toLowerCase();

            return `
                <div class="booking-card">
                    <div class="booking-header">
                        <div class="customer-info">
                            <h3>${booking.customerName || 'Unknown Customer'}</h3>
                            <p><i>📞</i> ${formattedPhone} • <i>💰</i> Nu.${booking.totalAmount || '0'}</p>
                        </div>
                        <div>
                            <span class="booking-id">${booking.bookingId || 'N/A'}</span>
                            <span class="status-badge ${this.getStatusBadgeClass(status)}">
                                ${status.toUpperCase()}
                            </span>
                        </div>
                    </div>
                    
                    <div class="booking-details">
                        <div class="detail-item">
                            <i>🏨</i>
                            <div>
                                <span>Room Type</span>
                                <strong>${booking.roomType || 'N/A'}</strong>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i>📅</i>
                            <div>
                                <span>Check-in</span>
                                <strong>${this.formatDate(booking.checkInDate)}</strong>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i>📅</i>
                            <div>
                                <span>Check-out</span>
                                <strong>${this.formatDate(booking.checkOutDate)}</strong>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i>🌙</i>
                            <div>
                                <span>Nights</span>
                                <strong>${fixedNights}</strong>
                            </div>
                        </div>
                    </div>
                    
                    ${booking.specialRequests && booking.specialRequests !== 'None' ? `
                        <div class="special-requests">
                            <strong>Special Requests:</strong> ${booking.specialRequests}
                        </div>
                    ` : ''}
                    
                    <div class="action-buttons">
                        ${status === 'requested' ? `
                            <button class="btn btn-approve" onclick="dashboard.approveBooking('${booking.bookingId}')">
                                <i>✅</i> Approve
                            </button>
                        ` : ''}
                        ${status === 'confirmed' ? `
                            <button class="btn btn-checkin" onclick="dashboard.checkInBooking('${booking.bookingId}')">
                                <i>✅</i> Check In
                            </button>
                        ` : ''}
                        ${status === 'checked_in' ? `
                            <button class="btn btn-checkout" onclick="dashboard.checkOutBooking('${booking.bookingId}')">
                                <i>🚪</i> Check Out
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        bookingsList.innerHTML = html;
    }

    async loadRooms() {
        try {
            const data = await this.fetchAPI('/rooms');
            const rooms = data.rooms || [];

            this.renderRooms(rooms);
            this.updateLastUpdateTime();

        } catch (error) {
            this.showError('rooms-list', 'Error loading rooms', error);
        }
    }

    renderRooms(rooms) {
        const roomsList = document.getElementById('rooms-list');

        if (!rooms.length) {
            roomsList.innerHTML = `
                <div class="no-bookings">
                    <i>🏨</i>
                    <h3>No rooms found</h3>
                    <p>Check Google Sheets connection</p>
                </div>
            `;
            return;
        }

        // Update available rooms count
        const totalAvailable = rooms.reduce((sum, room) => sum + (room.availableCount || 0), 0);
        const totalRooms = rooms.reduce((sum, room) => sum + (room.totalRooms || 0), 0);

        document.getElementById('available-rooms').textContent = totalAvailable;

        const occupancyRate = totalRooms > 0 ?
            ((totalRooms - totalAvailable) / totalRooms * 100).toFixed(0) : 0;
        document.getElementById('occupancy-rate').textContent = `${occupancyRate}%`;

        const html = rooms.map(room => {
            const availabilityPercentage = room.totalRooms > 0 ?
                ((room.availableCount || 0) / room.totalRooms * 100) : 0;
            const isAvailable = (room.availableCount || 0) > 0;

            return `
                <div class="room-card">
                    <div class="room-header">
                        <h3>${room.name || 'Unknown Room'}</h3>
                        <div class="room-availability ${isAvailable ? 'available' : 'unavailable'}">
                            ${room.availableCount || 0}/${room.totalRooms || 0}
                        </div>
                    </div>
                    
                    <div class="room-details">
                        <p><strong>Price:</strong> Nu.${room.pricePerNight || '0'}/night</p>
                        <p><strong>Status:</strong> ${isAvailable ? '✅ Available' : '❌ Fully Booked'}</p>
                        <p><strong>Availability:</strong> ${availabilityPercentage.toFixed(0)}%</p>
                        ${room.bookedDates && room.bookedDates.length > 0 ? `
                            <p style="margin-top: 10px; font-size: 12px;">
                                <strong>Booked Dates:</strong> ${room.bookedDates.slice(0, 3).join(', ')}
                                ${room.bookedDates.length > 3 ? '...' : ''}
                            </p>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        roomsList.innerHTML = html;
    }

    // Add this method to HotelDashboard class in script.js
    async refreshRevenueStats() {
        try {
            console.log('💰 Refreshing revenue stats...');

            // Update today's revenue
            const revenueData = await this.fetchAPI('/today-revenue');
            if (revenueData.success) {
                document.getElementById('today-revenue').textContent = `Nu.${revenueData.revenue}`;
                document.getElementById('today-revenue-tab').textContent = `Nu.${revenueData.revenue}`;
            }

            // Also update other stats if needed
            const statsData = await this.fetchAPI('/revenue-stats');
            if (statsData.success) {
                console.log('📊 Updated revenue stats:', statsData.stats);
            }

        } catch (error) {
            console.warn('Could not refresh revenue stats:', error);
        }
    }

    // Update the approveBooking method to refresh revenue:
    async approveBooking(bookingId) {
        if (!bookingId || !confirm('Approve this booking? This will confirm the booking and update room availability.')) {
            return;
        }

        try {
            const result = await this.fetchAPI(`/bookings/${bookingId}/approve`, {
                method: 'POST',
                body: JSON.stringify({ employeeName: 'Reception Staff' })
            });

            this.showNotification(`Booking approved! Revenue added: ${result.message}`, 'success');

            // Refresh the revenue stats
            await this.refreshRevenueStats();

            // Refresh current tab
            this.refreshCurrentTab();

        } catch (error) {
            this.showNotification('Error approving booking: ' + error.message, 'error');
        }
    }



    // Action methods
    async approveBooking(bookingId) {
        if (!bookingId || !confirm('Approve this booking? This will confirm the booking and update room availability.')) {
            return;
        }

        try {
            await this.fetchAPI(`/bookings/${bookingId}/approve`, {
                method: 'POST',
                body: JSON.stringify({ employeeName: 'Reception Staff' })
            });

            this.showNotification('Booking approved successfully!', 'success');
            this.refreshCurrentTab();

        } catch (error) {
            this.showNotification('Error approving booking: ' + error.message, 'error');
        }
    }

    async checkInBooking(bookingId) {
        if (!bookingId || !confirm('Mark this booking as checked in?')) {
            return;
        }

        try {
            await this.fetchAPI(`/bookings/${bookingId}/checkin`, {
                method: 'POST'
            });

            this.showNotification('Check-in recorded successfully!', 'success');
            this.refreshCurrentTab();

        } catch (error) {
            this.showNotification('Error checking in: ' + error.message, 'error');
        }
    }

    async checkOutBooking(bookingId) {
        if (!bookingId || !confirm('Mark this booking as checked out? Room will become available.')) {
            return;
        }

        try {
            await this.fetchAPI(`/bookings/${bookingId}/checkout`, {
                method: 'POST'
            });

            this.showNotification('Check-out completed successfully!', 'success');
            this.refreshCurrentTab();

        } catch (error) {
            this.showNotification('Error checking out: ' + error.message, 'error');
        }
    }

    callCustomer(phone) {
        if (!phone || phone === 'N/A') {
            this.showNotification('No phone number available', 'error');
            return;
        }

        // Clean phone number for tel: link
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone) {
            window.open(`tel:${cleanPhone}`);
        }
    }

    async cancelBooking(bookingId) {
        if (!bookingId || !confirm('Are you sure you want to cancel this booking request?')) {
            return;
        }

        try {
            await this.fetchAPI(`/bookings/${bookingId}/cancel`, {
                method: 'POST',
                body: JSON.stringify({ reason: 'Cancelled by staff' })
            });

            this.showNotification('Booking cancelled successfully!', 'success');

            // Remove from UI
            const bookingCard = document.getElementById(`booking-${bookingId}`);
            if (bookingCard) {
                bookingCard.style.opacity = '0.5';
                bookingCard.style.transition = 'opacity 0.5s';
                setTimeout(() => {
                    bookingCard.remove();
                    this.updatePendingCount();
                }, 500);
            } else {
                this.refreshCurrentTab();
            }

        } catch (error) {
            this.showNotification('Error cancelling booking: ' + error.message, 'error');
        }
    }

    updatePendingCount() {
        const pendingCount = document.getElementById('pending-count');
        const currentCount = parseInt(pendingCount.textContent) || 0;
        if (currentCount > 0) {
            pendingCount.textContent = currentCount - 1;
        }
    }

    refreshCurrentTab() {
        const activeTab = document.querySelector('.tab-btn.active');
        if (!activeTab) return;

        const tabName = activeTab.dataset.tab;
        switch (tabName) {
            case 'pending':
                this.loadPendingBookings();
                break;
            case 'today':
                this.loadTodayActivities();
                break;
            case 'all':
                this.loadAllBookings();
                break;
            case 'rooms':
                this.loadRooms();
                break;
        }
    }

    async loadDashboardStats() {
        try {
            await this.loadPendingBookings();
            await this.loadRooms();

            // Load today's revenue
            try {
                const revenueData = await this.fetchAPI('/today-revenue');
                if (revenueData.success) {
                    document.getElementById('today-revenue').textContent = `Nu.${revenueData.revenue}`;
                }
            } catch (revenueError) {
                console.warn('Could not load revenue data:', revenueError);
            }

        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        }
    }

    startAutoRefresh() {
        // Clear any existing interval
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        // Set up new interval
        this.autoRefreshInterval = setInterval(() => {
            this.refreshCurrentTab();
        }, 30000); // 30 seconds
    }

    showError(elementId, message, error) {
        console.error(message, error);
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `
                <div class="no-bookings">
                    <i>⚠️</i>
                    <h3>${message}</h3>
                    <p>Check if the backend server is running at ${this.API_URL}</p>
                    <p>Error details: ${error.message}</p>
                </div>
            `;
        }
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(el => el.remove());

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i>${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM fully loaded');
    window.dashboard = new HotelDashboard();

    // Add some debugging info
    console.log('🔧 Dashboard instance created:', window.dashboard);
});