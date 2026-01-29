const pool = require('../config/db');

exports.createNotification = async (userId, title, message) => {
  await pool.query(
    `INSERT INTO notifications (user_id, title, message)
     VALUES (?, ?, ?)`,
    [userId, title, message]
  );
};
