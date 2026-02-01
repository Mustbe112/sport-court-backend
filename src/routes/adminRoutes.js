const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const admin = require('../middlewares/adminMiddleware');
const adminController = require('../controllers/adminController');

// Apply auth and admin middleware to ALL routes in this file
router.use(auth);
router.use(admin);

// Court management
router.post('/courts', adminController.createCourt);
router.put('/courts/:id', adminController.updateCourt);
router.get('/courts', adminController.getAllCourts);

// Booking management
router.get('/bookings', adminController.getAllBookings);
router.get('/bookings/pending', adminController.getPendingBookings);  // ✅ This must come BEFORE /bookings/:id
router.post('/bookings/:id/confirm', adminController.confirmBooking); // ✅ Confirm (check-in)
router.delete('/bookings/noshow/:id', adminController.deleteNoShowBooking); // ✅ Delete no_show — MUST be before /bookings/:id
router.delete('/bookings/:id', adminController.forceCancelBooking);

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

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'ADMIN ROUTES WORK', user: req.user });
});

module.exports = router;