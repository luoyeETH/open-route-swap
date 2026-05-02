'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'ethers';
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
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
  getDefaultChainKey,
  getDefaultFromToken,
  getDefaultToToken,
  getOkxBaseUrl,
  isNativeToken,
  isSupportedSwapChain,
  isValidEvmAddress,
  mergeTokenLists,
  normalizeTokenAddress,
} from '@/lib/chains';
import {
  CredentialProvider,
  OkxClient,
  OkxCredentials,
  OkxQuote,
  getEnvDemoCredentials,
} from '@/lib/okx-client';
import {
  WalletState,
  approveToken,
  connectWallet,
  getNativeGasSymbol,
  getInjectedProvider,
  getWalletState,
  isWalletOnChain,
  parseTokenAmount,
  readAllowance,
  readTokenBalance,
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

const SESSION_CREDENTIALS_KEY = 'open-route-swap.okx.credentials';
const SESSION_MODE_KEY = 'open-route-swap.okx.mode';
const SESSION_PROXY_KEY = 'open-route-swap.okx.proxy';
const DEFAULT_NATIVE_GAS_RESERVE = '0.01';
const SLIPPAGE_PRESETS = ['0.3', '0.5', '1'];

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

function isSameToken(left: string, right: string): boolean {
  return normalizeTokenAddress(left) === normalizeTokenAddress(right);
}

function tokenStorageKey(token: TokenInfo): string {
  return `${token.chainKey}:${normalizeTokenAddress(token.address)}`;
}

function buildExplorerUrl(chainKey: ChainKey, hash: string): string {
  const explorerUrl = CHAIN_CONFIGS[chainKey].blockExplorerUrl;
  return explorerUrl ? `${explorerUrl}/tx/${hash}` : '#';
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
          className="mono-num min-w-0 flex-1 bg-transparent text-[28px] font-semibold leading-none text-white outline-none placeholder:text-white/18 disabled:text-white/55"
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
              const disabled = isSameToken(token.address, disabledAddress);
              const selected = isSameToken(token.address, selectedAddress);
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

export function SwapConsole() {
  const [chainKey, setChainKey] = useState<ChainKey>(getDefaultChainKey());
  const [wallet, setWallet] = useState<WalletState>({ address: null, chainId: null, connected: false });
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
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [credentialMode, setCredentialMode] = useState<CredentialProvider>('none');
  const [credentials, setCredentials] = useState<OkxCredentials>({ apiKey: '', secretKey: '', passphrase: '' });
  const [signerProxyUrl, setSignerProxyUrl] = useState(process.env.NEXT_PUBLIC_OKX_SIGNER_PROXY_URL?.trim() || '');

  const quoteRequestIdRef = useRef(0);
  const balanceRequestIdRef = useRef(0);
  const chain = CHAIN_CONFIGS[chainKey];
  const commonTokens = getCommonTokens(chainKey);
  const chainTokens = useMemo(
    () => mergeTokenLists([...commonTokens, ...tokens.filter((token) => token.chainKey === chainKey)]),
    [chainKey, commonTokens, tokens]
  );
  const nativeGasSymbol = getNativeGasSymbol(chainKey);
  const expectedChainLabel = chain.label;
  const walletOnSelectedChain = isWalletOnChain(wallet.chainId, chainKey);

  const fromToken = useMemo(
    () => chainTokens.find((token) => isSameToken(token.address, fromAddress)) || getDefaultFromToken(chainKey),
    [chainKey, chainTokens, fromAddress]
  );
  const toToken = useMemo(
    () => chainTokens.find((token) => isSameToken(token.address, toAddress)) || getDefaultToToken(chainKey),
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
  const configError = useMemo(() => {
    if (!isSupportedSwapChain(chainKey)) return `${chain.label} 暂未开放`;
    if (Number(feePercent) !== Number(REQUIRED_OKX_FEE_PERCENT)) return '费率必须为 0.01%';
    if (!isValidEvmAddress(referrerAddress)) return '缺手续费地址';
    return null;
  }, [chain.label, chainKey, feePercent, referrerAddress]);

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
    if (!walletOnSelectedChain) return `切换 ${expectedChainLabel}`;
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
    wallet.connected,
    walletOnSelectedChain,
  ]);

  const outputAmount = quote ? formatTokenUnits(quote.toTokenAmount, toToken.decimals, 8) : '';
  const actionableIssues = useMemo(
    () => new Set(['连接钱包', `切换 ${expectedChainLabel}`, '设置 OKX', '获取报价']),
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
    let mounted = true;
    getWalletState()
      .then((state) => {
        if (mounted) setWallet(state);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider?.on) return;
    const handleAccountsChanged = (accountsValue: unknown) => {
      const accounts = Array.isArray(accountsValue) ? accountsValue : [];
      setWallet((current) => ({
        ...current,
        address: typeof accounts[0] === 'string' ? accounts[0] : null,
        connected: typeof accounts[0] === 'string',
      }));
    };
    const handleChainChanged = (chainIdValue: unknown) => {
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
  }, []);

  useEffect(() => {
    const defaultFromToken = getDefaultFromToken(chainKey);
    const defaultToToken = getDefaultToToken(chainKey);
    setTokens((current) => mergeTokenLists([...current, ...getCommonTokens(chainKey)]));
    setFromAddress(defaultFromToken.address);
    setToAddress(defaultToToken.address);
    setAmount('');
    setBalances({});
    setQuote(null);
    setQuoteError(null);
    setQuoteUpdatedAt(null);
    setExecutionError(null);
  }, [chainKey]);

  const addTokens = useCallback((incoming: TokenInfo[]) => {
    if (!incoming.length) return;
    setTokens((current) => mergeTokenLists([...current, ...incoming]));
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!wallet.address || !isSupportedSwapChain(chainKey)) return;
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
  }, [chainKey, commonTokens, fromToken, toToken, wallet.address]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  const fetchQuote = useCallback(async () => {
    setQuote(null);
    setQuoteError(null);
    if (!isSupportedSwapChain(chainKey) || !okxClient.isReady || !isPositiveAmount(amount) || !amountRaw) {
      return;
    }
    if (isSameToken(fromToken.address, toToken.address)) {
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
    try {
      setWallet(await connectWallet());
    } catch (error) {
      setExecutionError(readErrorMessage(error, '连接失败'));
    }
  }, []);

  const handleSwitchChain = useCallback(async () => {
    setExecutionError(null);
    try {
      await switchToChain(chainKey);
      setWallet(await getWalletState());
    } catch (error) {
      setExecutionError(readErrorMessage(error, '切链失败'));
    }
  }, [chainKey]);

  const handleDisconnect = useCallback(() => {
    setWallet({ address: null, chainId: null, connected: false });
    setBalances({});
  }, []);

  const handleMax = useCallback(() => {
    if (!fromBalance) return;
    try {
      let raw = BigInt(fromBalance.raw);
      if (isNativeToken(fromToken.address)) {
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
    if (!walletOnSelectedChain) {
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
    okxClient.isReady,
    primaryIssue,
    quote,
    wallet.connected,
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
      if (!isNativeToken(fromToken.address)) {
        const approval = await okxClient.getApproveTransaction({
          chainKey,
          tokenContractAddress: fromToken.address,
          approveAmount: amountRaw,
        });
        const spender = approval.dexContractAddress;
        if (!spender) throw new Error('OKX 授权地址为空');
        const allowance = await readAllowance(fromToken.address, wallet.address, spender, chainKey);
        if (allowance < BigInt(amountRaw)) {
          const approveTx = await approveToken(fromToken.address, spender, BigInt(amountRaw));
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
    okxClient,
    quote,
    refreshBalances,
    referrerAddress,
    slippage,
    toToken.address,
    toToken.symbol,
    updateHistoryStatus,
    upsertHistory,
    wallet.address,
    walletOnSelectedChain,
  ]);

  return (
    <main className="min-h-[100dvh] px-3 py-4 sm:px-5 sm:py-6">
      <div className="mx-auto grid w-full max-w-[1080px] gap-4 lg:grid-cols-[520px_1fr]">
        <section className="space-y-3">
          <header className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-normal">Open Route Swap</h1>
              <div className="mono-num mt-0.5 text-xs text-white/40">fee {REQUIRED_OKX_FEE_PERCENT}%</div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={chainKey}
                onChange={(event) => setChainKey(event.target.value as ChainKey)}
                className="h-9 max-w-[170px] rounded-lg border border-white/[0.08] bg-[#11171d] px-2.5 text-sm font-medium text-white outline-none transition hover:bg-white/[0.06] focus:border-teal-300/35"
                title="选择链"
              >
                {SELECTABLE_CHAIN_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {CHAIN_CONFIGS[key].label}
                  </option>
                ))}
              </select>
              <IconButton title="OKX 设置" onClick={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4" />
              </IconButton>
            </div>
          </header>

          <div className="soft-panel rounded-3xl p-3">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2 text-xs text-white/45">
                <span className={`h-2 w-2 rounded-full ${okxClient.isReady ? 'bg-teal-300' : 'bg-white/22'}`} />
                OKX {okxClient.isReady ? '已设置' : '未设置'}
              </div>
              <button
                type="button"
                onClick={wallet.connected ? handleDisconnect : handleConnect}
                className="flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.045] px-3 text-sm text-white/72 transition hover:bg-white/[0.08] active:translate-y-px"
              >
                <Wallet className="h-4 w-4 shrink-0" />
                <span className="truncate">{wallet.address ? shortAddress(wallet.address) : '连接钱包'}</span>
              </button>
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

            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.035] p-1">
                {SLIPPAGE_PRESETS.map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setSlippage(value)}
                    className={`mono-num h-8 flex-1 rounded-lg text-xs transition active:translate-y-px ${
                      slippage === value
                        ? 'bg-teal-300/16 text-teal-100'
                        : 'text-white/45 hover:bg-white/[0.06] hover:text-white/72'
                    }`}
                  >
                    {value}%
                  </button>
                ))}
                <input
                  value={slippage}
                  onChange={(event) => setSlippage(normalizeDecimalInput(event.target.value))}
                  className="mono-num h-8 w-16 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 text-center text-xs text-white outline-none focus:border-teal-300/35"
                />
              </div>
              <IconButton title="刷新报价" onClick={fetchQuote} disabled={quoteLoading}>
                <RefreshCw className={`h-4 w-4 ${quoteLoading ? 'animate-spin' : ''}`} />
              </IconButton>
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
              className="button-primary mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold transition active:translate-y-px disabled:opacity-50"
            >
              {executionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {executionLoading ? '处理中' : primaryIssue || 'Swap'}
            </button>
          </div>
        </section>

        <aside className="space-y-3">
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
