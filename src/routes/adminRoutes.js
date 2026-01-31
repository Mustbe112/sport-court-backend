const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const admin = require('../middlewares/adminMiddleware');
const adminController = require('../controllers/adminController');
const bookingController = require('../controllers/bookingController');

router.use(auth);
router.use(admin);

// Court management
router.post('/courts', adminController.createCourt);
router.put('/courts/:id', adminController.updateCourt);
router.get('/courts', adminController.getAllCourts);

// Booking management
router.get('/bookings', adminController.getAllBookings);
router.get('/bookings/pending', adminController.getPendingBookings);
router.delete('/bookings/:id', adminController.forceCancelBooking);

// Booking approval (handled by bookingController)
router.post('/bookings/:id/approve', bookingController.approveBooking);
router.post('/bookings/:id/reject', bookingController.rejectBooking);

// Admin notifications
router.get('/notifications', adminController.getAdminNotifications);
router.post('/notifications/:id/read', adminController.markNotificationRead);

// Penalties
router.get('/penalties', adminController.getAllPenalties);
router.post('/penalties/:id/resolve', adminController.resolvePenalty);

// Statistics
router.get('/stats/dashboard', adminController.getDashboardStats);
router.get('/stats/high-demand', adminController.highDemandCourts);
router.get('/stats/peak-hours', adminController.getPeakHours);
router.get('/stats/cancellation-rate', adminController.getCancellationRate);
router.get('/stats/revenue', adminController.getRevenueTrend);

// Test
router.get('/test', (req, res) => {
  res.json({ message: 'ADMIN ROUTES WORK' });
});

module.exports = router;