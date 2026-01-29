const cron = require('node-cron');
const pool = require('../config/db');

cron.schedule('*/5 * * * *', async () => {
  await pool.query(
    `UPDATE bookings
     SET status = 'no_show'
     WHERE status = 'booked'
     AND TIMESTAMP(date, start_time) < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`
  );
});
