const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const pool = require("../config/db");

// BUY / TOP UP COINS
router.post("/topup", auth, async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  await pool.query(
    "UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?",
    [amount, userId]
  );

  const [[user]] = await pool.query(
    "SELECT coin_balance FROM users WHERE id = ?",
    [userId]
  );

  res.json({
    message: "Top up successful",
    coin_balance: user.coin_balance
  });
});

// GET CURRENT USER BALANCE
router.get("/me", auth, async (req, res) => {
  const [[user]] = await pool.query(
    "SELECT id, email, coin_balance FROM users WHERE id = ?",
    [req.user.id]
  );
  res.json(user);
});

module.exports = router;
