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
      "SELECT id, email, coin_balance FROM users WHERE id = ?",
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

module.exports = router;
