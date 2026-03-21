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

// Maintenance
router.post('/courts/:id/maintenance', adminController.scheduleMaintenance);
router.get('/maintenance', adminController.getCourtMaintenance);
router.delete('/maintenance/:id', adminController.deleteMaintenance);

// Booking management
router.get('/bookings', adminController.getAllBookings);
router.get('/bookings/pending', adminController.getPendingBookings);
router.post('/bookings/:id/confirm', bookingController.confirmBooking);
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

// Password Management
router.get('/users', adminController.getAllUsers);
router.get('/users/pending-resets', adminController.getPendingResets);
router.post('/users/:id/reset-password', adminController.adminResetUserPassword);

// Suspension Management
router.get('/suspensions', adminController.getSuspendedUsers);
router.get('/active-cases', adminController.getActiveCases);
router.get('/banned', adminController.getBannedUsers);
router.post('/users/:id/suspend', adminController.suspendUser);
router.post('/users/:id/unsuspend', adminController.unsuspendUser);
router.post('/users/:id/ban', adminController.banUser);

// Appeals
router.get('/appeals', adminController.getAppeals);
router.post('/appeals/:id/resolve', adminController.resolveAppeal);

// Test
router.get('/test', (req, res) => {
  res.json({ message: 'ADMIN ROUTES WORK', user: req.user });
});

module.exports = router;