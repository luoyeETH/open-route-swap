'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'ethers';
import {
  AlertTriangle,
  ArrowDownUp,
  ChartCandlestick,
  Check,
  ChevronDown,
  ClipboardPaste,
  ExternalLink,
  Loader2,
  Power,
  RefreshCw,
  Search,
  Settings,
  Wallet,
  X,
} from 'lucide-react';
import {
  CHAIN_CONFIGS,
  SELECTABLE_CHAIN_KEYS,
  REQUIRED_OKX_FEE_PERCENT,
  TOKEN_COLORS,
  type ChainKey,
  type TokenInfo,
  getCommonTokens,
  getConfiguredFeePercent,
  getConfiguredReferrerAddress,
  getConfiguredSolanaReferrerAddress,
  getDefaultChainKey,
  getDefaultFromToken,
  getDefaultToToken,
  getOkxBaseUrl,
  isEvmChain,
  isNativeToken,
  isSolanaChain,
  isSupportedSwapChain,
  isValidEvmAddress,
  isValidSolanaAddress,
  mergeTokenLists,
  normalizeTokenAddress,
} from '@/lib/chains';
import {
  CredentialProvider,
  OkxClient,
  OkxCredentials,
  OkxCandle,
  OkxQuote,
  getEnvDemoCredentials,
} from '@/lib/okx-client';
import {
  WalletState,
  approveToken,
  connectSolanaWallet,
  connectWallet,
  getNativeGasSymbol,
  getInjectedProvider,
  getInjectedSolanaProvider,
  getSolanaWalletState,
  getWalletState,
  isWalletOnChain,
  parseTokenAmount,
  readAllowance,
  readTokenBalance,
  sendSolanaSwapInstructions,
  sendSwapTransaction,
  switchToChain,
  type TokenBalance,
} from '@/lib/wallet-adapter';
import {
  formatNumber,
  formatPercent,
  formatTokenUnits,
  isPositiveAmount,
  normalizeDecimalInput,
  nowTimeLabel,
  shortAddress,
} from '@/lib/format';

type TokenSide = 'from' | 'to';

type HistoryItem = {
  id: string;
  type: 'approve' | 'swap';
  status: 'pending' | 'success' | 'failed';
  hash: string;
  title: string;
  createdAt: string;
  explorerUrl: string;
};

type AddressCandidate = {
  kind: 'evm' | 'solana';
  address: string;
};

type TokenMatch = {
  chainKey: ChainKey;
  token: TokenInfo;
};

type PendingChainSelection = {
  chainKey: ChainKey;
  fromAddress: string;
  toToken: TokenInfo;
};

const SESSION_CREDENTIALS_KEY = 'open-route-swap.okx.credentials';
const SESSION_MODE_KEY = 'open-route-swap.okx.mode';
const SESSION_PROXY_KEY = 'open-route-swap.okx.proxy';
const DEFAULT_NATIVE_GAS_RESERVE = '0.01';
const SLIPPAGE_PRESETS = ['0.3', '0.5', '1'];
const CANDLE_BARS = ['1m', '5m', '15m', '1H', '4H', '1Dutc'] as const;
const CANDLE_LIMIT = '120';
const ADDRESS_CANDIDATE_PATTERN = /0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function getTokenColor(symbol: string): string {
  return TOKEN_COLORS[symbol.toUpperCase()] || '#4f8f86';
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

function isSameToken(left: string, right: string, chainKey: ChainKey): boolean {
  return normalizeTokenAddress(left, chainKey) === normalizeTokenAddress(right, chainKey);
}

function tokenStorageKey(token: TokenInfo): string {
  return `${token.chainKey}:${normalizeTokenAddress(token.address, token.chainKey)}`;
}

function findTokenByAddress(tokens: TokenInfo[], chainKey: ChainKey, address: string): TokenInfo | null {
  const normalized = normalizeTokenAddress(address, chainKey);
  return tokens.find((token) => token.chainKey === chainKey && normalizeTokenAddress(token.address, chainKey) === normalized) || null;
}

function extractPastedAddress(text: string): AddressCandidate | null {
  for (const match of text.matchAll(ADDRESS_CANDIDATE_PATTERN)) {
    const value = match[0];
    if (isValidEvmAddress(value)) {
      return { kind: 'evm', address: normalizeTokenAddress(value) };
    }
    if (isValidSolanaAddress(value)) {
      return { kind: 'solana', address: value };
    }
  }
  return null;
}

function getDefaultFromTokenForTarget(chainKey: ChainKey, targetToken: TokenInfo): TokenInfo {
  const defaultFromToken = getDefaultFromToken(chainKey);
  if (!isSameToken(defaultFromToken.address, targetToken.address, chainKey)) return defaultFromToken;
  return getCommonTokens(chainKey).find((token) => !isSameToken(token.address, targetToken.address, chainKey))
    || defaultFromToken;
}

function emptyWalletState(): WalletState {
  return { address: null, chainId: null, connected: false, kind: null };
}

function buildExplorerUrl(chainKey: ChainKey, hash: string): string {
  const explorerUrl = CHAIN_CONFIGS[chainKey].blockExplorerUrl;
  if (!explorerUrl) return '#';
  return chainKey === 'solana' ? `${explorerUrl}/tx/${hash}` : `${explorerUrl}/tx/${hash}`;
}

function SwapLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label="Open Route Swap"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2230" />
          <stop offset="100%" stopColor="#111820" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="8" fill="url(#logo-bg)" />
      <path
        d="M11 16H27L24 13"
        fill="none"
        stroke="#F8FAFC"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M29 24H13L16 27"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="29" cy="16" r="3" fill="#2DD4BF" />
      <circle cx="11" cy="24" r="3" fill="#6B7280" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="7.25" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
    </svg>
  );
}

