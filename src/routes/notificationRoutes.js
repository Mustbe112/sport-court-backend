const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const notificationController = require('../controllers/notificationController');

router.use(auth);

router.get('/', notificationController.getMyNotifications);
router.put('/:id/read', notificationController.markAsRead);

module.exports = router;
