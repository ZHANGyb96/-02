import express from 'express';
import * as dataController from '../controllers/data.controller';

const router = express.Router();

/**
 * @route   POST /api/v1/data/sync
 * @desc    从远程源获取单品种数据并触发处理
 */
router.post('/sync', dataController.syncData);

/**
 * @route   POST /api/v1/data/sync-all
 * @desc    一键增量更新库内所有品种
 */
router.post('/sync-all', dataController.syncAllData);

export default router;