function TokenAvatar({ token, size = 30 }: { token: TokenInfo; size?: number }) {
  const letter = token.symbol.charAt(0).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
      style={{
        width: size,
        height: size,
        background: getTokenColor(token.symbol),
      }}
    >
      {letter}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.045] text-white/70 transition hover:bg-white/[0.08] hover:text-white active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ChainDropdown({
  value,
  onChange,
}: {
  value: ChainKey;
  onChange: (key: ChainKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 max-w-[130px] items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#151c23] px-2.5 text-sm font-medium text-white outline-none transition hover:bg-[#1a222b] sm:max-w-[170px]"
        title="选择链"
      >
        <span className="truncate">{CHAIN_CONFIGS[value].label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#151c23] py-1 shadow-lg shadow-black/40">
          {SELECTABLE_CHAIN_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onChange(key);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/[0.06] ${
                key === value ? 'text-teal-300' : 'text-white/80'
              }`}
            >
              {key === value && <Check className="h-3.5 w-3.5 shrink-0 text-teal-300" />}
              <span className={key === value ? '' : 'pl-[1.375rem]'}>{CHAIN_CONFIGS[key].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium text-white/45">{children}</div>;
}

function TokenSelectButton({
  token,
  onClick,
}: {
  token: TokenInfo;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex max-w-[150px] items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.055] px-2.5 py-2 text-left transition hover:bg-white/[0.09] active:translate-y-px"
    >
      <TokenAvatar token={token} size={26} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{token.symbol}</span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-white/42" />
    </button>
  );
}

function TokenAmountPanel({
  label,
  token,
  value,
  onValueChange,
  onTokenClick,
  balance,
  quoteValue,
  onMax,
  disabled,
}: {
  label: string;
  token: TokenInfo;
  value: string;
  onValueChange?: (value: string) => void;
  onTokenClick: () => void;
  balance?: TokenBalance | null;
  quoteValue?: string;
  onMax?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="soft-inset rounded-2xl p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <FieldLabel>{label}</FieldLabel>
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-white/42">
          <span className="truncate">余额 {balance ? formatNumber(balance.formatted, 6) : '--'}</span>
          {onMax ? (
            <button
              type="button"
              onClick={onMax}
              className="rounded-md px-1.5 py-0.5 font-medium text-teal-200 transition hover:bg-teal-300/10"
            >
              MAX
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange?.(normalizeDecimalInput(event.target.value))}
          placeholder="0"
          inputMode="decimal"
          className="mono-num min-w-0 flex-1 bg-transparent text-[22px] sm:text-[28px] font-semibold leading-none text-white outline-none placeholder:text-white/18 disabled:text-white/55"
        />
        <TokenSelectButton token={token} onClick={onTokenClick} />
      </div>
      <div className="mt-2 h-4 text-[11px] text-white/36">{quoteValue || ''}</div>
    </div>
  );
}

function TokenSelectorSheet({
  open,
  side,
  chainKey,
  tokens,
  selectedAddress,
  disabledAddress,
  okxClient,
  onClose,
  onSelect,
  onTokenDiscovered,
}: {
  open: boolean;
  side: TokenSide;
  chainKey: ChainKey;
  tokens: TokenInfo[];
  selectedAddress: string;
  disabledAddress: string;
  okxClient: OkxClient;
  onClose: () => void;
  onSelect: (token: TokenInfo) => void;
  onTokenDiscovered: (tokens: TokenInfo[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [remoteTokens, setRemoteTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setRemoteTokens([]);
    setError(null);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open, side]);

  useEffect(() => {
    if (!open) return;
    const search = deferredQuery.trim();
    if (search.length < 2 || !okxClient.isReady) {
      setRemoteTokens([]);
      setLoading(false);
      setError(null);
      return;
    }
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await okxClient.searchTokens(chainKey, search);
        if (requestId !== requestIdRef.current) return;
        setRemoteTokens(results);
        onTokenDiscovered(results);
        setError(null);
      } catch (searchError) {
        if (requestId !== requestIdRef.current) return;
        setRemoteTokens([]);
        setError(readErrorMessage(searchError, '搜索失败'));
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [chainKey, deferredQuery, okxClient, onTokenDiscovered, open]);

  const visibleTokens = useMemo(() => {
    const search = query.trim().toLowerCase();
    const merged = mergeTokenLists([...tokens, ...remoteTokens]);
    if (!search) return merged;
    return merged.filter((token) => (
      token.symbol.toLowerCase().includes(search)
      || token.name.toLowerCase().includes(search)
      || token.address.toLowerCase().includes(search)
    ));
  }, [query, remoteTokens, tokens]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/62 backdrop-blur-sm" />
      <div
        className="sheet-enter relative max-h-[76dvh] w-full max-w-[440px] overflow-hidden rounded-t-2xl border border-white/[0.08] bg-[#11171d] shadow-soft sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div className="text-sm font-semibold">选择代币</div>
          <IconButton title="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="border-b border-white/[0.07] p-4">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.045] px-3 py-2">
            <Search className="h-4 w-4 text-white/38" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="名称 / 地址"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/28"
            />
          </div>
          {error ? <div className="mt-2 text-xs text-rose-200">{error}</div> : null}
        </div>
        <div className="max-h-[52dvh] overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-2 p-2">
              <div className="skeleton h-12 rounded-xl" />
              <div className="skeleton h-12 rounded-xl" />
              <div className="skeleton h-12 rounded-xl" />
            </div>
          ) : visibleTokens.length > 0 ? (
            visibleTokens.map((token) => {
              const disabled = isSameToken(token.address, disabledAddress, chainKey);
              const selected = isSameToken(token.address, selectedAddress, chainKey);
              return (
                <button
                  type="button"
                  key={`${token.chainKey}:${token.address}`}
                  disabled={disabled}
                  onClick={() => {
                    onSelect(token);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <TokenAvatar token={token} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{token.symbol}</span>
                    <span className="block truncate text-xs text-white/38">{token.name}</span>
                  </span>
                  <span className="mono-num text-xs text-white/32">{shortAddress(token.address)}</span>
                  {selected ? <Check className="h-4 w-4 text-teal-200" /> : null}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-10 text-center text-sm text-white/40">无结果</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsSheet({
  open,
  mode,
  credentials,
  signerProxyUrl,
  onClose,
  onModeChange,
  onCredentialsChange,
  onSignerProxyUrlChange,
  onSaveCredentials,
  onClearCredentials,
}: {
  open: boolean;
  mode: CredentialProvider;
  credentials: OkxCredentials;
  signerProxyUrl: string;
  onClose: () => void;
  onModeChange: (mode: CredentialProvider) => void;
  onCredentialsChange: (credentials: OkxCredentials) => void;
  onSignerProxyUrlChange: (value: string) => void;
  onSaveCredentials: () => void;
  onClearCredentials: () => void;
}) {
  if (!open) return null;

  const envDemo = getEnvDemoCredentials();
  const modes: Array<{ value: CredentialProvider; label: string; disabled?: boolean }> = [
    { value: 'user-input', label: '用户 Key' },
    { value: 'signer-proxy', label: 'Proxy' },
    { value: 'env-demo', label: 'Env Demo', disabled: !envDemo },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/62 backdrop-blur-sm" />
      <div
        className="sheet-enter relative w-full max-w-[460px] rounded-t-2xl border border-white/[0.08] bg-[#11171d] shadow-soft sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div className="text-sm font-semibold">OKX 设置</div>
          <IconButton title="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-3 gap-2">
            {modes.map((item) => (
              <button
                type="button"
                key={item.value}
                disabled={item.disabled}
                onClick={() => onModeChange(item.value)}
                className={`rounded-xl border px-3 py-2 text-sm transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35 ${
                  mode === item.value
                    ? 'border-teal-300/35 bg-teal-300/12 text-teal-100'
                    : 'border-white/[0.08] bg-white/[0.04] text-white/62 hover:bg-white/[0.07]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {mode === 'user-input' ? (
            <div className="space-y-3">
              <InputBlock
                label="API Key"
                value={credentials.apiKey}
                onChange={(value) => onCredentialsChange({ ...credentials, apiKey: value })}
              />
              <InputBlock
                label="Secret"
                type="password"
                value={credentials.secretKey}
                onChange={(value) => onCredentialsChange({ ...credentials, secretKey: value })}
              />
              <InputBlock
                label="Passphrase"
                type="password"
                value={credentials.passphrase}
                onChange={(value) => onCredentialsChange({ ...credentials, passphrase: value })}
              />
              <div className="rounded-xl border border-amber-200/16 bg-amber-200/[0.06] px-3 py-2 text-xs text-amber-100/80">
                Secret 仅会话保存。浏览器不可保护 Secret。
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onSaveCredentials} className="button-primary h-10 flex-1 rounded-xl text-sm font-semibold transition active:translate-y-px">
                  保存
                </button>
                <button type="button" onClick={onClearCredentials} className="h-10 rounded-xl border border-white/[0.08] px-4 text-sm text-white/68 transition hover:bg-white/[0.06] active:translate-y-px">
                  清除
                </button>
              </div>
            </div>
          ) : null}

          {mode === 'signer-proxy' ? (
            <div className="space-y-3">
              <InputBlock label="Proxy URL" value={signerProxyUrl} onChange={onSignerProxyUrlChange} />
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white/50">
                Proxy 只签 OKX 请求，不签链上交易。
              </div>
            </div>
          ) : null}

          {mode === 'env-demo' ? (
            <div className="rounded-xl border border-amber-200/16 bg-amber-200/[0.06] px-3 py-2 text-xs text-amber-100/80">
              Env Demo 仅开发用。公开变量不保护 Secret。
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InputBlock({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-white/50">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.045] px-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-teal-300/35"
      />
    </label>
  );
}

function ConfirmSwapModal({
  open,
  loading,
  fromToken,
  toToken,
  amount,
  quote,
  onClose,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  amount: string;
  quote: OkxQuote | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" onClick={loading ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/62 backdrop-blur-sm" />
      <div
        className="sheet-enter relative w-full max-w-[420px] rounded-t-2xl border border-white/[0.08] bg-[#11171d] shadow-soft sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div className="text-sm font-semibold">确认交易</div>
          <IconButton title="关闭" onClick={onClose} disabled={loading}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="space-y-3 p-4">
          <div className="soft-inset rounded-2xl p-3">
            <div className="mono-num text-lg font-semibold">
              {amount || '0'} {fromToken.symbol}
            </div>
            <div className="mt-1 text-sm text-white/45">
              预计 {quote ? formatTokenUnits(quote.toTokenAmount, toToken.decimals, 8) : '--'} {toToken.symbol}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-white/50">
            <div className="soft-inset rounded-xl p-3">
              <div>滑点</div>
              <div className="mono-num mt-1 text-white/80">{quote ? formatPercent(quote.priceImpactPercent) : '--'}</div>
            </div>
            <div className="soft-inset rounded-xl p-3">
              <div>平台费</div>
              <div className="mono-num mt-1 text-white/80">{REQUIRED_OKX_FEE_PERCENT}%</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="button-primary flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition active:translate-y-px disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? '处理中' : '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}

function candleTimestampToMs(timestamp: string): number {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed)) return Date.now();
  return parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
}

function formatCandleTime(timestamp: string): string {
  return new Date(candleTimestampToMs(timestamp)).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCandlePrice(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '--';
  const price = Number(value);
  return formatNumber(price, Math.abs(price) < 0.01 ? 10 : 6);
}

function CandleChart({ candles }: { candles: OkxCandle[] }) {
  const width = 720;
  const height = 300;
  const padding = { top: 16, right: 14, bottom: 26, left: 58 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const lows = candles.map((candle) => candle.low);
  const highs = candles.map((candle) => candle.high);
  const low = Math.min(...lows);
  const high = Math.max(...highs);
  const range = high - low || Math.max(high * 0.002, 1);
  const minPrice = low - range * 0.05;
  const maxPrice = high + range * 0.05;
  const yForPrice = (price: number) => padding.top + ((maxPrice - price) / (maxPrice - minPrice)) * innerHeight;
  const step = candles.length > 1 ? innerWidth / (candles.length - 1) : innerWidth;
  const bodyWidth = Math.max(2, Math.min(8, step * 0.58));
  const ticks = Array.from({ length: 4 }, (_, index) => maxPrice - ((maxPrice - minPrice) * index) / 3);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="K 线图" className="h-full w-full">
      <rect x="0" y="0" width={width} height={height} rx="14" fill="rgba(255,255,255,0.025)" />
      {ticks.map((tick) => {
        const y = yForPrice(tick);
        return (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-white/38 text-[11px] mono-num">
              {formatCandlePrice(tick)}
            </text>
          </g>
        );
      })}
      {candles.map((candle, index) => {
        const x = padding.left + (candles.length > 1 ? step * index : innerWidth / 2);
        const highY = yForPrice(candle.high);
        const lowY = yForPrice(candle.low);
        const openY = yForPrice(candle.open);
        const closeY = yForPrice(candle.close);
        const isUp = candle.close >= candle.open;
        const color = isUp ? '#2dd4bf' : '#fb7185';
        const rawHeight = Math.abs(openY - closeY);
        const bodyHeight = Math.max(1, rawHeight);
        const bodyY = Math.min(openY, closeY) - (rawHeight < 1 ? 0.5 : 0);
        return (
          <g key={`${candle.timestamp}:${index}`}>
            <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.25" />
            <rect
              x={x - bodyWidth / 2}
              y={bodyY}
              width={bodyWidth}
              height={bodyHeight}
              rx="0.8"
              fill={isUp ? 'rgba(45,212,191,0.82)' : 'rgba(251,113,133,0.82)'}
            />
          </g>
        );
      })}
      {candles.length ? (
        <>
          <text x={padding.left} y={height - 7} className="fill-white/34 text-[11px] mono-num">
            {formatCandleTime(candles[0].timestamp)}
          </text>
          <text x={width - padding.right} y={height - 7} textAnchor="end" className="fill-white/34 text-[11px] mono-num">
            {formatCandleTime(candles[candles.length - 1].timestamp)}
          </text>
        </>
      ) : null}
    </svg>
  );
}

function KlineModal({
  open,
  chainKey,
  token,
  okxClient,
  onClose,
}: {
  open: boolean;
  chainKey: ChainKey;
  token: TokenInfo;
  okxClient: OkxClient;
  onClose: () => void;
}) {
  const [bar, setBar] = useState<(typeof CANDLE_BARS)[number]>('15m');
  const [candles, setCandles] = useState<OkxCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setBar('15m');
  }, [chainKey, open, token.address]);

  useEffect(() => {
    if (!open) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestIdRef.current;
    if (!okxClient.isReady) {
      setCandles([]);
      setLoading(false);
      setError('请先设置 OKX');
      return;
    }
    setLoading(true);
    setError(null);
    okxClient.getCandles({
      chainKey,
      tokenContractAddress: token.address,
      bar,
      limit: CANDLE_LIMIT,
    })
      .then((nextCandles) => {
        if (requestId !== requestIdRef.current) return;
        setCandles(nextCandles);
        setError(null);
      })
      .catch((fetchError) => {
        if (requestId !== requestIdRef.current) return;
        setCandles([]);
        setError(readErrorMessage(fetchError, 'K 线加载失败'));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [bar, chainKey, okxClient, open, token.address]);

  if (!open) return null;

  const firstCandle = candles[0] || null;
  const latestCandle = candles[candles.length - 1] || null;
  const changePercent = firstCandle && latestCandle && firstCandle.open > 0
    ? ((latestCandle.close - firstCandle.open) / firstCandle.open) * 100
    : null;
  const changeIsPositive = Number(changePercent) >= 0;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/62 backdrop-blur-sm" />
      <div
        className="sheet-enter relative flex max-h-[88dvh] w-full max-w-[900px] flex-col overflow-hidden rounded-t-2xl border border-white/[0.08] bg-[#11171d] shadow-soft sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <TokenAvatar token={token} size={28} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{token.symbol} K 线</div>
              <div className="truncate text-xs text-white/38">{CHAIN_CONFIGS[chainKey].label} · {shortAddress(token.address)}</div>
            </div>
          </div>
          <IconButton title="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-[1fr_1fr_auto]">
            <div className="soft-inset rounded-xl p-3">
              <div className="text-[11px] text-white/40">最新价</div>
              <div className="mono-num mt-1 text-base font-semibold text-white">
                {latestCandle ? formatCandlePrice(latestCandle.close) : '--'}
              </div>
            </div>
            <div className="soft-inset rounded-xl p-3">
              <div className="text-[11px] text-white/40">区间涨跌幅</div>
              <div className={`mono-num mt-1 text-base font-semibold ${changeIsPositive ? 'text-teal-200' : 'text-rose-200'}`}>
                {changePercent == null ? '--' : formatPercent(changePercent)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-white/[0.035] p-1 min-[360px]:col-span-2 sm:col-span-1">
              {CANDLE_BARS.map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setBar(value)}
                  className={`mono-num h-8 min-w-0 rounded-lg px-2 text-xs transition active:translate-y-px ${
                    bar === value
                      ? 'border border-white/[0.12] bg-[#374151] text-white shadow-inset'
                      : 'border border-transparent text-white/45 hover:bg-[#242c35] hover:text-white/72'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[260px] rounded-2xl border border-white/[0.08] bg-white/[0.025] p-2 sm:h-[320px]">
            {loading ? (
              <div className="h-full space-y-3 p-3">
                <div className="skeleton h-7 w-40 rounded-lg" />
                <div className="skeleton h-[250px] rounded-xl" />
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-amber-100/82">
                {error}
              </div>
            ) : candles.length ? (
              <CandleChart candles={candles} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/40">
                暂无 K 线数据
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SwapConsole() {
  const [chainKey, setChainKey] = useState<ChainKey>(getDefaultChainKey());
  const [wallet, setWallet] = useState<WalletState>(emptyWalletState);
  const [tokens, setTokens] = useState<TokenInfo[]>(() => getCommonTokens(getDefaultChainKey()));
  const [fromAddress, setFromAddress] = useState(() => getDefaultFromToken(getDefaultChainKey()).address);
  const [toAddress, setToAddress] = useState(() => getDefaultToToken(getDefaultChainKey()).address);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [balances, setBalances] = useState<Record<string, TokenBalance>>({});
  const [quote, setQuote] = useState<OkxQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<string | null>(null);
  const [activeTokenSide, setActiveTokenSide] = useState<TokenSide | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [klineOpen, setKlineOpen] = useState(false);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [credentialMode, setCredentialMode] = useState<CredentialProvider>('none');
  const [credentials, setCredentials] = useState<OkxCredentials>({ apiKey: '', secretKey: '', passphrase: '' });
  const [signerProxyUrl, setSignerProxyUrl] = useState(process.env.NEXT_PUBLIC_OKX_SIGNER_PROXY_URL?.trim() || '');
  const [manuallyDisconnectedKind, setManuallyDisconnectedKind] = useState<WalletState['kind']>(null);

  const quoteRequestIdRef = useRef(0);
  const balanceRequestIdRef = useRef(0);
  const pendingChainSelectionRef = useRef<PendingChainSelection | null>(null);
  const chain = CHAIN_CONFIGS[chainKey];
  const isSolanaSelected = isSolanaChain(chainKey);
  const commonTokens = getCommonTokens(chainKey);
  const chainTokens = useMemo(
    () => mergeTokenLists([...commonTokens, ...tokens.filter((token) => token.chainKey === chainKey)]),
    [chainKey, commonTokens, tokens]
  );
  const nativeGasSymbol = getNativeGasSymbol(chainKey);
  const expectedChainLabel = chain.label;
  const selectedWalletKind = isSolanaSelected ? 'solana' : 'evm';
  const walletOnSelectedChain = isSolanaSelected
    ? wallet.kind === 'solana' && wallet.connected
    : wallet.kind === 'evm' && isWalletOnChain(wallet.chainId, chainKey);

  const fromToken = useMemo(
    () => chainTokens.find((token) => isSameToken(token.address, fromAddress, chainKey)) || getDefaultFromToken(chainKey),
    [chainKey, chainTokens, fromAddress]
  );
  const toToken = useMemo(
    () => chainTokens.find((token) => isSameToken(token.address, toAddress, chainKey)) || getDefaultToToken(chainKey),
    [chainKey, chainTokens, toAddress]
  );

  const envDemoCredentials = useMemo(() => getEnvDemoCredentials(), []);
  const okxCredentials = credentialMode === 'env-demo' ? envDemoCredentials : credentials;
  const okxClient = useMemo(() => new OkxClient({
    mode: credentialMode,
    credentials: okxCredentials,
    signerProxyUrl,
    baseUrl: getOkxBaseUrl(),
  }), [credentialMode, okxCredentials, signerProxyUrl]);

  const feePercent = getConfiguredFeePercent();
  const referrerAddress = getConfiguredReferrerAddress();
  const solanaReferrerAddress = getConfiguredSolanaReferrerAddress();
  const configError = useMemo(() => {
    if (!isSupportedSwapChain(chainKey)) return `${chain.label} 暂未开放`;
    if (Number(feePercent) !== Number(REQUIRED_OKX_FEE_PERCENT)) return '费率必须为 0.01%';
    if (isSolanaSelected) {
      if (!solanaReferrerAddress || !isValidSolanaAddress(solanaReferrerAddress)) return '缺 Solana 手续费地址';
      return null;
    }
    if (!isValidEvmAddress(referrerAddress)) return '缺手续费地址';
    return null;
  }, [chain.label, chainKey, feePercent, isSolanaSelected, referrerAddress, solanaReferrerAddress]);

  const fromBalance = balances[tokenStorageKey(fromToken)] || null;
  const toBalance = balances[tokenStorageKey(toToken)] || null;
  const amountRaw = useMemo(() => {
    if (!isPositiveAmount(amount)) return null;
    try {
      return parseTokenAmount(amount, fromToken.decimals).toString();
    } catch {
      return null;
    }
  }, [amount, fromToken.decimals]);

  const balanceTooLow = useMemo(() => {
    if (!amountRaw || !fromBalance) return false;
    try {
      return BigInt(fromBalance.raw) < BigInt(amountRaw);
    } catch {
      return false;
    }
  }, [amountRaw, fromBalance]);

  const highImpact = Number(quote?.priceImpactPercent) > 5;
  const routeLabel = quote?.routes?.length
    ? quote.routes.slice(0, 2).map((route) => `${route.dex} ${route.percent}%`).join(' / ')
    : '--';

  const primaryIssue = useMemo(() => {
    if (!wallet.connected) return '连接钱包';
    if (isSolanaSelected && wallet.kind !== 'solana') return '连接 Solana 钱包';
    if (!isSolanaSelected && wallet.kind !== 'evm') return '连接 EVM 钱包';
    if (!walletOnSelectedChain) return isSolanaSelected ? '连接 Solana 钱包' : `切换 ${expectedChainLabel}`;
    if (!okxClient.isReady) return '设置 OKX';
    if (configError) return configError;
    if (!isPositiveAmount(amount)) return '输入数量';
    if (!amountRaw) return '数量无效';
    if (balanceTooLow) return '余额不足';
    if (quoteLoading) return '报价中';
    if (!quote) return '获取报价';
    if (quote.isHoneyPot === true) return '风险代币';
    return null;
  }, [
    amount,
    amountRaw,
    balanceTooLow,
    configError,
    expectedChainLabel,
    okxClient.isReady,
    quote,
    quoteLoading,
    isSolanaSelected,
    wallet.connected,
    wallet.kind,
    walletOnSelectedChain,
  ]);

  const outputAmount = quote ? formatTokenUnits(quote.toTokenAmount, toToken.decimals, 8) : '';
  const actionableIssues = useMemo(
    () => new Set(['连接钱包', '连接 Solana 钱包', '连接 EVM 钱包', `切换 ${expectedChainLabel}`, '设置 OKX', '获取报价']),
    [expectedChainLabel]
  );

  useEffect(() => {
    try {
      const savedCredentials = sessionStorage.getItem(SESSION_CREDENTIALS_KEY);
      const savedMode = sessionStorage.getItem(SESSION_MODE_KEY) as CredentialProvider | null;
      const savedProxy = sessionStorage.getItem(SESSION_PROXY_KEY);
      if (savedProxy) setSignerProxyUrl(savedProxy);
      if (savedCredentials) {
        const parsed = JSON.parse(savedCredentials) as OkxCredentials;
        setCredentials({
          apiKey: parsed.apiKey || '',
          secretKey: parsed.secretKey || '',
          passphrase: parsed.passphrase || '',
        });
      }
      if (savedMode) {
        setCredentialMode(savedMode);
      } else if (savedCredentials) {
        setCredentialMode('user-input');
      } else if (process.env.NEXT_PUBLIC_OKX_SIGNER_PROXY_URL) {
        setCredentialMode('signer-proxy');
      } else if (envDemoCredentials) {
        setCredentialMode('env-demo');
      }
    } catch {
      setCredentialMode('none');
    }
  }, [envDemoCredentials]);

  useEffect(() => {
    if (manuallyDisconnectedKind === selectedWalletKind) return;
    let mounted = true;
    const readState = chainKey === 'solana' ? getSolanaWalletState() : getWalletState();
    readState
      .then((state) => {
        if (mounted && (state.connected || wallet.kind !== selectedWalletKind)) setWallet(state);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [chainKey, manuallyDisconnectedKind, selectedWalletKind, wallet.kind]);

  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider?.on) return;
    const handleAccountsChanged = (accountsValue: unknown) => {
      if (chainKey === 'solana') return;
      const accounts = Array.isArray(accountsValue) ? accountsValue : [];
      if (manuallyDisconnectedKind === 'evm' && typeof accounts[0] === 'string') return;
      setWallet((current) => ({
        ...current,
        address: typeof accounts[0] === 'string' ? accounts[0] : null,
        connected: typeof accounts[0] === 'string',
        kind: typeof accounts[0] === 'string' ? 'evm' : null,
      }));
    };
    const handleChainChanged = (chainIdValue: unknown) => {
      if (chainKey === 'solana') return;
      const chainIdHex = String(chainIdValue || '0x0');
      setWallet((current) => ({
        ...current,
        chainId: Number.parseInt(chainIdHex, 16),
      }));
    };
    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);
    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [chainKey, manuallyDisconnectedKind]);

  useEffect(() => {
    const provider = getInjectedSolanaProvider();
    if (!provider?.on) return;
    const handleConnect = (publicKeyValue: unknown) => {
      if (chainKey !== 'solana') return;
      if (manuallyDisconnectedKind === 'solana') return;
      const address = publicKeyValue && typeof publicKeyValue === 'object' && 'toString' in publicKeyValue
        ? publicKeyValue.toString()
        : typeof publicKeyValue === 'string'
          ? publicKeyValue
          : provider.publicKey?.toString() || null;
      setWallet({
        address,
        chainId: null,
        connected: Boolean(address),
        kind: address ? 'solana' : null,
      });
    };
    const handleDisconnect = () => {
      if (chainKey !== 'solana') return;
      setWallet(emptyWalletState());
      setBalances({});
    };
    provider.on('connect', handleConnect);
    provider.on('disconnect', handleDisconnect);
    provider.on('accountChanged', handleConnect);
    return () => {
      provider.removeListener?.('connect', handleConnect);
      provider.removeListener?.('disconnect', handleDisconnect);
      provider.removeListener?.('accountChanged', handleConnect);
    };
  }, [chainKey, manuallyDisconnectedKind]);

  useEffect(() => {
    const pendingSelection = pendingChainSelectionRef.current;
    if (pendingSelection?.chainKey === chainKey) {
      pendingChainSelectionRef.current = null;
      const nextCommonTokens = getCommonTokens(chainKey);
      setTokens((current) => mergeTokenLists([...current, ...nextCommonTokens, pendingSelection.toToken]));
      setFromAddress(pendingSelection.fromAddress);
      setToAddress(pendingSelection.toToken.address);
      setAmount('');
      balanceRequestIdRef.current += 1;
      quoteRequestIdRef.current += 1;
      setBalances({});
      setQuote(null);
      setQuoteLoading(false);
      setQuoteError(null);
      setQuoteUpdatedAt(null);
      setExecutionError(null);
      return;
    }

    const defaultFromToken = getDefaultFromToken(chainKey);
    const defaultToToken = getDefaultToToken(chainKey);
    setTokens((current) => mergeTokenLists([...current, ...getCommonTokens(chainKey)]));
    setFromAddress(defaultFromToken.address);
    setToAddress(defaultToToken.address);
    setAmount('');
    balanceRequestIdRef.current += 1;
    quoteRequestIdRef.current += 1;
    setBalances({});
    setQuote(null);
    setQuoteLoading(false);
    setQuoteError(null);
    setQuoteUpdatedAt(null);
    setExecutionError(null);
  }, [chainKey]);

  useEffect(() => {
    setWallet((current) => (
      current.connected && current.kind === selectedWalletKind
        ? current
        : emptyWalletState()
    ));
    setBalances({});
  }, [selectedWalletKind]);

  const addTokens = useCallback((incoming: TokenInfo[]) => {
    if (!incoming.length) return;
    setTokens((current) => mergeTokenLists([...current, ...incoming]));
  }, []);

  const clearQuoteState = useCallback(() => {
    quoteRequestIdRef.current += 1;
    setQuote(null);
    setQuoteLoading(false);
    setQuoteError(null);
    setQuoteUpdatedAt(null);
  }, []);

  const applyPastedToken = useCallback((match: TokenMatch) => {
    addTokens([match.token]);
    setExecutionError(null);
    clearQuoteState();

    if (match.chainKey === chainKey) {
      setToAddress(match.token.address);
      return;
    }

    const nextFromToken = getDefaultFromTokenForTarget(match.chainKey, match.token);
    pendingChainSelectionRef.current = {
      chainKey: match.chainKey,
      fromAddress: nextFromToken.address,
      toToken: match.token,
    };
    setTokens((current) => mergeTokenLists([
      ...current,
      ...getCommonTokens(match.chainKey),
      nextFromToken,
      match.token,
    ]));
    setChainKey(match.chainKey);
  }, [addTokens, chainKey, clearQuoteState]);

  const resolvePastedToken = useCallback(async (candidate: AddressCandidate): Promise<TokenMatch | null> => {
    const currentLocalMatch = findTokenByAddress(chainTokens, chainKey, candidate.address);
    if (currentLocalMatch) return { chainKey, token: currentLocalMatch };

    const candidateChains: ChainKey[] = candidate.kind === 'solana'
      ? ['solana']
      : [
        ...(isEvmChain(chainKey) ? [chainKey] : []),
        ...SELECTABLE_CHAIN_KEYS.filter((key) => isEvmChain(key) && key !== chainKey),
      ];

    for (const candidateChainKey of candidateChains) {
      if (candidateChainKey === chainKey) continue;
      const localTokens = mergeTokenLists([
        ...getCommonTokens(candidateChainKey),
        ...tokens.filter((token) => token.chainKey === candidateChainKey),
      ]);
      const localMatch = findTokenByAddress(localTokens, candidateChainKey, candidate.address);
      if (localMatch) return { chainKey: candidateChainKey, token: localMatch };
    }

    if (!okxClient.isReady) {
      throw new Error('本地未找到该代币，请先设置 OKX');
    }

    const remoteTokens = await okxClient.searchTokensAcrossChains(candidateChains, candidate.address);
    for (const candidateChainKey of candidateChains) {
      const remoteMatch = findTokenByAddress(remoteTokens, candidateChainKey, candidate.address);
      if (remoteMatch) return { chainKey: candidateChainKey, token: remoteMatch };
    }

    return null;
  }, [chainKey, chainTokens, okxClient, tokens]);

  const handlePasteContract = useCallback(async () => {
    setExecutionError(null);
    setPasteLoading(true);
    try {
      if (!navigator.clipboard?.readText) throw new Error('当前浏览器不支持读取剪切板');
      const text = await navigator.clipboard.readText();
      const candidate = extractPastedAddress(text);
      if (!candidate) throw new Error('剪切板里没有有效合约地址');
      const match = await resolvePastedToken(candidate);
      if (!match) throw new Error('未找到该代币');
      applyPastedToken(match);
    } catch (error) {
      setExecutionError(readErrorMessage(error, '读取剪切板失败'));
    } finally {
      setPasteLoading(false);
    }
  }, [applyPastedToken, resolvePastedToken]);

  const refreshBalances = useCallback(async () => {
    if (!wallet.address || !isSupportedSwapChain(chainKey) || (isSolanaSelected && wallet.kind !== 'solana') || (!isSolanaSelected && wallet.kind !== 'evm')) return;
    const requestId = ++balanceRequestIdRef.current;
    const tokenList = mergeTokenLists([...commonTokens, fromToken, toToken]);
    try {
      const settled = await Promise.allSettled(
        tokenList.map((token) => readTokenBalance(token, wallet.address as string, chainKey))
      );
      if (requestId !== balanceRequestIdRef.current) return;
      const next: Record<string, TokenBalance> = {};
      for (const item of settled) {
        if (item.status === 'fulfilled') {
          next[tokenStorageKey(item.value.token)] = item.value;
        }
      }
      setBalances(next);
    } catch {
      if (requestId === balanceRequestIdRef.current) setBalances({});
    }
  }, [chainKey, commonTokens, fromToken, isSolanaSelected, toToken, wallet.address, wallet.kind]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  const fetchQuote = useCallback(async () => {
    setQuote(null);
    setQuoteError(null);
    if (!isSupportedSwapChain(chainKey) || !okxClient.isReady || !isPositiveAmount(amount) || !amountRaw) {
      return;
    }
    if (isSameToken(fromToken.address, toToken.address, chainKey)) {
      setQuoteError('代币相同');
      return;
    }
    const requestId = ++quoteRequestIdRef.current;
    setQuoteLoading(true);
    try {
      const nextQuote = await okxClient.getQuote({
        chainKey,
        fromTokenAddress: fromToken.address,
        toTokenAddress: toToken.address,
        amount: amountRaw,
        slippagePercent: slippage,
      });
      if (requestId !== quoteRequestIdRef.current) return;
      setQuote(nextQuote);
      setQuoteUpdatedAt(nowTimeLabel());
    } catch (error) {
      if (requestId !== quoteRequestIdRef.current) return;
      setQuoteError(readErrorMessage(error, '报价失败'));
      setQuote(null);
    } finally {
      if (requestId === quoteRequestIdRef.current) setQuoteLoading(false);
    }
  }, [amount, amountRaw, chainKey, fromToken.address, okxClient, slippage, toToken.address]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchQuote();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [fetchQuote]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchQuote();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [fetchQuote]);

  const saveCredentials = useCallback(() => {
    sessionStorage.setItem(SESSION_CREDENTIALS_KEY, JSON.stringify(credentials));
    sessionStorage.setItem(SESSION_MODE_KEY, credentialMode === 'none' ? 'user-input' : credentialMode);
    if (signerProxyUrl) sessionStorage.setItem(SESSION_PROXY_KEY, signerProxyUrl);
    setCredentialMode('user-input');
    setSettingsOpen(false);
  }, [credentialMode, credentials, signerProxyUrl]);

  const clearCredentials = useCallback(() => {
    sessionStorage.removeItem(SESSION_CREDENTIALS_KEY);
    sessionStorage.removeItem(SESSION_MODE_KEY);
    setCredentials({ apiKey: '', secretKey: '', passphrase: '' });
    setCredentialMode('none');
  }, []);

  const handleConnect = useCallback(async () => {
    setExecutionError(null);
    setManuallyDisconnectedKind(null);
    try {
      setWallet(isSolanaSelected ? await connectSolanaWallet() : await connectWallet());
    } catch (error) {
      setExecutionError(readErrorMessage(error, '连接失败'));
    }
  }, [isSolanaSelected]);

  const handleSwitchChain = useCallback(async () => {
    setExecutionError(null);
    try {
      await switchToChain(chainKey);
      setWallet(await getWalletState());
    } catch (error) {
      setExecutionError(readErrorMessage(error, '切链失败'));
    }
  }, [chainKey]);

  const handleDisconnect = useCallback(async () => {
    setManuallyDisconnectedKind(selectedWalletKind);
    if (selectedWalletKind === 'solana') {
      await getInjectedSolanaProvider()?.disconnect?.().catch(() => undefined);
    }
    setWallet(emptyWalletState());
    setBalances({});
  }, [selectedWalletKind]);

  const handleMax = useCallback(() => {
    if (!fromBalance) return;
    try {
      let raw = BigInt(fromBalance.raw);
      if (isNativeToken(fromToken.address, chainKey)) {
        const reserve = parseTokenAmount(DEFAULT_NATIVE_GAS_RESERVE, fromToken.decimals);
        raw = raw > reserve ? raw - reserve : 0n;
      }
      setAmount(formatUnits(raw, fromToken.decimals));
    } catch {
      setAmount(fromBalance.formatted);
    }
  }, [fromBalance, fromToken.address, fromToken.decimals]);

  const handleFlip = useCallback(() => {
    setFromAddress(toToken.address);
    setToAddress(fromToken.address);
    setQuote(null);
    setQuoteError(null);
  }, [fromToken.address, toToken.address]);

  const handlePrimaryAction = useCallback(async () => {
    setExecutionError(null);
    if (!wallet.connected) {
      await handleConnect();
      return;
    }
    if (isSolanaSelected && wallet.kind !== 'solana') {
      await handleConnect();
      return;
    }
    if (!isSolanaSelected && wallet.kind !== 'evm') {
      await handleConnect();
      return;
    }
    if (!walletOnSelectedChain) {
      if (isSolanaSelected) {
        await handleConnect();
        return;
      }
      await handleSwitchChain();
      return;
    }
    if (!okxClient.isReady) {
      setSettingsOpen(true);
      return;
    }
    if (!quote) {
      await fetchQuote();
      return;
    }
    if (!primaryIssue) setConfirmOpen(true);
  }, [
    fetchQuote,
    handleConnect,
    handleSwitchChain,
    isSolanaSelected,
    okxClient.isReady,
    primaryIssue,
    quote,
    wallet.connected,
    wallet.kind,
    walletOnSelectedChain,
  ]);

  const upsertHistory = useCallback((item: HistoryItem) => {
    setHistory((current) => [item, ...current.filter((row) => row.id !== item.id)].slice(0, 8));
  }, []);

  const updateHistoryStatus = useCallback((id: string, status: HistoryItem['status']) => {
    setHistory((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
  }, []);

  const executeSwap = useCallback(async () => {
    if (!wallet.address || !amountRaw || !quote || configError || !walletOnSelectedChain) return;
    setExecutionLoading(true);
    setExecutionError(null);
    try {
      if (isSolanaSelected) {
        const swap = await okxClient.getSolanaSwapInstructions({
          fromTokenAddress: fromToken.address,
          toTokenAddress: toToken.address,
          amount: amountRaw,
          slippagePercent: slippage,
          userWalletAddress: wallet.address,
          feePercent: REQUIRED_OKX_FEE_PERCENT,
          fromTokenReferrerWalletAddress: solanaReferrerAddress,
        });
        const signature = await sendSolanaSwapInstructions({
          instructions: swap.instructionLists,
          addressLookupTableAccounts: swap.addressLookupTableAccount,
          walletAddress: wallet.address,
        });
        const swapId = `swap:${signature}`;
        upsertHistory({
          id: swapId,
          type: 'swap',
          status: 'success',
          hash: signature,
          title: `${fromToken.symbol} -> ${toToken.symbol}`,
          createdAt: nowTimeLabel(),
          explorerUrl: buildExplorerUrl(chainKey, signature),
        });
        setConfirmOpen(false);
        await refreshBalances();
        await fetchQuote();
        return;
      }

      if (!isNativeToken(fromToken.address, chainKey)) {
        const approval = await okxClient.getApproveTransaction({
          chainKey,
          tokenContractAddress: fromToken.address,
          approveAmount: amountRaw,
        });
        const spender = approval.dexContractAddress;
        if (!spender) throw new Error('OKX 授权地址为空');
        const allowance = await readAllowance(fromToken.address, wallet.address, spender, chainKey);
        if (allowance < BigInt(amountRaw)) {
          const approveTx = await approveToken(fromToken.address, spender, BigInt(amountRaw), chainKey);
          const approveId = `approve:${approveTx.hash}`;
          upsertHistory({
            id: approveId,
            type: 'approve',
            status: 'pending',
            hash: approveTx.hash,
            title: `授权 ${fromToken.symbol}`,
            createdAt: nowTimeLabel(),
            explorerUrl: buildExplorerUrl(chainKey, approveTx.hash),
          });
          const receipt = await approveTx.wait();
          updateHistoryStatus(approveId, receipt?.status === 1 ? 'success' : 'failed');
          if (receipt?.status !== 1) throw new Error('授权失败');
        }
      }

      const swap = await okxClient.getSwapTransaction({
        chainKey,
        fromTokenAddress: fromToken.address,
        toTokenAddress: toToken.address,
        amount: amountRaw,
        slippagePercent: slippage,
        userWalletAddress: wallet.address,
        feePercent: REQUIRED_OKX_FEE_PERCENT,
        fromTokenReferrerWalletAddress: referrerAddress,
      });
      const tx = await sendSwapTransaction(swap.tx);
      const swapId = `swap:${tx.hash}`;
      upsertHistory({
        id: swapId,
        type: 'swap',
        status: 'pending',
        hash: tx.hash,
        title: `${fromToken.symbol} -> ${toToken.symbol}`,
        createdAt: nowTimeLabel(),
        explorerUrl: buildExplorerUrl(chainKey, tx.hash),
      });
      setConfirmOpen(false);
      const receipt = await tx.wait();
      updateHistoryStatus(swapId, receipt?.status === 1 ? 'success' : 'failed');
      if (receipt?.status !== 1) throw new Error('交易失败');
      await refreshBalances();
      await fetchQuote();
    } catch (error) {
      setExecutionError(readErrorMessage(error, '交易失败'));
    } finally {
      setExecutionLoading(false);
    }
  }, [
    amountRaw,
    chainKey,
    configError,
    fetchQuote,
    fromToken.address,
    fromToken.symbol,
    isSolanaSelected,
    okxClient,
    quote,
    refreshBalances,
    referrerAddress,
    slippage,
    solanaReferrerAddress,
    toToken.address,
    toToken.symbol,
    updateHistoryStatus,
    upsertHistory,
    wallet.address,
    walletOnSelectedChain,
  ]);

  return (
    <main className="min-h-[100dvh] overflow-x-hidden px-3 py-4 sm:px-5 sm:py-6">
      <div className="mx-auto grid w-full max-w-full gap-4 lg:max-w-[1080px] lg:grid-cols-[520px_1fr]">
        <section className="space-y-3">
          <header className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <SwapLogo />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-normal">Open Route Swap</h1>
                <div className="mono-num mt-0.5 text-xs text-white/40">fee {REQUIRED_OKX_FEE_PERCENT}%</div>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
              <ChainDropdown value={chainKey} onChange={(key) => setChainKey(key)} />
              <IconButton title="OKX 设置" onClick={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4" />
              </IconButton>
              <button
                type="button"
                onClick={wallet.connected ? undefined : handleConnect}
                disabled={wallet.connected}
                className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.045] px-2.5 text-sm text-white/72 transition hover:bg-white/[0.08] active:translate-y-px disabled:cursor-default disabled:hover:bg-white/[0.045] disabled:active:translate-y-0 sm:max-w-[220px] sm:px-3"
                title={wallet.address ? shortAddress(wallet.address) : (isSolanaSelected ? '连接 Solana' : '连接钱包')}
              >
                <Wallet className="h-4 w-4 shrink-0" />
                <span className="hidden truncate sm:inline">{wallet.address ? shortAddress(wallet.address) : (isSolanaSelected ? '连接 Solana' : '连接钱包')}</span>
              </button>
              {wallet.connected ? (
                <IconButton title="断开钱包" onClick={handleDisconnect}>
                  <Power className="h-4 w-4" />
                </IconButton>
              ) : null}
            </div>
          </header>

          <div className="soft-panel rounded-3xl p-3">
            <div className="mb-3 flex items-center justify-between gap-2 px-1 sm:gap-3">
              <div className="flex min-w-0 items-center gap-2 text-xs text-white/45">
                <span className={`h-2 w-2 rounded-full ${okxClient.isReady ? 'bg-teal-300' : 'bg-white/22'}`} />
                <span className="truncate">OKX {okxClient.isReady ? '已设置' : '未设置'}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <IconButton title="粘贴合约" onClick={handlePasteContract} disabled={pasteLoading}>
                  {pasteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
                </IconButton>
                <IconButton title="刷新报价" onClick={fetchQuote} disabled={quoteLoading}>
                  <RefreshCw className={`h-4 w-4 ${quoteLoading ? 'animate-spin' : ''}`} />
                </IconButton>
                <IconButton title="查看 K 线" onClick={() => setKlineOpen(true)}>
                  <ChartCandlestick className="h-4 w-4" />
                </IconButton>
              </div>
            </div>

            <div className="space-y-2">
              <TokenAmountPanel
                label="支付"
                token={fromToken}
                value={amount}
                onValueChange={setAmount}
                onTokenClick={() => setActiveTokenSide('from')}
                balance={fromBalance}
                onMax={handleMax}
              />

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleFlip}
                  className="-my-1 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-[#11171d] text-white/62 shadow-inset transition hover:bg-white/[0.08] hover:text-white active:translate-y-px"
                  title="翻转"
                >
                  <ArrowDownUp className="h-4 w-4" />
                </button>
              </div>

              <TokenAmountPanel
                label="收到"
                token={toToken}
                value={outputAmount}
                disabled
                onTokenClick={() => setActiveTokenSide('to')}
                balance={toBalance}
                quoteValue={quoteLoading ? '报价中' : quoteUpdatedAt ? `更新 ${quoteUpdatedAt}` : ''}
              />
            </div>

            <div className="mt-3">
              <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.035] p-1">
                {SLIPPAGE_PRESETS.map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setSlippage(value)}
                    className={`mono-num h-8 flex-1 rounded-lg text-xs transition active:translate-y-px ${
                      slippage === value
                        ? 'border border-white/[0.12] bg-[#374151] text-white shadow-inset'
                        : 'border border-transparent text-white/45 hover:bg-[#242c35] hover:text-white/72'
                    }`}
                  >
                    {value}%
                  </button>
                ))}
                <input
                  value={slippage}
                  onChange={(event) => setSlippage(normalizeDecimalInput(event.target.value))}
                  className="mono-num h-8 w-14 sm:w-16 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 text-center text-xs text-white outline-none focus:border-teal-300/35"
                />
              </div>
            </div>

            {(configError || quoteError || executionError || highImpact || quote?.isHoneyPot) ? (
              <div className="mt-3 flex gap-2 rounded-xl border border-amber-200/16 bg-amber-200/[0.055] px-3 py-2 text-xs text-amber-100/82">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  {configError || quoteError || executionError || (quote?.isHoneyPot ? '风险代币' : '价格影响偏高')}
                </span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={executionLoading || (primaryIssue != null && !actionableIssues.has(primaryIssue))}
              className="button-primary mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold transition active:translate-y-px disabled:opacity-50 sm:h-12"
            >
              {executionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {executionLoading ? '处理中' : primaryIssue || 'Swap'}
            </button>
          </div>
        </section>

        <aside className="space-y-3 lg:sticky lg:top-4">
          <section className="soft-panel rounded-3xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">报价</h2>
              <span className="mono-num text-xs text-white/36">{quoteUpdatedAt || '--'}</span>
            </div>
            {quoteLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-9 rounded-xl" />
                <div className="skeleton h-9 rounded-xl" />
                <div className="skeleton h-9 rounded-xl" />
              </div>
            ) : quote ? (
              <div className="divide-y divide-white/[0.07] text-sm">
                <InfoRow label="预计收到" value={`${formatTokenUnits(quote.toTokenAmount, toToken.decimals, 8)} ${toToken.symbol}`} />
                <InfoRow label="价格影响" value={formatPercent(quote.priceImpactPercent)} danger={highImpact} />
                <InfoRow label="Gas 估算" value={quote.estimateGasFee ? `${formatNumber(quote.estimateGasFee, 6)} ${nativeGasSymbol}` : '--'} />
                <InfoRow label="路径" value={routeLabel} />
                <InfoRow label="平台费" value={`${REQUIRED_OKX_FEE_PERCENT}%`} />
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-8 text-center text-sm text-white/40">
                暂无报价
              </div>
            )}
          </section>

          <section className="soft-panel rounded-3xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">余额</h2>
              <button type="button" onClick={refreshBalances} className="text-xs text-teal-100/80 hover:text-teal-100">
                刷新
              </button>
            </div>
            <div className="space-y-2">
              {mergeTokenLists([fromToken, toToken, ...commonTokens.slice(0, 4)]).slice(0, 6).map((token) => {
                const balance = balances[tokenStorageKey(token)];
                return (
                  <div key={tokenStorageKey(token)} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <TokenAvatar token={token} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{token.symbol}</div>
                      <div className="truncate text-xs text-white/34">{shortAddress(token.address)}</div>
                    </div>
                    <div className="mono-num text-right text-sm text-white/72">
                      {balance ? formatNumber(balance.formatted, 6) : '--'}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="soft-panel rounded-3xl p-4">
            <h2 className="mb-3 text-sm font-semibold">记录</h2>
            {history.length ? (
              <div className="space-y-2">
                {history.map((item) => (
                  <a
                    key={item.id}
                    href={item.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.055]"
                  >
                    <span className={`h-2 w-2 rounded-full ${
                      item.status === 'success' ? 'bg-teal-300' : item.status === 'failed' ? 'bg-rose-300' : 'bg-amber-200'
                    }`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{item.title}</span>
                      <span className="mono-num block text-xs text-white/34">{item.createdAt} · {shortAddress(item.hash)}</span>
                    </span>
                    <ExternalLink className="h-4 w-4 text-white/34" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-8 text-center text-sm text-white/40">
                暂无记录
              </div>
            )}
          </section>
        </aside>
      </div>

      <TokenSelectorSheet
        open={Boolean(activeTokenSide)}
        side={activeTokenSide || 'from'}
        chainKey={chainKey}
        tokens={chainTokens}
        selectedAddress={activeTokenSide === 'to' ? toToken.address : fromToken.address}
        disabledAddress={activeTokenSide === 'to' ? fromToken.address : toToken.address}
        okxClient={okxClient}
        onClose={() => setActiveTokenSide(null)}
        onTokenDiscovered={addTokens}
        onSelect={(token) => {
          addTokens([token]);
          if (activeTokenSide === 'to') {
            setToAddress(token.address);
          } else {
            setFromAddress(token.address);
          }
        }}
      />

      <SettingsSheet
        open={settingsOpen}
        mode={credentialMode}
        credentials={credentials}
        signerProxyUrl={signerProxyUrl}
        onClose={() => setSettingsOpen(false)}
        onModeChange={(mode) => {
          setCredentialMode(mode);
          sessionStorage.setItem(SESSION_MODE_KEY, mode);
        }}
        onCredentialsChange={setCredentials}
        onSignerProxyUrlChange={(value) => {
          setSignerProxyUrl(value);
          if (value) sessionStorage.setItem(SESSION_PROXY_KEY, value);
        }}
        onSaveCredentials={saveCredentials}
        onClearCredentials={clearCredentials}
      />

      <KlineModal
        open={klineOpen}
        chainKey={chainKey}
        token={toToken}
        okxClient={okxClient}
        onClose={() => setKlineOpen(false)}
      />

      <ConfirmSwapModal
        open={confirmOpen}
        loading={executionLoading}
        fromToken={fromToken}
        toToken={toToken}
        amount={amount}
        quote={quote}
        onClose={() => setConfirmOpen(false)}
        onConfirm={executeSwap}
      />
    </main>
  );
}

function InfoRow({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-white/45">{label}</span>
      <span className={`mono-num min-w-0 truncate text-right ${danger ? 'text-amber-100' : 'text-white/78'}`}>
        {value}
      </span>
    </div>
  );
}
