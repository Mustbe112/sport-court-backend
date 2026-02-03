const express = require("express");
const router = express.Router();
const pool = require("../config/db");

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

module.exports = router;
