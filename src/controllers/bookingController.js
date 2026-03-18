const pool = require('../config/db');
const { generateQRCode, generatePDF } = require("../utils/bookingUtils");
const { createNotification } = require('../utils/notificationUtils');

/* ============================
   1️⃣ CHECK AVAILABILITY
============================ */
exports.checkAvailability = async (req, res) => {
  const { court_id, date, start_time, end_time } = req.body;

  try {
    // Check for booking conflicts
    const [conflicts] = await pool.query(
      `SELECT id FROM bookings
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

    // ⭐ Check for maintenance periods
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
    // remove expired locks
    await pool.query(`DELETE FROM slot_locks WHERE expires_at < NOW()`);

    // check overlapping lock
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

    // insert new lock
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

    // check availability again (important)
    const [conflicts] = await conn.query(
      `SELECT id FROM bookings
       WHERE court_id = ?
       AND date = ?
       AND status IN ('booked', 'confirmed')
       AND start_time < ?
       AND end_time > ?`,
      [court_id, date, end_time, start_time]
    );

    if (conflicts.length > 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Time slot not available' });
    }

    // ⭐ Check for maintenance
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

    // court price
    const [[court]] = await conn.query(
      'SELECT price_per_hour FROM courts WHERE id = ?',
      [court_id]
    );

    // user coins & penalty
    const [[user]] = await conn.query(
      'SELECT coin_balance, penalty FROM users WHERE id = ?',
      [user_id]
    );

    // Calculate duration in hours
    const startTime = new Date(`1970-01-01 ${start_time}`);
    const endTime = new Date(`1970-01-01 ${end_time}`);
    const durationHours = (endTime - startTime) / (1000 * 60 * 60);
    
    // Separate base cost from penalty so the receipt can show them individually
    const baseCost    = court.price_per_hour * durationHours;
    const penaltyAmount = user.penalty || 0;
    const totalPrice  = baseCost + penaltyAmount;

    if (user.coin_balance < totalPrice) {
      await conn.rollback();
      return res.status(400).json({ message: 'Not enough coins' });
    }

    // deduct coins + reset penalty
    await conn.query(
      `UPDATE users
       SET coin_balance = coin_balance - ?, penalty = 0
       WHERE id = ?`,
      [totalPrice, user_id]
    );

    // create booking with status='booked' (not confirmed yet)
    const [result] = await conn.query(
      `INSERT INTO bookings
       (user_id, court_id, date, start_time, end_time, status, total_price)
       VALUES (?, ?, ?, ?, ?, 'booked', ?)`,
      [user_id, court_id, date, start_time, end_time, totalPrice]
    );

    // remove slot lock
    await conn.query(
      `DELETE FROM slot_locks
       WHERE court_id = ? AND date = ?`,
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
      // Return the breakdown so the frontend can show it on the receipt
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

    // cancel booking
    await conn.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = ?`,
      [bookingId]
    );

    // refund coins
    await conn.query(
      `UPDATE users
       SET coin_balance = coin_balance + ?
       WHERE id = ?`,
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

    const bookingEnd = new Date(`${booking.date} ${booking.end_time}`);
    const now = new Date();

    // Check if someone else has booked this court immediately after (same date, starts at our end_time)
    const [[nextBooking]] = await pool.query(
      `SELECT id FROM bookings
       WHERE court_id = ?
       AND date = ?
       AND start_time = ?
       AND status IN ('booked', 'confirmed')
       LIMIT 1`,
      [booking.court_id, booking.date, booking.end_time]
    );

    const isNextSlotBooked = !!nextBooking;

    // Penalty rules:
    // - Next slot IS booked by someone → any checkout past end_time triggers penalty
    // - Next slot is FREE              → 15-minute grace period before penalty
    const gracePeriodMs = isNextSlotBooked ? 0 : 15 * 60 * 1000;
    const penaltyThreshold = new Date(bookingEnd.getTime() + gracePeriodMs);

    if (now > penaltyThreshold) {
      // Penalty = 1 hour of the booked court's price
      const penaltyAmount = booking.price_per_hour;

      const reason = isNextSlotBooked
        ? `Late checkout from ${booking.court_name}. The next slot was already booked by another user.`
        : `Late checkout from ${booking.court_name}. Exceeded 15-minute grace period.`;

      // Add penalty to user's pending penalty balance
      await pool.query(
        `UPDATE users SET penalty = penalty + ? WHERE id = ?`,
        [penaltyAmount, booking.user_id]
      );

      // Record in penalties table for audit trail
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
   AUTO COMPLETE (CRON)
   Marks confirmed bookings as 'completed' once their end_time has passed
============================ */
exports.autoComplete = async (req, res) => {
  try {
    const [bookings] = await pool.query(
      `SELECT b.id, b.user_id, b.court_id, b.date, b.end_time,
              c.price_per_hour, c.name AS court_name
       FROM bookings b
       JOIN courts c ON b.court_id = c.id
       WHERE b.status = 'confirmed'
       AND NOW() > CONCAT(b.date, ' ', b.end_time)`
    );

    for (const b of bookings) {
      const now = new Date();
      const bookingEnd = new Date(`${b.date} ${b.end_time}`);
      const gracePeriodMs = 15 * 60 * 1000;

      // Check if the next slot on this court was booked by someone else
      const [[nextBooking]] = await pool.query(
        `SELECT id FROM bookings
         WHERE court_id = ?
         AND date = ?
         AND start_time = ?
         AND status IN ('booked', 'confirmed')
         LIMIT 1`,
        [b.court_id, b.date, b.end_time]
      );

      const isNextSlotBooked = !!nextBooking;
      const penaltyThreshold = new Date(bookingEnd.getTime() + (isNextSlotBooked ? 0 : gracePeriodMs));

      // If user never checked out and penalty threshold is exceeded → apply penalty
      if (now > penaltyThreshold) {
        const penaltyAmount = b.price_per_hour;
        const reason = isNextSlotBooked
          ? `Auto-completed: Did not check out from ${b.court_name}. Next slot was already booked.`
          : `Auto-completed: Did not check out from ${b.court_name}. Exceeded 15-minute grace period.`;

        await pool.query(
          `UPDATE users SET penalty = penalty + ? WHERE id = ?`,
          [penaltyAmount, b.user_id]
        );

        await pool.query(
          `INSERT INTO penalties (user_id, booking_id, type, description, amount, resolved)
           VALUES (?, ?, 'late_checkout', ?, ?, 0)`,
          [b.user_id, b.id, reason, penaltyAmount]
        );

        await createNotification(
          b.user_id,
          'Late Checkout Penalty',
          `You did not check out from ${b.court_name} on time. A penalty of ${penaltyAmount} coins will be charged on your next booking.`
        );
      }

      await pool.query(
        `UPDATE bookings SET status = 'completed' WHERE id = ?`,
        [b.id]
      );
    }

    res.json({ message: 'Auto-complete executed', completed: bookings.length });
  } catch (err) {
    console.error('❌ Auto-complete error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   6️⃣ AUTO NO-SHOW (15 MIN AFTER START)
============================ */
exports.autoNoShow = async (req, res) => {
  try {
    console.log('🔍 Checking for no-shows at:', new Date().toISOString());
    
    const [bookings] = await pool.query(
      `SELECT b.id, b.user_id, b.total_price, b.date, b.start_time, b.checked_in,
              b.court_id, c.price_per_hour, c.name AS court_name
       FROM bookings b
       JOIN courts c ON b.court_id = c.id
       WHERE b.status = 'booked'
       AND b.checked_in = FALSE
       AND NOW() > DATE_ADD(
         CONCAT(b.date, ' ', b.start_time),
         INTERVAL 15 MINUTE
       )`
    );

    console.log(`📊 Found ${bookings.length} no-show bookings`);

    for (const b of bookings) {
      console.log(`⚠️ Marking booking #${b.id} as no-show`);
      
      // Penalty = 1 hour of the booked court's price
      const penaltyAmount = b.price_per_hour;

      // mark as no-show
      await pool.query(
        `UPDATE bookings SET status = 'no_show' WHERE id = ?`,
        [b.id]
      );

      // NO REFUND for no-show — apply court-based penalty
      await pool.query(
        `UPDATE users SET penalty = penalty + ? WHERE id = ?`,
        [penaltyAmount, b.user_id]
      );

      // Record in penalties table for audit trail
      await pool.query(
        `INSERT INTO penalties (user_id, booking_id, type, description, amount, resolved)
         VALUES (?, ?, 'no_show', ?, ?, 0)`,
        [
          b.user_id,
          b.id,
          `No-show for booking at ${b.court_name}. 1-hour court fee penalty applied.`,
          penaltyAmount
        ]
      );

      await createNotification(
        b.user_id,
        'No-Show Penalty',
        `You did not check in for your booking at ${b.court_name}. A penalty of ${penaltyAmount} coins (1-hour court fee) will be charged on your next booking. No refund has been issued.`
      );
      
      console.log(`✅ Booking #${b.id} marked as no-show, penalty of ${penaltyAmount} coins applied`);
    }

    res.json({
      message: 'Auto no-show executed',
      no_shows: bookings.length,
      bookings: bookings.map(b => ({ id: b.id, date: b.date, start_time: b.start_time, penalty_applied: b.price_per_hour }))
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

    // Check if it's the appointment date
    const bookingDate = new Date(booking.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    bookingDate.setHours(0, 0, 0, 0);

    // Only prevent confirming past bookings, allow future bookings
    if (bookingDate.getTime() < today.getTime()) {
      return res.status(400).json({ error: "Cannot confirm past bookings" });
    }

    // Generate QR code text
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
   8️⃣ CHECK-IN (DEPRECATED - Use confirmBooking instead)
============================ */
exports.checkIn = async (req, res) => {
  const bookingId = req.params.id;

  try {
    const [result] = await pool.query(
      `UPDATE bookings
       SET checked_in = 1
       WHERE id = ? AND status = 'confirmed'`,
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