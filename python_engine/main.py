# AlphaScan AI - Python 数据引擎
#
# 企业级重构版本，特点:
# 1. 纯计算引擎: Python 仅负责拉取 and 计算数据，不接触数据库.
# 2. 标准化输出: 所有结果被处理成 an 标准的临时 CSV 文件.
# 3. 解耦与稳定: 架构上消除了与 Node.js 的文件并发冲突.

import os
import sys
import json
import time
import argparse
import re
import ssl
import urllib3
from datetime import datetime, timedelta
import pandas as pd
import pandas_ta as pta
import numpy as np
import akshare as ak
import uuid

# ==============================
# 解决环境 SSL 与 警告问题 (参考本地成功脚本)
# ==============================
ssl._create_default_https_context = ssl._create_unverified_context
urllib3.disable_warnings()

# --- 全局配置 ---
# DuckDB 路径仅用于确定 temp 文件夹的位置，脚本本身不使用
DUCKDB_PATH = os.getenv('DUCKDB_PATH', '../local_data/alphascan.duckdb')

# 标准列名到其可能别名的映射
COLUMN_ALIASES = {
    'time': ['time', 'date', 'datetime', 'timestamp', 'trading_date', '日期', '时间', 'day'],
    'open': ['open', '开盘', '开盘价'], 'high': ['high', '最高', '最高价'],
    'low': ['low', '最低', '最低价'], 'close': ['close', '收盘', '收盘价'],
    'volume': ['volume', 'vol', '成交量'],
}

# 全局数据库表列定义
REQUIRED_COLS = [
    'time', 'stock_code', 'stock_name', 'period', 'open', 'high', 'low', 'close', 'volume'
]
INDICATOR_COLS = []

# --- 期货品种前缀白名单（比正则判断更可靠） ---
FUTURE_PREFIXES = {
    'rb', 'hc', 'i', 'j', 'jm', 'sf', 'sm', 'ss', 'zc',  # 黑色系
    'ag', 'au', 'cu', 'al', 'zn', 'pb', 'ni', 'sn', 'ao',  # 贵金属与有色
    'sa', 'fg', 'sc', 'fu', 'bu', 'ma', 'ur', 'ta', 'l', 'pp', 'v', 'eg', 'ru', 'sp',  # 能化
    'm', 'y', 'p', 'rm', 'oi', 'c', 'lh', 'sr', 'cf', 'ap', 'jd',  # 农副
    'si', 'lc', 'if', 'ih', 'ic', 'im',  # 广期所与中金所
}

def _is_future_symbol(symbol):
    """使用明确的品种前缀列表判断是否为期货，比正则更可靠。"""
    if not symbol: return False
    s = str(symbol).strip().lower()
    if s.startswith(('sh', 'sz')): return False
    # 提取纯字母前缀
    prefix = re.match(r'^([a-z]+)', s)
    if prefix:
        return prefix.group(1) in FUTURE_PREFIXES
    return False

def _get_price_limit(symbol):
    """根据品种类型动态返回涨跌幅过滤阈值。"""
    if not symbol: return 0.11
    s = str(symbol).strip()
    # 期货：涨跌停板各品种不同，统一放宽到 15%
    if _is_future_symbol(s): return 0.15
    # 科创板 (688 开头) / 北交所 (8 开头)：30% 涨跌幅
    pure_digits = s.lstrip('shsz')
    if pure_digits.startswith('688') or pure_digits.startswith('8'): return 0.31
    # ST 股票通常以 *ST 或 ST 为股票名称，代码层面难以直接判断
    # 此处统一使用 11% (含打板溢价) 作为普通 A 股阈值
    return 0.11


