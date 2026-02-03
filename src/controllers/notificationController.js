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
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log('markAsRead - ID:', id, 'User:', userId);

    const [result] = await pool.query(
      'UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?',
      [id, userId]
    );

    console.log('Update result:', result);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        error: 'Notification not found or already marked as read' 
      });
    }

    res.json({ message: 'Notification marked as read', success: true });
  } catch (error) {
    console.error('Error in markAsRead:', error);
    res.status(500).json({ 
      error: 'Failed to mark notification as read',
      details: error.message 
    });
  }
};

// mark all as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('markAllAsRead - User:', userId);

    const [result] = await pool.query(
      'UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0',
      [userId]
    );

    console.log('Update all result:', result);

    res.json({ 
      message: 'All notifications marked as read', 
      success: true,
      updated: result.affectedRows 
    });
  } catch (error) {
    console.error('Error in markAllAsRead:', error);
    res.status(500).json({ 
      error: 'Failed to mark all notifications as read',
      details: error.message 
    });
  }
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