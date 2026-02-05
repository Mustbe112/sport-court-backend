const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const admin = require('../middlewares/adminMiddleware');
const adminController = require('../controllers/adminController');
const bookingController = require('../controllers/bookingController'); // ✅ FIX: import bookingController

// Apply auth and admin middleware to ALL routes in this file
router.use(auth);
router.use(admin);

// Court management
router.post('/courts', adminController.createCourt);
router.put('/courts/:id', adminController.updateCourt);
router.get('/courts', adminController.getAllCourts);

// Booking management
router.get('/bookings', adminController.getAllBookings);
router.get('/bookings/pending', adminController.getPendingBookings);
router.post('/bookings/:id/confirm', bookingController.confirmBooking); // ✅ FIX: use bookingController
// router.delete('/bookings/noshow/:id', adminController.deleteNoShowBooking); // ❌ REMOVED: this function doesn't exist — add it to adminController if you need it
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

// Maintenance management (add this after court management section)
router.post('/courts/:id/maintenance', adminController.scheduleMaintenance);
router.get('/maintenance', adminController.getCourtMaintenance);
router.delete('/maintenance/:id', adminController.deleteMaintenance);
// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'ADMIN ROUTES WORK', user: req.user });
});

module.exports = router;