const { Router } = require('express');
const db = require('../db');

const router = Router();

router.get('/', async (req, res) => {
  if (req.query.check === 'db') {
    try {
      await db.query('SELECT 1');
      return res.status(200).json({ status: 'ok', database: 'connected' });
    } catch {
      return res.status(503).json({ status: 'degraded', database: 'unavailable' });
    }
  }
  return res.status(200).json({ status: 'ok' });
});

router.get('/ready', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    return res.status(200).json({ status: 'ready', database: 'connected' });
  } catch {
    return res.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});

module.exports = router;
