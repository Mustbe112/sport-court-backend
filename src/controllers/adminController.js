const pool = require('../config/db');
const { createNotification } = require('../utils/notificationUtils');

exports.createCourt = async (req, res) => {
  const { name, type, price_per_hour } = req.body;

  await pool.query(
    'INSERT INTO courts (name, type, price_per_hour, is_active) VALUES (?, ?, ?, 1)',
    [name, type, price_per_hour]
  );

  res.json({ message: 'Court created' });
};

exports.updateCourt = async (req, res) => {
  const { id } = req.params;
  const { name, type, price_per_hour, is_active } = req.body;

  await pool.query(
    'UPDATE courts SET name=?, type=?, price_per_hour=?, is_active=? WHERE id=?',
    [name, type, price_per_hour, is_active, id]
  );

  res.json({ message: 'Court updated' });
};

exports.getAllBookings = async (req, res) => {
  const [rows] = await pool.query(`
    SELECT b.*, u.email, c.name AS court_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN courts c ON b.court_id = c.id
    ORDER BY b.created_at DESC
  `);

  res.json(rows);
};

exports.forceCancelBooking = async (req, res) => {
  const { id } = req.params;

  const [[booking]] = await pool.query(
    'SELECT user_id FROM bookings WHERE id=?',
    [id]
  );

  await pool.query(
    "UPDATE bookings SET status='cancelled' WHERE id=?",
    [id]
  );

  await createNotification(
    booking.user_id,
    'Booking Cancelled by Admin',
    'Your booking was cancelled due to maintenance or event.'
  );

  res.json({ message: 'Booking cancelled by admin' });
};

exports.getAllCourts = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM courts ORDER BY id DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getHighDemandCourts = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.name AS court,
        COUNT(b.id) AS total_bookings
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      WHERE b.status = 'confirmed'
      GROUP BY b.court_id
      ORDER BY total_bookings DESC
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPeakHours = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        HOUR(start_time) AS hour,
        COUNT(*) AS total
      FROM bookings
      WHERE status = 'confirmed'
      GROUP BY hour
      ORDER BY hour
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCancellationRate = async (req, res) => {
  try {
    const [[row]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'cancelled') AS cancelled
      FROM bookings
    `);

    const rate = row.total === 0
      ? 0
      : ((row.cancelled / row.total) * 100).toFixed(2);

    res.json({ rate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getRevenueTrend = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE(created_at) AS date,
        SUM(total_price) AS revenue
      FROM bookings
      WHERE status = 'confirmed'
      GROUP BY date
      ORDER BY date
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.highDemandCourts = async (req, res) => {
  const [rows] = await pool.query(`
    SELECT c.type AS courtType, COUNT(b.id) AS count
    FROM bookings b
    JOIN courts c ON b.court_id = c.id
    WHERE b.status = 'booked'
    GROUP BY c.type
  `);

  res.json(rows);
};
