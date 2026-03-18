// cron/noShowJob.js
// This script runs every 5 minutes to mark bookings as no_show
// if the user did not check in within 15 minutes of the start time.

const cron = require('node-cron');
const axios = require('axios');

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('🔄 Running no-show check...');

  try {
    const response = await axios.post('http://localhost:4000/api/bookings/auto-no-show');
    console.log('✅ No-show check completed:', response.data);
  } catch (error) {
    console.error('❌ No-show check failed:', error.message);
  }
});

console.log('⏰ No-show cron job started (runs every 5 minutes)');