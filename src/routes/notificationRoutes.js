const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const notificationController = require('../controllers/notificationController');

router.use(auth);

// Get all notifications
router.get('/', notificationController.getMyNotifications);

// Mark all notifications as read (MUST come before /:id/read)
router.put('/read-all', notificationController.markAllAsRead);

// Clear all notifications (MUST come before /:id)
router.delete('/clear-all', notificationController.clearAllNotifications);

// Mark single notification as read
router.put('/:id/read', notificationController.markAsRead);

// Delete single notification
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;