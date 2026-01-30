const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const admin = require('../middlewares/adminMiddleware');
const adminController = require('../controllers/adminController');

router.use(auth);
router.use(admin);

// Court management
router.post('/courts', adminController.createCourt);
router.put('/courts/:id', adminController.updateCourt);
router.get('/courts', adminController.getAllCourts);

// Booking management
router.get('/bookings', adminController.getAllBookings);
router.delete('/bookings/:id', adminController.forceCancelBooking);

// Statistics
router.get('/stats/high-demand', adminController.highDemandCourts);
router.get('/stats/peak-hours', adminController.getPeakHours);
router.get('/stats/cancellation-rate', adminController.getCancellationRate);
router.get('/stats/revenue', adminController.getRevenueTrend);

// Test
router.get('/test', (req, res) => {
  res.json({ message: 'ADMIN ROUTES WORK' });
});

module.exports = router;
