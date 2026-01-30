// cron/autoNoShowJob.js
// This script should be run every 5-15 minutes to check for no-shows

const cron = require('node-cron');
const axios = require('axios');

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('🔄 Running auto no-show check...');
  
  try {
    const response = await axios.post('http://localhost:4000/api/bookings/auto-no-show');
    console.log('✅ Auto no-show completed:', response.data);
  } catch (error) {
    console.error('❌ Auto no-show failed:', error.message);
  }
});

console.log('⏰ Auto no-show cron job started (runs every 5 minutes)');