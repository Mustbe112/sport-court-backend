// cron/noShowJob.js
// This script runs every 5 minutes to:
// 1. Auto-cancel bookings that passed end time without check-in (FULL REFUND)
// 2. Auto-complete confirmed bookings that passed end time + grace period

const cron = require('node-cron');
const axios = require('axios');

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000/api';

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('🔄 Running booking status check...', new Date().toISOString());
  
  try {
    // 1. Check for bookings to auto-cancel (passed end time, never checked in)
    console.log('📋 Checking for expired bookings to cancel...');
    const cancelResponse = await axios.post(`${API_BASE_URL}/bookings/auto-cancel-expired`);
    console.log('✅ Auto-cancel check completed:', cancelResponse.data);
    
    // 2. Check for confirmed bookings to auto-complete (passed end time + grace period)
    console.log('📋 Checking for bookings to auto-complete...');
    const completeResponse = await axios.post(`${API_BASE_URL}/bookings/auto-complete`);
    console.log('✅ Auto-complete check completed:', completeResponse.data);
    
    console.log('─'.repeat(50));
    
  } catch (error) {
    console.error('❌ Cron job failed:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
  }
});

console.log('⏰ Booking status cron job started');
console.log('📅 Schedule: Every 5 minutes');
console.log('🔍 Monitoring:');
console.log('   - Expired bookings (auto-cancel after end time, FULL REFUND)');
console.log('   - Auto-completion (confirmed bookings past end time)');
console.log('─'.repeat(50));