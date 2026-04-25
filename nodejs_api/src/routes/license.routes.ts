import express from 'express';
import * as licenseController from '../controllers/license.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = express.Router();

/**
 * 商业授权模块路由
 * 全量挂载 authMiddleware，确保所有授权相关的操作都基于用户账号进行
 */
router.use(authMiddleware);

/**
 * @route   POST /api/v1/license/activate
 * @desc    提交激活码并绑定到当前登录账号
 */
router.post('/activate', licenseController.activate);

/**
 * @route   GET /api/v1/license/status
 * @desc    获取当前账号的授权级别和效期
 */
router.get('/status', licenseController.getStatus);

export default router;
