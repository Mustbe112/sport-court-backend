const pool = require('../config/db');
const { createNotification } = require('../utils/notificationUtils');

// ================= COURTS =================

exports.createCourt = async (req, res) => {
  const { name, type, price_per_hour } = req.body;

  try {
    await pool.query(
      'INSERT INTO courts (name, type, price_per_hour, is_active) VALUES (?, ?, ?, 1)',
      [name, type, price_per_hour]
    );

    res.json({ message: 'Court created' });
  } catch (err) {
    console.error("CREATE COURT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateCourt = async (req, res) => {
  const { id } = req.params;
  const { name, type, price_per_hour, is_active } = req.body;

  try {
    await pool.query(
      'UPDATE courts SET name=?, type=?, price_per_hour=?, is_active=? WHERE id=?',
      [name, type, price_per_hour, is_active, id]
    );

    res.json({ message: 'Court updated' });
  } catch (err) {
    console.error("UPDATE COURT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getAllCourts = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM courts ORDER BY id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error("GET COURTS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= BOOKINGS =================

exports.getAllBookings = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*, u.email, c.name AS court_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN courts c ON b.court_id = c.id
      ORDER BY b.created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET BOOKINGS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// NEW: CONFIRM BOOKING (Admin confirms when user arrives)
exports.confirmBooking = async (req, res) => {
  const { id } = req.params;

  try {
    const [[booking]] = await pool.query(
      'SELECT user_id, status FROM bookings WHERE id=?',
      [id]
    );

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status !== 'booked') {
      return res.status(400).json({ message: `Cannot confirm booking with status: ${booking.status}` });
    }

    await pool.query(
      "UPDATE bookings SET status='confirmed', checked_in=1 WHERE id=?",
      [id]
    );

    await createNotification(
      booking.user_id,
      'Booking Confirmed',
      'Admin has confirmed your arrival. Enjoy your session!'
    );

    res.json({ message: 'Booking confirmed successfully' });
  } catch (err) {
    console.error("CONFIRM BOOKING ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// UPDATED: Force cancel with refund
exports.forceCancelBooking = async (req, res) => {
  const { id } = req.params;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[booking]] = await conn.query(
      'SELECT user_id, total_price, status FROM bookings WHERE id=?',
      [id]
    );

    if (!booking) {
      await conn.rollback();
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status === 'cancelled' || booking.status === 'completed') {
      await conn.rollback();
      return res.status(400).json({ message: 'Booking already cancelled or completed' });
    }

    await conn.query(
      "UPDATE bookings SET status='cancelled' WHERE id=?",
      [id]
    );

    // Refund coins
    await conn.query(
      `UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?`,
      [booking.total_price, booking.user_id]
    );

    await conn.commit();

    await createNotification(
      booking.user_id,
      'Booking Cancelled by Admin',
      'Your booking was cancelled due to maintenance or other reasons. Full refund issued.'
    );

    res.json({ message: 'Booking cancelled by admin, user refunded' });
  } catch (err) {
    await conn.rollback();
    console.error("FORCE CANCEL ERROR:", err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// NEW: Complete booking (Admin marks as completed)
exports.completeBooking = async (req, res) => {
  const { id } = req.params;

  try {
    const [[booking]] = await pool.query(
      'SELECT user_id, status, date, end_time FROM bookings WHERE id=?',
      [id]
    );

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status !== 'confirmed') {
      return res.status(400).json({ message: 'Only confirmed bookings can be completed' });
    }

    // Check for late checkout
    const bookingEnd = new Date(`${booking.date} ${booking.end_time}`);
    const now = new Date();

    if (now > new Date(bookingEnd.getTime() + 15 * 60000)) {
      // Late checkout - apply penalty
      await pool.query(
        `UPDATE users SET penalty = penalty + 50 WHERE id = ?`,
        [booking.user_id]
      );

      await createNotification(
        booking.user_id,
        'Late Checkout Penalty',
        'A 50 coin penalty has been applied for late checkout.'
      );
    }

    await pool.query(
      "UPDATE bookings SET status='completed' WHERE id=?",
      [id]
    );

    res.json({ message: 'Booking completed' });
  } catch (err) {
    console.error("COMPLETE BOOKING ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= STATISTICS =================

exports.highDemandCourts = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.name AS court_name, c.type AS courtType, COUNT(b.id) AS booking_count
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      WHERE b.status IN ('confirmed', 'completed')
      GROUP BY c.id
      ORDER BY booking_count DESC
      LIMIT 10
    `);

    res.json(rows);
  } catch (err) {
    console.error("HIGH DEMAND ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getPeakHours = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        HOUR(start_time) AS hour,
        COUNT(*) AS booking_count
      FROM bookings
      WHERE status IN ('confirmed', 'completed')
      GROUP BY hour
      ORDER BY hour
    `);

    res.json(rows);
  } catch (err) {
    console.error("PEAK HOURS ERROR:", err);
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
    console.error("CANCELLATION RATE ERROR:", err);
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
      WHERE status IN ('confirmed', 'completed', 'no_show')
      GROUP BY date
      ORDER BY date DESC
      LIMIT 7
    `);

    res.json(rows);
  } catch (err) {
    console.error("REVENUE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};