-- AlphaScan AI - Apache Doris DDL
-- This script sets up the database and tables for storing market data and indicators.

-- Create Database
CREATE DATABASE IF NOT EXISTS alphascan;

USE alphascan;

-- Main table for K-line and indicator data across all periods
-- This table is designed for high-performance time-series analysis.
-- Engine: AGGREGATE with REPLACE allows for data updates and corrections (e.g., reprocessing history).
-- Partitioning: Dynamic partitioning by day on 'datetime' enables efficient time-based queries and data lifecycle management.
-- Distribution: Hashing on 'symbol' ensures even data distribution across BE nodes for query parallelism.
CREATE TABLE IF NOT EXISTS alphascan.kline_indicators (
    -- Core Keys
    `symbol`        VARCHAR(32)         COMMENT 'Trading symbol, e.g., 600519.SH or BTCUSDT',
    `period`        VARCHAR(10)         COMMENT 'Time period, e.g., 1m, 5m, 1h, 1d',
    `datetime`      DATETIME(3)         COMMENT 'Start time of the K-line bar, with millisecond precision',

    -- K-line Data
    `open`          DECIMAL(18, 8)      REPLACE COMMENT 'Opening price',
    `high`          DECIMAL(18, 8)      REPLACE COMMENT 'Highest price',
    `low`           DECIMAL(18, 8)      REPLACE COMMENT 'Lowest price',
    `close`         DECIMAL(18, 8)      REPLACE COMMENT 'Closing price',
    `volume`        DECIMAL(24, 8)      REPLACE COMMENT 'Trading volume',
    `turnover`      DECIMAL(30, 8)      REPLACE COMMENT 'Trading turnover (amount)',

    -- 主图指标 (Main Indicators)
    `ma5`           DECIMAL(18, 8) NULL REPLACE COMMENT '5-period Moving Average',
    `ma10`          DECIMAL(18, 8) NULL REPLACE COMMENT '10-period Moving Average',
    `ma20`          DECIMAL(18, 8) NULL REPLACE COMMENT '20-period Moving Average',
    `ma60`          DECIMAL(18, 8) NULL REPLACE COMMENT '60-period Moving Average',
    `ma120`         DECIMAL(18, 8) NULL REPLACE COMMENT '120-period Moving Average',
    `ls_line`       DECIMAL(18, 8) NULL REPLACE COMMENT '多空线 (Long/Short Trend Line)',

    -- 副图指标 (Sub-chart Indicators)
    `boll_upper`    DECIMAL(18, 8) NULL REPLACE COMMENT 'Bollinger Bands - Upper Band',
    `boll_mid`      DECIMAL(18, 8) NULL REPLACE COMMENT 'Bollinger Bands - Middle Band',
    `boll_lower`    DECIMAL(18, 8) NULL REPLACE COMMENT 'Bollinger Bands - Lower Band',
    `macd_diff`     DECIMAL(18, 8) NULL REPLACE COMMENT 'MACD - DIFF line',
    `macd_dea`      DECIMAL(18, 8) NULL REPLACE COMMENT 'MACD - DEA line',
    `macd_hist`     DECIMAL(18, 8) NULL REPLACE COMMENT 'MACD - Histogram bar',
    `kdj_k`         DECIMAL(18, 8) NULL REPLACE COMMENT 'KDJ - K value',
    `kdj_d`         DECIMAL(18, 8) NULL REPLACE COMMENT 'KDJ - D value',
    `kdj_j`         DECIMAL(18, 8) NULL REPLACE COMMENT 'KDJ - J value',
    `rsi6`          DECIMAL(18, 8) NULL REPLACE COMMENT 'RSI (6-period)',
    `rsi12`         DECIMAL(18, 8) NULL REPLACE COMMENT 'RSI (12-period)',
    `rsi24`         DECIMAL(18, 8) NULL REPLACE COMMENT 'RSI (24-period)',
    `cci`           DECIMAL(18, 8) NULL REPLACE COMMENT 'CCI (Commodity Channel Index)',
    `bias`          DECIMAL(18, 8) NULL REPLACE COMMENT 'BIAS (Bias Ratio)',
    `trix`          DECIMAL(18, 8) NULL REPLACE COMMENT 'TRIX (Triple Exponential Average)',
    `trix_ma`       DECIMAL(18, 8) NULL REPLACE COMMENT 'TRIX Moving Average',
    `dpo`           DECIMAL(18, 8) NULL REPLACE COMMENT 'DPO (Detrended Price Oscillator)',
    `lon`           DECIMAL(18, 8) NULL REPLACE COMMENT 'LON (placeholder for custom indicator)'
)
AGGREGATE KEY(`symbol`, `period`, `datetime`)
PARTITION BY RANGE(`datetime`) (
    -- Example starting partition. Dynamic partitions will be created automatically.
    PARTITION p20240101 VALUES LESS THAN ("2024-01-02 00:00:00")
)
DISTRIBUTED BY HASH(`symbol`) BUCKETS 16
PROPERTIES (
    "replication_allocation" = "tag.location.default: 1",
    "dynamic_partition.enable" = "true",
    "dynamic_partition.time_unit" = "DAY",
    "dynamic_partition.start" = "-30",
    "dynamic_partition.end" = "3",
    "dynamic_partition.prefix" = "p",
    "dynamic_partition.buckets" = "16",
    "dynamic_partition.create_history_partition" = "true"
);


