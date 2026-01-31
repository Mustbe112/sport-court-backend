const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const auth = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const pool = require('../config/db');

// User endpoints
router.post('/availability', auth, bookingController.checkAvailability);
router.post('/book', auth, bookingController.createBooking);
router.post('/cancel/:id', auth, bookingController.cancelBooking);

// Admin approval endpoints
router.post('/:id/approve', auth, adminMiddleware, bookingController.approveBooking);
router.post('/:id/reject', auth, adminMiddleware, bookingController.rejectBooking);

// QR validation
router.post('/validate-qr', auth, bookingController.validateQR);

// Cron job endpoints (no auth)
router.post('/auto-complete', bookingController.autoCompleteBookings);
router.post('/auto-no-show', bookingController.autoNoShow);

// Penalty (admin only)
router.post('/penalty', auth, adminMiddleware, bookingController.applyPenalty);

// Get user's bookings
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

console.log('✅ Enhanced bookingRoutes loaded');

module.exports = router;