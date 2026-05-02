import { formatUnits } from 'ethers';

export function shortAddress(address: string | null | undefined): string {
  const value = String(address || '').trim();
  if (!value) return '--';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function normalizeDecimalInput(value: string | null | undefined): string {
  const raw = String(value || '').trim().replace(/,/g, '');
  if (!raw) return '';
  if (!/^\d*(?:\.\d*)?$/.test(raw)) return '';
  if (raw === '.') return '0.';

  const [integerPartRaw = '', fractionalPart] = raw.split('.');
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, '') || '0';
  if (fractionalPart == null) return integerPart;
  return `${integerPart}.${fractionalPart}`;
}

export function trimDecimal(value: string, maxFractionDigits = 6): string {
  if (!value || value === '0') return value || '0';
  const [integerPart, fraction = ''] = value.split('.');
  if (!fraction) return integerPart;
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return trimmed ? `${integerPart}.${trimmed}` : integerPart;
}

export function formatTokenUnits(
  rawAmount: string | bigint | null | undefined,
  decimals: number,
  maxFractionDigits = 6
): string {
  if (rawAmount == null || rawAmount === '') return '--';
  try {
    return trimDecimal(formatUnits(BigInt(rawAmount), decimals), maxFractionDigits);
  } catch {
    const parsed = Number(rawAmount);
    if (!Number.isFinite(parsed)) return '--';
    return formatNumber(parsed, maxFractionDigits);
  }
}

export function formatNumber(value: string | number | null | undefined, maxFractionDigits = 6): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '--';
  if (parsed === 0) return '0';
  if (Math.abs(parsed) >= 1000) {
    return parsed.toLocaleString('zh-CN', { maximumFractionDigits: Math.min(2, maxFractionDigits) });
  }
  if (Math.abs(parsed) >= 1) {
    return parsed.toLocaleString('zh-CN', { maximumFractionDigits: Math.min(4, maxFractionDigits) });
  }
  return parsed.toLocaleString('zh-CN', { maximumFractionDigits: maxFractionDigits });
}

export function formatUsd(value: string | number | null | undefined): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '--';
  return `$${parsed.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: string | number | null | undefined): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '--';
  return `${parsed.toFixed(2).replace(/\.?0+$/, '')}%`;
}

export function isPositiveAmount(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
