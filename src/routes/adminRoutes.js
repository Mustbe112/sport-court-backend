const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const admin = require('../middlewares/adminMiddleware');
const adminController = require('../controllers/adminController');

// Apply middleware to all admin routes
router.use(auth);
router.use(admin);

// Logging middleware for debugging
router.use((req, res, next) => {
  console.log('📍 [ADMIN ROUTE]', req.method, req.path);
  next();
});

// ==================== COURTS ====================
router.post('/courts', adminController.createCourt);
router.put('/courts/:id', adminController.updateCourt);
router.get('/courts', adminController.getAllCourts);

// ==================== BOOKINGS ====================
// ⚠️ IMPORTANT: Specific routes MUST come before parameterized routes
router.get('/bookings/pending', adminController.getPendingBookings);  // MUST be first
router.get('/bookings', adminController.getAllBookings);
router.delete('/bookings/:id', adminController.forceCancelBooking);

// ==================== NOTIFICATIONS ====================
router.get('/notifications', adminController.getAdminNotifications);
router.post('/notifications/:id/read', adminController.markNotificationRead);

// ==================== PENALTIES ====================
router.get('/penalties', adminController.getAllPenalties);
router.post('/penalties/:id/resolve', adminController.resolvePenalty);

// ==================== STATISTICS ====================
router.get('/stats/dashboard', adminController.getDashboardStats);
router.get('/stats/high-demand', adminController.highDemandCourts);
router.get('/stats/peak-hours', adminController.getPeakHours);
router.get('/stats/cancellation-rate', adminController.getCancellationRate);
router.get('/stats/revenue', adminController.getRevenueTrend);

// ==================== TEST ROUTE ====================
router.get('/test', (req, res) => {
  console.log('✅ Admin test route hit!');
  res.json({ 
    success: true,
    message: 'Admin routes are working!',
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Admin routes loaded successfully');

module.exports = router;