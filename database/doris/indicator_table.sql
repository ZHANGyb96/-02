CREATE TABLE indicators (
    `symbol` VARCHAR(30) COMMENT '交易对标识',
    `period` VARCHAR(10) COMMENT 'K线周期',
    `timestamp` DATETIME COMMENT 'K线开始时间',

    -- MA
    `ma5` DECIMAL(20, 8),
    `ma10` DECIMAL(20, 8),
    `ma20` DECIMAL(20, 8),
    `ma60` DECIMAL(20, 8),

    -- BOLL (Standard params: 20, 2)
    `boll_upper` DECIMAL(20, 8),
    `boll_middle` DECIMAL(20, 8),
    `boll_lower` DECIMAL(20, 8),

    -- MACD (Standard params: 12, 26, 9)
    `macd_diff` DECIMAL(20, 8),
    `macd_dea` DECIMAL(20, 8),
    `macd_hist` DECIMAL(20, 8),

    -- KDJ (Standard params: 9, 3, 3)
    `kdj_k` DECIMAL(20, 8),
    `kdj_d` DECIMAL(20, 8),
    `kdj_j` DECIMAL(20, 8),

    -- RSI (Standard params: 6, 12, 24)
    `rsi6` DECIMAL(20, 8),
    `rsi12` DECIMAL(20, 8),
    `rsi24` DECIMAL(20, 8),

    -- CCI (Standard param: 14)
    `cci` DECIMAL(20, 8),
    
    -- BIAS (Standard params: 6, 12, 24)
    `bias6` DECIMAL(20, 8),
    `bias12` DECIMAL(20, 8),
    `bias24` DECIMAL(20, 8),

    -- TRIX (Standard params: 12, 9)
    `trix` DECIMAL(20, 8),
    `trix_ma` DECIMAL(20, 8),

    -- DPO (Standard param: 20)
    `dpo` DECIMAL(20, 8),

    -- BBI (多空线 - Multi-Bull/Bear Indicator)
    `bbi` DECIMAL(20, 8),

    -- LON (Placeholder as requested)
    `lon` DECIMAL(20, 8)
)
ENGINE=OLAP
DUPLICATE KEY(`symbol`, `period`, `timestamp`)
COMMENT '技术指标统一存储表'
PARTITION BY RANGE(`timestamp`) (
    -- Partitions will be created dynamically by the policy below
    PARTITION p202401 VALUES LESS THAN ('2024-02-01 00:00:00')
)
DISTRIBUTED BY HASH(`symbol`, `period`) BUCKETS 32
PROPERTIES (
    "replication_allocation" = "tag.location.default: 1",
    "dynamic_partition.enable" = "true",
    "dynamic_partition.time_unit" = "DAY",
    "dynamic_partition.start" = "-30",
    "dynamic_partition.end" = "3",
    "dynamic_partition.prefix" = "p",
    "dynamic_partition.buckets" = "32",
    "in_memory" = "false",
    "storage_format" = "V2"
);
