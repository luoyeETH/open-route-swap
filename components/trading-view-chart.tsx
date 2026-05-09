'use client';

import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import type { UTCTimestamp, IChartApi, ISeriesApi, IPriceLine, CandlestickData } from 'lightweight-charts';
import type { OkxCandle } from '@/lib/okx-client';

function toUTCTimestamp(ts: string): UTCTimestamp {
  const n = Number(ts);
  if (!Number.isFinite(n)) return (Date.now() / 1000) as UTCTimestamp;
  return (n > 1_000_000_000_000 ? n / 1000 : n) as UTCTimestamp;
}

function toCandlestickData(candle: OkxCandle): CandlestickData {
  return {
    time: toUTCTimestamp(candle.timestamp),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

export default function TradingViewChart({ candles }: { candles: OkxCandle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.38)',
        fontSize: 11,
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.07)' },
        horzLines: { color: 'rgba(255,255,255,0.07)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255,255,255,0.18)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#374151',
        },
        horzLine: {
          color: 'rgba(255,255,255,0.18)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#374151',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.07)',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.07)',
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: 'rgba(45,212,191,0.82)',
      downColor: 'rgba(251,113,133,0.82)',
      borderVisible: false,
      wickUpColor: '#2dd4bf',
      wickDownColor: '#fb7185',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !candles.length) return;

    const data = candles
      .map(toCandlestickData)
      .sort((a, b) => (a.time as number) - (b.time as number));

    series.setData(data);

    const chart = chartRef.current;
    if (chart) {
      chart.timeScale().fitContent();

      // Remove previous price line
      if (priceLineRef.current) {
        series.removePriceLine(priceLineRef.current);
        priceLineRef.current = null;
      }

      // Price line for latest close
      const latest = data[data.length - 1];
      priceLineRef.current = series.createPriceLine({
        price: latest.close,
        color: latest.close >= latest.open ? 'rgba(45,212,191,0.45)' : 'rgba(251,113,133,0.45)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
      });
    }
  }, [candles]);

  return <div ref={containerRef} className="h-full w-full" />;
}
