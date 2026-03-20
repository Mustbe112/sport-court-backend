const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/request-admin-reset', authController.requestAdminReset);
router.get('/reset-status/:email', authController.checkResetStatus);
router.post('/reset-credentials', auth, authController.resetCredentials);

module.exports = router;