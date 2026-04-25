
'use client';

import { useEffect, useState, useRef } from 'react';
import * as LightweightCharts from 'lightweight-charts';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, DatabaseZap } from "lucide-react";
import { API_URL, STOCKS } from '@/config/constants';
import { useAuthStore } from '@/store/useAuthStore';
import { calculateAllIndicators } from '@/utils/ta-math';

type CandlestickData = LightweightCharts.SeriesDataItemTypeMap['Candlestick'];
type LineData = LightweightCharts.SeriesDataItemTypeMap['Line'];
type HistogramData = LightweightCharts.SeriesDataItemTypeMap['Histogram'];
type IChartApi = LightweightCharts.IChartApi;
type ISeriesApi<T extends LightweightCharts.SeriesType> = LightweightCharts.ISeriesApi<T>;

type RawKlineData = {
  time: string;
  open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null;
  ma5?: number | null; ma10?: number | null; ma20?: number | null; ma60?: number | null; ma120?: number | null; ma250?: number | null;
  macd?: number | null; macd_signal?: number | null; macd_hist?: number | null;
  kdj_k?: number | null; kdj_d?: number | null; kdj_j?: number | null;
  rsi_6?: number | null; rsi_12?: number | null; rsi_24?: number | null;
  trix?: number | null; trma?: number | null;
  boll_upper?: number | null; boll_middle?: number | null; boll_lower?: number | null;
  pdi?: number | null; mdi?: number | null; adx?: number | null; adxr?: number | null;
  bias_6?: number | null; bias_12?: number | null; bias_24?: number | null;
  bbi?: number | null;
  cci?: number | null;
  dpo?: number | null; madpo?: number | null;
  lon?: number | null; lonma?: number | null;
};

type FormattedChartData = CandlestickData & {
  volume: number;
  ma5?: number; ma10?: number; ma20?: number; ma60?: number; ma120?: number; ma250?: number;
  macd?: number; macd_signal?: number; macd_hist?: number;
  kdj_k?: number; kdj_d?: number; kdj_j?: number;
  rsi_6?: number; rsi_12?: number; rsi_24?: number;
  trix?: number; trma?: number;
  boll_upper?: number; boll_middle?: number; boll_lower?: number;
  pdi?: number; mdi?: number; adx?: number; adxr?: number;
  bias_6?: number; bias_12?: number; bias_24?: number;
  bbi?: number;
  cci?: number;
  dpo?: number; madpo?: number;
  lon?: number; lonma?: number;
};

export type IndicatorType = 'Volume' | 'MACD' | 'KDJ' | 'RSI' | 'TRIX' | 'DMI' | 'BIAS' | 'BBI' | 'CCI' | 'DPO' | 'BOLL' | 'LON';

export const indicatorList: { value: IndicatorType, label: string }[] = [
  { value: 'Volume', label: '成交量 (VOL)' },
  { value: 'MACD', label: 'MACD(12,26,9)' },
  { value: 'KDJ', label: 'KDJ(9,3,3)' },
  { value: 'RSI', label: 'RSI(6,12,24)' },
  { value: 'BOLL', label: '布林带 (BOLL)' },
  { value: 'TRIX', label: 'TRIX(12,9)' },
  { value: 'DPO', label: 'DPO' },
  { value: 'BIAS', label: 'BIAS(6,12,24)' },
  { value: 'BBI', label: 'BBI (多空线)' },
  { value: 'CCI', label: 'CCI(14)' },
  { value: 'DMI', label: 'DMI(14,6)' },
  { value: 'LON', label: 'LON (钱龙长线)' },
];

export const maConfig: Record<string, { color: string, label: string }> = {
  ma5: { color: '#F2A93B', label: 'MA5' },
  ma10: { color: '#31C2F2', label: 'MA10' },
  ma20: { color: '#E85EFF', label: 'MA20' },
  ma60: { color: '#44F279', label: 'MA60' },
  ma120: { color: '#FF6666', label: 'MA120' },
  ma250: { color: '#D4D4D4', label: 'MA250' },
};
export const bollConfig = {
    upper: { color: '#F2A93B' },
    middle: { color: 'rgba(255, 255, 255, 0.4)' },
    lower: { color: '#31C2F2' },
};
const kdjConfig = {
  k: { color: '#F2A93B', label: 'K' },
  d: { color: '#31C2F2', label: 'D' },
  j: { color: '#E85EFF', label: 'J' },
};
const rsiConfig = {
  rsi1: { color: '#F2A93B', label: 'RSI1' },
  rsi2: { color: '#31C2F2', label: 'RSI2' },
  rsi3: { color: '#E85EFF', label: 'RSI3' },
};
const macdConfig = {
    macd: { color: '#F2A93B', label: 'DIF' },
    macd_signal: { color: '#31C2F2', label: 'DEA' },
    macd_hist: { label: 'MACD' },
};
const trixConfig = {
    trix: { color: '#F2A93B', label: 'TRIX' },
    trma: { color: '#31C2F2', label: 'TRMA1' },
};
const dmiConfig = { 
    pdi: { color: '#F2A93B', label: 'DI1' }, 
    mdi: { color: '#31C2F2', label: 'DI2' }, 
    adx: { color: '#E85EFF', label: 'ADX' }, 
    adxr: { color: '#D4D4D4', label: 'ADXR' } 
};
const biasConfig = { bias6: { color: '#F2A93B', label: 'BIAS1' }, bias12: { color: '#31C2F2', label: 'BIAS2' }, bias24: { color: '#E85EFF', label: 'BIAS3' } };
const bbiConfig = { bbi: { color: '#D4D4D4', label: 'BBI' }, close: { color: 'rgba(255, 255, 255, 0.4)', label: 'CLOSE' } };
const cciConfig = { cci: { color: '#D4D4D4', label: 'CCI' } };
const dpoConfig = { dpo: { color: '#F2A93B', label: 'DPO' }, madpo: { color: '#31C2F2', label: 'MADPO' } };
const lonConfig = { lon: { color: '#F2A93B', label: 'LONG' }, lonma: { color: '#31C2F2', label: 'MA1' } };


