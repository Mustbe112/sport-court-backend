const pool = require('../config/db');

// get all notifications
exports.getMyNotifications = async (req, res) => {
  const userId = req.user.id;

  const [rows] = await pool.query(
    'SELECT id, user_id, message, type, is_read as `read`, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC',
    [userId]
  );

  res.json(rows);
};

// mark as read
exports.markAsRead = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  await pool.query(
    'UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?',
    [id, userId]
  );

  res.json({ message: 'Notification marked as read' });
};

// mark all as read
exports.markAllAsRead = async (req, res) => {
  const userId = req.user.id;

  await pool.query(
    'UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0',
    [userId]
  );

  res.json({ message: 'All notifications marked as read' });
};

// delete notification
exports.deleteNotification = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  await pool.query(
    'DELETE FROM notifications WHERE id=? AND user_id=?',
    [id, userId]
  );

  res.json({ message: 'Notification deleted' });
};

// clear all notifications
exports.clearAllNotifications = async (req, res) => {
  const userId = req.user.id;

  await pool.query(
    'DELETE FROM notifications WHERE user_id=?',
    [userId]
  );

  res.json({ message: 'All notifications cleared' });
};