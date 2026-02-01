const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const auth = require('../middlewares/authMiddleware');
const pool = require('../config/db');

// protected routes
router.post('/availability', auth, bookingController.checkAvailability);
router.post('/lock', auth, bookingController.lockSlot);
router.post('/book', auth, bookingController.createBooking);
router.post('/cancel/:id', auth, bookingController.cancelBooking);
router.post('/checkout/:id', auth, bookingController.checkOut);

// CRON job endpoint (no auth needed for cron)
router.post('/auto-no-show', bookingController.autoNoShow);

// Admin endpoint for QR check-in (moved to admin routes - but keeping here for compatibility)
router.post('/confirm/:id', bookingController.confirmBooking);

// Deprecated check-in route
router.post('/checkin/:id', auth, bookingController.checkIn);

// GET USER'S OWN BOOKINGS
router.get('/my-bookings', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, c.name AS court_name, c.type AS court_type
       FROM bookings b
       JOIN courts c ON b.court_id = c.id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', auth, bookingController.getBookingById);
// Add these routes to bookingRoutes.js

// CRON job endpoints (no auth needed for automated cron jobs)
router.post('/auto-no-show', bookingController.autoNoShow);
router.post('/auto-cancel-expired', bookingController.autoCancelExpired);
router.post('/auto-complete', bookingController.autoComplete);

// If you want to manually trigger these (with admin auth):
// router.post('/auto-no-show', auth, admin, bookingController.autoNoShow);
// router.post('/auto-cancel-expired', auth, admin, bookingController.autoCancelExpired);
// router.post('/auto-complete', auth, admin, bookingController.autoComplete);
console.log('✅ bookingRoutes loaded');

module.exports = router;