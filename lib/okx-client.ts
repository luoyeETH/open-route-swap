import {
  CHAIN_CONFIGS,
  REQUIRED_OKX_FEE_PERCENT,
  type ChainKey,
  type TokenInfo,
  getChainNativeSymbol,
  getOkxBaseUrl,
  isNativeToken,
  mergeTokenLists,
  normalizeTokenAddress,
} from '@/lib/chains';

export type CredentialProvider = 'none' | 'user-input' | 'env-demo' | 'signer-proxy';

export type OkxCredentials = {
  apiKey: string;
  secretKey: string;
  passphrase: string;
};

export type OkxClientConfig = {
  mode: CredentialProvider;
  credentials?: OkxCredentials | null;
  signerProxyUrl?: string | null;
  baseUrl?: string;
};

export type OkxRoute = {
  dex: string;
  percent: string;
};

export type OkxQuote = {
  fromTokenAmount: string;
  toTokenAmount: string;
  priceImpactPercent: string | null;
  estimateGasFee: string | null;
  tradeFee: string | null;
  isHoneyPot: boolean | null;
  routes: OkxRoute[];
  raw: unknown;
};

export type OkxApproveTransaction = {
  data: string | null;
  dexContractAddress: string | null;
  raw: unknown;
};

export type OkxSwapTransaction = {
  tx: {
    to: string;
    data: string;
    value: string;
    gas: string | null;
  };
  routerResult: {
    fromTokenAmount: string;
    toTokenAmount: string;
    routes: OkxRoute[];
  };
  priceImpactPercent: string | null;
  raw: unknown;
};

export type OkxSolanaInstructionAccount = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

export type OkxSolanaInstruction = {
  programId: string;
  data: string;
  accounts: OkxSolanaInstructionAccount[];
};

export type OkxSolanaSwapInstructions = {
  instructionLists: OkxSolanaInstruction[];
  addressLookupTableAccount: string[];
  routerResult: {
    fromTokenAmount: string;
    toTokenAmount: string;
    routes: OkxRoute[];
  };
  priceImpactPercent: string | null;
  raw: unknown;
};

export type OkxTokenBalance = TokenInfo & {
  balance: string;
  rawBalance: string | null;
  valueUsd: number | null;
  tokenPrice: number | null;
  isRiskToken: boolean;
};

export type OkxCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string;
  volumeUsd: string;
  confirmed: boolean;
  raw: unknown;
};

type OkxEnvelope = {
  code?: string;
  msg?: string;
  message?: string;
  data?: unknown;
};

const EMPTY_BODY = '';
const CHAIN_KEY_BY_CHAIN_INDEX = new Map<string, ChainKey>(
  Object.values(CHAIN_CONFIGS).map((chain) => [chain.chainIndex, chain.key])
);

function ensureConfiguredCredentials(config: OkxClientConfig): OkxCredentials {
  const credentials = config.credentials;
  const apiKey = credentials?.apiKey?.trim() || '';
  const secretKey = credentials?.secretKey?.trim() || '';
  const passphrase = credentials?.passphrase?.trim() || '';
  if (!apiKey || !secretKey || !passphrase) {
    throw new Error('OKX API Key / Secret / Passphrase 需要完整填写');
  }
  return { apiKey, secretKey, passphrase };
}

function textToBase64(bytes: ArrayBuffer): string {
  const values = new Uint8Array(bytes);
  let binary = '';
  for (const value of values) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

async function hmacSha256Base64(message: string, secretKey: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前浏览器不支持 Web Crypto，无法在前端生成 OKX 签名');
  }

  const encoder = new TextEncoder();
  const secretBytes = new Uint8Array(encoder.encode(secretKey));
  const messageBytes = new Uint8Array(encoder.encode(message));
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, messageBytes);
  return textToBase64(signature);
}

function asOkxEnvelope(value: unknown): OkxEnvelope {
  if (!value || typeof value !== 'object') return {};
  return value as OkxEnvelope;
}

