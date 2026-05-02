import { isAddress } from 'ethers';

export const OKX_NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const REQUIRED_OKX_FEE_PERCENT = '0.01';
export const DEFAULT_OKX_REFERRER_WALLET_ADDRESS = '0xddddd4a482561b90908329c145365c2bbe6adddd';

export type ChainKey = 'bsc' | 'solana';

export type TokenInfo = {
  chainKey: ChainKey;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string | null;
  source?: 'preset' | 'okx' | 'wallet' | 'custom';
};

export type ChainConfig = {
  key: ChainKey;
  label: string;
  chainIndex: string;
  chainId?: number;
  chainIdHex?: `0x${string}`;
  rpcUrls: string[];
  blockExplorerUrl?: string;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
  disabled?: boolean;
};

const publicBscRpc = process.env.NEXT_PUBLIC_BSC_RPC_URL?.trim();

export const CHAIN_CONFIGS: Record<ChainKey, ChainConfig> = {
  bsc: {
    key: 'bsc',
    label: 'BSC',
    chainIndex: '56',
    chainId: 56,
    chainIdHex: '0x38',
    rpcUrls: [publicBscRpc || 'https://bsc-dataseed.binance.org'],
    blockExplorerUrl: 'https://bscscan.com',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
  },
  solana: {
    key: 'solana',
    label: 'Solana',
    chainIndex: '501',
    rpcUrls: [],
    disabled: true,
  },
};

export const BSC_COMMON_TOKENS: TokenInfo[] = [
  {
    chainKey: 'bsc',
    symbol: 'BNB',
    name: 'BNB',
    address: OKX_NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    source: 'preset',
  },
  {
    chainKey: 'bsc',
    symbol: 'WBNB',
    name: 'Wrapped BNB',
    address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    decimals: 18,
    source: 'preset',
  },
  {
    chainKey: 'bsc',
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0x55d398326f99059ff775485246999027b3197955',
    decimals: 18,
    source: 'preset',
  },
  {
    chainKey: 'bsc',
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    decimals: 18,
    source: 'preset',
  },
  {
    chainKey: 'bsc',
    symbol: 'BUSD',
    name: 'Binance USD',
    address: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    decimals: 18,
    source: 'preset',
  },
  {
    chainKey: 'bsc',
    symbol: 'FDUSD',
    name: 'First Digital USD',
    address: '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409',
    decimals: 18,
    source: 'preset',
  },
  {
    chainKey: 'bsc',
    symbol: 'CAKE',
    name: 'PancakeSwap',
    address: '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
    decimals: 18,
    source: 'preset',
  },
];

export const TOKEN_COLORS: Record<string, string> = {
  BNB: '#d7a814',
  WBNB: '#d7a814',
  USDT: '#20a67a',
  USDC: '#2e7bcf',
  BUSD: '#c99716',
  FDUSD: '#12a987',
  CAKE: '#b47a52',
};

export function normalizeTokenAddress(address: string | null | undefined): string {
  const value = String(address || '').trim().toLowerCase();
  if (!value || value === ZERO_ADDRESS) return OKX_NATIVE_TOKEN_ADDRESS;
  return value;
}

export function isNativeToken(address: string | null | undefined): boolean {
  return normalizeTokenAddress(address) === OKX_NATIVE_TOKEN_ADDRESS;
}

export function isValidEvmAddress(address: string | null | undefined): boolean {
  return isAddress(String(address || '').trim());
}

export function getConfiguredFeePercent(): string {
  return process.env.NEXT_PUBLIC_OKX_FEE_PERCENT?.trim() || REQUIRED_OKX_FEE_PERCENT;
}

export function getConfiguredReferrerAddress(): string {
  return process.env.NEXT_PUBLIC_OKX_FROM_TOKEN_REFERRER_WALLET_ADDRESS?.trim()
    || DEFAULT_OKX_REFERRER_WALLET_ADDRESS;
}

export function getOkxBaseUrl(): string {
  return process.env.NEXT_PUBLIC_OKX_BASE_URL?.trim() || 'https://web3.okx.com';
}

export function getDefaultChainKey(): ChainKey {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_CHAIN?.trim().toLowerCase();
  return configured === 'solana' ? 'solana' : 'bsc';
}

export function mergeTokenLists(tokens: TokenInfo[]): TokenInfo[] {
  const byAddress = new Map<string, TokenInfo>();
  for (const token of tokens) {
    const address = normalizeTokenAddress(token.address);
    const existing = byAddress.get(address);
    byAddress.set(address, {
      ...existing,
      ...token,
      address,
      symbol: (token.symbol || existing?.symbol || 'TOKEN').trim().toUpperCase(),
      name: (token.name || existing?.name || token.symbol || 'Token').trim(),
      decimals: Number.isFinite(token.decimals) ? token.decimals : existing?.decimals ?? 18,
      logoUrl: token.logoUrl ?? existing?.logoUrl ?? null,
    });
  }
  return Array.from(byAddress.values());
}
