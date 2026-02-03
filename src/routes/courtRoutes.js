const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const auth = require('../middlewares/authMiddleware');

// PUBLIC: get all active courts
router.get("/", async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM courts WHERE is_active = 1"
  );
  res.json(rows);
});

// PUBLIC: filter by type
router.get("/type/:type", async (req, res) => {
  const { type } = req.params;
  const [rows] = await pool.query(
    "SELECT * FROM courts WHERE type=? AND is_active=1",
    [type]
  );
  res.json(rows);
});

// ✅ Schedule maintenance (admin only - add admin middleware if you have it)
router.post("/maintenance", auth, async (req, res) => {
  const { court_id, start_date, end_date, reason } = req.body;
  
  try {
    await pool.query(
      `INSERT INTO court_maintenance (court_id, start_date, end_date, reason)
       VALUES (?, ?, ?, ?)`,
      [court_id, start_date, end_date, reason]
    );
    
    res.json({ message: 'Maintenance scheduled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get maintenance schedules for a court
router.get("/maintenance/:court_id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM court_maintenance 
       WHERE court_id = ? AND end_date >= CURDATE()
       ORDER BY start_date`,
      [req.params.court_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Delete/cancel maintenance
router.delete("/maintenance/:id", auth, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM court_maintenance WHERE id = ?`,
      [req.params.id]
    );
    res.json({ message: 'Maintenance cancelled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;