function dataArray(result: OkxEnvelope): unknown[] {
  return Array.isArray(result.data) ? result.data : [];
}

function firstDataObject(result: OkxEnvelope): Record<string, unknown> | null {
  if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    return result.data as Record<string, unknown>;
  }
  const first = dataArray(result)[0];
  return first && typeof first === 'object' && !Array.isArray(first) ? (first as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return fallback;
}

function readNumber(record: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const parsed = Number(record[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseRoutes(value: unknown): OkxRoute[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const route = entry as Record<string, unknown>;
    const protocol = route.dexProtocol && typeof route.dexProtocol === 'object'
      ? (route.dexProtocol as Record<string, unknown>)
      : route;
    return [{
      dex: readString(protocol, ['dexName', 'name'], 'Unknown'),
      percent: readString(protocol, ['percent'], '100'),
    }];
  });
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (['true', '1', 'yes'].includes(text)) return true;
  if (['false', '0', 'no'].includes(text)) return false;
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
}

function parseCandle(value: unknown): OkxCandle | null {
  if (!Array.isArray(value)) return null;
  const [timestamp, open, high, low, close, volume] = value;
  const confirmed = value[value.length - 1];
  const volumeUsd = value.length >= 9 ? value[7] : value[6];
  const parsedOpen = Number(open);
  const parsedHigh = Number(high);
  const parsedLow = Number(low);
  const parsedClose = Number(close);
  if (!timestamp || !Number.isFinite(parsedOpen) || !Number.isFinite(parsedHigh) || !Number.isFinite(parsedLow) || !Number.isFinite(parsedClose)) {
    return null;
  }
  return {
    timestamp: String(timestamp),
    open: parsedOpen,
    high: parsedHigh,
    low: parsedLow,
    close: parsedClose,
    volume: String(volume ?? ''),
    volumeUsd: String(volumeUsd ?? ''),
    confirmed: String(confirmed ?? '') === '1',
    raw: value,
  };
}

function parseSolanaInstruction(value: unknown): OkxSolanaInstruction | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const programId = readString(record, ['programId']);
  const data = readString(record, ['data']);
  if (!programId) return null;

  const accounts = Array.isArray(record.accounts)
    ? record.accounts.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const account = entry as Record<string, unknown>;
      const pubkey = readString(account, ['pubkey', 'publicKey']);
      if (!pubkey) return [];
      return [{
        pubkey,
        isSigner: parseBoolean(account.isSigner) === true,
        isWritable: parseBoolean(account.isWritable) === true,
      }];
    })
    : [];

  return { programId, data, accounts };
}

