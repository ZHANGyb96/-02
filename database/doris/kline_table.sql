CREATE TABLE kline (
    `symbol` VARCHAR(30) COMMENT '交易对标识',
    `period` VARCHAR(10) COMMENT 'K线周期，例如: 1m, 5m, 1h, 1d',
    `timestamp` DATETIME COMMENT 'K线开始时间',
    `open` DECIMAL(20, 8) COMMENT '开盘价',
    `high` DECIMAL(20, 8) COMMENT '最高价',
    `low` DECIMAL(20, 8) COMMENT '最低价',
    `close` DECIMAL(20, 8) COMMENT '收盘价',
    `volume` DECIMAL(30, 8) COMMENT '成交量'
)
ENGINE=OLAP
DUPLICATE KEY(`symbol`, `period`, `timestamp`)
COMMENT '多周期K线数据表'
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
