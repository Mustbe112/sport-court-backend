const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/* ============================
   REGISTER
============================ */
exports.register = async (req, res) => {
  const { name, email, password, recovery_id } = req.body;

  try {
    if (!recovery_id || recovery_id.trim().length < 4) {
      return res.status(400).json({ message: 'Recovery ID must be at least 4 characters' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword  = await bcrypt.hash(password, 10);
    const hashedRecoveryId = await bcrypt.hash(recovery_id.trim(), 10);

    await pool.query(
      'INSERT INTO users (name, email, password_hash, recovery_id, recovery_id_plain) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, hashedRecoveryId, recovery_id.trim()]
    );

    res.json({ message: 'Registration successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   LOGIN
============================ */
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check if user logged in with a temp password (admin reset)
    const usedTempPassword = user.temp_password
      ? await bcrypt.compare(password, await bcrypt.hash(user.temp_password, 10).then(() => user.password_hash).catch(() => ''))
      : false;

    // Simpler check: if temp_password exists and matches what was stored
    const isTempLogin = !!user.temp_password && (password === user.temp_password);

    if (isTempLogin) {
      // Clear temp_password immediately — one time use only
      await pool.query(
        'UPDATE users SET temp_password = NULL WHERE id = ?',
        [user.id]
      );
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      force_reset: isTempLogin,   // tells frontend to redirect to reset page
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        coin_balance: user.coin_balance
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   FORGOT PASSWORD — Step 1
   Verify email + recovery ID, then reset password
============================ */
exports.forgotPassword = async (req, res) => {
  const { email, recovery_id, new_password } = req.body;

  try {
    const [[user]] = await pool.query(
      'SELECT id, recovery_id, password_reset_pending FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      return res.status(404).json({ message: 'Email not found' });
    }

    // Check if admin has flagged this account as reset pending
    if (user.password_reset_pending) {
      return res.status(400).json({ 
        message: 'Your account is pending admin reset. Please wait for admin to reset your account.',
        pending: true
      });
    }

    if (!user.recovery_id) {
      return res.status(400).json({ message: 'No recovery ID set for this account. Please contact admin.' });
    }

    const match = await bcrypt.compare(recovery_id.trim(), user.recovery_id);
    if (!match) {
      return res.status(400).json({ message: 'Incorrect Recovery ID' });
    }

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hashedPassword, user.id]
    );

    res.json({ message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   CHECK RESET STATUS
   Frontend polls this to know when admin has reset the account
============================ */
exports.checkResetStatus = async (req, res) => {
  const { email } = req.params;

  try {
    const [[user]] = await pool.query(
      'SELECT password_reset_pending, temp_password, recovery_id_plain FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.temp_password) {
      // Admin has reset — return the temp password so user can log in
      return res.json({
        ready: true,
        temp_password: user.temp_password,
        recovery_id: user.recovery_id_plain
      });
    }

    res.json({ ready: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   REQUEST ADMIN RESET
   User submits request when they forgot both password and recovery ID
============================ */
exports.requestAdminReset = async (req, res) => {
  const { email } = req.body;

  try {
    const [[user]] = await pool.query(
      'SELECT id, password_reset_pending FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      return res.status(404).json({ message: 'Email not found' });
    }

    if (user.password_reset_pending) {
      return res.json({ message: 'Reset request already submitted. Please wait for admin.' });
    }

    await pool.query(
      'UPDATE users SET password_reset_pending = 1 WHERE id = ?',
      [user.id]
    );

    res.json({ message: 'Reset request submitted. Please wait for admin to reset your account.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllCourts = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM courts');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   RESET CREDENTIALS (after admin reset)
   User sets their own new password + recovery ID
============================ */
exports.resetCredentials = async (req, res) => {
  const { new_password, new_recovery_id } = req.body;
  const user_id = req.user.id;

  try {
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    if (!new_recovery_id || new_recovery_id.trim().length < 4) {
      return res.status(400).json({ message: 'Recovery ID must be at least 4 characters' });
    }

    const hashedPassword   = await bcrypt.hash(new_password, 10);
    const hashedRecoveryId = await bcrypt.hash(new_recovery_id.trim(), 10);

    await pool.query(
      `UPDATE users 
       SET password_hash = ?, 
           recovery_id = ?,
           recovery_id_plain = ?,
           temp_password = NULL,
           password_reset_pending = 0
       WHERE id = ?`,
      [hashedPassword, hashedRecoveryId, new_recovery_id.trim(), user_id]
    );

    res.json({ message: 'Credentials updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   CHECK SUSPENSION STATUS (user)
============================ */
exports.getSuspensionStatus = async (req, res) => {
  const user_id = req.user.id;
  try {
    const [[user]] = await pool.query(
      `SELECT suspended_until, suspension_reason FROM users WHERE id = ?`,
      [user_id]
    );

    if (!user.suspended_until || new Date(user.suspended_until) <= new Date()) {
      return res.json({ suspended: false });
    }

    // Check if user has a pending appeal
    const [[appeal]] = await pool.query(
      `SELECT id, status FROM appeals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      [user_id]
    );

    // Count late checkouts
    const [[lateCount]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM penalties
       WHERE user_id = ? AND type = 'late_checkout'`,
      [user_id]
    );

    res.json({
      suspended: true,
      suspended_until: user.suspended_until,
      suspension_reason: user.suspension_reason,
      late_checkout_count: lateCount.cnt,
      appeal: appeal || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   SUBMIT APPEAL (user)
============================ */
exports.submitAppeal = async (req, res) => {
  const user_id = req.user.id;
  const { message } = req.body;

  try {
    if (!message || message.trim().length < 10) {
      return res.status(400).json({ message: 'Appeal message must be at least 10 characters' });
    }

    // Check if already has a pending appeal
    const [[existing]] = await pool.query(
      `SELECT id FROM appeals WHERE user_id = ? AND status = 'pending'`,
      [user_id]
    );

    if (existing) {
      return res.status(400).json({ message: 'You already have a pending appeal. Please wait for admin review.' });
    }

    await pool.query(
      `INSERT INTO appeals (user_id, message) VALUES (?, ?)`,
      [user_id, message.trim()]
    );

    res.json({ message: 'Appeal submitted successfully. Admin will review it shortly.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};