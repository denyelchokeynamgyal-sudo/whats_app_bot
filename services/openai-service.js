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
        this.bookingStates = new Map();

        // Room type capacities
        this.roomCapacities = {
            'Single Room': 1,
            'Double Room': 2,
            'Triple Room': 3,
            'Quad Room': 4,
            'Family Suite': 5
        };

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

        console.log('✅ OpenAI Service initialized with room booking logic');
    }

    setBookingState(phoneNumber, state, data = {}) {
        console.log(`📝 Setting booking state for ${phoneNumber}:`, state.step);
        this.bookingStates.set(phoneNumber, { ...state, ...data, timestamp: Date.now() });
    }

    getBookingState(phoneNumber) {
        const state = this.bookingStates.get(phoneNumber);
        if (state) {
            console.log(`📊 Current booking state for ${phoneNumber}:`, state.step);
        }
        return state;
    }

    clearBookingState(phoneNumber) {
        console.log(`🧹 Clearing booking state for ${phoneNumber}`);
        this.bookingStates.delete(phoneNumber);
        this.bookingIntents.delete(phoneNumber);
        this.conversationHistory.delete(phoneNumber);
    }

    getSelectedCombo(phoneNumber, userMessage, combinations) {
        const lowerMessage = userMessage.toLowerCase().trim();

        const selectionMap = {
            'first': 1, 'first option': 1, 'option 1': 1, 'option one': 1, '1st': 1, 'one': 1, '1': 1,
            'second': 2, 'second option': 2, 'option 2': 2, 'option two': 2, '2nd': 2, 'two': 2, '2': 2,
            'third': 3, 'third option': 3, 'option 3': 3, 'option three': 3, '3rd': 3, 'three': 3, '3': 3
        };

        // Check for exact matches
        if (selectionMap[lowerMessage]) {
            const selectedNumber = selectionMap[lowerMessage];
            const selectedIndex = selectedNumber - 1;
            if (selectedIndex >= 0 && selectedIndex < combinations.length) {
                return combinations[selectedIndex];
            }
        }

        // Check for patterns like "the first one"
        for (const [text, number] of Object.entries(selectionMap)) {
            if (lowerMessage.includes(text) &&
                (lowerMessage.includes(`the ${text}`) ||
                    lowerMessage.includes(`${text} option`) ||
                    lowerMessage.includes(`${text} one`))) {
                const selectedIndex = number - 1;
                if (selectedIndex >= 0 && selectedIndex < combinations.length) {
                    return combinations[selectedIndex];
                }
            }
        }

        return null;
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

            if (/^\d{1,2}$/.test(cleanedDate)) {
                const day = parseInt(cleanedDate);
                const currentDate = new Date(currentYear, currentMonth, day);
                if (currentDate < today) {
                    currentDate.setMonth(currentMonth + 1);
                }
                return format(currentDate, 'yyyy-MM-dd');
            }

            let parsedDate;
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

            console.warn(`Could not parse date: "${userDate}". Using today's date.`);
            return format(today, 'yyyy-MM-dd');

        } catch (error) {
            console.error('Error parsing date:', error.message, 'Input:', userDate);
            return format(new Date(), 'yyyy-MM-dd');
        }
    }

    generateRoomCombinations(totalPeople) {
        const combinations = [];

        const roomTypes = Object.entries(this.roomCapacities)
            .sort(([, a], [, b]) => b - a);

        for (let i = 1; i <= 3; i++) {
            this.findCombinations(totalPeople, roomTypes, i, [], combinations);
        }

        const uniqueCombos = [];
        const seen = new Set();

        combinations.forEach(combo => {
            const key = combo.sort().join(',');
            if (!seen.has(key)) {
                seen.add(key);
                uniqueCombos.push(combo);
            }
        });

        return uniqueCombos
            .sort((a, b) => {
                const aRooms = a.length;
                const bRooms = b.length;
                if (aRooms !== bRooms) return aRooms - bRooms;

                const aCapacity = a.reduce((sum, room) => sum + this.roomCapacities[room], 0);
                const bCapacity = b.reduce((sum, room) => sum + this.roomCapacities[room], 0);
                return aCapacity - bCapacity;
            })
            .slice(0, 3);
    }

    findCombinations(remainingPeople, roomTypes, maxRooms, current, results) {
        if (remainingPeople <= 0 && current.length <= maxRooms) {
            results.push([...current]);
            return;
        }

        if (current.length >= maxRooms || remainingPeople < 0) {
            return;
        }

        for (const [roomType, capacity] of roomTypes) {
            if (capacity <= remainingPeople) {
                current.push(roomType);
                this.findCombinations(remainingPeople - capacity, roomTypes, maxRooms, current, results);
                current.pop();
            }
        }
    }

    formatCombinationSuggestions(combinations, totalPeople) {
        if (combinations.length === 0) {
            return "Sorry, I couldn't find a suitable room combination for that many people.";
        }

        const suggestions = combinations.map((combo, index) => {
            const roomCounts = {};
            combo.forEach(room => {
                roomCounts[room] = (roomCounts[room] || 0) + 1;
            });

            const roomSummary = Object.entries(roomCounts)
                .map(([room, count]) => `${count} ${room}${count > 1 ? 's' : ''}`)
                .join(', ');

            const totalRooms = combo.length;
            const totalCapacity = combo.reduce((sum, room) => sum + this.roomCapacities[room], 0);

            return `${index + 1}. ${roomSummary} (${totalCapacity} people, ${totalRooms} room${totalRooms > 1 ? 's' : ''} total)`;
        }).join('\n');

        return `For ${totalPeople} people, I suggest:\n${suggestions}\n\nWhich option would you prefer? (1, 2, or 3)`;
    }

    handleCombinationSelection(phoneNumber, userMessage, combinations) {
        const lowerMessage = userMessage.toLowerCase().trim();

        console.log(`🔍 Checking combination selection for: "${userMessage}"`);
        console.log(`🔍 Available combinations:`, combinations.map((c, i) => `${i + 1}. ${c.join(' + ')}`));

        // FIXED: Better pattern matching for "Option 1", "1", "first", etc.
        let selectedNumber = null;

        // Common patterns users might say
        const selectionPatterns = [
            { pattern: /^(\d+)$/, extract: (match) => parseInt(match[1]) }, // "1", "2", "3"
            { pattern: /^option\s*(\d+)$/i, extract: (match) => parseInt(match[1]) }, // "option 1", "option1"
            { pattern: /^the\s+(\d+)(?:st|nd|rd)?$/i, extract: (match) => parseInt(match[1]) }, // "the 1st", "the 2nd"
            { pattern: /^(first|second|third)$/i, extract: (match) => ({ first: 1, second: 2, third: 3 }[match[1].toLowerCase()]) },
            { pattern: /^option\s+(one|two|three)$/i, extract: (match) => ({ one: 1, two: 2, three: 3 }[match[1].toLowerCase()]) }
        ];

        // Try each pattern
        for (const { pattern, extract } of selectionPatterns) {
            const match = lowerMessage.match(pattern);
            if (match) {
                selectedNumber = extract(match);
                console.log(`✅ Pattern matched: "${pattern}" -> ${selectedNumber}`);
                break;
            }
        }

        // Also check if message contains these words anywhere
        if (!selectedNumber) {
            if (lowerMessage.includes('option 1') || lowerMessage.includes('option one') || lowerMessage.includes('first')) selectedNumber = 1;
            else if (lowerMessage.includes('option 2') || lowerMessage.includes('option two') || lowerMessage.includes('second')) selectedNumber = 2;
            else if (lowerMessage.includes('option 3') || lowerMessage.includes('option three') || lowerMessage.includes('third')) selectedNumber = 3;
        }

        console.log(`🔍 Final selected number: ${selectedNumber}`);

        // If we found a valid selection
        if (selectedNumber !== null && selectedNumber >= 1 && selectedNumber <= 3) {
            const selectedIndex = selectedNumber - 1;

            console.log(`🔍 Selected index: ${selectedIndex}, Combinations length: ${combinations.length}`);

            if (selectedIndex < combinations.length) {
                const selectedCombo = combinations[selectedIndex];
                console.log(`✅ Selected combination at index ${selectedIndex}:`, selectedCombo);

                // Format response
                const roomCounts = {};
                selectedCombo.forEach(room => {
                    roomCounts[room] = (roomCounts[room] || 0) + 1;
                });

                const roomSummary = Object.entries(roomCounts)
                    .map(([room, count]) => `${count} ${room}${count > 1 ? 's' : ''}`)
                    .join(', ');

                const totalRooms = selectedCombo.length;
                const totalPeople = selectedCombo.reduce((sum, room) =>
                    sum + this.roomCapacities[room], 0);

                // Double-check: The selected combo should match what was shown
                console.log(`✅ Selection summary: ${roomSummary} (${totalRooms} rooms, ${totalPeople} people)`);

                // SET THE BOOKING STATE
                this.setBookingState(phoneNumber, {
                    step: 'waiting_for_checkin',
                    type: 'people_count',
                    people: totalPeople,
                    selectedOption: selectedCombo,
                    combinations: combinations
                });

                console.log(`✅ Booking state set: waiting_for_checkin for ${totalPeople} people`);

                return `Great! You selected: ${roomSummary} (${totalRooms} rooms, ${totalPeople} people).\n\nFirst, what is your check-in date? (e.g., tomorrow, today, or specific date)`;
            } else {
                console.log(`❌ Selected index ${selectedIndex} is out of bounds (combinations length: ${combinations.length})`);
            }
        } else {
            console.log(`❌ No valid selection found for: "${userMessage}"`);
        }

        return null;
    }

    parseRoomTypeRequest(message) {
        const roomRequest = {
            totalRooms: 0,
            rooms: {},
            valid: false,
            message: ''
        };

        const lowerMessage = message.toLowerCase();

        const roomPatterns = {
            'single': 'Single Room',
            'double': 'Double Room',
            'triple': 'Triple Room',
            'quad': 'Quad Room',
            'family': 'Family Suite',
            'suite': 'Family Suite',
            'deluxe': 'Family Suite'
        };

        let totalRooms = 0;
        const rooms = {};

        // Match patterns like "2 double rooms", "1 single", etc.
        for (const [pattern, roomType] of Object.entries(roomPatterns)) {
            const regex = new RegExp(`(\\d+)\\s*${pattern}`, 'gi');
            let match;
            while ((match = regex.exec(lowerMessage)) !== null) {
                const count = parseInt(match[1]);
                rooms[roomType] = (rooms[roomType] || 0) + count;
                totalRooms += count;
            }
        }

        // Also match "a single room", "one double room"
        if (totalRooms === 0) {
            for (const [pattern, roomType] of Object.entries(roomPatterns)) {
                if ((lowerMessage.includes(`a ${pattern}`) ||
                    lowerMessage.includes(`one ${pattern}`) ||
                    lowerMessage.includes(`an ${pattern}`)) &&
                    !lowerMessage.includes(`no ${pattern}`)) {
                    rooms[roomType] = 1;
                    totalRooms = 1;
                    break;
                }
            }
        }

        // Match simple "single room", "double room"
        if (totalRooms === 0) {
            for (const [pattern, roomType] of Object.entries(roomPatterns)) {
                if (lowerMessage.includes(`${pattern} room`) &&
                    !lowerMessage.includes(`no ${pattern}`)) {
                    rooms[roomType] = 1;
                    totalRooms = 1;
                    break;
                }
            }
        }

        roomRequest.totalRooms = totalRooms;
        roomRequest.rooms = rooms;

        if (totalRooms === 0) {
            roomRequest.valid = false;
            roomRequest.message = "I didn't recognize any room types. Please specify like 'Single Room', 'Double Room', etc.";
        } else if (totalRooms > 3) {
            roomRequest.valid = false;
            roomRequest.message = `Maximum 3 rooms per booking. You requested ${totalRooms} rooms.`;
        } else {
            roomRequest.valid = true;
            const roomDesc = Object.entries(rooms)
                .map(([room, count]) => `${count} ${room}${count > 1 ? 's' : ''}`)
                .join(', ');
            roomRequest.message = `You want: ${roomDesc} (${totalRooms} rooms total)`;
        }

        return roomRequest;
    }

    extractPeopleCount(message) {
        const lowerMessage = message.toLowerCase();

        const patterns = [
            /(\d+)\s*(?:people|guests|persons|person)/,
            /we are\s*(\d+)/,
            /for\s*(\d+)/,
            /(\d+)\s*of us/,
            /group of\s*(\d+)/,
            /(\d+)\s*members/,
            /(\d+)\s*adults/,
            /(\d+)\s*children/,
            /total\s*(\d+)/,
            /book\s*for\s*(\d+)/,
            /there are\s*(\d+)/,
            /(\d+)\s*guests/
        ];

        for (const pattern of patterns) {
            const match = lowerMessage.match(pattern);
            if (match) {
                console.log(`✅ Extracted people count: ${match[1]} from pattern: ${pattern}`);
                return parseInt(match[1]);
            }
        }

        // Check for standalone numbers that might indicate count
        const words = lowerMessage.split(/\s+/);
        for (const word of words) {
            if (/^\d+$/.test(word)) {
                const num = parseInt(word);
                if (num > 0 && num <= 20) {
                    console.log(`✅ Extracted people count from standalone number: ${num}`);
                    return num;
                }
            }
        }

        console.log(`❌ No people count found in: "${message}"`);
        return null;
    }

    isGreeting(message) {
        const lowerMessage = message.toLowerCase();
        const greetings = ['hello', 'hi', 'hey', 'hy', 'kuzu zangpo', 'good morning', 'good afternoon'];

        // Check for exact matches or very short greetings
        if (greetings.some(g => lowerMessage === g || lowerMessage === g + '!')) {
            return true;
        }

        // Check for longer greetings
        if (greetings.some(g => lowerMessage.startsWith(g + ' ') ||
            lowerMessage.includes(g + ' '))) {
            return true;
        }

        return false;
    }

    isOptionSelection(userMessage, history) {
        if (history.length < 2) return false;

        const lastAssistantMsg = history[history.length - 2]?.content || '';
        const lastAssistantLower = lastAssistantMsg.toLowerCase();

        // Was the assistant asking for an option?
        const wasAskingForOption = lastAssistantLower.includes('which option') ||
            lastAssistantLower.includes('(1, 2, or 3)') ||
            lastAssistantLower.includes('option 1') ||
            lastAssistantLower.includes('option 2') ||
            lastAssistantLower.includes('option 3') ||
            lastAssistantLower.includes('first option') ||
            lastAssistantLower.includes('second option') ||
            lastAssistantLower.includes('third option');

        if (!wasAskingForOption) return false;

        // Check if this message looks like an option selection
        const lowerMessage = userMessage.toLowerCase().trim();
        const isOptionPattern = /^(1|2|3|first|second|third|option\s*[123]|option\s*(one|two|three))$/i.test(lowerMessage) ||
            /^the\s+(first|second|third)(\s+option)?$/i.test(lowerMessage) ||
            /^i('ll| will)?\s+(take|choose|want)\s+(the\s+)?(first|second|third|option\s*[123])$/i.test(lowerMessage);

        return isOptionPattern;
    }

    async handleOptionSelection(phoneNumber, userMessage, history, rooms) {
        console.log(`🎯 Handling option selection: "${userMessage}"`);

        // ALWAYS try to use stored combinations first
        const bookingIntent = this.bookingIntents.get(phoneNumber);

        if (bookingIntent && bookingIntent.combinations) {
            console.log(`✅ Using stored combinations from booking intent`);
            const selectionResponse = this.handleCombinationSelection(phoneNumber, userMessage, bookingIntent.combinations);

            if (selectionResponse) {
                history.push({ role: 'assistant', content: selectionResponse });
                return selectionResponse;
            }
        }

        // Fallback: try to regenerate combinations
        console.log(`⚠️ No stored combinations, trying to regenerate`);

        // Find people count from history
        let peopleCount = null;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user') {
                const count = this.extractPeopleCount(history[i].content);
                if (count) {
                    peopleCount = count;
                    console.log(`✅ Found people count ${peopleCount} from history`);
                    break;
                }
            }
        }

        if (peopleCount) {
            const combinations = this.generateRoomCombinations(peopleCount);
            console.log(`🔍 Regenerated combinations:`, combinations);
            const selectionResponse = this.handleCombinationSelection(phoneNumber, userMessage, combinations);

            if (selectionResponse) {
                history.push({ role: 'assistant', content: selectionResponse });
                return selectionResponse;
            }
        }

        console.log(`❌ Could not handle option selection`);
        return null;
    }

    async startPeopleCountBooking(phoneNumber, userMessage, peopleCount, rooms, history) {
        console.log(`👥 Starting booking for ${peopleCount} people`);

        const combinations = this.generateRoomCombinations(peopleCount);

        // Check if user is immediately selecting an option
        const selectionResponse = this.handleCombinationSelection(phoneNumber, userMessage, combinations);
        if (selectionResponse) {
            console.log(`✅ User selected option immediately`);
            history.push({ role: 'assistant', content: selectionResponse });
            return selectionResponse;
        }

        // Otherwise show suggestions
        const response = this.formatCombinationSuggestions(combinations, peopleCount);

        // Store intent for later
        this.bookingIntents.set(phoneNumber, {
            type: 'people_count',
            people: peopleCount,
            combinations: combinations,
            selectedOption: null
        });

        history.push({ role: 'assistant', content: response });
        return response;
    }

    isBookingInitiation(message) {
        const lowerMessage = message.toLowerCase();
        const bookingTriggers = [
            'book a room',
            'i want to book',
            'i need a room',
            'reserve a room',
            'make a booking',
            'want to stay',
            'need to book'
        ];

        return bookingTriggers.some(trigger => lowerMessage.includes(trigger));
    }

    // MAIN METHOD - BALANCED AI AND BOOKING STATE MACHINE
    async getAIResponse(phoneNumber, userMessage) {
        try {
            console.log(`\n=== NEW MESSAGE ===`);
            console.log(`From: ${phoneNumber}`);
            console.log(`Message: "${userMessage}"`);

            // Initialize conversation history
            if (!this.conversationHistory.has(phoneNumber)) {
                this.conversationHistory.set(phoneNumber, []);
            }
            const history = this.conversationHistory.get(phoneNumber);
            history.push({ role: 'user', content: userMessage });

            if (history.length > 20) {
                history.splice(0, history.length - 20);
            }

            // Get room availability
            const rooms = await this.bookingService.getAllRoomsWithAvailability();

            // Check current booking state
            const bookingState = this.getBookingState(phoneNumber);
            console.log('📋 Booking state:', bookingState ? bookingState.step : 'No active booking');

            // 1. Handle cancellation anytime
            const lowerMessage = userMessage.toLowerCase();
            if (lowerMessage.includes('cancel') || lowerMessage.includes('start over')) {
                this.clearBookingState(phoneNumber);
                const cancelResponse = 'Booking cancelled. How can I help you today?';
                history.push({ role: 'assistant', content: cancelResponse });
                return cancelResponse;
            }

            // 2. If in booking process, ALWAYS use state machine first
            if (bookingState) {
                console.log(`🚀 Using state machine for step: ${bookingState.step}`);
                const bookingResponse = await this.handleBookingStep(phoneNumber, userMessage, bookingState, rooms, history);

                if (bookingResponse) {
                    return bookingResponse;
                }
            }

            // 3. Check for option selection (user selecting 1, 2, or 3)
            if (this.isOptionSelection(userMessage, history)) {
                console.log(`🎯 Detected option selection`);
                const selectionResult = await this.handleOptionSelection(phoneNumber, userMessage, history, rooms);
                if (selectionResult) {
                    return selectionResult;
                }
            }

            // 4. Check for people count (start new booking)
            const peopleCount = this.extractPeopleCount(userMessage);
            if (peopleCount !== null && !bookingState) {
                console.log(`👥 Starting booking for ${peopleCount} people`);
                return await this.startPeopleCountBooking(phoneNumber, userMessage, peopleCount, rooms, history);
            }

            // 5. Check for direct room booking
            const roomRequest = this.parseRoomTypeRequest(userMessage);
            if (roomRequest.valid && !bookingState) {
                console.log(`🏨 Starting booking with specific rooms`);
                return await this.handleRoomTypeRequest(phoneNumber, userMessage, roomRequest, rooms, history);
            }

            // 6. Check for booking initiation phrases
            if (this.isBookingInitiation(userMessage) && !bookingState) {
                console.log(`🎫 User wants to start booking`);
                const response = `Great! To book a room, please tell me:\n\n1. How many people will be staying? (e.g., "2 people")\nOR\n2. Which room type you prefer? (e.g., "Double Room")`;
                history.push({ role: 'assistant', content: response });
                return response;
            }

            // 7. Use AI for general conversation, but with booking awareness
            return await this.handleSmartAI(phoneNumber, userMessage, bookingState, rooms, history);

        } catch (error) {
            console.error('❌ Error in getAIResponse:', error);
            return `😅 Sorry, something went wrong. Please try again or contact us at ${this.hotelInfo.contactPhone}.`;
        }
    }

    async handleRoomTypeRequest(phoneNumber, userMessage, roomRequest, rooms, history) {
        let totalPeople = 0;
        for (const [roomType, count] of Object.entries(roomRequest.rooms)) {
            totalPeople += (this.roomCapacities[roomType] || 1) * count;
        }

        const response = `Great! ${roomRequest.totalRooms} rooms total (${Object.entries(roomRequest.rooms).map(([room, count]) => `${count} ${room}${count > 1 ? 's' : ''}`).join(', ')}) for ${totalPeople} people max.\n\nFirst, what is your check-in date? (e.g., tomorrow, today, or specific date)`;

        // Set state: waiting for check-in date
        this.setBookingState(phoneNumber, {
            step: 'waiting_for_checkin',
            type: 'room_specification',
            rooms: roomRequest.rooms,
            totalRooms: roomRequest.totalRooms,
            totalPeople: totalPeople
        });

        history.push({ role: 'assistant', content: response });
        return response;
    }

    async handleSmartAI(phoneNumber, userMessage, bookingState, rooms, history) {
        const recentHistory = history.slice(-10);

        const systemPrompt = `You are a helpful hotel booking assistant for ${this.hotelInfo.name}.

IMPORTANT GUIDELINES:
1. Answer general questions about the hotel, rooms, amenities, etc.
2. If user wants to BOOK, guide them to provide: 
   - Number of people OR specific room types
   - Then the booking system will take over
3. Be friendly, helpful, and professional
4. Don't force formalities - accept natural language

ROOM INFO:
- Single Room: 1 person max, Nu.800/night
- Double Room: 2 people max, Nu.1200/night  
- Triple Room: 3 people max, Nu.1500/night
- Quad Room: 4 people max, Nu.1800/night
- Family Suite: 5 people max, Nu.2500/night
- Maximum 3 rooms per booking

Current availability:
${rooms.map(r => `- ${r.name}: ${r.availableCount} available`).join('\n')}

HOTEL INFO:
- Location: ${this.hotelInfo.location}
- Check-in: ${this.hotelInfo.checkInTime}
- Check-out: ${this.hotelInfo.checkOutTime}
- Contact: ${this.hotelInfo.contactPhone}
- Amenities: ${this.hotelInfo.amenities.join(', ')}

Respond naturally. If unsure, ask clarifying questions.`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...recentHistory
        ];

        try {
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4.1-mini",
                messages: messages,
                temperature: 0.7,
                max_tokens: 300
            });

            const aiResponse = completion.choices[0].message.content;
            history.push({ role: 'assistant', content: aiResponse });
            return aiResponse;
        } catch (aiError) {
            console.error('AI error:', aiError);
            return await this.getFallbackResponse(userMessage, rooms);
        }
    }

    async handleBookingStep(phoneNumber, userMessage, bookingState, rooms, history) {
        const lowerMessage = userMessage.toLowerCase();

        console.log(`📋 Handling booking step: ${bookingState.step}`);

        // Check for cancel
        if (lowerMessage.includes('cancel') || lowerMessage.includes('start over')) {
            this.clearBookingState(phoneNumber);
            history.push({ role: 'assistant', content: 'Booking cancelled. How can I help you?' });
            return 'Booking cancelled. How can I help you?';
        }

        switch (bookingState.step) {
            case 'waiting_for_checkin':
                // User provided check-in date
                const checkInDate = this.parseDate(userMessage);

                console.log(`✅ Check-in date extracted: ${checkInDate}`);

                // Update state with check-in date
                this.setBookingState(phoneNumber, {
                    ...bookingState,
                    step: 'waiting_for_nights',
                    checkInDate: checkInDate
                });

                const response1 = `Got it! Check-in date: ${checkInDate}\n\nNow, how many nights will you be staying?`;
                history.push({ role: 'assistant', content: response1 });
                return response1;

            case 'waiting_for_nights':
                // User provided number of nights
                let nights = 1;
                const nightsMatch = userMessage.match(/(\d+)\s*(?:night|nights)/i);
                if (nightsMatch) {
                    nights = parseInt(nightsMatch[1]);
                } else if (/^\d+$/.test(userMessage.trim())) {
                    nights = parseInt(userMessage.trim());
                }

                if (nights < 1 || nights > 30) {
                    nights = 1;
                    console.log('⚠️ Invalid nights, defaulting to 1');
                }

                console.log(`✅ Nights extracted: ${nights}`);

                // Update state with nights
                this.setBookingState(phoneNumber, {
                    ...bookingState,
                    step: 'waiting_for_name',
                    nights: nights
                });

                // Calculate check-out date
                const checkOutDate = format(addDays(new Date(bookingState.checkInDate), nights), 'yyyy-MM-dd');

                const response2 = `Perfect! ${nights} night${nights > 1 ? 's' : ''} stay.\nCheck-out date: ${checkOutDate}\n\nNow, what is your name?`;
                history.push({ role: 'assistant', content: response2 });
                return response2;

            case 'waiting_for_name':
                // Extract just the name, not the whole phrase
                let name = userMessage.trim();

                // Remove "my name is", "i am", "name is" prefixes
                const nameMatch = name.match(/(?:my name is|i am|name is)\s*(.+)/i);
                if (nameMatch && nameMatch[1]) {
                    name = nameMatch[1].trim();
                }

                console.log(`✅ Name extracted: ${name}`);

                // Update state with name
                const updatedState = {
                    ...bookingState,
                    step: 'ready_for_confirmation',
                    name: name
                };
                this.setBookingState(phoneNumber, updatedState);

                // Generate summary
                const summary = this.generateBookingSummary(updatedState);

                const response3 = `Thank you, ${name}! Here's your booking summary:\n\n${summary}\n\nPlease type "Confirm" to submit your booking request, or "Cancel" to start over.`;
                history.push({ role: 'assistant', content: response3 });
                return response3;

            case 'ready_for_confirmation':
                // User confirms booking
                if (lowerMessage.includes('confirm') || lowerMessage.includes('yes') || lowerMessage === 'ok') {
                    // Extract final booking details
                    const bookingDetails = this.extractFinalBookingDetails(bookingState, phoneNumber);

                    console.log('✅ Booking confirmed, details:', bookingDetails);

                    // Clear state
                    this.clearBookingState(phoneNumber);

                    // Return booking ready signal
                    return `BOOKING_READY:${JSON.stringify(bookingDetails)}`;
                } else {
                    const response4 = `Please type "Confirm" to submit your booking, or "Cancel" to start over.`;
                    history.push({ role: 'assistant', content: response4 });
                    return response4;
                }

            default:
                // Unknown state, clear and restart
                console.log('⚠️ Unknown booking state, clearing');
                this.clearBookingState(phoneNumber);
                return `I lost track of our conversation. Let's start over. How can I help you?`;
        }
    }

    generateBookingSummary(bookingState) {
        let roomDescription = '';
        let totalPeople = 0;

        if (bookingState.type === 'people_count' && bookingState.selectedOption) {
            const combo = bookingState.selectedOption;
            const roomCounts = {};
            combo.forEach(room => {
                roomCounts[room] = (roomCounts[room] || 0) + 1;
            });
            roomDescription = Object.entries(roomCounts)
                .map(([room, count]) => `${count} ${room}${count > 1 ? 's' : ''}`)
                .join(', ');
            totalPeople = combo.reduce((sum, room) => sum + this.roomCapacities[room], 0);
        } else if (bookingState.type === 'room_specification') {
            roomDescription = Object.entries(bookingState.rooms)
                .map(([room, count]) => `${count} ${room}${count > 1 ? 's' : ''}`)
                .join(', ');
            totalPeople = bookingState.totalPeople;
        }

        const checkOutDate = format(addDays(new Date(bookingState.checkInDate), bookingState.nights), 'yyyy-MM-dd');

        return `🏨 Room(s): ${roomDescription}
👥 Guests: ${totalPeople} person${totalPeople > 1 ? 's' : ''}
📅 Check-in: ${bookingState.checkInDate}
📅 Check-out: ${checkOutDate}
🌙 Nights: ${bookingState.nights}
👤 Name: ${bookingState.name}`;
    }

    extractFinalBookingDetails(bookingState, phoneNumber) {
        let roomType = '';
        let roomCount = 1;
        let guests = 1;

        if (bookingState.type === 'people_count' && bookingState.selectedOption) {
            const combo = bookingState.selectedOption;
            roomCount = combo.length;
            if (combo.length === 1) {
                roomType = combo[0];
            } else {
                const roomCounts = {};
                combo.forEach(room => {
                    roomCounts[room] = (roomCounts[room] || 0) + 1;
                });
                roomType = Object.entries(roomCounts)
                    .map(([room, count]) => `${count} ${room}`)
                    .join(', ');
            }
            guests = bookingState.people;
        } else if (bookingState.type === 'room_specification') {
            const rooms = bookingState.rooms;
            roomCount = bookingState.totalRooms;
            if (Object.keys(rooms).length === 1) {
                const [room, count] = Object.entries(rooms)[0];
                roomType = room;
                roomCount = count;
            } else {
                roomType = Object.entries(rooms)
                    .map(([room, count]) => `${count} ${room}`)
                    .join(', ');
            }
            guests = bookingState.totalPeople;
        }

        return {
            customerName: bookingState.name,
            customerPhone: phoneNumber,
            checkInDate: bookingState.checkInDate,
            checkOutDate: format(addDays(new Date(bookingState.checkInDate), bookingState.nights), 'yyyy-MM-dd'),
            nights: bookingState.nights,
            roomType: roomType,
            roomCount: roomCount,
            totalRooms: roomCount,
            guests: guests,
            specialRequests: 'None'
        };
    }

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

        const roomList = rooms.map(r => `• ${r.name}: max ${this.roomCapacities[r.name] || 1} person${this.roomCapacities[r.name] > 1 ? 's' : ''}, Nu.${r.pricePerNight}/night (${r.availableCount} available)`).join('\n');

        // Check for greetings
        if (lowerMessage.includes('hello') || lowerMessage.includes('hi') ||
            lowerMessage.includes('hey') || lowerMessage === 'hy' ||
            lowerMessage === 'kuzu zangpo') {

            return `Hello! 👋 Welcome to ${this.hotelInfo.name}! 

I'm your AI booking assistant. Here's what I can help you with:
🏨 Book rooms (mention how many people or room types)
📅 Check availability  
💰 Get price quotes
❓ Answer questions

Available rooms:
${roomList}

*Important:* Maximum 3 rooms per booking.

How can I assist you today?`;
        }

        // Check if user mentioned number of people
        const peopleCount = this.extractPeopleCount(userMessage);
        if (peopleCount !== null) {
            const combinations = this.generateRoomCombinations(peopleCount);
            return this.formatCombinationSuggestions(combinations, peopleCount);
        }

        // Check for direct room requests
        const roomRequest = this.parseRoomTypeRequest(userMessage);
        if (roomRequest.valid) {
            let totalPeople = 0;
            for (const [roomType, count] of Object.entries(roomRequest.rooms)) {
                totalPeople += (this.roomCapacities[roomType] || 1) * count;
            }
            return `Great! ${roomRequest.totalRooms} rooms total (${Object.entries(roomRequest.rooms).map(([room, count]) => `${count} ${room}${count > 1 ? 's' : ''}`).join(', ')}) for ${totalPeople} people max.\n\nFirst, what is your check-in date? (e.g., tomorrow, today, or specific date)`;
        } else if (roomRequest.message.includes('Maximum 3 rooms')) {
            return roomRequest.message;
        }

        if (lowerMessage.includes('book') || lowerMessage.includes('room') || lowerMessage.includes('stay')) {
            return `I'd be happy to help you book rooms! 🏨

Available rooms (max 3 rooms per booking):
${roomList}

You can tell me:
1. How many people are staying (I'll suggest room combinations), OR
2. Which specific room types you want

What would you prefer?`;
        }

        if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
            return `💰 Room Prices (per night):
${roomList}

Maximum 3 rooms per booking. Would you like to book?`;
        }

        if (lowerMessage.includes('available') || lowerMessage.includes('vacant')) {
            return `✅ Current Availability:
${roomList}

Maximum 3 rooms per booking. Which room interests you?`;
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
• Booking rooms (max 3 rooms per booking)
• Checking availability
• Price information
• Hotel details

Available rooms:
${roomList}

How can I help you today?`;
    }

    async extractBookingDetails(phoneNumber, currentMessage) {
        try {
            const history = this.conversationHistory.get(phoneNumber) || [];
            if (history.length < 2) {
                return null;
            }

            const bookingIntent = this.bookingIntents.get(phoneNumber);

            const conversationText = history.map(msg =>
                `${msg.role === 'user' ? 'Customer' : 'Assistant'}: ${msg.content}`
            ).join('\n');

            console.log('🔍 Extracting booking details from conversation...');

            let bookingDetails = {
                customerName: 'Guest',
                customerPhone: phoneNumber,
                checkInDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
                nights: 1,
                guests: 1,
                specialRequests: 'None',
                roomType: '',
                roomCount: 1,
                totalRooms: 1
            };

            if (bookingIntent) {
                if (bookingIntent.type === 'room_specification') {
                    const roomEntries = Object.entries(bookingIntent.rooms);
                    if (roomEntries.length === 1) {
                        const [roomType, count] = roomEntries[0];
                        bookingDetails.roomType = roomType;
                        bookingDetails.roomCount = count;
                        bookingDetails.totalRooms = count;
                        bookingDetails.guests = bookingIntent.totalPeople;
                    } else {
                        const roomDescription = Object.entries(bookingIntent.rooms)
                            .map(([room, count]) => `${count} ${room}`)
                            .join(', ');
                        bookingDetails.roomType = `Multiple: ${roomDescription}`;
                        bookingDetails.roomCount = bookingIntent.totalRooms;
                        bookingDetails.totalRooms = bookingIntent.totalRooms;
                        bookingDetails.guests = bookingIntent.totalPeople;
                    }
                } else if (bookingIntent.type === 'people_count' && bookingIntent.selectedOption) {
                    const combo = bookingIntent.selectedOption;
                    const roomCounts = {};
                    combo.forEach(room => {
                        roomCounts[room] = (roomCounts[room] || 0) + 1;
                    });

                    if (Object.keys(roomCounts).length === 1) {
                        const [roomType, count] = Object.entries(roomCounts)[0];
                        bookingDetails.roomType = roomType;
                        bookingDetails.roomCount = count;
                        bookingDetails.totalRooms = count;
                        bookingDetails.guests = bookingIntent.people;
                    } else {
                        const roomDescription = Object.entries(roomCounts)
                            .map(([room, count]) => `${count} ${room}`)
                            .join(', ');
                        bookingDetails.roomType = `Multiple: ${roomDescription}`;
                        bookingDetails.roomCount = combo.length;
                        bookingDetails.totalRooms = combo.length;
                        bookingDetails.guests = bookingIntent.people;
                    }
                }
            }

            for (const msg of history) {
                if (msg.role === 'user') {
                    const content = msg.content.toLowerCase();

                    if (content.includes('name is') || content.includes('i am ') || content.includes('call me')) {
                        const nameMatch = msg.content.match(/name is\s+([^\.,!?]+)/i) ||
                            msg.content.match(/i am\s+([^\.,!?]+)/i) ||
                            msg.content.match(/call me\s+([^\.,!?]+)/i);
                        if (nameMatch && nameMatch[1]) {
                            bookingDetails.customerName = nameMatch[1].trim();
                        } else if (msg.content.length < 20 && msg.content.length > 1 && !msg.content.includes(' ')) {
                            bookingDetails.customerName = msg.content.trim();
                        }
                    }

                    if (content.includes('tomorrow')) {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        bookingDetails.checkInDate = format(tomorrow, 'yyyy-MM-dd');
                    } else if (content.includes('today')) {
                        bookingDetails.checkInDate = format(new Date(), 'yyyy-MM-dd');
                    } else if (content.includes('day after')) {
                        const dayAfter = new Date();
                        dayAfter.setDate(dayAfter.getDate() + 2);
                        bookingDetails.checkInDate = format(dayAfter, 'yyyy-MM-dd');
                    } else if (/\d{1,2}/.test(content)) {
                        const dayMatch = content.match(/(\d{1,2})/);
                        if (dayMatch) {
                            bookingDetails.checkInDate = this.parseDate(dayMatch[1]);
                        }
                    }

                    if (content.includes('night') || content.includes('stay')) {
                        const nightMatch = content.match(/(\d+)\s*(?:night|nights|stay)/i);
                        if (nightMatch) {
                            bookingDetails.nights = parseInt(nightMatch[1]) || 1;
                        }
                    } else if (/^\d+$/.test(content.trim())) {
                        const num = parseInt(content.trim());
                        if (num > 0 && num < 30) {
                            bookingDetails.nights = num;
                        }
                    }

                    if (content.includes('guest') || content.includes('people') || content.includes('person')) {
                        const guestMatch = content.match(/(\d+)\s*(?:guest|guests|people|person)/i);
                        if (guestMatch) {
                            bookingDetails.guests = parseInt(guestMatch[1]) || 1;
                        }
                    }
                }
            }

            if (bookingDetails.nights > 30 || bookingDetails.nights < 1) {
                console.log(`⚠️ Fixing invalid nights: ${bookingDetails.nights} → 1`);
                bookingDetails.nights = 1;
            }

            if (bookingDetails.guests > 20 || bookingDetails.guests < 1) {
                console.log(`⚠️ Fixing invalid guests: ${bookingDetails.guests} → 1`);
                bookingDetails.guests = 1;
            }

            const checkOutDate = addDays(new Date(bookingDetails.checkInDate), bookingDetails.nights);
            bookingDetails.checkOutDate = format(checkOutDate, 'yyyy-MM-dd');

            if (!bookingDetails.roomType) {
                bookingDetails.roomType = 'Single Room';
            }

            console.log('✅ Final booking details:', bookingDetails);
            return bookingDetails;

        } catch (error) {
            console.error('❌ Error extracting booking details:', error.message);
            return null;
        }
    }

    shouldCreateBookingRequest(phoneNumber, userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        const history = this.conversationHistory.get(phoneNumber) || [];

        console.log('Checking booking trigger for:', lowerMessage);

        const confirmationKeywords = ['yes', 'confirm', 'proceed', 'go ahead', 'book now'];
        const isConfirming = confirmationKeywords.some(keyword =>
            lowerMessage.includes(keyword) && !lowerMessage.includes('not')
        );

        const conversationText = history.map(msg => msg.content).join(' ').toLowerCase();

        const bookingIntent = this.bookingIntents.get(phoneNumber);
        const hasRoomInfo = bookingIntent &&
            ((bookingIntent.type === 'people_count' && bookingIntent.selectedOption) ||
                (bookingIntent.type === 'room_specification'));

        const hasCheckInDate = conversationText.includes('tomorrow') ||
            conversationText.includes('today') ||
            conversationText.includes('check-in') ||
            /\d{4}-\d{2}-\d{2}/.test(conversationText);

        const hasNights = /\d+\s*(?:night|nights|stay)/i.test(conversationText) ||
            (/\d+/.test(conversationText) && conversationText.includes('night'));

        const hasName = /name is|i am |call me /i.test(conversationText) ||
            (history.some(msg =>
                msg.role === 'user' &&
                msg.content.length > 1 &&
                msg.content.length < 30 &&
                !msg.content.includes(' ') &&
                !msg.content.match(/^\d+$/) &&
                !['no', 'not', 'cancel'].some(word => msg.content.toLowerCase().includes(word))
            ));

        const hasAllInfo = hasRoomInfo && hasCheckInDate && hasNights && hasName;

        const lastAIMessage = history.filter(msg => msg.role === 'assistant').pop()?.content || '';
        const aiAskedForConfirmation = lastAIMessage.includes('confirm') ||
            lastAIMessage.includes('type confirm') ||
            lastAIMessage.includes('please confirm') ||
            lastAIMessage.includes('proceed with booking');

        const shouldCreate = isConfirming && aiAskedForConfirmation && hasAllInfo;

        if (shouldCreate) {
            console.log(`✅ Should create booking request for ${phoneNumber}`);
        }

        return shouldCreate;
    }

    clearHistory(phoneNumber) {
        if (this.conversationHistory.has(phoneNumber)) {
            this.conversationHistory.set(phoneNumber, []);
        }
        if (this.bookingIntents.has(phoneNumber)) {
            this.bookingIntents.delete(phoneNumber);
        }
    }
}

module.exports = OpenAIService;