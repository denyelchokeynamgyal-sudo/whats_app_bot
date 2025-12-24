const { spawn } = require('child_process');
const path = require('path');

console.log(`
╔══════════════════════════════════════════╗
║    🏨 HOTEL MANAGEMENT SYSTEM v2.0      ║
║    🤖 WhatsApp Bot + Dashboard          ║
╚══════════════════════════════════════════╝
`);

// Start WhatsApp Bot
console.log('\n🤖 Starting WhatsApp Booking Bot...');
const whatsappBot = spawn('node', ['index.js'], {
    stdio: 'inherit',
    shell: true
});

// Give WhatsApp bot time to initialize
setTimeout(() => {
    console.log('\n👨‍💼 Starting Employee Dashboard...');
    const dashboard = spawn('node', ['employee-dashboard.js'], {
        stdio: 'inherit',
        shell: true
    });

    // Handle process exits
    whatsappBot.on('close', (code) => {
        console.log(`\n❌ WhatsApp Bot exited with code ${code}`);
        process.exit(code);
    });

    dashboard.on('close', (code) => {
        console.log(`\n❌ Dashboard exited with code ${code}`);
        process.exit(code);
    });

    console.log('\n✅ Both services started successfully!');
    console.log('\n📱 URLs:');
    console.log('   • WhatsApp Bot: Running in background');
    console.log('   • Dashboard: http://localhost:3001');
    console.log('   • Google Sheets: Live updates');
    console.log('\n🔑 Dashboard Auth Token: "hotel-staff-2024"');

}, 3000);

// Handle CTRL+C
process.on('SIGINT', () => {
    console.log('\n\n🔄 Shutting down services...');
    whatsappBot.kill();
    process.exit(0);
});