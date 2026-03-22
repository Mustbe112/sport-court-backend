const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// PUBLIC: get all active courts + maintenance status
router.get("/", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT c.*,
         CASE WHEN cm.id IS NOT NULL THEN 1 ELSE 0 END AS under_maintenance,
         cm.reason  AS maintenance_reason,
         cm.end_date AS maintenance_end
       FROM courts c
       LEFT JOIN court_maintenance cm
         ON cm.court_id = c.id
         AND ? BETWEEN DATE(cm.start_date) AND DATE(cm.end_date)
       WHERE c.is_active = 1`,
      [today]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC: filter by type
router.get("/type/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT c.*,
         CASE WHEN cm.id IS NOT NULL THEN 1 ELSE 0 END AS under_maintenance,
         cm.reason  AS maintenance_reason,
         cm.end_date AS maintenance_end
       FROM courts c
       LEFT JOIN court_maintenance cm
         ON cm.court_id = c.id
         AND ? BETWEEN DATE(cm.start_date) AND DATE(cm.end_date)
       WHERE c.type = ? AND c.is_active = 1`,
      [today, type]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;