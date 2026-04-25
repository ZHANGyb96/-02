-- Apache Doris DDL for AlphaScan AI

-- K-line (Candlestick) Data Table
-- This table stores OHLCV data for various symbols and timeframes.
CREATE TABLE kline_data (
    `ts` DATETIME NOT NULL COMMENT 'Timestamp of the k-line bar, precise to seconds',
    `symbol` VARCHAR(30) NOT NULL COMMENT 'Trading symbol, e.g., BTCUSDT, AAPL',
    `timeframe` VARCHAR(10) NOT NULL COMMENT 'Timeframe, e.g., 1m, 5m, 1h, 1d',
    `open` DECIMAL(18, 8) NOT NULL COMMENT 'Open price',
    `high` DECIMAL(18, 8) NOT NULL COMMENT 'High price',
    `low` DECIMAL(18, 8) NOT NULL COMMENT 'Low price',
    `close` DECIMAL(18, 8) NOT NULL COMMENT 'Close price',
    `volume` DECIMAL(24, 8) NOT NULL COMMENT 'Volume'
)
DUPLICATE KEY(`ts`, `symbol`, `timeframe`)
PARTITION BY RANGE(`ts`) (
    -- Example: Create partitions for each year. Adjust as needed.
    PARTITION p2022 VALUES LESS THAN ('2023-01-01 00:00:00'),
    PARTITION p2023 VALUES LESS THAN ('2024-01-01 00:00:00'),
    PARTITION p2024 VALUES LESS THAN ('2025-01-01 00:00:00')
    -- Dynamic partitions will be created for new data.
)
DISTRIBUTED BY HASH(`symbol`) BUCKETS 32 -- Adjust bucket number based on cluster size and data cardinality
PROPERTIES (
    "replication_allocation" = "tag.location.default: 1",
    "dynamic_partition.enable" = "true",
    "dynamic_partition.time_unit" = "YEAR",
    "dynamic_partition.time_zone" = "Asia/Shanghai",
    "dynamic_partition.start" = "-2147483648", -- Start from a very old date
    "dynamic_partition.end" = "3", -- Create partitions for the next 3 years
    "dynamic_partition.prefix" = "p",
    "dynamic_partition.buckets" = "32"
);

-- Technical Indicators Table
-- This table stores pre-calculated indicator values.
-- It's structured in a way to join with kline_data on ts, symbol, and timeframe.
CREATE TABLE indicators_data (
    `ts` DATETIME NOT NULL COMMENT 'Timestamp, matching kline_data',
    `symbol` VARCHAR(30) NOT NULL COMMENT 'Trading symbol, matching kline_data',
    `timeframe` VARCHAR(10) NOT NULL COMMENT 'Timeframe, matching kline_data',
    
    -- MA (Moving Average) - Example for 3 MAs
    `ma5` DECIMAL(18, 8),
    `ma10` DECIMAL(18, 8),
    `ma20` DECIMAL(18, 8),

    -- BOLL (Bollinger Bands)
    `boll_upper` DECIMAL(18, 8),
    `boll_middle` DECIMAL(18, 8),
    `boll_lower` DECIMAL(18, 8),

    -- MACD (Moving Average Convergence Divergence)
    `macd_diff` DECIMAL(18, 8),
    `macd_dea` DECIMAL(18, 8),
    `macd_hist` DECIMAL(18, 8),

    -- KDJ
    `kdj_k` DECIMAL(18, 8),
    `kdj_d` DECIMAL(18, 8),
    `kdj_j` DECIMAL(18, 8),

    -- RSI (Relative Strength Index) - Example for 3 RSIs
    `rsi6` DECIMAL(18, 8),
    `rsi12` DECIMAL(18, 8),
    `rsi24` DECIMAL(18, 8),

    -- CCI (Commodity Channel Index)
    `cci` DECIMAL(18, 8),

    -- BIAS (Bias Ratio)
    `bias` DECIMAL(18, 8),

    -- TRIX (Triple Exponential Average)
    `trix` DECIMAL(18, 8),
    `trix_ma` DECIMAL(18, 8),

    -- DPO (Detrended Price Oscillator)
    `dpo` DECIMAL(18, 8),

    -- LON (another custom indicator)
    `lon` DECIMAL(18, 8),

    -- Multi-air line (多空线)
    `dkx` DECIMAL(18, 8)

)
DUPLICATE KEY(`ts`, `symbol`, `timeframe`)
PARTITION BY RANGE(`ts`) (
    PARTITION p2022 VALUES LESS THAN ('2023-01-01 00:00:00'),
    PARTITION p2023 VALUES LESS THAN ('2024-01-01 00:00:00'),
    PARTITION p2024 VALUES LESS THAN ('2025-01-01 00:00:00')
)
DISTRIBUTED BY HASH(`symbol`) BUCKETS 32
PROPERTIES (
    "replication_allocation" = "tag.location.default: 1",
    "dynamic_partition.enable" = "true",
    "dynamic_partition.time_unit" = "YEAR",
    "dynamic_partition.time_zone" = "Asia/Shanghai",
    "dynamic_partition.start" = "-2147483648",
    "dynamic_partition.end" = "3",
    "dynamic_partition.prefix" = "p",
    "dynamic_partition.buckets" = "32"
);

-- Note: The use of NULLable columns for indicators allows flexibility.
-- If an indicator cannot be calculated for a certain period (e.g., at the beginning of the series),
-- it can be stored as NULL.
