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

// Auto no-show endpoint (can be called by cron job or manually)
router.post('/auto-no-show', bookingController.autoNoShow);

router.post('/confirm', bookingController.confirmBooking);
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
console.log('✅ bookingRoutes loaded');

module.exports = router;