def clean_data_robust(df, period=None, symbol=None):
    """
    灵魂级增强清洗逻辑：
    1. 统一时间字段 (date/datetime/day -> time)
    2. 动态盘中截断 (仅针对 A 股，彻底放过期货夜盘)
    3. 强制数值转换、时间排序、缺口前向填充 (ffill)
    4. 异常 K 线过滤 (过滤涨跌幅 > 20% 的脏数据)
    """
    if df is None or df.empty: return pd.DataFrame()
    df_cleaned = df.copy()
    
    # 1. 统一时间字段
    if 'date' in df_cleaned.columns and 'time' not in df_cleaned.columns:
        df_cleaned.rename(columns={'date': 'time'}, inplace=True)
    elif 'day' in df_cleaned.columns and 'time' not in df_cleaned.columns:
        df_cleaned.rename(columns={'day': 'time'}, inplace=True)
    elif 'datetime' in df_cleaned.columns and 'time' not in df_cleaned.columns:
        df_cleaned.rename(columns={'datetime': 'time'}, inplace=True)
        
    df_cleaned['time'] = pd.to_datetime(df_cleaned['time'])
    
    # 2. 【架构级优化】：动态盘中截断 (仅针对 A 股股票，防止 ffill 产生深夜直线)
    if period and any(p in str(period).lower() for p in ['m', 'min']):
        is_stock = not _is_future_symbol(symbol) if symbol else True

        if is_stock:
            df_cleaned.set_index('time', inplace=True)
            # 使用 between_time 剔除 15:15 以后和 09:15 以前的非交易静默数据
            df_cleaned = df_cleaned.between_time('09:15', '15:15')
            df_cleaned.reset_index(inplace=True)
    
    # 3. 强制数值化
    base_cols = ['open', 'high', 'low', 'close', 'volume']
    for col in base_cols:
        if col in df_cleaned.columns:
            df_cleaned[col] = pd.to_numeric(df_cleaned[col], errors='coerce')
    
    # 4. 排序与缺口补全
    df_cleaned.sort_values('time', inplace=True)
    df_cleaned.ffill(inplace=True)
    df_cleaned['volume'] = df_cleaned['volume'].fillna(0)
    
    # 5. 删除无效记录
    df_cleaned.dropna(subset=['open', 'high', 'low', 'close'], inplace=True)
    
    # 6. 智能异常 K 线过滤 (根据品种类型动态设定阈值)
    if len(df_cleaned) > 1:
        pct_limit = _get_price_limit(symbol)
        pct = df_cleaned["close"].pct_change().abs()
        df_cleaned = df_cleaned[(pct < pct_limit) | (pct.isna())]
        
    return df_cleaned


def calculate_indicators(df, period):
    # 【架构升级】移除落地前预计算逻辑，图表与分析所需的指标由前端和动态查询引擎实时生成
    # 只确保 OHLCV 列的干净
    return df

def get_latest_trading_date():
    try:
        sh_index_df = ak.stock_zh_index_daily(symbol="sh000001")
        if not sh_index_df.empty: return sh_index_df['date'].iloc[-1]
    except Exception: pass
    now = datetime.now()
    if now.weekday() == 5: return now.date() - timedelta(days=1)
    if now.weekday() == 6: return now.date() - timedelta(days=2)
    return now.date()

def calculate_start_dates(duration_str):
    latest_date = get_latest_trading_date()
    end_date_str = latest_date.strftime('%Y%m%d')
    days_map = {'120d': 180, '1y': 365, '3y': 365 * 3, 'all': 365 * 30}
    day_delta = days_map.get(duration_str, 180)
    day_start_str = (latest_date - timedelta(days=day_delta)).strftime('%Y%m%d')
    print(f"根据时长 '{duration_str}', 将从以下日期开始获取数据：>= {day_start_str}")
    return day_start_str, end_date_str

def get_stock_code_prefix(stock_code):
    stock_code_str = str(stock_code).strip()
    if stock_code_str.startswith(('sh', 'sz')): return stock_code_str
    if stock_code_str.startswith(('6', '9')): return 'sh' + stock_code_str
    if stock_code_str.startswith(('0', '3', '2')): return 'sz' + stock_code_str
    return stock_code_str

