import express from 'express';
import * as adminController from '../controllers/admin.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';

const router = express.Router();

// 所有 admin 路由均需双重检查：已登录 + 是管理员
router.use(authMiddleware, adminMiddleware);

router.get('/users', adminController.getAllUsers);
router.post('/users/license', adminController.updateUserLicense);
router.get('/settings', adminController.getSystemSettings);
router.post('/settings', adminController.updateSystemSettings);
router.post('/license/generate', adminController.generateLicense);

export default router;
