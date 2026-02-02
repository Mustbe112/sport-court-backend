const pool = require('../config/db');
const { generateQRCode, generatePDF } = require("../utils/bookingUtils");
const { createNotification } = require('../utils/notificationUtils');

/* ============================
   1️⃣ CHECK AVAILABILITY
============================ */
exports.checkAvailability = async (req, res) => {
  const { court_id, date, start_time, end_time } = req.body;

  try {
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
      return res.json({ available: false });
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
    
    // Calculate total price: (price per hour × hours) + penalty
    const totalPrice = (court.price_per_hour * durationHours) + user.penalty;

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
      booking_id: result.insertId
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
      `SELECT user_id, date, end_time
       FROM bookings
       WHERE id = ? AND status = 'confirmed'`,
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or not confirmed' });
    }

    const bookingEnd = new Date(`${booking.date} ${booking.end_time}`);
    const now = new Date();

    // late checkout (> 15 minutes)
    if (now > new Date(bookingEnd.getTime() + 15 * 60000)) {
      await pool.query(
        `UPDATE users SET penalty = penalty + 50 WHERE id = ?`,
        [booking.user_id]
      );
      
      await createNotification(
        booking.user_id,
        'Late Checkout Penalty',
        'You checked out late. A 50 coin penalty has been applied.'
      );
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
   6️⃣ AUTO NO-SHOW (15 MIN AFTER START)
============================ */
exports.autoNoShow = async (req, res) => {
  try {
    console.log('🔍 Checking for no-shows at:', new Date().toISOString());
    
    const [bookings] = await pool.query(
      `SELECT id, user_id, total_price, date, start_time, checked_in
       FROM bookings
       WHERE status = 'booked'
       AND checked_in = FALSE
       AND NOW() > DATE_ADD(
         CONCAT(date, ' ', start_time),
         INTERVAL 15 MINUTE
       )`
    );

    console.log(`📊 Found ${bookings.length} no-show bookings`);

    for (const b of bookings) {
      console.log(`⚠️ Marking booking #${b.id} as no-show`);
      
      // mark as no-show
      await pool.query(
        `UPDATE bookings SET status = 'no_show' WHERE id = ?`,
        [b.id]
      );

      // NO REFUND for no-show
      // Apply penalty
      await pool.query(
        `UPDATE users SET penalty = penalty + 100 WHERE id = ?`,
        [b.user_id]
      );

      await createNotification(
        b.user_id,
        'No-Show Penalty',
        'You did not check in for your booking. A 100 coin penalty has been applied and no refund issued.'
      );
      
      console.log(`✅ Booking #${b.id} marked as no-show, penalty applied`);
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