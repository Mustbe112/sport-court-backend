// cron/autoCompleteJob.js
// This script runs every 10 minutes to mark bookings as completed

const cron = require('node-cron');
const axios = require('axios');

// Run every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  console.log('🔄 Running auto-complete check...');
  
  try {
    const response = await axios.post('http://localhost:4000/api/bookings/auto-complete');
    console.log('✅ Auto-complete completed:', response.data);
  } catch (error) {
    console.error('❌ Auto-complete failed:', error.message);
  }
});

console.log('⏰ Auto-complete cron job started (runs every 10 minutes)');