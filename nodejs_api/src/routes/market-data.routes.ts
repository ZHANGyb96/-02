import express from 'express';
import * as marketDataController from '../controllers/market-data.controller';

const router = express.Router();

/**
 * 路由说明：身份与授权中间件已在 index.ts 中统一挂载
 * 此处仅定义业务路径
 */

/**
 * @route   GET /api/v1/market-data/symbols
 * @desc    获取所有可用的交易品种代码
 */
router.get('/symbols', marketDataController.getSymbols);

/**
 * @route   GET /api/v1/market-data/:stockCode/kline
 * @desc    获取K线数据
 */
router.get('/:stockCode/kline', marketDataController.getKlineData);

/**
 * @route   GET /api/v1/market-data/:stockCode/aggregate
 * @desc    获取聚合指标
 */
router.get('/:stockCode/aggregate', marketDataController.getAggregateData);

/**
 * @route   DELETE /api/v1/market-data/:stockCode
 * @desc    删除指定品种的所有K线数据
 */
router.delete('/:stockCode', marketDataController.deleteSymbolData);

export default router;
