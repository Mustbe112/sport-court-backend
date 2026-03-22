const pool = require('../config/db');
const { generateQRCode, generatePDF } = require("../utils/bookingUtils");
const { createNotification } = require('../utils/notificationUtils');

/**
 * Safely build a JS Date from a MySQL date field + a time string.
 * MySQL DATETIME columns come back as full ISO strings like
 * "2026-02-01T00:00:00.000Z", so we always extract just the
 * YYYY-MM-DD part before combining with the time.
 */
function buildDateTime(dateField, timeStr) {
  // Extract date part directly from the string — avoids all timezone issues.
  // MySQL DATETIME fields arrive as "2026-03-22T00:00:00.000Z" or "2026-03-22 00:00:00".
  // Either way, the first 10 characters are always the correct YYYY-MM-DD date
  // as stored in the DB (which matches Bangkok local date since bookings are
  // created with Bangkok date). No Date object construction needed for the date part.
  const raw      = (dateField instanceof Date) ? dateField.toISOString() : String(dateField);
  const datePart = raw.slice(0, 10); // "YYYY-MM-DD" — safe, no TZ conversion
  return new Date(`${datePart}T${timeStr}`);
}

/* ============================
   1️⃣ CHECK AVAILABILITY
============================ */
exports.checkAvailability = async (req, res) => {
  const { court_id, date, start_time, end_time } = req.body;

  // Helper: add minutes to a "HH:MM:SS" string, returns "HH:MM:SS"
  function addMinutesToTime(timeStr, minutes) {
    const [h, m, s] = timeStr.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}:${s !== undefined ? String(s).padStart(2, '0') : '00'}`;
  }

  try {
    // Check for direct conflicts (existing booking overlaps requested slot)
    const [conflicts] = await pool.query(
      `SELECT id, end_time FROM bookings
       WHERE court_id = ?
       AND date = ?
       AND status IN ('booked', 'confirmed')
       AND start_time < ?
       AND end_time > ?`,
      [court_id, date, end_time, start_time]
    );

    if (conflicts.length > 0) {
      return res.json({ available: false, reason: 'Time slot already booked' });
    }

    // Check 15-minute buffer: is there a booking that ends within 15 min before our start?
    // i.e. another booking's end_time is between (start_time - 15min) and start_time
    const [bufferConflicts] = await pool.query(
      `SELECT id, end_time FROM bookings
       WHERE court_id = ?
       AND date = ?
       AND status IN ('booked', 'confirmed')
       AND end_time > SUBTIME(?, '00:15:00')
       AND end_time <= ?`,
      [court_id, date, start_time, start_time]
    );

    if (bufferConflicts.length > 0) {
      const prevEndTime = bufferConflicts[0].end_time;
      // Show the time string correctly whether it's a full datetime or time-only
      const timeOnly = prevEndTime.includes('T')
        ? prevEndTime.split('T')[1].slice(0, 8)
        : String(prevEndTime).slice(0, 8);
      const nextAvailable = addMinutesToTime(timeOnly, 15);
      return res.json({
        available: false,
        reason: `There is a 15-minute maintenance gap after the previous booking. Earliest available start time is ${nextAvailable}.`,
        next_available_time: nextAvailable
      });
    }

    // Check if our end_time conflicts with the 15-min buffer of a future booking
    // i.e. a booking starts less than 15 min after our end_time
    const [futureBufferConflicts] = await pool.query(
      `SELECT id, start_time FROM bookings
       WHERE court_id = ?
       AND date = ?
       AND status IN ('booked', 'confirmed')
       AND start_time >= ?
       AND start_time < ADDTIME(?, '00:15:00')`,
      [court_id, date, end_time, end_time]
    );

    if (futureBufferConflicts.length > 0) {
      const nextStart = futureBufferConflicts[0].start_time;
      const timeOnly = nextStart.includes('T')
        ? nextStart.split('T')[1].slice(0, 8)
        : String(nextStart).slice(0, 8);
      return res.json({
        available: false,
        reason: `Your end time is too close to the next booking at ${timeOnly}. Please end at least 15 minutes before the next booking starts.`,
        next_booking_start: timeOnly
      });
    }

    const [maintenance] = await pool.query(
      `SELECT id, reason FROM court_maintenance
       WHERE court_id = ?
       AND ? BETWEEN start_date AND end_date`,
      [court_id, date]
    );

    if (maintenance.length > 0) {
      return res.json({ 
        available: false, 
        reason: 'Court under maintenance',
        maintenance_reason: maintenance[0].reason 
      });
    }

    res.json({ available: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   2️⃣ LOCK SLOT (10 MINUTES)
============================ */
exports.lockSlot = async (req, res) => {
  const { court_id, date, start_time, end_time } = req.body;

  try {
    await pool.query(`DELETE FROM slot_locks WHERE expires_at < NOW()`);

    const [locks] = await pool.query(
      `SELECT id FROM slot_locks
       WHERE court_id = ?
       AND date = ?
       AND start_time < ?
       AND end_time > ?`,
      [court_id, date, end_time, start_time]
    );

    if (locks.length > 0) {
      return res.status(400).json({ message: 'Slot temporarily locked' });
    }

    await pool.query(
      `INSERT INTO slot_locks
       (court_id, date, start_time, end_time, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [court_id, date, start_time, end_time]
    );

    res.json({ message: 'Slot locked for payment' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   3️⃣ CREATE BOOKING + PAYMENT
============================ */
exports.createBooking = async (req, res) => {
  const { court_id, date, start_time, end_time } = req.body;
  const user_id = req.user.id;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [conflicts] = await conn.query(
      `SELECT id FROM bookings
       WHERE court_id = ?
       AND date = ?
       AND status IN ('booked', 'confirmed')
       AND start_time < ADDTIME(?, '00:15:00')
       AND ADDTIME(end_time, '00:15:00') > ?`,
      [court_id, date, end_time, start_time]
    );

    if (conflicts.length > 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Time slot not available (includes 15-minute maintenance gap)' });
    }

    const [maintenance] = await conn.query(
      `SELECT id, reason FROM court_maintenance
       WHERE court_id = ?
       AND ? BETWEEN start_date AND end_date`,
      [court_id, date]
    );

    if (maintenance.length > 0) {
      await conn.rollback();
      return res.status(400).json({ 
        message: 'Court under maintenance', 
        reason: maintenance[0].reason 
      });
    }

    const [[court]] = await conn.query(
      'SELECT price_per_hour FROM courts WHERE id = ?',
      [court_id]
    );

    const [[user]] = await conn.query(
      'SELECT coin_balance, penalty, suspended_until, suspension_reason FROM users WHERE id = ?',
      [user_id]
    );

    // Check if user is suspended
    if (user.suspended_until) {
      const suspendedUntil = new Date(user.suspended_until);
      const now = new Date();
      if (suspendedUntil > now) {
        await conn.rollback();
        return res.status(403).json({
          suspended: true,
          message: 'Your account is suspended. You cannot make bookings.',
          suspended_until: user.suspended_until,
          suspension_reason: user.suspension_reason
        });
      }
      // Suspension expired — clear it automatically
      await conn.query(
        `UPDATE users SET suspended_until = NULL, suspension_reason = NULL WHERE id = ?`,
        [user_id]
      );
    }

    const startTime = new Date(`1970-01-01 ${start_time}`);
    const endTime = new Date(`1970-01-01 ${end_time}`);
    const durationHours = (endTime - startTime) / (1000 * 60 * 60);

    const baseCost      = court.price_per_hour * durationHours;
    const penaltyAmount = user.penalty || 0;
    const totalPrice    = baseCost + penaltyAmount;

    if (user.coin_balance < totalPrice) {
      await conn.rollback();
      return res.status(400).json({ message: 'Not enough coins' });
    }

    await conn.query(
      `UPDATE users SET coin_balance = coin_balance - ?, penalty = 0 WHERE id = ?`,
      [totalPrice, user_id]
    );

    const [result] = await conn.query(
      `INSERT INTO bookings
       (user_id, court_id, date, start_time, end_time, status, total_price)
       VALUES (?, ?, ?, ?, ?, 'booked', ?)`,
      [user_id, court_id, date, start_time, end_time, totalPrice]
    );

    await conn.query(
      `DELETE FROM slot_locks WHERE court_id = ? AND date = ?`,
      [court_id, date]
    );

    await conn.commit();

    await createNotification(
      user_id,
      'Booking Created',
      'Your booking has been created. Please check in on the day of your appointment.'
    );

    res.json({
      message: 'Booking paid & created',
      booking_id: result.insertId,
      base_cost: baseCost,
      penalty_amount: penaltyAmount,
      total_price: totalPrice
    });

  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

/* ============================
   4️⃣ CANCEL BOOKING + REFUND
============================ */
exports.cancelBooking = async (req, res) => {
  const bookingId = req.params.id;
  const user_id = req.user.id;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[booking]] = await conn.query(
      `SELECT total_price, status
       FROM bookings
       WHERE id = ? AND user_id = ? AND status IN ('booked', 'confirmed')`,
      [bookingId, user_id]
    );

    if (!booking) {
      await conn.rollback();
      return res.status(404).json({ message: 'Booking not found or cannot be cancelled' });
    }

    await conn.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = ?`,
      [bookingId]
    );

    await conn.query(
      `UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?`,
      [booking.total_price, user_id]
    );

    await conn.commit();

    await createNotification(
      user_id,
      'Booking Cancelled',
      'Your booking has been cancelled and refunded.'
    );

    res.json({ message: 'Booking cancelled & refunded' });

  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

/* ============================
   5️⃣ CHECK OUT + LATE PENALTY
============================ */
exports.checkOut = async (req, res) => {
  const bookingId = req.params.id;

  try {
    const [[booking]] = await pool.query(
      `SELECT b.user_id, b.date, b.end_time, b.court_id, c.price_per_hour, c.name AS court_name
       FROM bookings b
       JOIN courts c ON b.court_id = c.id
       WHERE b.id = ? AND b.status = 'confirmed'`,
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or not confirmed' });
    }

    // FIX: use buildDateTime so MySQL DATETIME field parses correctly
    const bookingEnd = buildDateTime(booking.date, booking.end_time);
    const now = new Date();

    // 10-minute grace period after booking end time
    const gracePeriodMs    = 10 * 60 * 1000;
    const penaltyThreshold = new Date(bookingEnd.getTime() + gracePeriodMs);

    if (now > penaltyThreshold) {
      const penaltyAmount = booking.price_per_hour;
      const reason = `Late checkout from ${booking.court_name}. Exceeded 15-minute grace period.`;

      await pool.query(
        `UPDATE users SET penalty = penalty + ? WHERE id = ?`,
        [penaltyAmount, booking.user_id]
      );

      await pool.query(
        `INSERT INTO penalties (user_id, booking_id, type, description, amount, resolved)
         VALUES (?, ?, 'late_checkout', ?, ?, 0)`,
        [booking.user_id, bookingId, reason, penaltyAmount]
      );

      await createNotification(
        booking.user_id,
        'Late Checkout Penalty',
        `You checked out late from ${booking.court_name}. A penalty of ${penaltyAmount} coins (1-hour court fee) will be charged on your next booking.`
      );

      // Check late checkout count — suspend if 2 or more
      const [[lateCount]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM penalties
         WHERE user_id = ? AND type = 'late_checkout' AND resolved = 0`,
        [booking.user_id]
      );

      if (lateCount.cnt >= 2) {
        const suspendUntil = new Date();
        suspendUntil.setDate(suspendUntil.getDate() + 7);
        const reason = `Suspended for 7 days due to ${lateCount.cnt} late checkouts.`;

        await pool.query(
          `UPDATE users SET suspended_until = ?, suspension_reason = ? WHERE id = ?`,
          [suspendUntil, reason, booking.user_id]
        );

        await createNotification(
          booking.user_id,
          'Account Suspended',
          `Your account has been suspended for 7 days due to repeated late checkouts (${lateCount.cnt} times). You can appeal this decision on the suspension page.`
        );
      }

      await pool.query(
        `UPDATE bookings SET status = 'completed' WHERE id = ?`,
        [bookingId]
      );

      return res.json({
        message: 'Checked out with late penalty',
        penalty_applied: penaltyAmount,
        reason
      });
    }

    await pool.query(
      `UPDATE bookings SET status = 'completed' WHERE id = ?`,
      [bookingId]
    );

    res.json({ message: 'Checked out successfully' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   AUTO COMPLETE — REMOVED
   Bookings are only completed via manual admin checkout or QR scanner.
   Auto-complete was causing false late-checkout penalties for users
   who checked out on time or early.
============================ */
exports.autoComplete = async (req, res) => {
  res.json({ message: 'Auto-complete is disabled. Checkout is handled manually.' });
};

/* ============================
   6️⃣ AUTO NO-SHOW (15 MIN AFTER START)
============================ */
exports.autoNoShow = async (req, res) => {
  try {
    console.log('🔍 Checking for no-shows at:', new Date().toISOString());

    // FIX: ADDTIME(DATE(b.date), b.start_time) instead of CONCAT(b.date, ' ', b.start_time)
    const [bookings] = await pool.query(
      `SELECT b.id, b.user_id, b.total_price, b.date, b.start_time, b.checked_in,
              b.court_id, c.price_per_hour, c.name AS court_name
       FROM bookings b
       JOIN courts c ON b.court_id = c.id
       WHERE b.status = 'booked'
       AND b.checked_in = FALSE
       AND NOW() > DATE_ADD(
         ADDTIME(DATE(b.date), b.start_time),
         INTERVAL 15 MINUTE
       )`
    );

    console.log(`📊 Found ${bookings.length} no-show bookings`);

    for (const b of bookings) {
      console.log(`⚠️ Marking booking #${b.id} as no-show`);

      // Just mark as no_show — payment was already collected at booking time.
      // No additional penalty is charged. Penalty only applies to late checkout.
      await pool.query(
        `UPDATE bookings SET status = 'no_show' WHERE id = ?`,
        [b.id]
      );

      await createNotification(
        b.user_id,
        'No-Show',
        `You did not check in for your booking at ${b.court_name}. Your booking has been marked as no-show. No refund has been issued.`
      );

      console.log(`✅ Booking #${b.id} marked as no-show`);
    }

    res.json({
      message: 'Auto no-show executed',
      no_shows: bookings.length,
      bookings: bookings.map(b => ({ id: b.id, date: b.date, start_time: b.start_time }))
    });

  } catch (err) {
    console.error('❌ Auto no-show error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   7️⃣ CONFIRM BOOKING (ADMIN CHECK-IN VIA QR)
============================ */
exports.confirmBooking = async (req, res) => {
  const bookingId = req.params.id;

  try {
    const [[booking]] = await pool.query(
      "SELECT * FROM bookings WHERE id = ? AND status = 'booked'",
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({ error: "Booking not found or already confirmed" });
    }

    // Extract stored date directly — avoids UTC-vs-local timezone mismatch.
    // booking.date from MySQL = "2026-03-22T00:00:00.000Z" — slice(0,10) = "2026-03-22"
    // todayStr uses toLocaleDateString('en-CA') which is fine for "today" comparison.
    const raw            = (booking.date instanceof Date) ? booking.date.toISOString() : String(booking.date);
    const bookingDateStr = raw.slice(0, 10);
    const todayStr       = new Date().toLocaleDateString('en-CA');

    if (bookingDateStr < todayStr) {
      return res.status(400).json({ error: "Cannot confirm past bookings" });
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

    res.json({
      message: "Booking confirmed - User checked in",
      booking_id: booking.id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Confirm booking failed" });
  }
};

/* ============================
   8️⃣ CHECK-IN (DEPRECATED)
============================ */
exports.checkIn = async (req, res) => {
  const bookingId = req.params.id;

  try {
    const [result] = await pool.query(
      `UPDATE bookings SET checked_in = 1 WHERE id = ? AND status = 'confirmed'`,
      [bookingId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'Check-in failed' });
    }

    res.json({ message: 'Check-in successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   9️⃣ GET USER'S BOOKINGS
============================ */
exports.getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;

    const [bookings] = await pool.query(`
      SELECT 
        b.id,
        b.court_id,
        b.date,
        b.start_time,
        b.end_time,
        b.status,
        b.total_price,
        b.checked_in,
        b.created_at,
        c.name as court_name,
        c.type as court_type,
        c.location
      FROM bookings b
      LEFT JOIN courts c ON b.court_id = c.id
      WHERE b.user_id = ?
      ORDER BY b.date DESC, b.start_time DESC
    `, [userId]);

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

/* ============================
   🔟 GET SINGLE BOOKING (FOR RECEIPT)
============================ */
exports.getBookingById = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;

    const [bookings] = await pool.query(`
      SELECT 
        b.*,
        c.name as court_name,
        c.type as court_type,
        c.location,
        c.price_per_hour,
        u.email as user_email
      FROM bookings b
      LEFT JOIN courts c ON b.court_id = c.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.id = ? AND b.user_id = ?
    `, [bookingId, userId]);

    if (bookings.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(bookings[0]);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
};