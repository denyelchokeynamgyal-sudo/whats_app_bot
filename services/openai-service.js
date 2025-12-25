const OpenAI = require('openai');
require('dotenv').config();
const { parse, format, isValid, addDays } = require('date-fns');

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
        this.bookingIntents = new Map();

        this.hotelInfo = {
            name: process.env.DEFAULT_HOTEL_NAME || 'Jaggle AI',
            location: process.env.DEFAULT_HOTEL_LOCATION || 'Thimphu, Bhutan',
            contactEmail: process.env.DEFAULT_CONTACT_EMAIL || 'denyelcnamgyal@gmail.com',
            contactPhone: process.env.DEFAULT_CONTACT_PHONE || '+975-17271095',
            checkInTime: process.env.DEFAULT_CHECK_IN_TIME || '2:00 PM',
            checkOutTime: process.env.DEFAULT_CHECK_OUT_TIME || '12:00 PM',
            amenities: process.env.DEFAULT_AMENITIES
                ? process.env.DEFAULT_AMENITIES.split(',')
                : ['Free WiFi']
        };

        console.log('✅ OpenAI Service initialized');
    }

    parseDate(userDate) {
        try {
            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();
            const currentDay = today.getDate();

            if (!userDate || userDate.trim() === '') {
                return format(today, 'yyyy-MM-dd');
            }

            const cleanedDate = userDate.trim().toLowerCase();
            console.log('Parsing date:', cleanedDate);

            // Handle common relative dates
            if (cleanedDate === 'today' || cleanedDate === 'now') {
                return format(today, 'yyyy-MM-dd');
            }

            if (cleanedDate === 'tomorrow') {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                return format(tomorrow, 'yyyy-MM-dd');
            }

            if (cleanedDate === 'day after tomorrow') {
                const dayAfter = new Date(today);
                dayAfter.setDate(dayAfter.getDate() + 2);
                return format(dayAfter, 'yyyy-MM-dd');
            }

            // Try to parse as day number (like "24")
            if (/^\d{1,2}$/.test(cleanedDate)) {
                const day = parseInt(cleanedDate);
                const currentDate = new Date(currentYear, currentMonth, day);

                // If day is in the past, assume next month
                if (currentDate < today) {
                    currentDate.setMonth(currentMonth + 1);
                }

                return format(currentDate, 'yyyy-MM-dd');
            }

            // Try parsing with various formats
            let parsedDate;

            // Try common date formats
            const formats = [
                'yyyy-MM-dd',
                'dd/MM/yyyy',
                'MM/dd/yyyy',
                'd MMMM yyyy',
                'd MMM yyyy',
                'MMMM d, yyyy',
                'MMM d, yyyy',
                'd-M-yyyy',
                'd/M/yyyy'
            ];

            for (const fmt of formats) {
                try {
                    parsedDate = parse(cleanedDate, fmt, new Date());
                    if (isValid(parsedDate)) {
                        return format(parsedDate, 'yyyy-MM-dd');
                    }
                } catch (e) {
                    continue;
                }
            }

            // Fallback: assume today
            console.warn(`Could not parse date: "${userDate}". Using today's date.`);
            return format(today, 'yyyy-MM-dd');

        } catch (error) {
            console.error('Error parsing date:', error.message, 'Input:', userDate);
            return format(new Date(), 'yyyy-MM-dd');
        }
    }

    async getAIResponse(phoneNumber, userMessage) {
        try {
            // Initialize conversation history for this phone number
            if (!this.conversationHistory.has(phoneNumber)) {
                this.conversationHistory.set(phoneNumber, []);
            }
            const history = this.conversationHistory.get(phoneNumber);

            // Add user message to history
            history.push({ role: 'user', content: userMessage });

            // Keep history manageable (last 15 messages)
            if (history.length > 15) {
                history.splice(0, history.length - 15);
            }

            // Get current room availability
            const rooms = await this.bookingService.getAllRoomsWithAvailability();
            const roomOptions = rooms.map(room =>
                `${room.name} (Nu.${room.pricePerNight}/night, ${room.availableCount} available)`
            ).join(', ');

            console.log(`📊 Room availability loaded: ${rooms.length} room types`);

            // First, check if we should create a booking request
            if (this.shouldCreateBookingRequest(phoneNumber, userMessage)) {
                console.log(`🔍 Should create booking request for ${phoneNumber}`);

                // Extract booking details, allowing updates from user corrections
                const bookingDetails = await this.extractBookingDetails(phoneNumber, userMessage);

                if (bookingDetails &&
                    bookingDetails.customerName &&
                    bookingDetails.roomType &&
                    bookingDetails.checkInDate) {

                    try {
                        // Format phone for display
                        let displayPhone;
                        if (phoneNumber.startsWith('91') && phoneNumber.length === 12) {
                            displayPhone = `+91 ${phoneNumber.substring(2, 7)} ${phoneNumber.substring(7)}`;
                        } else if (phoneNumber.startsWith('975') && phoneNumber.length === 11) {
                            displayPhone = `+975 ${phoneNumber.substring(3, 7)} ${phoneNumber.substring(7)}`;
                        } else if (phoneNumber.length === 10) {
                            displayPhone = `+91 ${phoneNumber.substring(0, 5)} ${phoneNumber.substring(5)}`;
                        } else {
                            displayPhone = `+${phoneNumber}`;
                        }

                        // Create booking request with latest details
                        const result = await this.bookingService.createBookingRequest({
                            ...bookingDetails,
                            customerPhone: phoneNumber,
                            status: 'requested'
                        });

                        if (result.success) {
                            this.clearHistory(phoneNumber);
                            this.bookingIntents.delete(phoneNumber);

                            const confirmationMessage = `🎉 *THANK YOU FOR YOUR BOOKING REQUEST!* 🎉

    📋 *Request Details:*
    • 📝 Request ID: *${result.booking.bookingId}*
    • 👤 Name: *${bookingDetails.customerName}*
    • 🏨 Room: *${bookingDetails.roomType}*
    • 🗓️ Check-in: *${bookingDetails.checkInDate}* (${bookingDetails.nights} night${bookingDetails.nights > 1 ? 's' : ''})
    • 📅 Check-out: *${bookingDetails.checkOutDate}*
    • 👥 Guests: *${bookingDetails.guests}*
    • 💰 Total: *Nu.${result.booking.totalAmount}*

    📞 *Next Steps:*
    1. Our staff will call you at *${displayPhone}* within *30 minutes*
    2. We'll confirm availability and take payment
    3. You'll receive final confirmation via WhatsApp

    ⏰ *Check-in Time:* ${this.hotelInfo.checkInTime}
    🏨 *Hotel:* ${this.hotelInfo.name}
    📍 *Location:* ${this.hotelInfo.location}

    *Special Requests:* ${bookingDetails.specialRequests || 'None'}

    Thank you for choosing ${this.hotelInfo.name}! We look forward to hosting you! 🏨✨`;

                            history.push({ role: 'assistant', content: confirmationMessage });
                            return confirmationMessage;
                        } else {
                            const errorMessage = `❌ *Booking Request Failed*
    Sorry, we couldn't process your booking request at this time.

    Please contact us directly:
    📞 ${this.hotelInfo.contactPhone}
    📧 ${this.hotelInfo.contactEmail}

    Or try again in a few minutes.`;

                            history.push({ role: 'assistant', content: errorMessage });
                            return errorMessage;
                        }
                    } catch (bookingError) {
                        console.error('❌ Booking creation error:', bookingError);

                        const errorMessage = `❌ *Booking Request Issue*
    ${bookingError.message || 'Sorry, we encountered an issue with your booking request.'}

    Please contact us directly:
    📞 ${this.hotelInfo.contactPhone}

    Or try different dates/room types.`;

                        history.push({ role: 'assistant', content: errorMessage });
                        return errorMessage;
                    }
                }
            }

            // For simple greetings, use pre-defined responses
            const lowerMessage = userMessage.toLowerCase();
            if (lowerMessage.includes('hello') || lowerMessage.includes('hi') ||
                lowerMessage.includes('hey') || lowerMessage === 'hi' ||
                lowerMessage === 'hello' || lowerMessage.includes('how are you')) {

                const greetingResponse = `Hello! 👋 Welcome to ${this.hotelInfo.name}! 

    I'm your AI booking assistant. Here's what I can help you with:
    🏨 Book a room
    📅 Check availability  
    💰 Get price quotes
    ❓ Answer questions

    Available rooms:
    ${rooms.map(r => `• ${r.name}: Nu.${r.pricePerNight}/night (${r.availableCount} available)`).join('\n')}

    How can I assist you today?`;

                history.push({ role: 'assistant', content: greetingResponse });
                return greetingResponse;
            }

            // For booking-related queries or general conversation, use AI
            try {
                // Prepare the conversation context
                const recentHistory = history.slice(-10); // Last 10 messages for context

                // System prompt with hotel information
                const systemPrompt = `You are a helpful hotel booking assistant for ${this.hotelInfo.name} hotel in ${this.hotelInfo.location}.

    Available rooms with prices:
    ${rooms.map(room => `- ${room.name}: Nu.${room.pricePerNight} per night (Currently ${room.availableCount} available)`).join('\n')}

    Hotel Information:
    - Check-in time: ${this.hotelInfo.checkInTime}
    - Check-out time: ${this.hotelInfo.checkOutTime}
    - Contact: ${this.hotelInfo.contactPhone}
    - Amenities: ${this.hotelInfo.amenities.join(', ')}

    IMPORTANT INSTRUCTIONS:
    1. Be friendly, professional, and helpful
    2. If user wants to book, guide them step by step:
    a. Ask for room type (Single/Double/Suite)
    b. Ask for check-in date (tomorrow, today, specific date)
    c. Ask for number of nights
    d. Ask for number of guests
    e. Ask for their name
    3. Ask ONE question at a time, don't overwhelm with multiple questions
    4. Once all information is collected, summarize and ask them to type "Confirm" to proceed
    5. For other questions, answer concisely and helpfully
    6. Always mention that staff will call to confirm the booking
    7. If user provides any booking details, acknowledge and continue with next question

    Current conversation history (last few messages):`;

                // Build messages for AI
                const messages = [
                    { role: "system", content: systemPrompt },
                    ...recentHistory
                ];

                console.log(`🤖 Calling AI with ${messages.length} messages for ${phoneNumber}`);

                const completion = await this.openai.chat.completions.create({
                    model: "gpt-4.1-mini",
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 300
                });

                const aiResponse = completion.choices[0].message.content;

                // Add AI response to history
                history.push({ role: 'assistant', content: aiResponse });

                console.log(`✅ AI Response generated (${aiResponse.length} chars)`);
                return aiResponse;

            } catch (aiError) {
                console.error('❌ AI generation error:', aiError);

                // Fallback to simple responses
                const fallbackResponse = await this.getFallbackResponse(userMessage, rooms);
                history.push({ role: 'assistant', content: fallbackResponse });
                return fallbackResponse;
            }

        } catch (error) {
            console.error('❌ Error in getAIResponse:', error);

            // Ultimate fallback response
            const errorResponse = `😅 Sorry, something went wrong while processing your request. 

    Please try again or contact us directly:
    📞 ${this.hotelInfo.contactPhone}
    📧 ${this.hotelInfo.contactEmail}

    Thank you for your patience!`;

            return errorResponse;
        }
    }

    // Helper method for fallback responses (keep your existing getFallbackResponse but update it)
    async getFallbackResponse(userMessage, rooms = []) {
        const lowerMessage = userMessage.toLowerCase();

        // If rooms not provided, fetch them
        if (rooms.length === 0) {
            try {
                rooms = await this.bookingService.getAllRoomsWithAvailability();
            } catch (error) {
                console.error('Error getting rooms for fallback:', error);
            }
        }

        const roomList = rooms.map(r => `• ${r.name}: Nu.${r.pricePerNight}/night (${r.availableCount} available)`).join('\n');

        if (lowerMessage.includes('book') || lowerMessage.includes('room') || lowerMessage.includes('stay')) {
            return `I'd be happy to help you book a room! 🏨

    Available rooms:
    ${roomList}

    To make a booking, I need a few details. Could you tell me:
    1. Which room type you'd like?
    2. What's your check-in date?`;
        }

        if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
            return `💰 Room Prices (per night):
    ${roomList}

    Would you like to book one of these rooms?`;
        }

        if (lowerMessage.includes('available') || lowerMessage.includes('vacant')) {
            return `✅ Current Availability:
    ${roomList}

    Which room interests you?`;
        }

        if (lowerMessage.includes('amenities') || lowerMessage.includes('facilities')) {
            return `⭐ Hotel Amenities:
    ${this.hotelInfo.amenities.map(a => `• ${a}`).join('\n')}

    ⏰ Check-in: ${this.hotelInfo.checkInTime}
    ⏰ Check-out: ${this.hotelInfo.checkOutTime}
    📍 ${this.hotelInfo.location}`;
        }

        return `Hello! I'm the booking assistant for ${this.hotelInfo.name}. 🏨

    I can help you with:
    • Booking rooms
    • Checking availability
    • Price information
    • Hotel details

    Available rooms:
    ${roomList}

    How can I help you today?`;
    }


    extractFromConversation(conversation, keywords) {
        const lowerConversation = conversation.toLowerCase();
        if (keywords.includes('single room') || keywords.includes('double room') || keywords.includes('suite')) {
            if (lowerConversation.includes('single')) return 'Single Room';
            if (lowerConversation.includes('double')) return 'Double Room';
            if (lowerConversation.includes('suite')) return 'Suite';
        }

        // Handle check-in date keywords
        if (keywords.includes('tomorrow') || keywords.includes('today') || keywords.includes('check-in')) {
            if (lowerConversation.includes('tomorrow')) return 'tomorrow';
            if (lowerConversation.includes('today')) return 'today';
            if (lowerConversation.includes('check-in')) {
                const dateMatch = lowerConversation.match(/check-in.*?(\d{4}-\d{2}-\d{2}|tomorrow|today)/);
                if (dateMatch) return dateMatch[1];
            }
        }

        // Handle nights
        if (keywords.includes('night') || keywords.includes('nights') || keywords.includes('stay')) {
            const nightMatch = lowerConversation.match(/(\d+)\s*(?:night|nights|stay)/i);
            if (nightMatch) return nightMatch[1];
        }

        // Handle guests
        if (keywords.includes('guest') || keywords.includes('guests') || keywords.includes('people')) {
            const guestMatch = lowerConversation.match(/(\d+)\s*(?:guest|guests|people|person)/i);
            if (guestMatch) return guestMatch[1];
        }

        // Handle name
        if (keywords.includes('name') || keywords.includes('call me') || keywords.includes('i am')) {
            const nameMatch = conversation.match(/name is\s+([^\.\?!,]+)/i) ||
                conversation.match(/i am\s+([^\.\?!,]+)/i) ||
                conversation.match(/call me\s+([^\.\?!,]+)/i);
            if (nameMatch && nameMatch[1]) {
                return nameMatch[1].trim();
            }
        }

        return null;
    }

    getMissingInfoPrompt(collectedInfo) {
        const steps = [
            { key: 'roomType', label: 'Room type (Single/Double/Suite)', done: !!collectedInfo.roomType },
            { key: 'checkInDate', label: 'Check-in date', done: !!collectedInfo.checkInDate },
            { key: 'nights', label: 'Number of nights', done: !!collectedInfo.nights },
            { key: 'guests', label: 'Number of guests', done: !!collectedInfo.guests },
            { key: 'name', label: 'Customer name', done: !!collectedInfo.name }
        ];

        const missingSteps = steps.filter(step => !step.done);

        if (missingSteps.length === 0) {
            return "ALL INFORMATION COLLECTED. Summarize all details and ask user to type 'Confirm' to proceed.";
        }

        const nextStep = missingSteps[0];
        return `NEXT STEP: Ask for ${nextStep.label}`;
    }

    async extractBookingDetails(phoneNumber, currentMessage) {
        try {
            const history = this.conversationHistory.get(phoneNumber) || [];
            if (history.length < 2) {
                return null;
            }

            // Get conversation text
            const conversationText = history.map(msg =>
                `${msg.role === 'user' ? 'Customer' : 'Assistant'}: ${msg.content}`
            ).join('\n');

            console.log('🔍 Extracting booking details from conversation...');

            // Manually extract key information first
            let extractedInfo = {
                customerName: 'Guest',
                roomType: 'Single Room',
                checkInDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'), // Tomorrow
                nights: 1,
                guests: 1,
                specialRequests: 'None'
            };

            // Extract from conversation
            for (const msg of history) {
                if (msg.role === 'user') {
                    const content = msg.content.toLowerCase();

                    // Extract name
                    if (content.includes('name is') || content.includes('i am ') || content.includes('call me')) {
                        const nameMatch = msg.content.match(/name is\s+([^\.,!?]+)/i) ||
                            msg.content.match(/i am\s+([^\.,!?]+)/i) ||
                            msg.content.match(/call me\s+([^\.,!?]+)/i);
                        if (nameMatch && nameMatch[1]) {
                            extractedInfo.customerName = nameMatch[1].trim();
                        } else if (msg.content.length < 20 && msg.content.length > 1 && !msg.content.includes(' ')) {
                            extractedInfo.customerName = msg.content.trim();
                        }
                    }

                    if (content.includes('tomorrow')) {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        extractedInfo.checkInDate = format(tomorrow, 'yyyy-MM-dd');
                    } else if (content.includes('today')) {
                        extractedInfo.checkInDate = format(new Date(), 'yyyy-MM-dd');
                    } else if (content.includes('day after')) {
                        const dayAfter = new Date();
                        dayAfter.setDate(dayAfter.getDate() + 2);
                        extractedInfo.checkInDate = format(dayAfter, 'yyyy-MM-dd');
                    } else if (/\d{1,2}/.test(content)) {
                        const dayMatch = content.match(/(\d{1,2})/);
                        if (dayMatch) {
                            extractedInfo.checkInDate = this.parseDate(dayMatch[1]);
                        }
                    }

                    if (content.includes('night') || content.includes('stay')) {
                        const nightMatch = content.match(/(\d+)\s*(?:night|nights|stay)/i);
                        if (nightMatch) {
                            extractedInfo.nights = parseInt(nightMatch[1]) || 1;
                        }
                    } else if (/^\d+$/.test(content.trim())) {
                        const num = parseInt(content.trim());
                        if (num > 0 && num < 30) {
                            extractedInfo.nights = num;
                        }
                    }

                    if (content.includes('guest') || content.includes('people') || content.includes('person')) {
                        const guestMatch = content.match(/(\d+)\s*(?:guest|guests|people|person)/i);
                        if (guestMatch) {
                            extractedInfo.guests = parseInt(guestMatch[1]) || 1;
                        }
                    }
                }
            }

            const extractionPrompt = `Extract booking details from this conversation.

CONVERSATION:
${conversationText}

TODAY'S DATE: ${format(new Date(), 'yyyy-MM-dd')}
TOMORROW'S DATE: ${format(addDays(new Date(), 1), 'yyyy-MM-dd')}

Extract as JSON:
{
  "customerName": "string (extract actual name or use 'Guest')",
  "roomType": "string ('Single Room', 'Double Room', or 'Suite')",
  "checkInDate": "string in YYYY-MM-DD format (use actual date, NOT 'YYYY-MM-DD')",
  "nights": "number (1-30 only)",
  "guests": "number (1-10 only)",
  "specialRequests": "string"
}

IMPORTANT RULES:
1. For checkInDate: Use actual date in YYYY-MM-DD format
   - If user says "today": Use ${format(new Date(), 'yyyy-MM-dd')}
   - If user says "tomorrow": Use ${format(addDays(new Date(), 1), 'yyyy-MM-dd')}
   - If no date mentioned: Use tomorrow's date
2. NEVER use placeholder text like "YYYY-MM-DD" 
3. Return ONLY valid JSON`;

            try {
                const completion = await this.openai.chat.completions.create({
                    model: "gpt-4.1-mini",
                    messages: [
                        { role: "system", content: "Extract booking details. Return ONLY valid JSON." },
                        { role: "user", content: extractionPrompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 300,
                    response_format: { type: "json_object" }
                });

                const extractedText = completion.choices[0].message.content;
                console.log('AI extraction:', extractedText);

                const aiExtracted = JSON.parse(extractedText);

                const finalDetails = {
                    customerName: extractedInfo.customerName !== 'Guest' ? extractedInfo.customerName : (aiExtracted.customerName || 'Guest'),
                    roomType: extractedInfo.roomType || aiExtracted.roomType || 'Single Room',
                    checkInDate: this.parseDate(aiExtracted.checkInDate || extractedInfo.checkInDate),
                    nights: extractedInfo.nights || (aiExtracted.nights ? parseInt(aiExtracted.nights) : 1),
                    guests: extractedInfo.guests || (aiExtracted.guests ? parseInt(aiExtracted.guests) : 1),
                    specialRequests: aiExtracted.specialRequests || 'None'
                };

                if (finalDetails.nights > 30 || finalDetails.nights < 1) {
                    console.log(`⚠️ Fixing invalid nights: ${finalDetails.nights} → 1`);
                    finalDetails.nights = 1;
                }

                const checkOutDate = addDays(new Date(finalDetails.checkInDate), finalDetails.nights);
                finalDetails.checkOutDate = format(checkOutDate, 'yyyy-MM-dd');

                console.log('✅ Final booking details:', finalDetails);
                return finalDetails;

            } catch (aiError) {
                console.error('AI extraction failed, using manual extraction:', aiError.message);
                if (extractedInfo.nights > 30) {
                    extractedInfo.nights = 1;
                }
                const checkOutDate = addDays(new Date(extractedInfo.checkInDate), extractedInfo.nights);
                extractedInfo.checkOutDate = format(checkOutDate, 'yyyy-MM-dd');

                console.log('✅ Using manual extraction:', extractedInfo);
                return extractedInfo;
            }

        } catch (error) {
            console.error('❌ Error extracting booking details:', error.message);
            return null;
        }
    }
    shouldCreateBookingRequest(phoneNumber, userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        const history = this.conversationHistory.get(phoneNumber) || [];

        console.log('Checking booking trigger for:', lowerMessage);

        // Check for explicit confirmation
        const confirmationKeywords = ['yes', 'confirm', 'proceed', 'go ahead'];
        const isConfirming = confirmationKeywords.some(keyword =>
            lowerMessage.includes(keyword) && !lowerMessage.includes('not')
        );

        const conversationText = history.map(msg => msg.content).join(' ').toLowerCase();

        const hasRoomType = conversationText.includes('single') ||
            conversationText.includes('double') ||
            conversationText.includes('suite');

        const hasCheckInDate = conversationText.includes('tomorrow') ||
            conversationText.includes('today') ||
            conversationText.includes('check-in') ||
            /\d{4}-\d{2}-\d{2}/.test(conversationText);

        const hasNights = /\d+\s*(?:night|nights|stay)/i.test(conversationText) ||
            (/\d+/.test(conversationText) && conversationText.includes('night'));

        const hasGuests = /\d+\s*(?:guest|guests|people|person)/i.test(conversationText) ||
            (/\d+/.test(conversationText) && conversationText.includes('guest'));

        const hasName = /name is|i am |call me /i.test(conversationText) ||
            (history.some(msg =>
                msg.role === 'user' &&
                msg.content.length > 1 &&
                msg.content.length < 30 &&
                !msg.content.includes(' ') &&
                !msg.content.match(/^\d+$/) &&
                !['no', 'not', 'cancel'].some(word => msg.content.toLowerCase().includes(word))
            ));

        const hasAllInfo = hasRoomType && hasCheckInDate && hasNights && hasGuests && hasName;

        const lastAIMessage = history.filter(msg => msg.role === 'assistant').pop()?.content || '';
        const aiAskedForConfirmation = lastAIMessage.includes('confirm') ||
            lastAIMessage.includes('type confirm') ||
            lastAIMessage.includes('please confirm');

        const shouldCreate = isConfirming && aiAskedForConfirmation && hasAllInfo;

        return shouldCreate;
    }

    /** Get fallback response */
    async getFallbackResponse(userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        const rooms = await this.bookingService.getAllRoomsWithAvailability();

        const roomOptions = rooms.map(room =>
            `• ${room.name}: Nu.${room.pricePerNight}/night (${room.availableCount} available)`
        ).join('\n');

        if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
            return `Hello! 👋 Welcome to ${this.hotelInfo.name}! 

    I'm your AI booking assistant. Here's what I can help you with:
    🏨 Book a room
    📅 Check availability  
    💰 Get price quotes
    ❓ Answer questions

    Available rooms right now:
    ${roomOptions}

    How can I assist you today?`;
        }

        if (lowerMessage.includes('book') || lowerMessage.includes('room') || lowerMessage.includes('stay')) {
            return `Great! I'll help you book a room. 😊

    Available rooms:
    ${roomOptions}

    To book, I need a few details:
    1. 🏨 Which room type would you like?
    2. 📅 What is your check-in date?
    3. 🌙 How many nights will you stay?
    4. 👥 How many guests?

    Would you like to start with room selection?`;
        }

        if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
            return `💰 Our Room Prices:
    ${roomOptions}

    *Note:* All prices are per night. Would you like to book one of these rooms?`;
        }

        if (lowerMessage.includes('available') || lowerMessage.includes('vacant')) {
            return `✅ Current Room Availability:
    ${roomOptions}

    Which room would you like to book?`;
        }

        if (lowerMessage.includes('amenities') || lowerMessage.includes('facilities')) {
            return `⭐ Hotel Amenities:
    ${this.hotelInfo.amenities.map(amenity => `• ${amenity}`).join('\n')}

    ⏰ Check-in: ${this.hotelInfo.checkInTime}
    ⏰ Check-out: ${this.hotelInfo.checkOutTime}
    📍 Location: ${this.hotelInfo.location}

    Would you like to know more or book a room?`;
        }

        return `I'm here to help you with your hotel booking at ${this.hotelInfo.name}! 🏨

    You can ask me about:
    • Room availability and prices
    • Booking process
    • Hotel amenities
    • Check-in/check-out times

    Or just say "I want to book a room" to get started! 😊

    Available rooms:
    ${roomOptions}`;
    }

    clearHistory(phoneNumber) {
        if (this.conversationHistory.has(phoneNumber)) {
            this.conversationHistory.set(phoneNumber, []);
        }
        if (this.bookingIntents.has(phoneNumber)) {
            this.bookingIntents.delete(phoneNumber);
        }
    }

    userProvidedInfo(conversation, infoType) {
        const lowerConv = conversation.toLowerCase();
        switch (infoType) {
            case 'checkInDate':
                return lowerConv.includes('tomorrow') || lowerConv.includes('today') || /\d{1,2}/.test(lowerConv);
            case 'nights':
                return lowerConv.includes('night') || /\d+\s*(?:night|nights)/.test(lowerConv);
            case 'guests':
                return lowerConv.includes('guest') || lowerConv.includes('people');
            case 'name':
                return lowerConv.includes('name') || lowerConv.includes('i am ') || lowerConv.includes('call me');
            default:
                return false;
        }
    }
}

module.exports = OpenAIService;