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
       AND status = 'booked'
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
       AND status = 'booked'
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

    const totalPrice = court.price_per_hour + user.penalty;

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

    // create booking
    await conn.query(
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
    res.json({ message: 'Booking paid & confirmed' });

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
      `SELECT total_price
       FROM bookings
       WHERE id = ? AND user_id = ? AND status = 'booked'`,
      [bookingId, user_id]
    );

    if (!booking) {
      await conn.rollback();
      return res.status(404).json({ message: 'Booking not found' });
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
      'Your booking has been cancelled.'
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
       WHERE id = ? AND status = 'booked'`,
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const bookingEnd = new Date(`${booking.date} ${booking.end_time}`);
    const now = new Date();

    // late checkout (> 15 minutes)
    if (now > new Date(bookingEnd.getTime() + 15 * 60000)) {
      await pool.query(
        `UPDATE users SET penalty = penalty + 50 WHERE id = ?`,
        [booking.user_id]
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
   6️⃣ AUTO CANCEL NO CHECK-IN
============================ */
exports.autoCancelNoCheckIn = async (req, res) => {
  try {
    const [bookings] = await pool.query(
      `SELECT id, user_id, total_price
       FROM bookings
       WHERE status = 'booked'
       AND checked_in = FALSE
       AND NOW() > DATE_ADD(
         CONCAT(date, ' ', start_time),
         INTERVAL 15 MINUTE
       )`
    );

    for (const b of bookings) {
      // cancel booking
      await pool.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = ?`,
        [b.id]
      );

      // refund coins
      await pool.query(
        `UPDATE users
         SET coin_balance = coin_balance + ?
         WHERE id = ?`,
        [b.total_price, b.user_id]
      );

      await createNotification(
        b.user_id,
        'Booking Auto Cancelled',
        'You did not check in within 15 minutes. Penalty applied.'
      );
    }

    res.json({
      message: 'Auto cancel executed',
      cancelled: bookings.length
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   7️⃣ CONFIRM BOOKING + QR & PDF
============================ */
exports.confirmBooking = async (req, res) => {
  const { bookingId } = req.body;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM bookings WHERE id = ?",
      [bookingId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = rows[0];

    const qrText = `BOOKING-${booking.id}`;
    const qrCode = await generateQRCode(qrText);
    const pdfReceipt = generatePDF(booking);

    await pool.query(
      "UPDATE bookings SET status='confirmed', qr_code=? WHERE id=?",
      [qrText, booking.id]
    );

    await createNotification(
      booking.user_id,
      'Booking Confirmed',
      `Your booking for court ${booking.court_id} is confirmed.`
    );

    res.json({
      message: "Booking confirmed",
      qr_code: qrCode,
      pdf: pdfReceipt
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Confirm booking failed" });
  }
};

/* ============================
   8️⃣ CHECK-IN
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
