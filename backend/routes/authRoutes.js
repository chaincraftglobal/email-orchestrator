import express from 'express';
import { login, verifyToken } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login - Login endpoint
router.post('/login', login);

// GET /api/auth/verify - Verify if token is valid
router.get('/verify', authenticateToken, verifyToken);

export default router;