const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const pool = require("../config/db");

// BUY / TOP UP COINS
router.post("/topup", auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Update coin balance
    await pool.query(
      "UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?",
      [amount, userId]
    );

    // Get updated balance
    const [rows] = await pool.query(
      "SELECT coin_balance FROM users WHERE id = ?",
      [userId]
    );

    // Check if user exists
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "Top up successful",
      coin_balance: rows[0].coin_balance
    });
  } catch (error) {
    console.error("Top up error:", error);
    res.status(500).json({ error: "Failed to top up coins" });
  }
});

// GET CURRENT USER BALANCE
router.get("/me", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, coin_balance, penalty, created_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

// CHANGE PASSWORD
router.put("/me/password", auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  const userId = req.user.id;

  try {
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Both current and new password are required" });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const [rows] = await pool.query(
      "SELECT password_hash FROM users WHERE id = ?",
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const bcrypt = require("bcrypt");
    const isMatch = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await pool.query(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [hashedPassword, userId]
    );

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// DELETE ACCOUNT
router.delete("/me", auth, async (req, res) => {
  const userId = req.user.id;
  const { password } = req.body;

  try {
    if (!password) {
      return res.status(400).json({ error: "Password is required to delete account" });
    }

    const [rows] = await pool.query(
      "SELECT password_hash FROM users WHERE id = ?",
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const bcrypt = require("bcrypt");
    const isMatch = await bcrypt.compare(password, rows[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect password" });
    }

    // Disable FK checks to avoid constraint errors
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");

    // Delete all related data
    await pool.query("DELETE FROM notifications WHERE user_id = ?", [userId]);
    await pool.query("DELETE FROM bookings WHERE user_id = ?", [userId]);

    // Delete the user
    await pool.query("DELETE FROM users WHERE id = ?", [userId]);

    // Re-enable FK checks
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    try { await pool.query("SET FOREIGN_KEY_CHECKS = 1"); } catch (_) {}
    console.error("Delete account error:", error.message, error.code);
    res.status(500).json({ error: error.message || "Failed to delete account" });
  }
});

// POST /api/users/report-request — User requests a report
router.post('/report-request', auth, async (req, res) => {
  const userId = req.user.id;
  try {
    // Check if user already has a pending request
    const [[existing]] = await pool.query(
      "SELECT id FROM report_requests WHERE user_id = ? AND status = 'pending'",
      [userId]
    );
    if (existing) {
      return res.status(400).json({ message: 'You already have a pending report request. Please wait for admin to send it.' });
    }

    // Check if a report was already sent recently (within 24h) — optional throttle
    const [[recentSent]] = await pool.query(
      "SELECT id FROM report_requests WHERE user_id = ? AND status = 'sent' AND sent_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)",
      [userId]
    );
    if (recentSent) {
      return res.status(400).json({ message: 'A report was already sent to you within the last 24 hours.' });
    }

    await pool.query(
      'INSERT INTO report_requests (user_id) VALUES (?)',
      [userId]
    );

    // Notify admin via admin notifications table
    await pool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES (
         (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
         'New Report Request',
         CONCAT('A user has requested their activity report. Check Users > Report Requests in the admin panel.')
       )`
    );

    res.json({ message: 'Report request submitted. Admin will send it shortly.' });
  } catch (err) {
    console.error('Report request error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/report-status — User polls their own report status
router.get('/report-status', auth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [[row]] = await pool.query(
      `SELECT status, requested_at, sent_at
       FROM report_requests
       WHERE user_id = ?
       ORDER BY requested_at DESC
       LIMIT 1`,
      [userId]
    );
    if (!row) return res.json({ status: 'none' });
    res.json(row);
  } catch (err) {
    console.error('Report status error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;