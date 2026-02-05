// routes/notificationRoutes.js

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middlewares/authMiddleware');

// IMPORTANT: Place /read-all BEFORE /:id/read
// Otherwise Express will treat "read-all" as an ID parameter
router.put('/read-all', auth, notificationController.markAllAsRead);
router.get('/', auth, notificationController.getMyNotifications);
router.put('/:id/read', auth, notificationController.markAsRead);

console.log('✅ notificationRoutes loaded');

module.exports = router;