function flattenTokenRecords(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  const records: Record<string, unknown>[] = [];
  for (const entry of data) {
    if (Array.isArray(entry)) {
      records.push(...flattenTokenRecords(entry));
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const tokenList = record.tokenList ?? record.tokens ?? record.tokenAssets;
    if (Array.isArray(tokenList)) {
      records.push(...flattenTokenRecords(tokenList));
      continue;
    }
    records.push(record);
  }
  return records;
}

function parseToken(record: Record<string, unknown>, chainKey: ChainKey): TokenInfo | null {
  const address = normalizeTokenAddress(readString(record, [
    'tokenContractAddress',
    'address',
    'contractAddress',
    'tokenAddress',
  ]), chainKey);
  const fallbackSymbol = isNativeToken(address, chainKey) ? getChainNativeSymbol(chainKey) || 'NATIVE' : 'TOKEN';
  const symbol = readString(record, ['tokenSymbol', 'symbol', 'ticker'], fallbackSymbol).toUpperCase();
  const name = readString(record, ['tokenName', 'name'], symbol);
  const decimals = readNumber(record, ['decimals', 'decimal', 'tokenDecimal'], 18);
  return {
    chainKey,
    address,
    symbol,
    name,
    decimals,
    logoUrl: readString(record, ['tokenLogoUrl', 'logoUrl', 'logo'], '') || null,
    source: 'okx',
  };
}

function parseBalanceToken(record: Record<string, unknown>, chainKey: ChainKey): TokenInfo {
  const tokenAddress = 'tokenContractAddress' in record
    ? String(record.tokenContractAddress ?? '').trim()
    : 'tokenAddress' in record
      ? String(record.tokenAddress ?? '').trim()
      : readString(record, ['contractAddress', 'address']);
  const address = normalizeTokenAddress(tokenAddress, chainKey);
  const fallbackSymbol = isNativeToken(address, chainKey) ? getChainNativeSymbol(chainKey) || 'NATIVE' : 'TOKEN';
  const symbol = readString(record, ['tokenSymbol', 'symbol', 'ticker'], fallbackSymbol).toUpperCase();
  const name = readString(record, ['tokenName', 'name'], symbol);
  const decimals = readNumber(
    record,
    ['decimals', 'decimal', 'tokenDecimal'],
    isNativeToken(address, chainKey) ? CHAIN_CONFIGS[chainKey].nativeCurrency?.decimals ?? 18 : 18
  );
  return {
    chainKey,
    address,
    symbol,
    name,
    decimals,
    logoUrl: readString(record, ['tokenLogoUrl', 'logoUrl', 'logo'], '') || null,
    source: 'okx',
  };
}

function parseTokenBalance(record: Record<string, unknown>, chainKey: ChainKey): OkxTokenBalance | null {
  const token = parseBalanceToken(record, chainKey);
  const balance = readString(record, ['balance', 'tokenBalance'], '0');
  const balanceNumber = Number(balance);
  const tokenPrice = Number(readString(record, ['tokenPrice', 'price'], ''));
  return {
    ...token,
    balance,
    rawBalance: readString(record, ['rawBalance', 'rawTokenBalance'], '') || null,
    valueUsd: Number.isFinite(balanceNumber) && Number.isFinite(tokenPrice) ? balanceNumber * tokenPrice : null,
    tokenPrice: Number.isFinite(tokenPrice) ? tokenPrice : null,
    isRiskToken: parseBoolean(record.isRiskToken) === true,
  };
}

function assertOkxSuccess(result: OkxEnvelope): void {
  if (result.code !== '0') {
    throw new Error(result.msg || result.message || `OKX 请求失败：${result.code || 'unknown'}`);
  }
}

function normalizeSignerProxyUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/okx';
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

export class OkxClient {
  private readonly config: OkxClientConfig;

  constructor(config: OkxClientConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || getOkxBaseUrl(),
    };
  }

  get isReady(): boolean {
    if (this.config.mode === 'signer-proxy') {
      return Boolean(this.config.signerProxyUrl?.trim());
    }
    if (this.config.mode === 'user-input' || this.config.mode === 'env-demo') {
      const credentials = this.config.credentials;
      return Boolean(credentials?.apiKey?.trim() && credentials?.secretKey?.trim() && credentials?.passphrase?.trim());
    }
    return false;
  }

  private async request(method: 'GET' | 'POST', path: string, params?: URLSearchParams, body = EMPTY_BODY): Promise<OkxEnvelope> {
    const query = params?.toString();
    const requestPath = `${path}${query ? `?${query}` : ''}`;

    if (this.config.mode === 'signer-proxy') {
      const proxyUrl = normalizeSignerProxyUrl(this.config.signerProxyUrl || '');
      if (!proxyUrl) throw new Error('Signer Proxy URL 未配置');
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, requestPath, body: body || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || payload?.msg || `Signer Proxy 请求失败：HTTP ${response.status}`);
      }
      return asOkxEnvelope(payload?.okx || payload?.data?.okx || payload);
    }

    const credentials = ensureConfiguredCredentials(this.config);
    const timestamp = new Date().toISOString();
    const preHash = `${timestamp}${method}${requestPath}${method === 'POST' ? body : ''}`;
    const signature = await hmacSha256Base64(preHash, credentials.secretKey);
    const response = await fetch(`${this.config.baseUrl}${requestPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': credentials.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': credentials.passphrase,
      },
      body: method === 'POST' && body ? body : undefined,
    });
    const payload = asOkxEnvelope(await response.json().catch(() => ({})));
    if (!response.ok && !payload.code) {
      throw new Error(payload.msg || payload.message || `OKX HTTP ${response.status}`);
    }
    return payload;
  }

  async getAllTokens(chainKey: ChainKey): Promise<TokenInfo[]> {
    const chain = CHAIN_CONFIGS[chainKey];
    const params = new URLSearchParams({ chainIndex: chain.chainIndex });
    const result = await this.request('GET', '/api/v6/dex/aggregator/all-tokens', params);
    assertOkxSuccess(result);
    return flattenTokenRecords(result.data)
      .map((record) => parseToken(record, chainKey))
      .filter((token): token is TokenInfo => Boolean(token));
  }

  async searchTokens(chainKey: ChainKey, query: string): Promise<TokenInfo[]> {
    return this.searchTokensAcrossChains([chainKey], query, 40);
  }

  async searchTokensAcrossChains(chainKeys: ChainKey[], query: string, limit = 100): Promise<TokenInfo[]> {
    const chains = Array.from(new Set(chainKeys));
    const search = query.trim();
    if (!chains.length || !search) return [];

    const params = new URLSearchParams({
      chains: chains.map((chainKey) => CHAIN_CONFIGS[chainKey].chainIndex).join(','),
      search,
      limit: String(limit),
    });
    const result = await this.request('GET', '/api/v6/dex/market/token/search', params);
    assertOkxSuccess(result);

    return mergeTokenLists(flattenTokenRecords(result.data).flatMap((record) => {
      const chainKey = CHAIN_KEY_BY_CHAIN_INDEX.get(readString(record, ['chainIndex']));
      if (!chainKey) return [];
      const token = parseToken(record, chainKey);
      return token ? [token] : [];
    }));
  }

  async getTokenBalances(chainKey: ChainKey, address: string): Promise<OkxTokenBalance[]> {
    const chain = CHAIN_CONFIGS[chainKey];
    const params = new URLSearchParams({
      chains: chain.chainIndex,
      address,
      excludeRiskToken: '0',
    });
    const result = await this.request('GET', '/api/v6/dex/balance/all-token-balances-by-address', params);
    assertOkxSuccess(result);
    return flattenTokenRecords(result.data)
      .map((record) => parseTokenBalance(record, chainKey))
      .filter((balance): balance is OkxTokenBalance => Boolean(balance));
  }

  async getSpecificTokenBalances(chainKey: ChainKey, address: string, tokens: TokenInfo[]): Promise<OkxTokenBalance[]> {
    const chain = CHAIN_CONFIGS[chainKey];
    const normalizedAddresses = Array.from(new Set(
      tokens
        .filter((token) => token.chainKey === chainKey)
        .map((token) => normalizeTokenAddress(token.address, chainKey))
    )).slice(0, 20);
    if (!normalizedAddresses.length) return [];

    const body = JSON.stringify({
      address,
      tokenContractAddresses: normalizedAddresses.map((tokenAddress) => ({
        chainIndex: chain.chainIndex,
        tokenContractAddress: isNativeToken(tokenAddress, chainKey) ? '' : tokenAddress,
      })),
      excludeRiskToken: '0',
    });
    const result = await this.request('POST', '/api/v6/dex/balance/token-balances-by-address', undefined, body);
    assertOkxSuccess(result);
    return flattenTokenRecords(result.data)
      .map((record) => parseTokenBalance(record, chainKey))
      .filter((balance): balance is OkxTokenBalance => Boolean(balance));
  }

  async getCandles(params: {
    chainKey: ChainKey;
    tokenContractAddress: string;
    bar: string;
    limit?: string;
  }): Promise<OkxCandle[]> {
    const chain = CHAIN_CONFIGS[params.chainKey];
    const query = new URLSearchParams({
      chainIndex: chain.chainIndex,
      tokenContractAddress: normalizeTokenAddress(params.tokenContractAddress, params.chainKey),
      bar: params.bar,
      limit: params.limit || '120',
    });
    const result = await this.request('GET', '/api/v6/dex/market/candles', query);
    assertOkxSuccess(result);
    return dataArray(result)
      .map(parseCandle)
      .filter((candle): candle is OkxCandle => Boolean(candle))
      .sort((left, right) => Number(left.timestamp) - Number(right.timestamp));
  }

  async getQuote(params: {
    chainKey: ChainKey;
    fromTokenAddress: string;
    toTokenAddress: string;
    amount: string;
    slippagePercent: string;
  }): Promise<OkxQuote> {
    const chain = CHAIN_CONFIGS[params.chainKey];
    const query = new URLSearchParams({
      chainIndex: chain.chainIndex,
      fromTokenAddress: normalizeTokenAddress(params.fromTokenAddress, params.chainKey),
      toTokenAddress: normalizeTokenAddress(params.toTokenAddress, params.chainKey),
      amount: params.amount,
      slippagePercent: params.slippagePercent,
      swapMode: 'exactIn',
    });
    const result = await this.request('GET', '/api/v6/dex/aggregator/quote', query);
    assertOkxSuccess(result);
    const quote = firstDataObject(result);
    if (!quote) throw new Error('OKX 未返回报价数据');
    return {
      fromTokenAmount: readString(quote, ['fromTokenAmount'], params.amount),
      toTokenAmount: readString(quote, ['toTokenAmount'], '0'),
      priceImpactPercent: readString(quote, ['priceImpactPercent'], '') || null,
      estimateGasFee: readString(quote, ['estimateGasFee'], '') || null,
      tradeFee: readString(quote, ['tradeFee'], '') || null,
      isHoneyPot: parseBoolean(quote.isHoneyPot),
      routes: parseRoutes(quote.dexRouterList),
      raw: quote,
    };
  }

  async getApproveTransaction(params: {
    chainKey: ChainKey;
    tokenContractAddress: string;
    approveAmount: string;
  }): Promise<OkxApproveTransaction> {
    const chain = CHAIN_CONFIGS[params.chainKey];
    const query = new URLSearchParams({
      chainIndex: chain.chainIndex,
      tokenContractAddress: normalizeTokenAddress(params.tokenContractAddress, params.chainKey),
      approveAmount: params.approveAmount,
    });
    const result = await this.request('GET', '/api/v6/dex/aggregator/approve-transaction', query);
    assertOkxSuccess(result);
    const approval = firstDataObject(result);
    if (!approval) throw new Error('OKX 未返回授权数据');
    return {
      data: readString(approval, ['data'], '') || null,
      dexContractAddress: readString(approval, ['dexContractAddress', 'spender'], '') || null,
      raw: approval,
    };
  }

  async getSwapTransaction(params: {
    chainKey: ChainKey;
    fromTokenAddress: string;
    toTokenAddress: string;
    amount: string;
    slippagePercent: string;
    userWalletAddress: string;
    fromTokenReferrerWalletAddress: string;
    feePercent?: string;
  }): Promise<OkxSwapTransaction> {
    const chain = CHAIN_CONFIGS[params.chainKey];
    const query = new URLSearchParams({
      chainIndex: chain.chainIndex,
      fromTokenAddress: normalizeTokenAddress(params.fromTokenAddress, params.chainKey),
      toTokenAddress: normalizeTokenAddress(params.toTokenAddress, params.chainKey),
      amount: params.amount,
      slippagePercent: params.slippagePercent,
      userWalletAddress: params.userWalletAddress,
      swapMode: 'exactIn',
      feePercent: params.feePercent || REQUIRED_OKX_FEE_PERCENT,
      fromTokenReferrerWalletAddress: params.fromTokenReferrerWalletAddress,
      priceImpactProtectionPercent: '10',
    });
    const result = await this.request('GET', '/api/v6/dex/aggregator/swap', query);
    assertOkxSuccess(result);
    const swap = firstDataObject(result);
    if (!swap) throw new Error('OKX 未返回交易数据');

    const tx = swap.tx && typeof swap.tx === 'object'
      ? (swap.tx as Record<string, unknown>)
      : {};
    const routerResult = swap.routerResult && typeof swap.routerResult === 'object'
      ? (swap.routerResult as Record<string, unknown>)
      : {};
    const to = readString(tx, ['to']);
    const data = readString(tx, ['data']);
    if (!to || !data) throw new Error('OKX 交易数据缺少 tx.to 或 tx.data');

    return {
      tx: {
        to,
        data,
        value: readString(tx, ['value'], '0'),
        gas: readString(tx, ['gas', 'gasLimit'], '') || null,
      },
      routerResult: {
        fromTokenAmount: readString(routerResult, ['fromTokenAmount'], params.amount),
        toTokenAmount: readString(routerResult, ['toTokenAmount'], '0'),
        routes: parseRoutes(routerResult.dexRouterList),
      },
      priceImpactPercent: readString(routerResult, ['priceImpactPercent'], '') || readString(swap, ['priceImpactPercent'], '') || null,
      raw: swap,
    };
  }

  async getSolanaSwapInstructions(params: {
    fromTokenAddress: string;
    toTokenAddress: string;
    amount: string;
    slippagePercent: string;
    userWalletAddress: string;
    fromTokenReferrerWalletAddress: string;
    feePercent?: string;
  }): Promise<OkxSolanaSwapInstructions> {
    const chain = CHAIN_CONFIGS.solana;
    const query = new URLSearchParams({
      chainIndex: chain.chainIndex,
      fromTokenAddress: normalizeTokenAddress(params.fromTokenAddress, 'solana'),
      toTokenAddress: normalizeTokenAddress(params.toTokenAddress, 'solana'),
      amount: params.amount,
      slippagePercent: params.slippagePercent,
      userWalletAddress: params.userWalletAddress,
      autoSlippage: 'false',
      pathNum: '3',
      feePercent: params.feePercent || REQUIRED_OKX_FEE_PERCENT,
      fromTokenReferrerWalletAddress: params.fromTokenReferrerWalletAddress,
    });
    const result = await this.request('GET', '/api/v6/dex/aggregator/swap-instruction', query);
    assertOkxSuccess(result);
    const swap = firstDataObject(result);
    if (!swap) throw new Error('OKX 未返回 Solana 交易指令');

    const instructionLists = Array.isArray(swap.instructionLists)
      ? swap.instructionLists
        .map(parseSolanaInstruction)
        .filter((instruction): instruction is OkxSolanaInstruction => Boolean(instruction))
      : [];
    if (!instructionLists.length) throw new Error('OKX Solana 指令为空');

    const routerResult = swap.routerResult && typeof swap.routerResult === 'object'
      ? (swap.routerResult as Record<string, unknown>)
      : {};

    return {
      instructionLists,
      addressLookupTableAccount: readStringArray(swap.addressLookupTableAccount),
      routerResult: {
        fromTokenAmount: readString(routerResult, ['fromTokenAmount'], params.amount),
        toTokenAmount: readString(routerResult, ['toTokenAmount'], '0'),
        routes: parseRoutes(routerResult.dexRouterList),
      },
      priceImpactPercent: readString(routerResult, ['priceImpactPercent'], '') || readString(swap, ['priceImpactPercent'], '') || null,
      raw: swap,
    };
  }
}

export function getEnvDemoCredentials(): OkxCredentials | null {
  const apiKey = process.env.NEXT_PUBLIC_DEMO_OKX_API_KEY?.trim() || '';
  const secretKey = process.env.NEXT_PUBLIC_DEMO_OKX_SECRET?.trim() || '';
  const passphrase = process.env.NEXT_PUBLIC_DEMO_OKX_PASSPHRASE?.trim() || '';
  if (!apiKey && !secretKey && !passphrase) return null;
  return { apiKey, secretKey, passphrase };
}