def normalize_future_symbol(symbol):
    """
    【架构级适配器】：国内全市场期货 中文/泛用代码 -> 新浪财经标准底层代码 转换器
    """
    symbol_str = str(symbol).strip()
    symbol_upper = symbol_str.upper()

    # 终极映射字典：涵盖主流交易品种的中文和 9999 惯用代码
    SPECIAL_MAP = {
        # --- 黑色系 ---
        '螺纹': 'rb0', '螺纹钢': 'rb0', 'RB': 'rb0', 'RB9999': 'rb0',
        '热卷': 'hc0', '热轧卷板': 'hc0', 'HC': 'hc0', 'HC9999': 'hc0',
        '铁矿': 'i0', '铁矿石': 'i0', 'I': 'i0', 'I9999': 'i0',
        '焦炭': 'j0', 'J': 'j0', 'J9999': 'j0',
        '焦煤': 'jm0', 'JM': 'jm0', 'JM9999': 'jm0',
        '硅铁': 'SF0', 'SF': 'SF0', 'SF9999': 'SF0',
        '锰硅': 'SM0', 'SM': 'SM0', 'SM9999': 'SM0',
        '不锈钢': 'ss0', 'SS': 'ss0', 'SS9999': 'ss0',
        '动力煤': 'ZC0', 'ZC': 'ZC0', 'ZC9999': 'ZC0', 'ROZC9999': 'ZC0',

        # --- 贵金属与有色金属 ---
        '白银': 'ag0', 'AG': 'ag0', 'AG9999': 'ag0',
        '黄金': 'au0', 'AU': 'au0', 'AU9999': 'au0',
        '铜': 'cu0', '沪铜': 'cu0', 'CU': 'cu0', 'CU9999': 'cu0',
        '铝': 'al0', '沪铝': 'al0', 'AL': 'al0', 'AL9999': 'al0',
        '锌': 'zn0', '沪锌': 'zn0', 'ZN': 'zn0', 'ZN9999': 'zn0',
        '铅': 'pb0', '沪铅': 'pb0', 'PB': 'pb0', 'PB9999': 'pb0',
        '镍': 'ni0', '沪镍': 'ni0', 'NI': 'ni0', 'NI9999': 'ni0',
        '锡': 'sn0', '沪锡': 'sn0', 'SN': 'sn0', 'SN9999': 'sn0',
        '氧化铝': 'ao0', 'AO': 'ao0', 'AO9999': 'ao0',

        # --- 能源化工 ---
        '纯碱': 'SA0', '纯碱主力': 'SA0', 'SA': 'SA0', 'SA9999': 'SA0',
        '玻璃': 'FG0', 'FG': 'FG0', 'FG9999': 'FG0',
        '原油': 'sc0', 'SC': 'sc0', 'SC9999': 'sc0',
        '燃油': 'fu0', '燃料油': 'fu0', 'FU': 'fu0', 'FU9999': 'fu0',
        '沥青': 'bu0', 'BU': 'bu0', 'BU9999': 'bu0',
        '甲醇': 'MA0', 'MA': 'MA0', 'MA9999': 'MA0',
        '尿素': 'UR0', 'UR': 'UR0', 'UR9999': 'UR0',
        'PTA': 'TA0', 'TA': 'TA0', 'TA9999': 'TA0', 'PTA9999': 'TA0',
        '塑料': 'l0', 'LLDPE': 'l0', 'L': 'l0', 'L9999': 'l0',
        '聚丙烯': 'pp0', 'PP': 'pp0', 'PP9999': 'pp0',
        'PVC': 'v0', 'V': 'v0', 'V9999': 'v0',
        '乙二醇': 'eg0', 'EG': 'eg0', 'EG9999': 'eg0',
        '橡胶': 'ru0', '天然橡胶': 'ru0', 'RU': 'ru0', 'RU9999': 'ru0',
        '纸浆': 'sp0', 'SP': 'sp0', 'SP9999': 'sp0',

        # --- 农副产品 ---
        '豆粕': 'm0', 'M': 'm0', 'M9999': 'm0', 'MMAIN': 'm0',
        '豆油': 'y0', 'Y': 'y0', 'Y9999': 'y0',
        '棕榈油': 'p0', '棕榈': 'p0', 'P': 'p0', 'P9999': 'p0',
        '菜粕': 'RM0', 'RM': 'RM0', 'RM9999': 'RM0',
        '菜油': 'OI0', 'OI': 'OI0', 'OI9999': 'OI0',
        '玉米': 'c0', 'C': 'c0', 'C9999': 'c0',
        '生猪': 'lh0', 'LH': 'lh0', 'LH9999': 'lh0',
        '白糖': 'SR0', 'SR': 'SR0', 'SR9999': 'SR0',
        '棉花': 'CF0', 'CF': 'CF0', 'CF9999': 'CF0',
        '苹果': 'AP0', 'AP': 'AP0', 'AP9999': 'AP0',
        '鸡蛋': 'jd0', 'JD': 'jd0', 'JD9999': 'jd0',

        # --- 广期所与中金所 ---
        '工业硅': 'si0', 'SI': 'si0', 'SI9999': 'si0',
        '碳酸锂': 'lc0', 'LC': 'lc0', 'LC9999': 'lc0',
        '沪深300': 'IF0', 'IF': 'IF0', 'IF9999': 'IF0',
        '上证50': 'IH0', 'IH': 'IH0', 'IH9999': 'IH0',
        '中证500': 'IC0', 'IC': 'IC0', 'IC9999': 'IC0',
        '中证1000': 'IM0', 'IM': 'IM0', 'IM9999': 'IM0',
    }
    
    if symbol_upper in SPECIAL_MAP:
        return SPECIAL_MAP[symbol_upper]

    import re
    match_specific = re.match(r'^([A-Za-z]+)\d{3,4}$', symbol_str)
    if match_specific:
        prefix = match_specific.group(1).upper()
        czce_prefixes =['SA','SR','CF','TA','MA','FG','RM','OI','ZC','UR','AP','CJ']
        if prefix in czce_prefixes:
            return symbol_str.upper() 
        else:
            return symbol_str.lower()
            
    return symbol_str

