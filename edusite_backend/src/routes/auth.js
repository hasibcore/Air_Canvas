const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const config = require('../config');
const db = require('../db');

const router = Router();

// Pre-computed dummy bcrypt hash ($2b$12) for constant-time comparison when account does not exist
const DUMMY_PASSWORD_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKxGhu6P6C7mQ8J2P8xX8R2kU4tQqv7w5K9mK';

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  fullName: z.string().trim().min(2).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

router.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);

    const result = await db.query(
      'INSERT INTO app_users (email, full_name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, full_name, created_at',
      [input.email.toLowerCase(), input.fullName, passwordHash],
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    return next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await db.query(
      'SELECT id, email, password_hash FROM app_users WHERE email = $1 LIMIT 1',
      [input.email.toLowerCase()],
    );

    const user = result.rowCount > 0 ? result.rows[0] : null;
    const targetHash = user ? user.password_hash : DUMMY_PASSWORD_HASH;
    const isMatch = await bcrypt.compare(input.password, targetHash);

    if (!user || !isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { email: user.email },
      config.jwtSecret,
      { subject: String(user.id), expiresIn: config.jwtExpiresIn, algorithm: 'HS256' },
    );

    return res.status(200).json({ token });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
