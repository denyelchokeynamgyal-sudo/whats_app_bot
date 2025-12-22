const OpenAI = require('openai');
require('dotenv').config();
const { parse, format, isValid } = require('date-fns');

class OpenAIService {
    constructor(bookingService) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not set in .env file');
        }

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        this.bookingService = bookingService;
        this.conversationHistory = new Map();

        this.hotelInfo = {
            name: process.env.DEFAULT_HOTEL_NAME || 'Jaggle AI',
            location: process.env.DEFAULT_HOTEL_LOCATION || 'Thimphu, Bhutan',
            contactEmail: process.env.DEFAULT_CONTACT_EMAIL || 'denyelcnamgyal@gmail.com',
            contactPhone: process.env.DEFAULT_CONTACT_PHONE || '+975-17271095',
            checkInTime: process.env.DEFAULT_CHECK_IN_TIME || '2:00 PM',
            checkOutTime: process.env.DEFAULT_CHECK_OUT_TIME || '12:00 PM',
            amenities: process.env.DEFAULT_AMENITIES
                ? process.env.DEFAULT_AMENITIES.split(',')
                : ['Free WiFi', 'Swimming Pool', 'Spa', '24/7 Room Service', 'Airport Pickup']
        };
    }

    /** Helper: parse user-friendly date to YYYY-MM-DD safely */
    /** Helper: parse user-friendly date to YYYY-MM-DD safely */
    parseDate(userDate) {
        try {
            const today = new Date();
            if (!userDate || userDate.trim() === '') return today.toISOString().split('T')[0];

            // Clean up the input
            const cleanedDate = userDate.trim().toLowerCase();

            // Handle common relative dates
            if (cleanedDate === 'today' || cleanedDate === 'now') {
                return today.toISOString().split('T')[0];
            }

            if (cleanedDate === 'tomorrow') {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                return tomorrow.toISOString().split('T')[0];
            }

            // Remove any time component if present
            const dateOnly = cleanedDate.split(' ')[0];

            // Try parsing as ISO date first (YYYY-MM-DD)
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
                const parsed = new Date(dateOnly);
                if (!isNaN(parsed.getTime())) {
                    return format(parsed, 'yyyy-MM-dd');
                }
            }

            // Try parsing with date-fns formats
            const currentYear = today.getFullYear();
            let parsed;

            // Add more formats to try
            const formatsToTry = [
                'd MMMM yyyy',
                'd MMMM',
                'yyyy-MM-dd',
                'dd/MM/yyyy',
                'MM/dd/yyyy',
                'MMMM d, yyyy',
                'MMM d, yyyy'
            ];

            for (let fmt of formatsToTry) {
                try {
                    parsed = parse(dateOnly, fmt, new Date());
                    if (isValid(parsed)) {
                        // If year wasn't specified, use current year
                        if (!/(\d{4})/.test(dateOnly)) {
                            parsed.setFullYear(currentYear);
                        }
                        return format(parsed, 'yyyy-MM-dd');
                    }
                } catch (e) {
                    // Try next format
                    continue;
                }
            }

            // Fallback: use today's date
            console.warn(`Could not parse date: "${userDate}". Using today's date.`);
            return today.toISOString().split('T')[0];

        } catch (error) {
            console.error('Error parsing date:', error.message, 'Input:', userDate);
            return new Date().toISOString().split('T')[0];
        }
    }

    async getAIResponse(phoneNumber, userMessage) {
    try {
        console.log(`🤖 AI Request for ${phoneNumber}: ${userMessage}`);
        
        if (!this.conversationHistory.has(phoneNumber)) {
            this.conversationHistory.set(phoneNumber, []);
        }
        const history = this.conversationHistory.get(phoneNumber);

        history.push({ role: 'user', content: userMessage });

        if (history.length > 20) history.splice(0, history.length - 20);

        // Get rooms with default date (today)
        const rooms = await this.bookingService.getAllRoomsWithAvailability();
        
        console.log(`📊 Retrieved ${rooms.length} rooms from database`);

        const roomInfo = rooms
            .filter(room => room.availableCount > 0)
            .map(room => `${room.name}: ₹${room.pricePerNight}/night (${room.availableCount} available)`)
            .join('\n');

        // Create a simple prompt for basic responses
        const systemPrompt = `You are ${this.hotelInfo.name}'s WhatsApp booking assistant. 
You have access to real-time room availability from our database.

Current Available Rooms:
${roomInfo}

Hotel Info:
Name: ${this.hotelInfo.name}
Location: ${this.hotelInfo.location}
Contact: ${this.hotelInfo.contactPhone}

Respond to the user in a friendly, helpful way. If they want to book or check availability, ask for details.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-8)
        ];

        console.log('🤖 Sending request to OpenAI...');
        
        // First, try a simple response without tools to test
        const completion = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            temperature: 0.6,
            max_tokens: 300
        });

        const response = completion.choices[0].message.content;
        
        // Add response to history
        history.push({ role: 'assistant', content: response });
        
        // If response is getting too long, trim it
        if (history.length > 10) {
            history.splice(0, history.length - 10);
        }

        console.log(`✅ AI Response generated: ${response.substring(0, 100)}...`);
        return response;

    } catch (error) {
        console.error('❌ OpenAI Error:', error.message);
        
        // Fallback responses based on user message
        const lowerMessage = userMessage.toLowerCase();
        
        if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
            return `Hello! 👋 Welcome to ${this.hotelInfo.name}! I'm your booking assistant. I can help you with:
• Checking room availability
• Making bookings
• Hotel information
• Pricing queries

How can I assist you today? 🏨`;
        }
        
        if (lowerMessage.includes('book') || lowerMessage.includes('reservation')) {
            const rooms = await this.bookingService.getAllRoomsWithAvailability();
            const availableRooms = rooms.filter(r => r.availableCount > 0);
            
            if (availableRooms.length === 0) {
                return `📅 I'd love to help you book! Currently, all rooms are booked. Please check back later or contact us at ${this.hotelInfo.contactPhone}.`;
            }
            
            const roomList = availableRooms.map(r => `• ${r.name} - ₹${r.pricePerNight}/night (${r.availableCount} available)`).join('\n');
            
            return `📅 Great! I can help you make a booking. Here are our available rooms:\n\n${roomList}\n\nTo book, please provide:\n1. Your full name\n2. Room type\n3. Check-in date (YYYY-MM-DD format)\n4. Number of nights\n5. Number of guests`;
        }
        
        if (lowerMessage.includes('available') || lowerMessage.includes('rooms')) {
            const rooms = await this.bookingService.getAllRoomsWithAvailability();
            const availableRooms = rooms.filter(r => r.availableCount > 0);
            
            if (availableRooms.length === 0) {
                return `🏨 Currently, all rooms are booked. Please try different dates or contact us at ${this.hotelInfo.contactPhone}.`;
            }
            
            const roomList = availableRooms.map(r => `• ${r.name} - ₹${r.pricePerNight}/night (${r.availableCount} available)`).join('\n');
            
            return `🏨 AVAILABLE ROOMS (Real-time from database):\n\n${roomList}\n\nWould you like to book any of these rooms?`;
        }
        
        if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
            const rooms = await this.bookingService.getAllRoomsWithAvailability();
            const roomList = rooms.map(r => `• ${r.name}: ₹${r.pricePerNight}/night`).join('\n');
            
            return `💰 OUR ROOM PRICES (per night):\n\n${roomList}\n\nFor a total price calculation, please let me know:\n1. Which room type\n2. Number of nights\n3. Number of guests`;
        }
        
        // Default fallback
        return `Hello! I'm having some technical difficulties with my AI system. 😅

But I can still help you with:
• Room availability
• Booking information
• Hotel details

Please contact us directly at ${this.hotelInfo.contactPhone} for immediate assistance, or try asking in a different way! 🏨`;
    }
}

    createSystemPrompt(roomInfo) {
    return `You are ${this.hotelInfo.name}'s friendly and professional WhatsApp booking assistant.

IMPORTANT - USE REAL DATABASE DATA:
AVAILABLE ROOMS (REAL-TIME FROM DATABASE - AUTO-UPDATES WHEN BOOKED):
${roomInfo}

HOTEL INFORMATION:
- Name: ${this.hotelInfo.name}
- Location: ${this.hotelInfo.location}
- Contact: ${this.hotelInfo.contactPhone} | ${this.hotelInfo.contactEmail}
- Check-in: ${this.hotelInfo.checkInTime} | Check-out: ${this.hotelInfo.checkOutTime}

AMENITIES & SERVICES:
${this.hotelInfo.amenities.map(amenity => `• ${amenity}`).join('\n')}

CRITICAL RULES:
1. ALWAYS check REAL availability from the database above before confirming any booking
2. If a room shows "0 available", it's COMPLETELY BOOKED - suggest other rooms or dates
3. When someone books, the database AUTOMATICALLY updates room availability
4. Collect ALL required info before creating booking: name, room type, check-in date, nights, guests
5. Only confirm booking if room is actually available in database
6. After booking, inform customer that room count has been updated

AVAILABLE FUNCTIONS (CALL THESE WHEN NEEDED):
• checkRoomAvailability - Check if a specific room type is available
• calculatePrice - Calculate total price for a stay
• createBooking - Create a new booking (requires all details)
• getHotelInfo - Get hotel details
• getAllAvailableRooms - List all available rooms

USE THESE FUNCTIONS WHEN:
- User asks about room availability → use checkRoomAvailability or getAllAvailableRooms
- User asks about pricing → use calculatePrice
- User wants to book → use createBooking (after collecting all details)
- User asks about hotel → use getHotelInfo
- General greeting → just respond naturally

YOUR TONE:
- Friendly, professional, helpful
- Use emojis occasionally (🏨💰✅📅)
- Be concise for WhatsApp but complete
- Always ask for their name if you don't have it yet
- If unsure, ask clarifying questions

Remember: The database updates in REAL-TIME. When a room is booked, it immediately shows less availability for other customers.`;
}
    getAvailableTools() {
    return [
        {
            type: "function",
            function: {
                name: "checkRoomAvailability",
                description: "Check REAL availability of specific room types from database",
                parameters: {
                    type: "object",
                    properties: {
                        roomType: { 
                            type: "string", 
                            description: "Type of room to check (e.g., 'Deluxe Room', 'Executive Suite')" 
                        },
                        checkInDate: { 
                            type: "string", 
                            description: "Check-in date in YYYY-MM-DD format" 
                        },
                        nights: { 
                            type: "integer", 
                            description: "Number of nights to stay" 
                        }
                    },
                    required: ["roomType", "checkInDate"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "calculatePrice",
                description: "Calculate total price for a booking",
                parameters: {
                    type: "object",
                    properties: {
                        roomType: { 
                            type: "string",
                            description: "Type of room (e.g., 'Deluxe Room', 'Executive Suite')"
                        },
                        nights: { 
                            type: "integer",
                            description: "Number of nights"
                        },
                        guests: { 
                            type: "integer",
                            description: "Number of guests",
                            default: 2
                        }
                    },
                    required: ["roomType", "nights"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "createBooking",
                description: "Create a new booking - AUTOMATICALLY UPDATES DATABASE",
                parameters: {
                    type: "object",
                    properties: {
                        customerName: { 
                            type: "string", 
                            description: "Full name of the customer" 
                        },
                        customerPhone: { 
                            type: "string", 
                            description: "Phone number of the customer" 
                        },
                        roomType: { 
                            type: "string", 
                            description: "Type of room to book" 
                        },
                        checkInDate: { 
                            type: "string", 
                            description: "Check-in date in YYYY-MM-DD format" 
                        },
                        nights: { 
                            type: "integer", 
                            description: "Number of nights" 
                        },
                        guests: { 
                            type: "integer", 
                            description: "Number of guests",
                            default: 2
                        },
                        specialRequests: { 
                            type: "string", 
                            description: "Any special requests or notes" 
                        }
                    },
                    required: ["customerName", "customerPhone", "roomType", "checkInDate", "nights"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "getHotelInfo",
                description: "Get general hotel information",
                parameters: {
                    type: "object",
                    properties: {}
                }
            }
        },
        {
            type: "function",
            function: {
                name: "getAllAvailableRooms",
                description: "Get all available rooms with real-time counts",
                parameters: {
                    type: "object",
                    properties: {
                        checkInDate: { 
                            type: "string", 
                            description: "Check-in date in YYYY-MM-DD format (optional, defaults to today)" 
                        }
                    }
                }
            }
        }
    ];
}

    async handleFunctionCall(functionCall, phoneNumber) {
    try {
        console.log('🔧 Handling function call:', functionCall.name);
        
        let parsedArgs;
        if (typeof functionCall.arguments === 'string') {
            parsedArgs = JSON.parse(functionCall.arguments);
        } else if (typeof functionCall.arguments === 'object') {
            parsedArgs = functionCall.arguments;
        } else {
            parsedArgs = {};
        }

        // Safe date parsing
        if (parsedArgs.checkInDate && typeof parsedArgs.checkInDate === 'string') {
            parsedArgs.checkInDate = this.parseDate(parsedArgs.checkInDate);
        } else {
            parsedArgs.checkInDate = new Date().toISOString().split('T')[0];
        }

        // Set default values for optional parameters
        if (!parsedArgs.nights || parsedArgs.nights < 1) {
            parsedArgs.nights = 1;
        }
        
        if (!parsedArgs.guests || parsedArgs.guests < 1) {
            parsedArgs.guests = 2;
        }

        console.log('🔧 Function arguments:', JSON.stringify(parsedArgs, null, 2));

        switch (functionCall.name) {
            case "checkRoomAvailability":
                return await this.checkRoomAvailability(parsedArgs);
            case "calculatePrice":
                return await this.calculatePrice(parsedArgs);
            case "createBooking":
                // Add phone number to booking data if not provided
                if (!parsedArgs.customerPhone) {
                    parsedArgs.customerPhone = phoneNumber;
                }
                return await this.createBooking(parsedArgs);
            case "getHotelInfo":
                return this.getHotelInfo();
            case "getAllAvailableRooms":
                return await this.getAllAvailableRooms(parsedArgs);
            default:
                return "I'll help you with that!";
        }
    } catch (error) {
        console.error(`❌ Function ${functionCall.name} error:`, error.message, error.stack);
        return `Sorry, I encountered an error: ${error.message}`;
    }
}

    async checkRoomAvailability(args) {
        const { roomType, checkInDate, nights = 1 } = args;
        const availability = await this.bookingService.checkAvailability(roomType, checkInDate, nights);

        if (availability.available) {
            return `✅ ${roomType} is AVAILABLE for ${checkInDate} (${nights} night${nights > 1 ? 's' : ''})!
💰 Price: ₹${availability.room.pricePerNight}/night
📊 Available Rooms: ${availability.availableCount}
📈 Total for ${nights} night${nights > 1 ? 's' : ''}: ₹${availability.room.pricePerNight * nights}

Would you like to book this room? Please provide:
1. Your full name
2. Number of guests
3. Any special requests`;
        } else {
            return `⚠️ ${roomType} is NOT AVAILABLE for ${checkInDate}.
📊 Available Rooms: ${availability.availableCount}

Would you like to:
• Check other dates?
• See other room types?
• Be notified when available?`;
        }
    }

    async calculatePrice(args) {
        const { roomType, nights, guests = 2 } = args;
        const rooms = await this.bookingService.getAllRoomsWithAvailability();
        const room = rooms.find(r => r.name === roomType);

        if (!room) return `Sorry, I couldn't find ${roomType}. Available rooms are: ${rooms.map(r => r.name).join(', ')}`;

        const total = room.pricePerNight * nights;
        return `💰 PRICE CALCULATION:
Room: ${roomType}
Nightly Rate: ₹${room.pricePerNight}
Nights: ${nights}
Guests: ${guests}
📊 Total: ₹${total}`;
    }

    async createBooking(args) {
        const { customerName, customerPhone, roomType, checkInDate, nights, guests = 2, specialRequests = "None" } = args;

        try {
            const result = await this.bookingService.createBooking({
                customerPhone, customerName, roomType, checkInDate, nights, guests, specialRequests
            });

            if (result.success) {
                this.clearHistory(customerPhone);
                return `🎉 BOOKING CONFIRMED! 🎉
Thank you, ${customerName}!
📋 Booking Details:
• Booking ID: ${result.booking.bookingId}
• Room: ${roomType}
• Check-in: ${checkInDate} (${this.hotelInfo.checkInTime})
• Nights: ${nights}
• Guests: ${guests}
• Total Amount: ₹${result.booking.totalAmount}
• Status: ${result.booking.status}
📞 Next Steps:
1. Your booking is now in our system
2. Room availability has been UPDATED in database
3. We'll contact you at ${customerPhone} for payment details
4. For any changes, quote your Booking ID: ${result.booking.bookingId}
Special Requests: ${specialRequests}
🏨 We look forward to hosting you at ${this.hotelInfo.name}!`;
            } else {
                return `❌ Booking Failed: ${result.message}
Please try:
• Different dates
• Different room type
• Or contact us directly at ${this.hotelInfo.contactPhone}`;
            }
        } catch (error) {
            console.error('Booking creation error:', error);
            return `❌ Booking Failed: ${error.message}
Please contact us directly at ${this.hotelInfo.contactPhone} for assistance.`;
        }
    }

    getHotelInfo() {
        return `🏨 ${this.hotelInfo.name}
📍 ${this.hotelInfo.location}
📞 Contact: ${this.hotelInfo.contactPhone}
📧 Email: ${this.hotelInfo.contactEmail}
⏰ Check-in: ${this.hotelInfo.checkInTime}
⏰ Check-out: ${this.hotelInfo.checkOutTime}
🌟 Amenities:
${this.hotelInfo.amenities.map(a => `• ${a}`).join('\n')}
💬 How can I assist you today?
• Check room availability & prices
• Make a booking
• Special requests
• Local attractions
• Any other questions?`;
    }

    async getAllAvailableRooms(args) {
    try {
        const checkInDate = args?.checkInDate || '';
        const parsedDate = this.parseDate(checkInDate);
        
        // Validate parsed date
        if (!parsedDate || isNaN(new Date(parsedDate).getTime())) {
            throw new Error('Invalid date format');
        }
        
        const rooms = await this.bookingService.getAllRoomsWithAvailability(parsedDate);

        if (rooms.length === 0) {
            return "No rooms available for the selected dates. Please try different dates.";
        }

        const availableRooms = rooms.filter(room => room.isAvailable);
        
        if (availableRooms.length === 0) {
            return `All rooms are booked for ${parsedDate}. Please try different dates.`;
        }

        const roomsList = availableRooms.map(room => 
            `• ${room.name}: ₹${room.pricePerNight}/night (${room.availableCount} available)`
        ).join('\n');
        
        return `🏨 AVAILABLE ROOMS for ${parsedDate}:
${roomsList}
💡 All prices are per night. Availability updates in real-time when bookings are made.`;
    } catch (error) {
        console.error('Error in getAllAvailableRooms:', error.message);
        return "I'm having trouble checking room availability. Please contact us directly or try again.";
    }
}
}

module.exports = OpenAIService;