async function fetchKlineData(stockCode: string, period: string, token: string): Promise<RawKlineData[]> {
  const limit = 10000;
  const res = await fetch(`${API_URL}/api/v1/market-data/${stockCode}/kline?period=${period}&limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      useAuthStore.getState().logout();
    }
    const errorBody = await res.json();
    throw new Error(errorBody.message || '获取数据失败');
  }
  
  const data: any[] = await res.json();
  return data.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function transformData(d: RawKlineData, period: string): FormattedChartData | null {
    if (d.open === null || d.high === null || d.low === null || d.close === null || !d.time) {
        return null;
    }

    // 【灵魂级修复】：智能解析时间，杜绝 NaN 产生
    let finalTime: LightweightCharts.Time;
    const isDayPlus = period === '1d' || period === '1w' || period === '1M';

    try {
        if (isDayPlus) {
            // 日线及以上直接取 YYYY-MM-DD
            finalTime = d.time.split(' ')[0].split('T')[0];
        } else {
            // 分钟线：检查是否带有 Z 或 时区偏移
            const hasTimeZone = /Z|[+-]\d{2}:?\d{2}$/.test(d.time);
            let timeStr = d.time;
            
            // 如果不带时区，且包含空格或T（意味着是裸本地时间字符串），补充北京时区
            if (!hasTimeZone && (d.time.includes(' ') || d.time.includes('T'))) {
                timeStr = d.time.replace(' ', 'T') + '+08:00';
            }
            
            const timestamp = Math.floor(new Date(timeStr).getTime() / 1000);
            if (isNaN(timestamp)) throw new Error('NaN timestamp');
            finalTime = timestamp as LightweightCharts.UTCTimestamp;
        }
    } catch (e) {
        console.error(`[KlineChart] 解析时间失败: ${d.time}`, e);
        return null;
    }

    // Since we now do dynamic calc on the client side, we don't need to try and copy missing ones.
    // D is guaranteed to have OHLCV. 

    return {
        time: finalTime,
        open: d.open, high: d.high, low: d.low, close: d.close,
        volume: d.volume ?? 0,
        ma5: d.ma5 ?? undefined, ma10: d.ma10 ?? undefined, ma20: d.ma20 ?? undefined, ma60: d.ma60 ?? undefined, ma120: d.ma120 ?? undefined, ma250: d.ma250 ?? undefined,
        macd: d.macd ?? undefined, macd_signal: d.macd_signal ?? undefined, macd_hist: d.macd_hist ?? undefined,
        kdj_k: d.kdj_k ?? undefined, kdj_d: d.kdj_d ?? undefined, kdj_j: d.kdj_j ?? undefined,
        rsi_6: d.rsi_6 ?? undefined, rsi_12: d.rsi_12 ?? undefined, rsi_24: d.rsi_24 ?? undefined,
        trix: d.trix ?? undefined, trma: d.trma ?? undefined,
        boll_upper: d.boll_upper ?? undefined, boll_middle: d.boll_middle ?? undefined, boll_lower: d.boll_lower ?? undefined,
        pdi: d.pdi ?? undefined, mdi: d.mdi ?? undefined, adx: d.adx ?? undefined, adxr: d.adxr ?? undefined,
        bias_6: d.bias_6 ?? undefined, bias_12: d.bias_12 ?? undefined, bias_24: d.bias_24 ?? undefined,
        bbi: d.bbi ?? undefined,
        cci: d.cci ?? undefined,
        dpo: d.dpo ?? undefined, madpo: d.madpo ?? undefined,
        lon: d.lon ?? undefined, lonma: d.lonma ?? undefined,
    };
}

const sortMarkers = (m: LightweightCharts.SeriesMarker<LightweightCharts.Time>[]) => {
    if (!m || m.length === 0) return [];
    return m.sort((a, b) => {
        const timeA = typeof a.time === 'string' ? new Date(a.time).getTime() : (a.time as number) * 1000;
        const timeB = typeof b.time === 'string' ? new Date(b.time).getTime() : (a.time as number) * 1000;
        return timeA - timeB;
    });
};

function calculateMacdDivergence(data: FormattedChartData[]): LightweightCharts.SeriesMarker<LightweightCharts.Time>[] {
    const markers: LightweightCharts.SeriesMarker<LightweightCharts.Time>[] = [];
    if (data.length < 30) return markers;

    const diff = data.map(d => d.macd);
    const dea = data.map(d => d.macd_signal);
    const macdHist = data.map(d => d.macd_hist);
    const high = data.map(d => d.high);
    const low = data.map(d => d.low);

    let lastJcIndex = -1;
    let lastScIndex = -1;
    
    let prevHH = -1;
    let prevMHD = -1;
    let prevLL = -1;
    let prevMLD = -1;

    for (let i = 1; i < data.length; i++) {
        const prevDiff = diff[i-1];
        const prevDea = dea[i-1];
        const currDiff = diff[i];
        const currDea = dea[i];

        if (prevDiff === undefined || prevDea === undefined || currDiff === undefined || currDea === undefined) continue;
        
        const isJC = prevDiff <= prevDea && currDiff > currDea;
        const isSC = prevDiff >= prevDea && currDiff < currDea;

        if (isSC) {
            if (lastJcIndex !== -1) {
                const sectionHighs = high.slice(lastJcIndex, i + 1).filter(v => v != null) as number[];
                const sectionHists = macdHist.slice(lastJcIndex, i + 1).filter(v => v != null) as number[];
                
                if (sectionHighs.length > 0 && sectionHists.length > 0) {
                    const currentHH = Math.max(...sectionHighs);
                    const currentMHD = Math.max(...sectionHists);
                    
                    if (prevHH !== -1 && prevMHD !== -1) {
                        if (currentHH > prevHH && currentMHD < prevMHD) {
                            markers.push({
                                time: data[i].time,
                                position: 'aboveBar',
                                color: '#26a69a',
                                shape: 'arrowDown',
                                text: '顶背离',
                            });
                        }
                    }
                    prevHH = currentHH;
                    prevMHD = currentMHD;
                }
            }
            lastScIndex = i;
        }

        if (isJC) {
            if (lastScIndex !== -1) {
                const sectionLows = low.slice(lastScIndex, i + 1).filter(v => v != null) as number[];
                const sectionHists = macdHist.slice(lastScIndex, i + 1).filter(v => v != null) as number[];
                
                if (sectionLows.length > 0 && sectionHists.length > 0) {
                    const currentLL = Math.min(...sectionLows);
                    const currentMLD = Math.min(...sectionHists);
                    
                    if (prevLL !== -1 && prevMLD !== -1) {
                        if (currentLL < prevLL && currentMLD > prevMLD) {
                            markers.push({
                                time: data[i].time,
                                position: 'belowBar',
                                color: '#ef5350',
                                shape: 'arrowUp',
                                text: '底背离',
                            });
                        }
                    }
                    prevLL = currentLL;
                    prevMLD = currentMLD;
                }
            }
            lastJcIndex = i;
        }
    }
    return markers;
}


function calculateTrixSignals(data: FormattedChartData[]): LightweightCharts.SeriesMarker<LightweightCharts.Time>[] {
    const markers: LightweightCharts.SeriesMarker<LightweightCharts.Time>[] = [];
    if (data.length < 2) return markers;

    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];

        const prevTrix = prev.trix;
        const prevTrma = prev.trma;
        const currTrix = curr.trix;
        const currTrma = curr.trma;

        if (prevTrix === undefined || prevTrma === undefined || currTrix === undefined || currTrma === undefined) continue;

        if (prevTrix <= prevTrma && currTrix > currTrma) {
            markers.push({
                time: curr.time,
                position: 'belowBar',
                color: '#ef5350',
                shape: 'arrowUp',
                text: '↑买',
            });
        }

        if (prevTrix >= prevTrma && currTrix < currTrma) {
            markers.push({
                time: curr.time,
                position: 'aboveBar',
                color: '#26a69a',
                shape: 'arrowDown',
                text: '↓卖',
            });
        }
    }
    return markers;
}

function calculateDpoSignals(data: FormattedChartData[]): LightweightCharts.SeriesMarker<LightweightCharts.Time>[] {
    const markers: LightweightCharts.SeriesMarker<LightweightCharts.Time>[] = [];
    if (data.length < 2) return markers;

    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];

        const prevDpo = prev.dpo;
        const prevMadpo = prev.madpo;
        const currDpo = curr.dpo;
        const currMadpo = curr.madpo;

        if (prevDpo === undefined || prevMadpo === undefined || currDpo === undefined || currMadpo === undefined) continue;

        if (prevDpo <= prevMadpo && currDpo > currMadpo) {
            markers.push({
                time: curr.time,
                position: 'belowBar',
                color: '#ef5350',
                shape: 'arrowUp',
                text: '↑买',
            });
        }

        if (prevDpo >= prevMadpo && currDpo < currMadpo) {
            markers.push({
                time: curr.time,
                position: 'aboveBar',
                color: '#26a69a',
                shape: 'arrowDown',
                text: '↓卖',
            });
        }
    }
    return markers;
}

function calculateBbiSignals(data: FormattedChartData[]): LightweightCharts.SeriesMarker<LightweightCharts.Time>[] {
    const markers: LightweightCharts.SeriesMarker<LightweightCharts.Time>[] = [];
    if (data.length < 2) return markers;

    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];

        const prevClose = prev.close;
        const prevBbi = prev.bbi;
        const currClose = curr.close;
        const currBbi = curr.bbi;

        if (prevClose === undefined || prevBbi === undefined || currClose === undefined || currBbi === undefined) continue;

        if (prevClose <= prevBbi && currClose > currBbi) {
            markers.push({
                time: curr.time,
                position: 'belowBar',
                color: '#ef5350',
                shape: 'arrowUp',
                text: '↑买',
            });
        }

        if (prevClose >= prevBbi && currClose < currBbi) {
            markers.push({
                time: curr.time,
                position: 'aboveBar',
                color: '#26a69a',
                shape: 'arrowDown',
                text: '↓卖',
            });
        }
    }
    return markers;
}


const formatNumber = (num?: number | null, precision = 2) => num != null ? num.toFixed(precision) : ' - ';
function formatBigNumber(num?: number | null): string {
  if (num == null) return ' - ';
  if (num > 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num > 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num > 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toString();
}

/**
 * 精准时间格式化：按照“年/月/日”排列
 */
function formatTimestamp(time: LightweightCharts.Time, period: string) {
    if (typeof time === 'string') return time;
    const date = new Date((time as number) * 1000);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    if (period === '1d' || period === '1w' || period === '1M') {
        return `${year}/${month}/${day}`;
    }
    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

const safeData = (data: FormattedChartData[], field: keyof FormattedChartData): (LineData | LightweightCharts.WhitespaceData)[] => {
    return data.map(d => {
        const value = d[field];
        if (value != null && !isNaN(value as number)) {
            return { time: d.time, value: value as number };
        } else {
            return { time: d.time };
        }
    });
};

function getPrimaryIndicatorField(indicator: IndicatorType): keyof FormattedChartData {
    switch(indicator) {
        case 'Volume': return 'volume';
        case 'MACD': return 'macd';
        case 'KDJ': return 'kdj_k';
        case 'RSI': return 'rsi_6';
        case 'TRIX': return 'trix';
        case 'DMI': return 'pdi';
        case 'BIAS': return 'bias_6';
        case 'BBI': return 'bbi';
        case 'CCI': return 'cci';
        case 'DPO': return 'dpo';
        case 'BOLL': return 'boll_middle';
        case 'LON': return 'lon';
    }
}

export function KlineChart({ stockCode, period, visibleMAs, indicatorPanes, showDivergence, showTrixSignal, showDpoSignal, showBbiSignal }: { stockCode: string, period: string, visibleMAs: Record<string, boolean>, indicatorPanes: IndicatorType[], showDivergence: boolean, showTrixSignal: boolean, showDpoSignal: boolean, showBbiSignal: boolean }) {
  const token = useAuthStore(state => state.token);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<FormattedChartData[]>([]);
  const [dataMap, setDataMap] = useState(new Map<LightweightCharts.Time, FormattedChartData>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legend, setLegend] = useState<FormattedChartData | null>(null);
  
  const stockLabel = STOCKS.find(s => s.value === stockCode)?.label || stockCode;
  
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!token) return;
      if (!stockCode) {
        if (isMounted) {
          setData([]);
          setDataMap(new Map());
          setLegend(null);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true); setError(null); setData([]); setDataMap(new Map()); setLegend(null);
      try {
        const klineData = await fetchKlineData(stockCode, period, token);
        if (isMounted) {
            if (klineData.length === 0) {
              setData([]);
            } else {
              // 1. Transform raw
              let transformed = klineData
                .map(d => transformData(d, period))
                .filter((d): d is FormattedChartData => d !== null);

              // 2. Sort by time strictly
              transformed.sort((a, b) => {
                  const tA = typeof a.time === 'string' ? new Date(a.time).getTime() : a.time as number;
                  const tB = typeof b.time === 'string' ? new Date(b.time).getTime() : b.time as number;
                  return tA - tB;
              });

              // 3. 【核心修复】前端接管实时本地计算：瞬间生成所有指标
              transformed = calculateAllIndicators(transformed) as FormattedChartData[];

              const newMap = new Map<LightweightCharts.Time, FormattedChartData>();
              transformed.forEach(item => newMap.set(item.time, item));
              setData(transformed);
              setDataMap(newMap);
              setLegend(transformed.length > 0 ? transformed[transformed.length - 1] : null);
            }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false };
  }, [stockCode, period, token]);

  useEffect(() => {
    if (loading || error || data.length === 0 || !chartContainerRef.current) return;
    
    const container = chartContainerRef.current;
    const mainPane = container.querySelector<HTMLDivElement>('[data-pane-id="main"]');
    const indicatorPaneElements = indicatorPanes.map((_, index) => 
        container.querySelector<HTMLDivElement>(`[data-pane-id="indicator-${index}"]`)
    ).filter(Boolean) as HTMLDivElement[];

    if (!mainPane || indicatorPaneElements.length !== indicatorPanes.length) return;

    const chartOptions: LightweightCharts.DeepPartial<LightweightCharts.ChartOptions> = {
        layout: { background: { type: LightweightCharts.ColorType.Solid, color: 'transparent' }, textColor: '#D1D4DC' },
        grid: { vertLines: { color: 'rgba(255, 255, 255, 0.05)' }, horzLines: { color: 'rgba(255, 255, 255, 0.0)' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        timeScale: { borderColor: '#444', timeVisible: period !== '1d' && period !== '1w' && period !== '1M', secondsVisible: false },
        rightPriceScale: { borderColor: '#444' },
        handleScroll: true, handleScale: true,
        // 本地化配置：强制年月日顺序
        localization: {
            locale: 'zh-CN',
            dateFormat: 'yyyy/MM/dd',
        },
    };

    const mainChart = LightweightCharts.createChart(mainPane, { ...chartOptions, height: mainPane.clientHeight });
    const candlestickSeries = mainChart.addCandlestickSeries({ upColor: '#ef5350', downColor: '#26a69a', borderVisible: false, wickUpColor: '#ef5350', wickDownColor: '#26a69a' });
    candlestickSeries.setData(data);
    
    const seriesOptions = { lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, lineWidth: 1 };

    Object.keys(maConfig).forEach(key => {
        if (visibleMAs[key]) {
            const series = mainChart.addLineSeries({ color: maConfig[key as keyof typeof maConfig].color, ...seriesOptions });
            series.setData(safeData(data, key as keyof FormattedChartData));
        }
    });

    if (showDivergence) {
        const divergenceMarkers = calculateMacdDivergence(data);
        candlestickSeries.setMarkers(sortMarkers(divergenceMarkers));
    }


    const drawIndicator = (chart: IChartApi, indicator: IndicatorType): ISeriesApi<any> | null => {
        const indicatorSeriesOptions = { lastValueVisible: false, priceLineVisible: false };
        let primarySeries: ISeriesApi<any> | null = null;
        
        switch (indicator) {
            case 'Volume':
                const volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, ...indicatorSeriesOptions });
                volSeries.setData(data.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(239, 83, 80, 0.5)' : 'rgba(38, 166, 154, 0.5)' })));
                primarySeries = volSeries;
                break;
            case 'MACD':
                const macdLine = chart.addLineSeries({ color: macdConfig.macd.color, lineWidth: 1, ...indicatorSeriesOptions });
                macdLine.setData(safeData(data, 'macd'));
                chart.addLineSeries({ color: macdConfig.macd_signal.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'macd_signal'));
                chart.addHistogramSeries({ priceFormat: { type: 'volume' }, ...indicatorSeriesOptions }).setData(data.map(d => ({ time: d.time, value: d.macd_hist, color: (d.macd_hist || 0) >= 0 ? '#ef5350' : '#26a69a' })));
                primarySeries = macdLine;
                break;
            case 'KDJ':
                const kLine = chart.addLineSeries({ color: kdjConfig.k.color, lineWidth: 1, ...indicatorSeriesOptions });
                kLine.setData(safeData(data, 'kdj_k'));
                chart.addLineSeries({ color: kdjConfig.d.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'kdj_d'));
                chart.addLineSeries({ color: kdjConfig.j.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'kdj_j'));
                chart.addLineSeries({ color: 'rgba(145, 55, 76, 0.4)', lineStyle: LightweightCharts.LineStyle.Dotted, lineWidth: 1, ...indicatorSeriesOptions }).setData(data.map(d => ({ time: d.time, value: 20 })));
                chart.addLineSeries({ color: 'rgba(145, 55, 76, 0.4)', lineStyle: LightweightCharts.LineStyle.Dotted, lineWidth: 1, ...indicatorSeriesOptions }).setData(data.map(d => ({ time: d.time, value: 80 })));
                primarySeries = kLine;
                break;
            case 'RSI':
                const rsi1 = chart.addLineSeries({ color: rsiConfig.rsi1.color, lineWidth: 1, ...indicatorSeriesOptions });
                rsi1.setData(safeData(data, 'rsi_6'));
                chart.addLineSeries({ color: rsiConfig.rsi2.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'rsi_12'));
                chart.addLineSeries({ color: rsiConfig.rsi3.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'rsi_24'));
                primarySeries = rsi1;
                break;
            case 'TRIX':
                const trixLine = chart.addLineSeries({ color: trixConfig.trix.color, lineWidth: 1, ...indicatorSeriesOptions });
                trixLine.setData(safeData(data, 'trix'));
                if (showTrixSignal) {
                    const trixMarkers = calculateTrixSignals(data);
                    trixLine.setMarkers(sortMarkers(trixMarkers));
                }
                chart.addLineSeries({ color: trixConfig.trma.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'trma'));
                primarySeries = trixLine;
                break;
            case 'DMI':
                const pdiLine = chart.addLineSeries({ color: dmiConfig.pdi.color, lineWidth: 1, ...indicatorSeriesOptions });
                pdiLine.setData(safeData(data, 'pdi'));
                chart.addLineSeries({ color: dmiConfig.mdi.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'mdi'));
                chart.addLineSeries({ color: dmiConfig.adx.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'adx'));
                chart.addLineSeries({ color: dmiConfig.adxr.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'adxr'));
                primarySeries = pdiLine;
                break;
            case 'BIAS':
                const bias6 = chart.addLineSeries({ color: biasConfig.bias6.color, lineWidth: 1, ...indicatorSeriesOptions });
                bias6.setData(safeData(data, 'bias_6'));
                chart.addLineSeries({ color: biasConfig.bias12.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'bias_12'));
                chart.addLineSeries({ color: biasConfig.bias24.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'bias_24'));
                primarySeries = bias6;
                break;
            case 'BBI':
                const bbiLine = chart.addLineSeries({ color: bbiConfig.bbi.color, lineWidth: 1, ...indicatorSeriesOptions });
                bbiLine.setData(safeData(data, 'bbi'));
                if (showBbiSignal) {
                    const bbiMarkers = calculateBbiSignals(data);
                    bbiLine.setMarkers(sortMarkers(bbiMarkers));
                }
                chart.addLineSeries({ color: bbiConfig.close.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'close'));
                primarySeries = bbiLine;
                break;
            case 'CCI':
                const cciLine = chart.addLineSeries({ color: cciConfig.cci.color, lineWidth: 1, ...indicatorSeriesOptions });
                cciLine.setData(safeData(data, 'cci'));
                chart.addLineSeries({ color: 'rgba(145, 55, 76, 0.6)', lineStyle: LightweightCharts.LineStyle.Dotted, lineWidth: 2, ...indicatorSeriesOptions }).setData(data.map(d => ({ time: d.time, value: 100 })));
                chart.addLineSeries({ color: 'rgba(145, 55, 76, 0.6)', lineStyle: LightweightCharts.LineStyle.Dotted, lineWidth: 2, ...indicatorSeriesOptions }).setData(data.map(d => ({ time: d.time, value: -100 })));
                primarySeries = cciLine;
                break;
            case 'DPO':
                const dpoLine = chart.addLineSeries({ color: dpoConfig.dpo.color, lineWidth: 1, ...indicatorSeriesOptions });
                dpoLine.setData(safeData(data, 'dpo'));
                 if (showDpoSignal) {
                    const dpoMarkers = calculateDpoSignals(data);
                    dpoLine.setMarkers(sortMarkers(dpoMarkers));
                }
                chart.addLineSeries({ color: dpoConfig.madpo.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'madpo'));
                primarySeries = dpoLine;
                break;
            case 'BOLL':
                const bollCandleSeries = chart.addCandlestickSeries({ upColor: '#ef5350', downColor: '#26a69a', borderVisible: false, wickUpColor: '#ef5350', wickDownColor: '#26a69a' });
                bollCandleSeries.setData(data);
                
                const bollUpperSeries = chart.addLineSeries({ color: bollConfig.upper.color, lineWidth: 1, ...indicatorSeriesOptions });
                bollUpperSeries.setData(safeData(data, 'boll_upper'));
                
                const bollMiddleSeries = chart.addLineSeries({ color: bollConfig.middle.color, lineStyle: LightweightCharts.LineStyle.Dashed, lineWidth: 1, ...indicatorSeriesOptions });
                bollMiddleSeries.setData(safeData(data, 'boll_middle'));
                
                const bollLowerSeries = chart.addLineSeries({ color: bollConfig.lower.color, lineWidth: 1, ...indicatorSeriesOptions });
                bollLowerSeries.setData(safeData(data, 'boll_lower'));
                
                const ma1Series = chart.addLineSeries({ color: maConfig.ma5.color, lineWidth: 1, ...indicatorSeriesOptions });
                ma1Series.setData(safeData(data, 'ma5'));
                
                const ma2Series = chart.addLineSeries({ color: maConfig.ma10.color, lineWidth: 1, ...indicatorSeriesOptions });
                ma2Series.setData(safeData(data, 'ma10'));
                
                primarySeries = bollCandleSeries;
                break;
            case 'LON':
                const lonLine = chart.addLineSeries({ color: lonConfig.lon.color, lineWidth: 1, ...indicatorSeriesOptions });
                lonLine.setData(safeData(data, 'lon'));
                chart.addLineSeries({ color: lonConfig.lonma.color, lineWidth: 1, ...indicatorSeriesOptions }).setData(safeData(data, 'lonma'));
                chart.addHistogramSeries({ priceFormat: { type: 'volume' }, ...indicatorSeriesOptions }).setData(data.map(d => ({ time: d.time, value: d.lon, color: (d.lon || 0) >= 0 ? '#ef5350' : '#26a69a' })));
                primarySeries = lonLine;
                break;
        }
        return primarySeries;
    }
    
    const indicatorCharts = indicatorPaneElements.map(el => LightweightCharts.createChart(el, { ...chartOptions, height: el.clientHeight }));
    const indicatorSeries = indicatorPanes.map((indicator, index) => {
        return drawIndicator(indicatorCharts[index], indicator);
    });

    const allCharts = [mainChart, ...indicatorCharts];
    
    type SyncGroupItem = { chart: IChartApi, series: ISeriesApi<any> | null, field: keyof FormattedChartData };
    const syncGroup: SyncGroupItem[] = [
        { chart: mainChart, series: candlestickSeries, field: 'close' },
        ...indicatorPanes.map((indicator, index) => ({
            chart: indicatorCharts[index],
            series: indicatorSeries[index],
            field: getPrimaryIndicatorField(indicator),
        }))
    ];

    allCharts.forEach(chart => {
      chart.subscribeCrosshairMove(param => {
        if (!param.point || !param.time) {
          if (data.length > 0) setLegend(data[data.length - 1]);
          syncGroup.forEach(item => { if (item.chart !== chart) item.chart.clearCrosshairPosition(); });
          return;
        }

        const dataPoint = dataMap.get(param.time);
        if (dataPoint) setLegend(dataPoint);
        
        syncGroup.forEach(item => {
          if (item.chart !== chart) {
            const price = dataPoint ? dataPoint[item.field] : undefined;
            if (price !== undefined && price !== null && !isNaN(price as number) && item.series) {
                item.chart.setCrosshairPosition(price as number, param.time, item.series);
            } else if (item.series) {
                item.chart.clearCrosshairPosition();
            }
          }
        });
      });
      
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) {
          allCharts.forEach(otherChart => {
            if (otherChart !== chart) otherChart.timeScale().setVisibleLogicalRange(range);
          });
        }
      });
    });

    const resizeObserver = new ResizeObserver(entries => {
        entries.forEach(entry => {
            const chart = allCharts.find(c => c.element === entry.target);
            if (chart) {
                const { width, height } = entry.contentRect;
                chart.applyOptions({ width, height });
            }
        });
    });
    [mainPane, ...indicatorPaneElements].forEach(pane => { if(pane) resizeObserver.observe(pane); });
    
    return () => {
        resizeObserver.disconnect();
        allCharts.forEach(chart => chart.remove());
    };
  }, [data, loading, error, period, indicatorPanes, visibleMAs, dataMap, showDivergence, showTrixSignal, showDpoSignal, showBbiSignal]);

  if (loading) return <Skeleton className="h-full w-full" />;
  if (error) return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>错误</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!stockCode || data.length === 0) {
      return (
          <div className="flex h-full w-full flex-col items-center justify-center p-4 text-muted-foreground">
              <DatabaseZap className="h-12 w-12" />
              <h3 className="mt-4 text-lg font-semibold">缺少市场数据</h3>
              <p className="mt-2 text-sm">无法加载图表。请选择一个品种或在“数据管理”页面同步数据。</p>
          </div>
      );
  }
  
  const { change = 0, changePercent = 0 } = (() => {
      if (!legend || legend.open === undefined || legend.close === undefined) return {};
      const { open, close } = legend; const changeVal = close - open; const changePercentVal = (open !== 0) ? (changeVal / open) * 100 : 0;
      return { change: changeVal, changePercent: changePercentVal };
  })();
  const isUp = change >= 0;

  const mainLegend = legend && (<>
      <div className="flex items-center gap-2 mb-1"><span className="font-bold text-base text-foreground">{stockLabel}</span><span className="text-sm text-muted-foreground">{period.toUpperCase()}</span><span className="text-sm text-muted-foreground">{formatTimestamp(legend.time, period)}</span></div>
      <div className='flex items-center flex-wrap gap-x-4 text-sm text-muted-foreground'><span>开: <span className="font-mono text-foreground">{formatNumber(legend.open)}</span></span><span>高: <span className="font-mono text-foreground">{formatNumber(legend.high)}</span></span><span>低: <span className="font-mono text-foreground">{formatNumber(legend.low)}</span></span><span>收: <span className="font-mono text-foreground">{formatNumber(legend.close)}</span></span><span className={isUp ? 'text-red-500' : 'text-green-500'}>涨跌: <span className="font-mono">{formatNumber(change)}</span></span><span className={isUp ? 'text-red-500' : 'text-green-500'}>涨幅: <span className="font-mono">{formatNumber(changePercent)}%</span></span></div>
      <div className="mt-1 flex items-center flex-wrap gap-x-3 text-xs">
          {Object.entries(maConfig).map(([key, config]) => ( visibleMAs[key] && <span key={key} style={{color: config.color}}>{config.label}:<span className="font-mono ml-1">{formatNumber(legend[key as keyof FormattedChartData] as number)}</span></span>))}
      </div>
  </>);

  const createIndicatorLegend = (indicator: IndicatorType) => {
    if (!legend) return null;
    switch (indicator) {
        case 'Volume': return <span className="text-sm">成交量: <span className="font-mono">{formatBigNumber(legend.volume)}</span></span>;
        case 'MACD': return <div className="flex items-center flex-wrap gap-x-3 text-sm"><span style={{ color: macdConfig.macd.color }}>DIF: <span className="font-mono">{formatNumber(legend.macd)}</span></span><span style={{ color: macdConfig.macd_signal.color }}>DEA: <span className="font-mono">{formatNumber(legend.macd_signal)}</span></span><span>MACD: <span className="font-mono" style={{ color: (legend.macd_hist || 0) >= 0 ? '#ef5350' : '#26a69a' }}>{formatNumber(legend.macd_hist)}</span></span></div>;
        case 'KDJ': return <div className="flex items-center flex-wrap gap-x-3 text-sm"><span style={{ color: kdjConfig.k.color }}>{kdjConfig.k.label}: <span className="font-mono">{formatNumber(legend.kdj_k)}</span></span><span style={{ color: kdjConfig.d.color }}>{kdjConfig.d.label}: <span className="font-mono">{formatNumber(legend.kdj_d)}</span></span><span style={{ color: kdjConfig.j.color }}>{kdjConfig.j.label}: <span className="font-mono">{formatNumber(legend.kdj_j)}</span></span></div>;
        case 'RSI': return <div className="flex items-center flex-wrap gap-x-3 text-sm"><span style={{ color: rsiConfig.rsi1.color }}>RSI1: <span className="font-mono">{formatNumber(legend.rsi_6)}</span></span><span style={{ color: rsiConfig.rsi2.color }}>RSI2: <span className="font-mono">{formatNumber(legend.rsi_12)}</span></span><span style={{ color: rsiConfig.rsi3.color }}>RSI3: <span className="font-mono">{formatNumber(legend.rsi_24)}</span></span></div>;
        case 'TRIX': return <div className="flex items-center flex-wrap gap-x-3 text-sm"><span style={{ color: trixConfig.trix.color }}>TRIX: <span className="font-mono">{formatNumber(legend.trix)}</span></span><span style={{ color: trixConfig.trma.color }}>TRMA1: <span className="font-mono">{formatNumber(legend.trma)}</span></span></div>;
        case 'DMI': return <div className="flex items-center flex-wrap gap-x-3 text-sm"><span style={{ color: dmiConfig.pdi.color }}>{dmiConfig.pdi.label}: <span className="font-mono">{formatNumber(legend.pdi)}</span></span><span style={{ color: dmiConfig.mdi.color }}>{dmiConfig.mdi.label}: <span className="font-mono">{formatNumber(legend.mdi)}</span></span><span style={{ color: dmiConfig.adx.color }}>{dmiConfig.adx.label}: <span className="font-mono">{formatNumber(legend.adx)}</span></span><span style={{ color: dmiConfig.adxr.color }}>{dmiConfig.adxr.label}: <span className="font-mono">{formatNumber(legend.adxr)}</span></span></div>;
        case 'BIAS': return <div className="flex items-center flex-wrap gap-x-3 text-sm"><span style={{ color: biasConfig.bias6.color }}>BIAS1: <span className="font-mono">{formatNumber(legend.bias_6)}</span></span><span style={{ color: biasConfig.bias12.color }}>BIAS2: <span className="font-mono">{formatNumber(legend.bias_12)}</span></span><span style={{ color: biasConfig.bias24.color }}>BIAS3: <span className="font-mono">{formatNumber(legend.bias_24)}</span></span></div>;
        case 'BBI': return <div className="flex items-center flex-wrap gap-x-3 text-sm"><span style={{ color: bbiConfig.bbi.color }}>BBI: <span className="font-mono">{formatNumber(legend.bbi)}</span></span><span style={{ color: bbiConfig.close.color }}>CLOSE: <span className="font-mono">{formatNumber(legend.close)}</span></span></div>;
        case 'CCI': return <div className="flex items-center flex-wrap gap-x-3 text-sm"><span style={{ color: cciConfig.cci.color }}>{cciConfig.cci.label}: <span className="font-mono">{formatNumber(legend.cci)}</span></span></div>;
        case 'DPO': return <div className="flex items-center flex-wrap gap-x-3 text-sm"><span style={{ color: dpoConfig.dpo.color }}>DPO: <span className="font-mono">{formatNumber(legend.dpo)}</span></span><span style={{ color: dpoConfig.madpo.color }}>MADPO: <span className="font-mono">{formatNumber(legend.madpo)}</span></span></div>;
        case 'BOLL':
            return <div className="flex items-center flex-wrap gap-x-3 text-sm">
                <span style={{ color: bollConfig.upper.color }}>UB: <span className="font-mono">{formatNumber(legend.boll_upper)}</span></span>
                <span style={{ color: bollConfig.middle.color }}>MB: <span className="font-mono">{formatNumber(legend.boll_middle)}</span></span>
                <span style={{ color: bollConfig.lower.color }}>LB: <span className="font-mono">{formatNumber(legend.boll_lower)}</span></span>
                <span className="ml-2" style={{ color: maConfig.ma5.color }}>MA1: <span className="font-mono">{formatNumber(legend.ma5)}</span></span>
                <span style={{ color: maConfig.ma10.color }}>MA2: <span className="font-mono">{formatNumber(legend.ma10)}</span></span>
            </div>;
        case 'LON':
            return <div className="flex items-center flex-wrap gap-x-3 text-sm"><span style={{ color: lonConfig.lon.color }}>LONG: <span className="font-mono">{formatNumber(legend.lon)}</span></span><span style={{ color: lonConfig.lonma.color }}>MA1: <span className="font-mono">{formatNumber(legend.lonma)}</span></span></div>;
        default: return null;
    }
  };

  return (
    <div ref={chartContainerRef} className="flex flex-col h-full w-full text-xs text-muted-foreground">
      <div data-pane-id="main" className="relative flex-[6]">
        {legend && <div className="absolute top-2 left-2 z-10 p-2 pointer-events-none">{mainLegend}</div>}
      </div>
      {indicatorPanes.map((indicator, index) => (
        <div key={index} data-pane-id={`indicator-${index}`} className="relative flex-[2] border-t border-gray-800">
          <div className="absolute top-2 left-2 z-20 p-2 flex items-center gap-2 pointer-events-none">
            <span className="text-xs font-semibold text-foreground">{indicatorList.find(i => i.value === indicator)?.label || indicator}</span>
            {createIndicatorLegend(indicator)}
          </div>
        </div>
      ))}
    </div>
  );
 }
