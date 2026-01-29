const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const auth = require('../middlewares/authMiddleware');

// protected routes
router.post('/availability', auth, bookingController.checkAvailability);
router.post('/lock', auth, bookingController.lockSlot);
router.post('/book', auth, bookingController.createBooking);
router.post('/cancel/:id', auth, bookingController.cancelBooking);
router.post('/checkout/:id', auth, bookingController.checkOut);
router.post('/auto-cancel', bookingController.autoCancelNoCheckIn);
router.post('/confirm', bookingController.confirmBooking);
router.post('/checkin/:id', auth, bookingController.checkIn);

console.log('✅ bookingRoutes loaded');

module.exports = router;