def fetch_future_data(symbol, period):
    # 1. 调用适配器进行底层代码转换
    normalized_symbol = normalize_future_symbol(symbol)
    
    if normalized_symbol != symbol:
         print(f"🔄 代码适配: 已将用户输入的 '{symbol}' 自动映射为标准代码 '{normalized_symbol}'")
    else:
         print(f"正在从 获取期货 '{normalized_symbol}' 的 {period} 周期数据...")
         
    period_map = {'1m': '1', '5m': '5', '15m': '15', '30m': '30', '60m': '60', '1d': '240'}
    ak_p = period_map.get(period, '240')
    
    try:
        # 2. 必须使用 normalized_symbol 去请求 akshare 接口
        if period != '1d':
            future_df = ak.futures_zh_minute_sina(symbol=normalized_symbol, period=ak_p)
        else:
            future_df = ak.futures_zh_daily_sina(symbol=normalized_symbol)
            
        if future_df.empty:
            print(f"警告: 未能为期货 '{symbol}' 获取到 {period} 周期的数据。")
            return pd.DataFrame()
            
        future_df = clean_data_robust(future_df, period, symbol)
        return future_df[['time', 'open', 'high', 'low', 'close', 'volume']]
    except Exception as e:
        print(f"错误: 在获取期货 '{symbol}' 的 {period} 周期数据时发生错误: {e}")
        return pd.DataFrame()

def resample_to_period(df, period):
    if df.empty: return df
    print(f"正在重采样至 {period} 周期...")
    try:
        df_resample = df.copy()
        df_resample.set_index('time', inplace=True)
        ohlc = {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last', 'volume': 'sum'}
        resampled_df = df_resample.resample(period, label='right', closed='right').apply(ohlc).dropna(subset=['open']).reset_index()
        return resampled_df
    except Exception as e:
        print(f"错误: 重采样至 {period} 失败: {e}")
        return pd.DataFrame()

def perform_full_suite_resampling(all_dataframes):
    """
    极致性能助手：基于 1m 原始数据，全量重采样生成其它所有核心周期。
    """
    if '1m' not in all_dataframes or all_dataframes['1m'].empty:
        return
    
    print("💡 极致性能模式：正在基于 1m 原始数据全量重采样生成其它周期...")
    base_df = all_dataframes['1m']
    
    # 1. 生成分钟线全系列
    for p_min in [5, 15, 30, 60, 120, 240]:
        p_str = f"{p_min}m"
        if p_str not in all_dataframes:
            all_dataframes[p_str] = resample_to_period(base_df.copy(), f'{p_min}min')
        
    # 2. 生成日、周、月线
    if '1d' not in all_dataframes:
        all_dataframes['1d'] = resample_to_period(base_df.copy(), '1D')
    if '1w' not in all_dataframes:
        all_dataframes['1w'] = resample_to_period(base_df.copy(), 'W-FRI')
    if '1M' not in all_dataframes:
        all_dataframes['1M'] = resample_to_period(base_df.copy(), 'ME')

def save_data_to_temp_file(df, symbol):
    if df is None or df.empty:
        print("没有生成任何数据，已跳过文件创建。")
        return None
    
    temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'local_data', 'temp'))
    os.makedirs(temp_dir, exist_ok=True)
    
    file_name = f"data_{symbol}_{uuid.uuid4().hex}.csv"
    file_path = os.path.join(temp_dir, file_name)

    for col in REQUIRED_COLS:
        if col not in df.columns:
            df[col] = np.nan
    df_to_save = df[REQUIRED_COLS].copy()
    
    df_to_save.to_csv(file_path, index=False, na_rep='')
    print(f"成功将 {len(df_to_save)} 条记录保存到临时文件: {file_path}")
    return file_path

