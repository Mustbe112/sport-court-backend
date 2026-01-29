const pool = require('../config/db');

// get all notifications
exports.getMyNotifications = async (req, res) => {
  const userId = req.user.id;

  const [rows] = await pool.query(
    'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC',
    [userId]
  );

  res.json(rows);
};

// mark as read
exports.markAsRead = async (req, res) => {
  const { id } = req.params;

  await pool.query(
    'UPDATE notifications SET is_read=1 WHERE id=?',
    [id]
  );

  res.json({ message: 'Notification marked as read' });
};
