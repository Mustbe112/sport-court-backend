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

// ================= MAINTENANCE =================

exports.scheduleMaintenance = async (req, res) => {
  const { id } = req.params;
  const { start_date, end_date, reason } = req.body;

  try {
    // Validate dates
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    // Insert maintenance schedule
    await pool.query(
      `INSERT INTO court_maintenance (court_id, start_date, end_date, reason)
       VALUES (?, ?, ?, ?)`,
      [id, start_date, end_date, reason || 'Scheduled maintenance']
    );

    // Get affected bookings
    const [affectedBookings] = await pool.query(
      `SELECT b.id, b.user_id, b.total_price
       FROM bookings b
       WHERE b.court_id = ?
       AND b.date BETWEEN ? AND ?
       AND b.status = 'booked'`,
      [id, start_date, end_date]
    );

    // Cancel and refund affected bookings
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const booking of affectedBookings) {
        // Cancel booking
        await conn.query(
          `UPDATE bookings SET status = 'cancelled' WHERE id = ?`,
          [booking.id]
        );

        // Refund user
        await conn.query(
          `UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?`,
          [booking.total_price, booking.user_id]
        );

        // Notify user
        await createNotification(
          booking.user_id,
          'Booking Cancelled - Court Maintenance',
          `Your booking has been cancelled due to scheduled maintenance. You have been fully refunded ${booking.total_price} coins.`
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({ 
      message: 'Maintenance scheduled successfully',
      affected_bookings: affectedBookings.length
    });
  } catch (err) {
    console.error("SCHEDULE MAINTENANCE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getCourtMaintenance = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT cm.*, c.name as court_name
      FROM court_maintenance cm
      JOIN courts c ON cm.court_id = c.id
      ORDER BY cm.start_date DESC
    `);
    
    res.json(rows);
  } catch (err) {
    console.error("GET MAINTENANCE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteMaintenance = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM court_maintenance WHERE id = ?', [id]);
    res.json({ message: 'Maintenance schedule deleted' });
  } catch (err) {
    console.error("DELETE MAINTENANCE ERROR:", err);
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
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status !== 'booked') {
      await conn.rollback();
      return res.status(400).json({ error: `Cannot cancel booking with status: ${booking.status}` });
    }

    await conn.query(
      "UPDATE bookings SET status='cancelled' WHERE id=?",
      [id]
    );

    await conn.query(
      'UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?',
      [booking.total_price, booking.user_id]
    );

    await conn.commit();

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

    // Safely compare dates as strings to avoid timezone issues with MySQL DATETIME
    const bookingDateStr = String(booking.date).slice(0, 10); // "YYYY-MM-DD"
    const todayStr = new Date().toLocaleDateString('en-CA');  // "YYYY-MM-DD" in local time

    if (bookingDateStr < todayStr) {
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
      SELECT 
        p.id AS penalty_id,
        p.user_id,
        u.email,
        u.penalty AS pending_penalty_balance,
        p.booking_id,
        p.type,
        p.description,
        p.amount,
        p.resolved,
        p.created_at,
        c.name AS court_name
      FROM penalties p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN bookings b ON p.booking_id = b.id
      LEFT JOIN courts c ON b.court_id = c.id
      ORDER BY p.created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET PENALTIES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.resolvePenalty = async (req, res) => {
  const { id } = req.params; // this is user_id

  try {
    // Reset user's pending penalty balance
    await pool.query(
      'UPDATE users SET penalty = 0 WHERE id = ?',
      [id]
    );

    // Mark all unresolved penalty records for this user as resolved
    await pool.query(
      'UPDATE penalties SET resolved = 1 WHERE user_id = ? AND resolved = 0',
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
    const [[revenueData]] = await pool.query(`
      SELECT COALESCE(SUM(total_price), 0) AS total_revenue
      FROM bookings
      WHERE status = 'confirmed' OR status = 'completed'
    `);

    const [[activeData]] = await pool.query(`
      SELECT COUNT(*) AS active_bookings
      FROM bookings
      WHERE status = 'confirmed'
      AND date = CURDATE()
    `);

    const [[courtsData]] = await pool.query(`
      SELECT COUNT(*) AS total_courts
      FROM courts
      WHERE is_active = 1
    `);

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
// ================= PASSWORD MANAGEMENT =================

exports.getPendingResets = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, created_at 
       FROM users 
       WHERE password_reset_pending = 1
       ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET PENDING RESETS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.adminResetUserPassword = async (req, res) => {
  const { id } = req.params;
  const bcrypt = require('bcrypt');

  try {
    const [[user]] = await pool.query(
      'SELECT id, email, name FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate a simple temp password: "Sport" + random 4 digits
    const tempPassword = 'Sport' + Math.floor(1000 + Math.random() * 9000);

    // Generate a new recovery ID: "RC" + random 6 digits
    const newRecoveryId = 'RC' + Math.floor(100000 + Math.random() * 900000);

    const hashedPassword   = await bcrypt.hash(tempPassword, 10);
    const hashedRecoveryId = await bcrypt.hash(newRecoveryId, 10);

    await pool.query(
      `UPDATE users 
       SET password_hash = ?, 
           temp_password = ?,
           recovery_id = ?,
           recovery_id_plain = ?,
           password_reset_pending = 0
       WHERE id = ?`,
      [hashedPassword, tempPassword, hashedRecoveryId, newRecoveryId, id]
    );

    res.json({
      message: 'Password reset successfully',
      temp_password: tempPassword,
      new_recovery_id: newRecoveryId,
      user_email: user.email
    });
  } catch (err) {
    console.error("ADMIN RESET PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, coin_balance, penalty, role, password_reset_pending, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET ALL USERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};
// ================= SUSPENSION MANAGEMENT =================

exports.getSuspendedUsers = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.suspended_until, u.suspension_reason,
        COUNT(p.id) AS late_checkout_count,
        MAX(p.created_at) AS last_late_checkout
      FROM users u
      LEFT JOIN penalties p ON u.id = p.user_id AND p.type = 'late_checkout'
      WHERE u.suspended_until IS NOT NULL AND u.suspended_until > NOW()
      GROUP BY u.id
      ORDER BY u.suspended_until ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("GET SUSPENDED USERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.suspendUser = async (req, res) => {
  const { id } = req.params;
  const { reason, days } = req.body;

  try {
    const suspendDays = days || 7;
    const suspendUntil = new Date();
    suspendUntil.setDate(suspendUntil.getDate() + suspendDays);

    await pool.query(
      `UPDATE users SET suspended_until = ?, suspension_reason = ? WHERE id = ?`,
      [suspendUntil, reason || 'Suspended by admin', id]
    );

    await createNotification(
      id,
      'Account Suspended',
      `Your account has been suspended for ${suspendDays} days. Reason: ${reason || 'Suspended by admin'}. You can submit an appeal on the suspension page.`
    );

    res.json({ message: `User suspended for ${suspendDays} days` });
  } catch (err) {
    console.error("SUSPEND USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.unsuspendUser = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE users SET suspended_until = NULL WHERE id = ?`,
      [id]
    );

    // Also mark all unresolved late_checkout penalties as resolved
    await pool.query(
      `UPDATE penalties SET resolved = 1 WHERE user_id = ? AND type = 'late_checkout' AND resolved = 0`,
      [id]
    );

    await createNotification(
      id,
      'Suspension Lifted',
      'Your account suspension has been lifted by the admin. You can now make bookings again.'
    );

    res.json({ message: 'User unsuspended successfully' });
  } catch (err) {
    console.error("UNSUSPEND USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= APPEALS =================

exports.getAppeals = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        a.id, a.user_id, a.message, a.status, a.admin_note, a.created_at,
        u.name, u.email, u.suspended_until, u.suspension_reason,
        COUNT(p.id) AS late_checkout_count,
        MAX(p.created_at) AS last_late_checkout
      FROM appeals a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN penalties p ON u.id = p.user_id AND p.type = 'late_checkout'
      GROUP BY a.id, a.user_id, a.message, a.status, a.admin_note, a.created_at,
               u.name, u.email, u.suspended_until, u.suspension_reason
      ORDER BY a.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("GET APPEALS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.resolveAppeal = async (req, res) => {
  const { id } = req.params;
  const { action, admin_note } = req.body; // action: 'approve' or 'reject'

  try {
    const [[appeal]] = await pool.query(
      'SELECT * FROM appeals WHERE id = ?',
      [id]
    );

    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found' });
    }

    await pool.query(
      `UPDATE appeals SET status = ?, admin_note = ? WHERE id = ?`,
      [action === 'approve' ? 'approved' : 'rejected', admin_note || '', id]
    );

    if (action === 'approve') {
      // Lift suspension
      await pool.query(
        `UPDATE users SET suspended_until = NULL WHERE id = ?`,
        [appeal.user_id]
      );

      // Resolve penalties
      await pool.query(
        `UPDATE penalties SET resolved = 1 WHERE user_id = ? AND type = 'late_checkout' AND resolved = 0`,
        [appeal.user_id]
      );

      await createNotification(
        appeal.user_id,
        'Appeal Approved ✅',
        `Your appeal has been approved. Your suspension has been lifted. ${admin_note ? 'Admin note: ' + admin_note : ''}`
      );
    } else {
      await createNotification(
        appeal.user_id,
        'Appeal Rejected',
        `Your appeal has been reviewed and rejected. ${admin_note ? 'Reason: ' + admin_note : 'Your suspension remains in effect.'}`
      );
    }

    res.json({ message: `Appeal ${action === 'approve' ? 'approved' : 'rejected'} successfully` });
  } catch (err) {
    console.error("RESOLVE APPEAL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};
// ================= REPORTS =================

exports.getReportData = async (req, res) => {
  const { from, to } = req.query;

  // Default: last 30 days
  const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateTo   = to   || new Date().toISOString().slice(0, 10);

  try {
    // Revenue by date
    const [revenueByDate] = await pool.query(`
      SELECT DATE(created_at) AS date, SUM(total_price) AS revenue, COUNT(*) AS bookings
      FROM bookings
      WHERE (status = 'confirmed' OR status = 'completed')
        AND DATE(created_at) BETWEEN ? AND ?
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `, [dateFrom, dateTo]);

    // Revenue by court
    const [revenueByCourt] = await pool.query(`
      SELECT c.name AS court_name, c.type AS court_type,
             COUNT(b.id) AS total_bookings,
             SUM(b.total_price) AS total_revenue,
             AVG(b.total_price) AS avg_revenue
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      WHERE (b.status = 'confirmed' OR b.status = 'completed')
        AND DATE(b.created_at) BETWEEN ? AND ?
      GROUP BY c.id, c.name, c.type
      ORDER BY total_revenue DESC
    `, [dateFrom, dateTo]);

    // Booking status summary
    const [bookingStatus] = await pool.query(`
      SELECT status, COUNT(*) AS count, COALESCE(SUM(total_price), 0) AS total_value
      FROM bookings
      WHERE DATE(created_at) BETWEEN ? AND ?
      GROUP BY status
    `, [dateFrom, dateTo]);

    // Cancellation details
    const [cancellations] = await pool.query(`
      SELECT b.id, u.name AS user_name, u.email, c.name AS court_name,
             b.date, b.start_time, b.end_time, b.total_price, b.created_at
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN courts c ON b.court_id = c.id
      WHERE b.status = 'cancelled'
        AND DATE(b.created_at) BETWEEN ? AND ?
      ORDER BY b.created_at DESC
    `, [dateFrom, dateTo]);

    // Penalties summary
    const [penalties] = await pool.query(`
      SELECT u.name AS user_name, u.email,
             COUNT(p.id) AS penalty_count,
             SUM(p.amount) AS total_penalty_amount,
             MAX(p.created_at) AS last_penalty
      FROM penalties p
      JOIN users u ON p.user_id = u.id
      WHERE DATE(p.created_at) BETWEEN ? AND ?
      GROUP BY p.user_id, u.name, u.email
      ORDER BY penalty_count DESC
    `, [dateFrom, dateTo]);

    // Top users by spend
    const [topUsers] = await pool.query(`
      SELECT u.name, u.email, COUNT(b.id) AS total_bookings,
             SUM(b.total_price) AS total_spent
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE (b.status = 'confirmed' OR b.status = 'completed')
        AND DATE(b.created_at) BETWEEN ? AND ?
      GROUP BY u.id, u.name, u.email
      ORDER BY total_spent DESC
      LIMIT 20
    `, [dateFrom, dateTo]);

    res.json({
      period: { from: dateFrom, to: dateTo },
      revenue_by_date: revenueByDate,
      revenue_by_court: revenueByCourt,
      booking_status: bookingStatus,
      cancellations: cancellations,
      penalties: penalties,
      top_users: topUsers
    });
  } catch (err) {
    console.error("REPORT DATA ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= USER ACTIVITY LOOKUP =================

exports.getUserActivity = async (req, res) => {
  const { q } = req.query; // name or email search term

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  const search = `%${q.trim()}%`;

  try {
    // Find matching users
    const [users] = await pool.query(
      `SELECT id, name, email, coin_balance, penalty, role,
              suspended_until, suspension_reason, created_at,
              password_reset_pending
       FROM users
       WHERE name LIKE ? OR email LIKE ?
       ORDER BY name ASC
       LIMIT 10`,
      [search, search]
    );

    if (users.length === 0) {
      return res.json({ users: [], activities: null });
    }

    // Get full activity for all matched users
    const userIds = users.map(u => u.id);
    const placeholders = userIds.map(() => '?').join(',');

    // All bookings
    const [bookings] = await pool.query(
      `SELECT b.id, b.user_id, b.date, b.start_time, b.end_time,
              b.status, b.total_price, b.created_at,
              c.name AS court_name, c.type AS court_type
       FROM bookings b
       JOIN courts c ON b.court_id = c.id
       WHERE b.user_id IN (${placeholders})
       ORDER BY b.created_at DESC`,
      userIds
    );

    // All penalties
    const [penalties] = await pool.query(
      `SELECT p.id, p.user_id, p.type, p.description,
              p.amount, p.resolved, p.created_at,
              c.name AS court_name
       FROM penalties p
       LEFT JOIN bookings b ON p.booking_id = b.id
       LEFT JOIN courts c ON b.court_id = c.id
       WHERE p.user_id IN (${placeholders})
       ORDER BY p.created_at DESC`,
      userIds
    );

    // All appeals
    const [appeals] = await pool.query(
      `SELECT id, user_id, message, status, admin_note, created_at
       FROM appeals
       WHERE user_id IN (${placeholders})
       ORDER BY created_at DESC`,
      userIds
    );

    // Coin top-ups (positive transactions not from bookings — via coin_transactions if exists, else skip gracefully)
    let topups = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, user_id, amount, created_at
         FROM coin_transactions
         WHERE user_id IN (${placeholders}) AND type = 'topup'
         ORDER BY created_at DESC`,
        userIds
      );
      topups = rows;
    } catch(_) {
      // coin_transactions table may not exist — silently skip
    }

    res.json({
      users,
      activities: {
        bookings,
        penalties,
        appeals,
        topups
      }
    });
  } catch (err) {
    console.error("USER ACTIVITY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};