def smart_read_csv(file_path):
    df = pd.read_csv(file_path)
    df.columns = df.columns.str.lower()
    mapped_columns = {}
    for standard_name, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in df.columns:
                mapped_columns[alias] = standard_name
                break
    df.rename(columns=mapped_columns, inplace=True)
    df['time'] = pd.to_datetime(df['time'])
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df.dropna(subset=['time', 'open', 'high', 'low', 'close', 'volume'], inplace=True)
    df.sort_values(by='time', inplace=True)
    return df.reset_index(drop=True)

def retry_request(func, retries=3, delay=5):
    for i in range(retries):
        try:
            return func()
        except Exception as e:
            print(f"错误: 请求失败 ({e.__class__.__name__})。将在 {delay} 秒后重试 ({i+1}/{retries})...")
            time.sleep(delay)
    return None

def process_data_and_save(dataframes, stock_code, stock_name=""):
    if not dataframes:
        print("数据帧字典为空，无法持久化。")
        return
    
    all_dfs = []
    for period, df in dataframes.items():
        if df.empty: continue
        print(f"----- 正在为品种 {stock_code} 的 {period} 周期准备数据 -----")
        df = clean_data_robust(df, period, stock_code)
        if df.empty: continue
        
        df['stock_code'] = stock_code
        df['stock_name'] = stock_name
        df['period'] = period
        df_with_metrics = calculate_indicators(df, period)
        all_dfs.append(df_with_metrics)

    if not all_dfs:
        print("所有周期的数据均为空，已跳过文件创建。")
        return
        
    combined_df = pd.concat(all_dfs, ignore_index=True)
    output_path = save_data_to_temp_file(combined_df, stock_code)
    
    if output_path:
        print(f"PYTHON_OUTPUT_FILE:{output_path}")

def handle_stock_data_sync(symbol, duration, requested_periods=None):
    if requested_periods is None: requested_periods = []

    prefixed_code = get_stock_code_prefix(symbol)
    print(f"检测到 A 股代码，已将 '{symbol}' 自动标准化为 '{prefixed_code}'。")
    start_date_str, end_date_str = calculate_start_dates(duration)
    all_dataframes = {}

    minute_map = {'1m': '1', '5m': '5', '15m': '15', '30m': '30', '60m': '60'}
    direct_fetch_minutes = [p for p in requested_periods if p in minute_map]
    resample_minutes = [p for p in requested_periods if p.endswith('m') and p not in minute_map]
    
    # 智能补齐：如果没有直接请求基础分钟线，但需要重采样生成大周期(120/240m)
    if resample_minutes and not direct_fetch_minutes and '1m' not in requested_periods:
        direct_fetch_minutes.append('60m')
        
    if direct_fetch_minutes:
        print(f"--- 正在直接获取勾选的分钟线周期: {direct_fetch_minutes} ---")
        for p_str in direct_fetch_minutes:
            p_ak = minute_map[p_str]
            df_raw = retry_request(lambda: ak.stock_zh_a_minute(symbol=prefixed_code, period=p_ak, adjust="qfq"))
            if df_raw is not None and not df_raw.empty:
                all_dataframes[p_str] = clean_data_robust(df_raw, p_str, symbol)
                print(f"成功获取 {p_str} 周期原始数据（已完成列名统一），条数: {len(all_dataframes[p_str])}")

    # 【极致性能模式拦截】
    if requested_periods == ['1m']:
        perform_full_suite_resampling(all_dataframes)
        return all_dataframes

    if resample_minutes:
        base_period = next((all_dataframes[p] for p in ['60m', '30m', '15m', '5m', '1m'] if p in all_dataframes and not all_dataframes[p].empty), None)
        if base_period is not None:
            for p_str in resample_minutes:
                all_dataframes[p_str] = resample_to_period(base_period.copy(), f"{p_str.replace('m', '')}min")
        else:
            print("警告: 没有任何分钟线基础数据可用于重采样 120m/240m 周期。")

    day_plus_periods = [p for p in requested_periods if p in ['1d', '1w', '1M']]
    if day_plus_periods:
        print("--- 正在获取日线及以上周期数据 ---")
        df_daily_raw = retry_request(lambda: ak.stock_zh_a_daily(symbol=prefixed_code, start_date=start_date_str, end_date=end_date_str, adjust="qfq"))
        if df_daily_raw is not None and not df_daily_raw.empty:
            df_daily = clean_data_robust(df_daily_raw, '1d', symbol)
            if '1d' in day_plus_periods: all_dataframes["1d"] = df_daily.copy()
            if '1w' in day_plus_periods: all_dataframes["1w"] = resample_to_period(df_daily.copy(), 'W-FRI')
            if '1M' in day_plus_periods: all_dataframes["1M"] = resample_to_period(df_daily.copy(), 'ME')
            
    return all_dataframes

