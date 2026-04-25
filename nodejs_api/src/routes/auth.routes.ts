import express from 'express';
import * as authController from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = express.Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    注册新用户
 * @access  Public
 */
router.post('/register', authController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    用户登录并获取 JWT
 * @access  Public
 */
router.post('/login', authController.login);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    获取当前登录用户信息
 * @access  Private
 */
router.get('/profile', authMiddleware, authController.getProfile);

export default router;
