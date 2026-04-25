-- A Materialized View to pre-join k-line and indicator data for faster querying.
-- The actual backtesting logic involving window functions (LEAD/LAG) will be constructed
-- dynamically in the Node.js API layer, as Doris Materialized Views have limitations
-- with such complex, non-additive aggregations.

CREATE MATERIALIZED VIEW kline_with_indicators_mv
BUILD IMMEDIATE REFRESH AUTO ON SCHEDULE EVERY 10 MINUTE
DISTRIBUTED BY HASH(`symbol`, `period`)
PROPERTIES (
    "replication_allocation" = "tag.location.default: 1"
)
AS
SELECT
    k.symbol,
    k.period,
    k.timestamp,
    k.open,
    k.high,
    k.low,
    k.close,
    k.volume,
    i.ma5,
    i.ma10,
    i.ma20,
    i.ma60,
    i.boll_upper,
    i.boll_middle,
    i.boll_lower,
    i.macd_diff,
    i.macd_dea,
    i.macd_hist,
    i.kdj_k,
    i.kdj_d,
    i.kdj_j,
    i.rsi6,
    i.rsi12,
    i.rsi24,
    i.cci,
    i.bias6,
    i.bias12,
    i.bias24,
    i.trix,
    i.trix_ma,
    i.dpo,
    i.bbi,
    i.lon
FROM kline AS k
LEFT JOIN indicators AS i 
    ON k.symbol = i.symbol 
    AND k.period = i.period 
    AND k.timestamp = i.timestamp;

-- =======================================================================================
-- The following is a conceptual example of the dynamic SQL that the Node.js API would
-- generate to perform a backtest on a 'Golden Cross' signal (MA5 > MA10).
-- This is NOT part of the Materialized View definition.
/*
WITH SignalData AS (
    SELECT
        timestamp,
        symbol,
        close,
        ma5,
        ma10,
        -- Use LAG to get the previous period's state
        LAG(ma5, 1) OVER (PARTITION BY symbol, period ORDER BY timestamp) AS prev_ma5,
        LAG(ma10, 1) OVER (PARTITION BY symbol, period ORDER BY timestamp) AS prev_ma10,
        -- Use LEAD to get future close prices for probability calculation
        -- Assuming '1m' is the base period. The numbers (5, 15, 30, 60) would be adjusted
        -- based on the period of the kline_with_indicators_mv view being queried.
        LEAD(close, 5) OVER (PARTITION BY symbol, period ORDER BY timestamp) AS close_5_periods,
        LEAD(close, 15) OVER (PARTITION BY symbol, period ORDER BY timestamp) AS close_15_periods,
        LEAD(close, 30) OVER (PARTITION BY symbol, period ORDER BY timestamp) AS close_30_periods,
        LEAD(close, 60) OVER (PARTITION BY symbol, period ORDER BY timestamp) AS close_60_periods
    FROM kline_with_indicators_mv
    WHERE symbol = 'BTC_USDT' AND period = '1m' AND timestamp >= '2023-01-01' AND timestamp < '2024-01-01'
),
TriggeredSignals AS (
    SELECT
        *,
        (close_5_periods - close) / close AS return_5,
        (close_15_periods - close) / close AS return_15,
        (close_30_periods - close) / close AS return_30,
        (close_60_periods - close) / close AS return_60
    FROM SignalData
    WHERE
        prev_ma5 IS NOT NULL AND prev_ma10 IS NOT NULL
        AND prev_ma5 <= prev_ma10 -- Condition before
        AND ma5 > ma10           -- Condition now (the trigger)
)
SELECT
    'GoldenCross_1m_MA5_cross_MA10' AS strategy_name,
    COUNT(*) AS sample_size,
    
    -- 5-period window analysis
    AVG(return_5) AS avg_return_5_periods,
    SUM(CASE WHEN return_5 > 0 THEN 1 ELSE 0 END) AS up_count_5_periods,
    SUM(CASE WHEN return_5 <= 0 THEN 1 ELSE 0 END) AS down_count_5_periods,
    SUM(CASE WHEN return_5 > 0 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS up_probability_5_periods,

    -- 15-period window analysis
    AVG(return_15) AS avg_return_15_periods,
    SUM(CASE WHEN return_15 > 0 THEN 1 ELSE 0 END) AS up_count_15_periods,
    SUM(CASE WHEN return_15 <= 0 THEN 1 ELSE 0 END) AS down_count_15_periods,
    SUM(CASE WHEN return_15 > 0 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS up_probability_15_periods

    -- ... and so on for 30 and 60 periods
FROM TriggeredSignals;
*/