def handle_future_data_sync(symbol, requested_periods=None):
    if requested_periods is None: requested_periods = []
    all_dataframes = {}

    base_minute_periods = ['1m', '5m', '15m', '30m', '60m']
    needed_minutes = [p for p in requested_periods if p in base_minute_periods]
    resample_minutes = [p for p in requested_periods if p in ['120m', '240m']]
    
    fetch_list = needed_minutes if needed_minutes else []
    # 如果用户请求了单品种大周期分钟线（非全局1m），优先使用最近周期（如60m）防漂移
    if resample_minutes and not fetch_list and '1m' not in requested_periods: 
        fetch_list.append('60m')

    for p in fetch_list:
        df = retry_request(lambda: fetch_future_data(symbol, p))
        if df is not None and not df.empty: all_dataframes[p] = df
    
    # 【极致性能模式拦截】
    if requested_periods == ['1m']:
        perform_full_suite_resampling(all_dataframes)
        return all_dataframes

    if resample_minutes:
        # 降级寻源机制：60m -> 30m -> 15m -> 5m -> 1m
        base_df = next((all_dataframes[p] for p in ['60m', '30m', '15m', '5m', '1m'] if p in all_dataframes and not all_dataframes[p].empty), None)
        if base_df is not None:
            for p in resample_minutes: all_dataframes[p] = resample_to_period(base_df.copy(), f"{p.replace('m', '')}min")

    if any(p in requested_periods for p in ['1d', '1w', '1M']):
        df_daily = retry_request(lambda: fetch_future_data(symbol, '1d'))
        if df_daily is not None and not df_daily.empty:
            if '1d' in requested_periods: all_dataframes['1d'] = df_daily.copy()
            if '1w' in requested_periods: all_dataframes['1w'] = resample_to_period(df_daily.copy(), 'W-FRI')
            if '1M' in requested_periods: all_dataframes['1M'] = resample_to_period(df_daily.copy(), 'ME')
                
    return all_dataframes

def handle_csv_upload(args):
    base_df = smart_read_csv(args.file)
    time_diffs = base_df['time'].diff().dt.total_seconds().median()
    all_dataframes = {}
    if time_diffs > 3600 * 6:
        all_dataframes['1d'] = base_df.copy()
        all_dataframes['1w'] = resample_to_period(base_df.copy(), 'W-FRI')
        all_dataframes['1M'] = resample_to_period(base_df.copy(), 'ME')
    else:
        print("正在基于 CSV 数据进行全周期重采样...")
        for p_min in [1, 5, 15, 30, 60, 120, 240]:
            all_dataframes[f"{p_min}m"] = resample_to_period(base_df.copy(), f'{p_min}min')
        all_dataframes['1d'] = resample_to_period(base_df.copy(), '1D')
        all_dataframes['1w'] = resample_to_period(base_df.copy(), 'W-FRI')
        all_dataframes['1M'] = resample_to_period(base_df.copy(), 'ME')
        
    process_data_and_save(all_dataframes, args.file_symbol, stock_name="")

def main():
    parser = argparse.ArgumentParser(description="AlphaScan AI - Python 数据引擎", add_help=False)
    parser.add_argument('--symbol', type=str)
    parser.add_argument('--name', type=str)
    parser.add_argument('--duration', type=str)
    parser.add_argument('--periods', nargs='*')
    parser.add_argument('--file', type=str)
    parser.add_argument('--file-symbol', type=str)
    args, _ = parser.parse_known_args()
    print("\n--- AlphaScan AI Python 数据引擎 ---")
    try:
        if args.symbol and args.duration and args.periods:
            if _is_future_symbol(args.symbol):
                all_dfs = handle_future_data_sync(args.symbol, args.periods)
            else:
                all_dfs = handle_stock_data_sync(args.symbol, args.duration, args.periods)
            process_data_and_save({k:v for k,v in all_dfs.items() if v is not None and not v.empty}, args.symbol, args.name or "")
        elif args.file and args.file_symbol: handle_csv_upload(args)
        else: print("\n--- 无写入任务，引擎空闲。---\n")
        print("\n--- Python 数据流水线成功完成。---\n")
    except Exception as e:
        import traceback
        print(f"\n[FATAL] Python 引擎发生严重错误: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        print("PYTHON_SCRIPT_FAILED_WITH_EXCEPTION", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__': main()
