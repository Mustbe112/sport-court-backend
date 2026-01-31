const pool = require('../config/db');
const { generateQRCode } = require("../utils/bookingUtils");
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
       AND status IN ('pending', 'booked', 'confirmed')
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
   2️⃣ CREATE BOOKING (Now creates PENDING status)
============================ */
exports.createBooking = async (req, res) => {
  const { court_id, date, start_time, end_time } = req.body;
  const user_id = req.user.id;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Check if user is suspended
    const [[user]] = await conn.query(
      'SELECT suspended_until, suspension_reason, coin_balance, penalty FROM users WHERE id = ?',
      [user_id]
    );

    if (user.suspended_until) {
      const suspensionDate = new Date(user.suspended_until);
      const today = new Date();
      if (suspensionDate > today) {
        await conn.rollback();
        return res.status(403).json({ 
          message: `Account suspended until ${suspensionDate.toDateString()}. Reason: ${user.suspension_reason}` 
        });
      }
    }

    // Check availability
    const [conflicts] = await conn.query(
      `SELECT id FROM bookings
       WHERE court_id = ?
       AND date = ?
       AND status IN ('pending', 'booked', 'confirmed')
       AND start_time < ?
       AND end_time > ?`,
      [court_id, date, end_time, start_time]
    );

    if (conflicts.length > 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Time slot not available' });
    }

    // Get court price
    const [[court]] = await conn.query(
      'SELECT price_per_hour FROM courts WHERE id = ?',
      [court_id]
    );

    const totalPrice = court.price_per_hour + user.penalty;

    if (user.coin_balance < totalPrice) {
      await conn.rollback();
      return res.status(400).json({ message: 'Not enough coins' });
    }

    // Deduct coins + reset penalty
    await conn.query(
      `UPDATE users
       SET coin_balance = coin_balance - ?, penalty = 0
       WHERE id = ?`,
      [totalPrice, user_id]
    );

    // Create booking with PENDING status
    const [result] = await conn.query(
      `INSERT INTO bookings
       (user_id, court_id, date, start_time, end_time, status, total_price)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [user_id, court_id, date, start_time, end_time, totalPrice]
    );

    const bookingId = result.insertId;

    // Create admin notification
    await conn.query(
      `INSERT INTO admin_notifications (booking_id, type, message)
       VALUES (?, 'new_booking', ?)`,
      [bookingId, `New booking request from user #${user_id} for ${date}`]
    );

    await conn.commit();
    
    await createNotification(
      user_id,
      'Booking Request Submitted',
      'Your booking request has been submitted. Please wait for admin approval.'
    );
    
    res.json({ 
      message: 'Booking request submitted. Awaiting admin approval.',
      booking_id: bookingId,
      status: 'pending'
    });

  } catch (err) {
    await conn.rollback();
    console.error('CREATE BOOKING ERROR:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

/* ============================
   3️⃣ ADMIN APPROVE BOOKING (Generates QR Code)
============================ */
exports.approveBooking = async (req, res) => {
  const bookingId = req.params.id;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[booking]] = await conn.query(
      "SELECT * FROM bookings WHERE id = ? AND status = 'pending'",
      [bookingId]
    );

    if (!booking) {
      await conn.rollback();
      return res.status(404).json({ error: "Booking not found or already processed" });
    }

    // Generate QR code with timestamp
    const qrText = `BOOKING-${booking.id}-${Date.now()}`;
    
    // Set QR validity window (from booking start time to end time)
    const qrValidFrom = `${booking.date} ${booking.start_time}`;
    const qrValidUntil = `${booking.date} ${booking.end_time}`;

    await conn.query(
      `UPDATE bookings 
       SET status='booked', qr_code=?, qr_valid_from=?, qr_valid_until=?
       WHERE id=?`,
      [qrText, qrValidFrom, qrValidUntil, booking.id]
    );

    // Mark admin notification as read
    await conn.query(
      `UPDATE admin_notifications SET is_read=1 WHERE booking_id=?`,
      [bookingId]
    );

    await conn.commit();

    await createNotification(
      booking.user_id,
      'Booking Approved',
      `Your booking for ${booking.date} has been approved! Check your receipt for the QR code.`
    );

    res.json({
      message: "Booking approved and QR code generated",
      booking_id: booking.id,
      qr_code: qrText
    });

  } catch (err) {
    await conn.rollback();
    console.error('APPROVE BOOKING ERROR:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

/* ============================
   4️⃣ ADMIN REJECT BOOKING (Full refund)
============================ */
exports.rejectBooking = async (req, res) => {
  const bookingId = req.params.id;
  const { reason } = req.body;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[booking]] = await conn.query(
      "SELECT * FROM bookings WHERE id = ? AND status = 'pending'",
      [bookingId]
    );

    if (!booking) {
      await conn.rollback();
      return res.status(404).json({ error: "Booking not found or already processed" });
    }

    // Refund user
    await conn.query(
      `UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?`,
      [booking.total_price, booking.user_id]
    );

    // Cancel booking
    await conn.query(
      `UPDATE bookings SET status='cancelled' WHERE id=?`,
      [bookingId]
    );

    // Mark admin notification as read
    await conn.query(
      `UPDATE admin_notifications SET is_read=1 WHERE booking_id=?`,
      [bookingId]
    );

    await conn.commit();

    await createNotification(
      booking.user_id,
      'Booking Rejected',
      `Your booking request was rejected. Reason: ${reason || 'Not specified'}. Full refund issued.`
    );

    res.json({ message: "Booking rejected and refunded" });

  } catch (err) {
    await conn.rollback();
    console.error('REJECT BOOKING ERROR:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

/* ============================
   5️⃣ VALIDATE QR CODE (Check-in)
============================ */
exports.validateQR = async (req, res) => {
  const { qr_code } = req.body;

  try {
    const [[booking]] = await pool.query(
      `SELECT * FROM bookings 
       WHERE qr_code = ? AND status = 'booked'`,
      [qr_code]
    );

    if (!booking) {
      return res.status(404).json({ 
        valid: false,
        message: "Invalid QR code or booking not found" 
      });
    }

    // Check if already used
    if (booking.qr_used_at) {
      return res.status(400).json({ 
        valid: false,
        message: "QR code already used" 
      });
    }

    // Check time validity
    const now = new Date();
    const validFrom = new Date(booking.qr_valid_from);
    const validUntil = new Date(booking.qr_valid_until);

    if (now < validFrom) {
      return res.status(400).json({ 
        valid: false,
        message: `QR code not yet valid. Valid from ${validFrom.toLocaleString()}` 
      });
    }

    if (now > validUntil) {
      return res.status(400).json({ 
        valid: false,
        message: "QR code expired. Booking time has passed." 
      });
    }

    // Valid QR code - Mark as confirmed and used
    await pool.query(
      `UPDATE bookings 
       SET status='confirmed', checked_in=1, qr_used_at=NOW()
       WHERE id=?`,
      [booking.id]
    );

    res.json({
      valid: true,
      message: "Check-in successful",
      booking: {
        id: booking.id,
        court_id: booking.court_id,
        user_id: booking.user_id,
        date: booking.date,
        start_time: booking.start_time,
        end_time: booking.end_time
      }
    });

  } catch (err) {
    console.error('QR VALIDATION ERROR:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   6️⃣ AUTO-COMPLETE BOOKINGS
============================ */
exports.autoCompleteBookings = async (req, res) => {
  try {
    console.log('🔍 Auto-completing bookings...');
    
    const [bookings] = await pool.query(
      `SELECT id, user_id, date, end_time
       FROM bookings
       WHERE status = 'confirmed'
       AND NOW() > CONCAT(date, ' ', end_time)`
    );

    console.log(`📊 Found ${bookings.length} bookings to complete`);

    for (const b of bookings) {
      await pool.query(
        `UPDATE bookings SET status = 'completed' WHERE id = ?`,
        [b.id]
      );

      await createNotification(
        b.user_id,
        'Booking Completed',
        'Your booking session has ended. Thank you for using our facilities!'
      );
      
      console.log(`✅ Booking #${b.id} marked as completed`);
    }

    res.json({
      message: 'Auto-complete executed',
      completed: bookings.length
    });

  } catch (err) {
    console.error('❌ Auto-complete error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   7️⃣ APPLY PENALTY
============================ */
exports.applyPenalty = async (req, res) => {
  const { user_id, booking_id, type, description, amount, suspension_days } = req.body;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Record penalty
    await conn.query(
      `INSERT INTO penalties (user_id, booking_id, type, description, amount)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, booking_id, type, description, amount]
    );

    // Apply fine
    if (amount > 0) {
      await conn.query(
        `UPDATE users SET penalty = penalty + ? WHERE id = ?`,
        [amount, user_id]
      );
    }

    // Apply suspension
    if (suspension_days > 0) {
      const suspensionUntil = new Date();
      suspensionUntil.setDate(suspensionUntil.getDate() + suspension_days);
      
      await conn.query(
        `UPDATE users 
         SET suspended_until = ?, suspension_reason = ?
         WHERE id = ?`,
        [suspensionUntil.toISOString().split('T')[0], type, user_id]
      );
    }

    await conn.commit();

    await createNotification(
      user_id,
      'Penalty Applied',
      `A penalty has been applied to your account. Type: ${type}. ${description}`
    );

    res.json({ message: 'Penalty applied successfully' });

  } catch (err) {
    await conn.rollback();
    console.error('APPLY PENALTY ERROR:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

/* ============================
   EXISTING FUNCTIONS (Updated)
============================ */

// Cancel booking - users can only cancel PENDING bookings
exports.cancelBooking = async (req, res) => {
  const bookingId = req.params.id;
  const user_id = req.user.id;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[booking]] = await conn.query(
      `SELECT total_price, status
       FROM bookings
       WHERE id = ? AND user_id = ? AND status = 'pending'`,
      [bookingId, user_id]
    );

    if (!booking) {
      await conn.rollback();
      return res.status(404).json({ 
        message: 'Booking not found or cannot be cancelled (only pending bookings can be cancelled by users)' 
      });
    }

    // Cancel booking
    await conn.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = ?`,
      [bookingId]
    );

    // Refund coins
    await conn.query(
      `UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?`,
      [booking.total_price, user_id]
    );

    await conn.commit();
    
    await createNotification(
      user_id,
      'Booking Cancelled',
      'Your booking request has been cancelled and refunded.'
    );
    
    res.json({ message: 'Booking cancelled & refunded' });

  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// Get user bookings
exports.getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [bookings] = await pool.query(`
      SELECT 
        b.*,
        c.name as court_name,
        c.type as court_type
      FROM bookings b
      LEFT JOIN courts c ON b.court_id = c.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `, [userId]);
    
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

// Get single booking
exports.getBookingById = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;
    
    const [bookings] = await pool.query(`
      SELECT 
        b.*,
        c.name as court_name,
        c.type as court_type
      FROM bookings b
      LEFT JOIN courts c ON b.court_id = c.id
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