-- Example Materialized View for a specific strategy analysis
-- This demonstrates how Doris can pre-aggregate results for a common backtest scenario.
-- In a real-world, dynamic system, such logic would be built in the Node.js API layer
-- to accommodate custom user strategies. This MV is for demonstration purposes.
-- Strategy: 1-hour golden cross (MA5 crosses above MA20) on symbol 'BTCUSDT'
-- Note: Materialized Views with complex joins and window functions might have limitations.
-- This is a conceptual example of the SQL logic that would drive a backtest summary.
/*
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_example_btc_golden_cross_stats
BUILD IMMEDIATE REFRESH COMPLETE ON SCHEDULE EVERY 1 HOUR
AS
WITH SignalData AS (
    -- Step 1: Identify the crossover events
    SELECT
        datetime,
        close,
        ma5,
        ma20,
        -- Use LAG to get the previous bar's values to detect a cross
        LAG(ma5, 1) OVER (ORDER BY datetime) as prev_ma5,
        LAG(ma20, 1) OVER (ORDER BY datetime) as prev_ma20,
        -- Use LEAD to get future closing prices for performance calculation
        LEAD(close, 1) OVER (ORDER BY datetime) as close_plus_1h,
        LEAD(close, 4) OVER (ORDER BY datetime) as close_plus_4h,
        LEAD(close, 12) OVER (ORDER BY datetime) as close_plus_12h
    FROM alphascan.kline_indicators
    WHERE symbol = 'BTCUSDT' AND period = '1h'
),
GoldenCrossEvents AS (
    -- Step 2: Filter for the exact bars where a golden cross occurred
    SELECT
        datetime AS signal_datetime,
        close AS price_at_signal,
        close_plus_1h,
        close_plus_4h,
        close_plus_12h
    FROM SignalData
    WHERE ma5 > ma20 AND prev_ma5 <= prev_ma20
)
-- Step 3: Aggregate statistics from the filtered events
SELECT
    'BTCUSDT_1h_GoldenCross' AS strategy_name,
    COUNT(1) AS total_signals,
    -- Stats for 1-hour window
    SUM(IF(close_plus_1h > price_at_signal, 1, 0)) AS wins_1h,
    SUM(IF(close_plus_1h <= price_at_signal, 1, 0)) AS losses_1h,
    AVG((close_plus_1h - price_at_signal) / price_at_signal) AS avg_return_pct_1h,
    -- Stats for 4-hour window
    SUM(IF(close_plus_4h > price_at_signal, 1, 0)) AS wins_4h,
    SUM(IF(close_plus_4h <= price_at_signal, 1, 0)) AS losses_4h,
    AVG((close_plus_4h - price_at_signal) / price_at_signal) AS avg_return_pct_4h,
    -- Stats for 12-hour window
    SUM(IF(close_plus_12h > price_at_signal, 1, 0)) AS wins_12h,
    SUM(IF(close_plus_12h <= price_at_signal, 1, 0)) AS losses_12h,
    AVG((close_plus_12h - price_at_signal) / price_at_signal) AS avg_return_pct_12h,
    NOW() as last_updated
FROM GoldenCrossEvents
WHERE close_plus_12h IS NOT NULL; -- Ensure we only count signals with complete future data
*/
