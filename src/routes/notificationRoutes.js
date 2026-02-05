// routes/notificationRoutes.js

const router = require('express').Router();
const notificationController = require('../controllers/notificationController');

// COPY THIS LINE FROM YOUR WORKING ROUTE FILE (e.g., bookingRoutes.js)
const { authMiddleware } = require('../middlewares/auth');  // ← Use the EXACT import from your other files

router.put('/read-all', authMiddleware, notificationController.markAllAsRead);
router.get('/', authMiddleware, notificationController.getMyNotifications);
router.put('/:id/read', authMiddleware, notificationController.markAsRead);

module.exports = router;