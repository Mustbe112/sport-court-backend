// routes/notifications.js or wherever you define your notification routes

const router = require('express').Router();
const notificationController = require('../controllers/notificationController');
const { authMiddleware } = require('../middleware/auth');

// IMPORTANT: Place /read-all BEFORE /:id/read
// Otherwise Express will treat "read-all" as an ID parameter
router.put('/read-all', authMiddleware, notificationController.markAllAsRead);
router.get('/', authMiddleware, notificationController.getMyNotifications);
router.put('/:id/read', authMiddleware, notificationController.markAsRead);

module.exports = router;