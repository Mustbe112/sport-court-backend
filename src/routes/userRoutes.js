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
      "SELECT id, name, email, coin_balance, created_at FROM users WHERE id = ?",
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

  const conn = await pool.getConnection();
  try {
    if (!password) {
      conn.release();
      return res.status(400).json({ error: "Password is required to delete account" });
    }

    const [rows] = await conn.query(
      "SELECT password_hash FROM users WHERE id = ?",
      [userId]
    );

    if (!rows || rows.length === 0) {
      conn.release();
      return res.status(404).json({ error: "User not found" });
    }

    const bcrypt = require("bcrypt");
    const isMatch = await bcrypt.compare(password, rows[0].password_hash);
    if (!isMatch) {
      conn.release();
      return res.status(400).json({ error: "Incorrect password" });
    }

    await conn.beginTransaction();

    // Cancel active bookings
    await conn.query(
      "UPDATE bookings SET status = 'cancelled' WHERE user_id = ? AND status IN ('booked', 'confirmed')",
      [userId]
    );

    // Delete notifications
    await conn.query("DELETE FROM notifications WHERE user_id = ?", [userId]);

    // Delete the user
    await conn.query("DELETE FROM users WHERE id = ?", [userId]);

    await conn.commit();

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    await conn.rollback();
    console.error("Delete account error:", error);
    res.status(500).json({ error: "Failed to delete account" });
  } finally {
    conn.release();
  }
});

module.exports = router;