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

// ✅ NEW: Get pending bookings for admin approval
exports.getPendingBookings = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*, u.email, c.name AS court_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN courts c ON b.court_id = c.id
      WHERE b.status = 'booked' OR b.status = 'pending'
      ORDER BY b.created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET PENDING BOOKINGS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Admin can cancel 'booked' bookings only with full refund
exports.forceCancelBooking = async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Get booking details including status and price
    const [[booking]] = await conn.query(
      'SELECT user_id, total_price, status FROM bookings WHERE id=?',
      [id]
    );

    if (!booking) {
      await conn.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Only allow cancellation of booked bookings
    if (booking.status !== 'booked') {
      await conn.rollback();
      return res.status(400).json({ error: `Cannot cancel booking with status: ${booking.status}` });
    }

    // Update booking status to cancelled
    await conn.query(
      "UPDATE bookings SET status='cancelled' WHERE id=?",
      [id]
    );

    // Refund the user
    await conn.query(
      'UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?',
      [booking.total_price, booking.user_id]
    );

    await conn.commit();

    // Send notification to user
    await createNotification(
      booking.user_id,
      'Booking Cancelled by Admin',
      `Your booking was cancelled due to maintenance or event. You have been fully refunded ${booking.total_price} coins.`
    );

    res.json({ 
      message: 'Booking cancelled by admin and user refunded',
      refunded_amount: booking.total_price
    });
  } catch (err) {
    await conn.rollback();
    console.error("FORCE CANCEL ERROR:", err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// ================= ADMIN NOTIFICATIONS =================

exports.getAdminNotifications = async (req, res) => {
  try {
    // Get system-wide notifications or admin-specific ones
    const [rows] = await pool.query(`
      SELECT * FROM notifications 
      WHERE user_id IS NULL OR user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `, [req.user.id]);

    res.json(rows);
  } catch (err) {
    console.error("GET ADMIN NOTIFICATIONS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ?',
      [id]
    );

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error("MARK NOTIFICATION READ ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ NEW: Delete no_show booking record
exports.deleteNoShowBooking = async (req, res) => {
  const { id } = req.params;

  try {
    const [[booking]] = await pool.query(
      'SELECT status FROM bookings WHERE id = ?',
      [id]
    );

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status !== 'no_show') {
      return res.status(400).json({ error: 'Only no_show bookings can be deleted' });
    }

    await pool.query('DELETE FROM bookings WHERE id = ?', [id]);

    res.json({ message: 'No-show booking deleted' });
  } catch (err) {
    console.error("DELETE NO_SHOW ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ NEW: Confirm booking (admin check-in)
exports.confirmBooking = async (req, res) => {
  const { id } = req.params;

  try {
    const [[booking]] = await pool.query(
      "SELECT * FROM bookings WHERE id = ? AND status = 'booked'",
      [id]
    );

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found or already confirmed' });
    }

    const bookingDate = new Date(booking.date);
    const today = new Date();
    bookingDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    // Only prevent confirming past bookings, allow future bookings
    if (bookingDate.getTime() < today.getTime()) {
      return res.status(400).json({ error: 'Cannot confirm past bookings' });
    }

    const qrText = `BOOKING-${booking.id}`;

    await pool.query(
      "UPDATE bookings SET status='confirmed', checked_in=1, qr_code=? WHERE id=?",
      [qrText, booking.id]
    );

    await createNotification(
      booking.user_id,
      'Booking Confirmed',
      `Your booking has been confirmed. Enjoy your game!`
    );

    res.json({ message: 'Booking confirmed - User checked in', booking_id: booking.id });
  } catch (err) {
    console.error("CONFIRM BOOKING ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= PENALTIES =================

exports.getAllPenalties = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.email, u.penalty, u.updated_at
      FROM users u
      WHERE u.penalty > 0
      ORDER BY u.penalty DESC
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
      'UPDATE users SET penalty = 0 WHERE id = ?',
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
    // Get total revenue
    const [[revenueData]] = await pool.query(`
      SELECT COALESCE(SUM(total_price), 0) AS total_revenue
      FROM bookings
      WHERE status = 'confirmed' OR status = 'completed'
    `);

    // Get active bookings count
    const [[activeData]] = await pool.query(`
      SELECT COUNT(*) AS active_bookings
      FROM bookings
      WHERE status = 'confirmed'
      AND date = CURDATE()
    `);

    // Get total courts
    const [[courtsData]] = await pool.query(`
      SELECT COUNT(*) AS total_courts
      FROM courts
      WHERE is_active = 1
    `);

    // Get cancellation rate
    const [[cancelData]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'cancelled') AS cancelled
      FROM bookings
      WHERE MONTH(created_at) = MONTH(CURDATE())
      AND YEAR(created_at) = YEAR(CURDATE())
    `);

    const cancellationRate = cancelData.total === 0
      ? 0
      : ((cancelData.cancelled / cancelData.total) * 100).toFixed(1);

    res.json({
      total_revenue: revenueData.total_revenue,
      active_bookings: activeData.active_bookings,
      total_courts: courtsData.total_courts,
      cancellation_rate: cancellationRate
    });
  } catch (err) {
    console.error("GET DASHBOARD STATS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.highDemandCourts = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.name AS court_name,
        c.type AS court_type,
        COUNT(b.id) AS booking_count
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      WHERE b.status = 'confirmed' OR b.status = 'completed'
      GROUP BY c.id, c.name, c.type
      ORDER BY booking_count DESC
      LIMIT 10
    `);

    res.json(rows);
  } catch (err) {
    console.error("HIGH DEMAND ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ FIXED: GROUP BY uses full expression instead of alias
exports.getPeakHours = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        HOUR(start_time) AS hour,
        COUNT(*) AS booking_count
      FROM bookings
      WHERE status = 'confirmed' OR status = 'completed'
      GROUP BY HOUR(start_time)
      ORDER BY HOUR(start_time)
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

// ✅ FIXED: GROUP BY uses full expression instead of alias
exports.getRevenueTrend = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE(created_at) AS date,
        SUM(total_price) AS revenue
      FROM bookings
      WHERE status = 'confirmed' OR status = 'completed'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
      LIMIT 30
    `);

    res.json(rows);
  } catch (err) {
    console.error("REVENUE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};