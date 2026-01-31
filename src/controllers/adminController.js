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
      ORDER BY 
        CASE 
          WHEN b.status = 'pending' THEN 1
          WHEN b.status = 'booked' THEN 2
          WHEN b.status = 'confirmed' THEN 3
          ELSE 4
        END,
        b.created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET BOOKINGS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get pending bookings (for admin notification)
exports.getPendingBookings = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*, u.email, c.name AS court_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN courts c ON b.court_id = c.id
      WHERE b.status = 'pending'
      ORDER BY b.created_at ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET PENDING BOOKINGS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get admin notifications
exports.getAdminNotifications = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT an.*, b.date, b.start_time, u.email
      FROM admin_notifications an
      JOIN bookings b ON an.booking_id = b.id
      JOIN users u ON b.user_id = u.id
      WHERE an.is_read = 0
      ORDER BY an.created_at DESC
      LIMIT 50
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET ADMIN NOTIFICATIONS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// Mark notification as read
exports.markNotificationRead = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      'UPDATE admin_notifications SET is_read=1 WHERE id=?',
      [id]
    );

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error("MARK NOTIFICATION READ ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// Force cancel booking (by admin)
exports.forceCancelBooking = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[booking]] = await conn.query(
      'SELECT * FROM bookings WHERE id=?',
      [id]
    );

    if (!booking) {
      await conn.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Refund if booking was paid
    if (booking.status === 'booked' || booking.status === 'pending') {
      await conn.query(
        'UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?',
        [booking.total_price, booking.user_id]
      );
    }

    await conn.query(
      "UPDATE bookings SET status='cancelled' WHERE id=?",
      [id]
    );

    await conn.commit();

    await createNotification(
      booking.user_id,
      'Booking Cancelled by Admin',
      `Your booking was cancelled. Reason: ${reason || 'Maintenance or event'}. Full refund issued.`
    );

    res.json({ message: 'Booking cancelled by admin and refunded' });
  } catch (err) {
    await conn.rollback();
    console.error("FORCE CANCEL ERROR:", err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// ================= PENALTIES =================

exports.getAllPenalties = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, u.email, b.date as booking_date
      FROM penalties p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN bookings b ON p.booking_id = b.id
      ORDER BY p.created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET PENALTIES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.resolvePenalty = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      'UPDATE penalties SET resolved=1 WHERE id=?',
      [id]
    );

    res.json({ message: 'Penalty resolved' });
  } catch (err) {
    console.error("RESOLVE PENALTY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= STATISTICS =================

exports.getDashboardStats = async (req, res) => {
  try {
    // Pending bookings count
    const [[{ pending_count }]] = await pool.query(
      `SELECT COUNT(*) as pending_count FROM bookings WHERE status='pending'`
    );

    // Active bookings count
    const [[{ active_count }]] = await pool.query(
      `SELECT COUNT(*) as active_count FROM bookings WHERE status='confirmed'`
    );

    // Today's bookings
    const [[{ today_count }]] = await pool.query(
      `SELECT COUNT(*) as today_count FROM bookings WHERE date=CURDATE()`
    );

    // Total revenue
    const [[{ total_revenue }]] = await pool.query(
      `SELECT SUM(total_price) as total_revenue FROM bookings 
       WHERE status IN ('booked', 'confirmed', 'completed')`
    );

    res.json({
      pending_bookings: pending_count,
      active_bookings: active_count,
      today_bookings: today_count,
      total_revenue: total_revenue || 0
    });

  } catch (err) {
    console.error("DASHBOARD STATS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.highDemandCourts = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.name as court_name, c.type AS courtType, COUNT(b.id) AS count
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      WHERE b.status IN ('booked', 'confirmed', 'completed')
      GROUP BY c.id, c.name, c.type
      ORDER BY count DESC
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
        COUNT(*) AS total
      FROM bookings
      WHERE status IN ('booked', 'confirmed', 'completed')
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
      WHERE status IN ('booked', 'confirmed', 'completed')
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) DESC
      LIMIT 30
    `);

    res.json(rows);
  } catch (err) {
    console.error("REVENUE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};