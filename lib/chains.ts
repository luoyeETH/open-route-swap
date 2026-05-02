import { isAddress } from 'ethers';

export const OKX_NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export const SOLANA_NATIVE_TOKEN_ADDRESS = '11111111111111111111111111111111';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const REQUIRED_OKX_FEE_PERCENT = '0.01';
export const DEFAULT_OKX_REFERRER_WALLET_ADDRESS = '0xddddd4a482561b90908329c145365c2bbe6adddd';
export const DEFAULT_OKX_SOLANA_REFERRER_WALLET_ADDRESS = 'GivfQdgTJySDcavJT99KVwQ5FksfgUuLGBrbknRmqNEK';

export type ChainKey =
  | 'ethereum'
  | 'bsc'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'
  | 'base'
  | 'avalanche'
  | 'fantom'
  | 'linea'
  | 'zksync'
  | 'solana';

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
  wrappedNativeToken?: TokenInfo;
  disabled?: boolean;
};

function nativeToken(chainKey: ChainKey, symbol: string, name = symbol): TokenInfo {
  const chain = CHAIN_CONFIGS[chainKey];
  return {
    chainKey,
    symbol,
    name,
    address: chainKey === 'solana' ? SOLANA_NATIVE_TOKEN_ADDRESS : OKX_NATIVE_TOKEN_ADDRESS,
    decimals: chainKey === 'solana' ? 9 : chain.nativeCurrency?.decimals ?? 18,
    source: 'preset',
  };
}

function presetToken(
  chainKey: ChainKey,
  symbol: string,
  name: string,
  address: string,
  decimals: number
): TokenInfo {
  return {
    chainKey,
    symbol,
    name,
    address,
    decimals,
    source: 'preset',
  };
}

export const CHAIN_CONFIGS: Record<ChainKey, ChainConfig> = {
  ethereum: {
    key: 'ethereum',
    label: 'Ethereum',
    chainIndex: '1',
    chainId: 1,
    chainIdHex: '0x1',
    rpcUrls: [process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL?.trim() || 'https://ethereum.publicnode.com'],
    blockExplorerUrl: 'https://etherscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    wrappedNativeToken: presetToken(
      'ethereum',
      'WETH',
      'Wrapped Ether',
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      18
    ),
  },
  bsc: {
    key: 'bsc',
    label: 'BSC',
    chainIndex: '56',
    chainId: 56,
    chainIdHex: '0x38',
    rpcUrls: [process.env.NEXT_PUBLIC_BSC_RPC_URL?.trim() || 'https://bsc-dataseed.binance.org'],
    blockExplorerUrl: 'https://bscscan.com',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
    wrappedNativeToken: presetToken(
      'bsc',
      'WBNB',
      'Wrapped BNB',
      '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
      18
    ),
  },
  polygon: {
    key: 'polygon',
    label: 'Polygon',
    chainIndex: '137',
    chainId: 137,
    chainIdHex: '0x89',
    rpcUrls: [process.env.NEXT_PUBLIC_POLYGON_RPC_URL?.trim() || 'https://polygon-rpc.com'],
    blockExplorerUrl: 'https://polygonscan.com',
    nativeCurrency: {
      name: 'POL',
      symbol: 'POL',
      decimals: 18,
    },
    wrappedNativeToken: presetToken(
      'polygon',
      'WPOL',
      'Wrapped POL',
      '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
      18
    ),
  },
  arbitrum: {
    key: 'arbitrum',
    label: 'Arbitrum',
    chainIndex: '42161',
    chainId: 42161,
    chainIdHex: '0xa4b1',
    rpcUrls: [process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL?.trim() || 'https://arb1.arbitrum.io/rpc'],
    blockExplorerUrl: 'https://arbiscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    wrappedNativeToken: presetToken(
      'arbitrum',
      'WETH',
      'Wrapped Ether',
      '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      18
    ),
  },
  optimism: {
    key: 'optimism',
    label: 'Optimism',
    chainIndex: '10',
    chainId: 10,
    chainIdHex: '0xa',
    rpcUrls: [process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL?.trim() || 'https://mainnet.optimism.io'],
    blockExplorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    wrappedNativeToken: presetToken(
      'optimism',
      'WETH',
      'Wrapped Ether',
      '0x4200000000000000000000000000000000000006',
      18
    ),
  },
  base: {
    key: 'base',
    label: 'Base',
    chainIndex: '8453',
    chainId: 8453,
    chainIdHex: '0x2105',
    rpcUrls: [process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() || 'https://mainnet.base.org'],
    blockExplorerUrl: 'https://basescan.org',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    wrappedNativeToken: presetToken(
      'base',
      'WETH',
      'Wrapped Ether',
      '0x4200000000000000000000000000000000000006',
      18
    ),
  },
  avalanche: {
    key: 'avalanche',
    label: 'Avalanche',
    chainIndex: '43114',
    chainId: 43114,
    chainIdHex: '0xa86a',
    rpcUrls: [process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL?.trim() || 'https://api.avax.network/ext/bc/C/rpc'],
    blockExplorerUrl: 'https://snowtrace.io',
    nativeCurrency: {
      name: 'Avalanche',
      symbol: 'AVAX',
      decimals: 18,
    },
    wrappedNativeToken: presetToken(
      'avalanche',
      'WAVAX',
      'Wrapped AVAX',
      '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
      18
    ),
  },
  fantom: {
    key: 'fantom',
    label: 'Fantom',
    chainIndex: '250',
    chainId: 250,
    chainIdHex: '0xfa',
    rpcUrls: [process.env.NEXT_PUBLIC_FANTOM_RPC_URL?.trim() || 'https://rpc.ftm.tools'],
    blockExplorerUrl: 'https://ftmscan.com',
    nativeCurrency: {
      name: 'Fantom',
      symbol: 'FTM',
      decimals: 18,
    },
    wrappedNativeToken: presetToken(
      'fantom',
      'WFTM',
      'Wrapped FTM',
      '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83',
      18
    ),
  },
  linea: {
    key: 'linea',
    label: 'Linea',
    chainIndex: '59144',
    chainId: 59144,
    chainIdHex: '0xe708',
    rpcUrls: [process.env.NEXT_PUBLIC_LINEA_RPC_URL?.trim() || 'https://rpc.linea.build'],
    blockExplorerUrl: 'https://lineascan.build',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    wrappedNativeToken: presetToken(
      'linea',
      'WETH',
      'Wrapped Ether',
      '0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f',
      18
    ),
  },
  zksync: {
    key: 'zksync',
    label: 'zkSync Era',
    chainIndex: '324',
    chainId: 324,
    chainIdHex: '0x144',
    rpcUrls: [process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL?.trim() || 'https://mainnet.era.zksync.io'],
    blockExplorerUrl: 'https://explorer.zksync.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    wrappedNativeToken: presetToken(
      'zksync',
      'WETH',
      'Wrapped Ether',
      '0x5aea5775959fbc2557cc8789bc1bf90a239d9a91',
      18
    ),
  },
  solana: {
    key: 'solana',
    label: 'Solana',
    chainIndex: '501',
    rpcUrls: [process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com'],
    blockExplorerUrl: 'https://solscan.io',
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
    },
  },
};

export const EVM_CHAIN_KEYS = [
  'ethereum',
  'bsc',
  'polygon',
  'arbitrum',
  'optimism',
  'base',
  'avalanche',
  'fantom',
  'linea',
  'zksync',
] as const satisfies readonly ChainKey[];

export type EvmChainKey = (typeof EVM_CHAIN_KEYS)[number];

export const SELECTABLE_CHAIN_KEYS = [...EVM_CHAIN_KEYS, 'solana'] as const satisfies readonly ChainKey[];

export const COMMON_TOKENS_BY_CHAIN: Record<ChainKey, TokenInfo[]> = {
  ethereum: [
    nativeToken('ethereum', 'ETH', 'Ether'),
    CHAIN_CONFIGS.ethereum.wrappedNativeToken!,
    presetToken('ethereum', 'USDT', 'Tether USD', '0xdac17f958d2ee523a2206206994597c13d831ec7', 6),
    presetToken('ethereum', 'USDC', 'USD Coin', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6),
    presetToken('ethereum', 'DAI', 'Dai Stablecoin', '0x6b175474e89094c44da98b954eedeac495271d0f', 18),
    presetToken('ethereum', 'WBTC', 'Wrapped BTC', '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', 8),
  ],
  bsc: [
    nativeToken('bsc', 'BNB'),
    CHAIN_CONFIGS.bsc.wrappedNativeToken!,
    presetToken('bsc', 'USDT', 'Tether USD', '0x55d398326f99059ff775485246999027b3197955', 18),
    presetToken('bsc', 'USDC', 'USD Coin', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', 18),
    presetToken('bsc', 'BUSD', 'Binance USD', '0xe9e7cea3dedca5984780bafc599bd69add087d56', 18),
    presetToken('bsc', 'FDUSD', 'First Digital USD', '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409', 18),
    presetToken('bsc', 'CAKE', 'PancakeSwap', '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82', 18),
  ],
  polygon: [
    nativeToken('polygon', 'POL', 'POL'),
    CHAIN_CONFIGS.polygon.wrappedNativeToken!,
    presetToken('polygon', 'USDT', 'Tether USD', '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', 6),
    presetToken('polygon', 'USDC', 'USD Coin', '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', 6),
    presetToken('polygon', 'DAI', 'Dai Stablecoin', '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', 18),
    presetToken('polygon', 'WBTC', 'Wrapped BTC', '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', 8),
  ],
  arbitrum: [
    nativeToken('arbitrum', 'ETH', 'Ether'),
    CHAIN_CONFIGS.arbitrum.wrappedNativeToken!,
    presetToken('arbitrum', 'USDT', 'Tether USD', '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', 6),
    presetToken('arbitrum', 'USDC', 'USD Coin', '0xaf88d065e77c8cc2239327c5edb3a432268e5831', 6),
    presetToken('arbitrum', 'ARB', 'Arbitrum', '0x912ce59144191c1204e64559fe8253a0e49e6548', 18),
    presetToken('arbitrum', 'WBTC', 'Wrapped BTC', '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', 8),
  ],
  optimism: [
    nativeToken('optimism', 'ETH', 'Ether'),
    CHAIN_CONFIGS.optimism.wrappedNativeToken!,
    presetToken('optimism', 'USDT', 'Tether USD', '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', 6),
    presetToken('optimism', 'USDC', 'USD Coin', '0x0b2c639c533813f4aa9d7837caf62653d097ff85', 6),
    presetToken('optimism', 'OP', 'Optimism', '0x4200000000000000000000000000000000000042', 18),
    presetToken('optimism', 'WBTC', 'Wrapped BTC', '0x68f180fcce6836688e9084f035309e29bf0a2095', 8),
  ],
  base: [
    nativeToken('base', 'ETH', 'Ether'),
    CHAIN_CONFIGS.base.wrappedNativeToken!,
    presetToken('base', 'USDC', 'USD Coin', '0x833589fcd6edb6e08f4c7c32d4f71b54bdA02913', 6),
    presetToken('base', 'DAI', 'Dai Stablecoin', '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', 18),
    presetToken('base', 'cbBTC', 'Coinbase Wrapped BTC', '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', 8),
  ],
  avalanche: [
    nativeToken('avalanche', 'AVAX', 'Avalanche'),
    CHAIN_CONFIGS.avalanche.wrappedNativeToken!,
    presetToken('avalanche', 'USDT', 'Tether USD', '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7', 6),
    presetToken('avalanche', 'USDC', 'USD Coin', '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', 6),
    presetToken('avalanche', 'DAI.e', 'Dai Stablecoin', '0xd586e7f844cea2f87f50152665bcbc2c279d8d70', 18),
    presetToken('avalanche', 'BTC.b', 'Bitcoin', '0x152b9d0fdc40c096757f570a51e494bd4b943e50', 8),
  ],
  fantom: [
    nativeToken('fantom', 'FTM', 'Fantom'),
    CHAIN_CONFIGS.fantom.wrappedNativeToken!,
    presetToken('fantom', 'USDT', 'Tether USD', '0x049d68029688eabf473097a2fc38ef61633a3c7a', 6),
    presetToken('fantom', 'USDC', 'USD Coin', '0x04068da6c83afcfa0e13ba15a6696662335d5b75', 6),
    presetToken('fantom', 'DAI', 'Dai Stablecoin', '0x8d11ec38a3eb5e956b052f67da8bdc9bef8abf3e', 18),
    presetToken('fantom', 'WETH', 'Wrapped Ether', '0x74b23882a30290451a17c44f4f05243b6b58c76d', 18),
  ],
  linea: [
    nativeToken('linea', 'ETH', 'Ether'),
    CHAIN_CONFIGS.linea.wrappedNativeToken!,
    presetToken('linea', 'USDT', 'Tether USD', '0xa219439258ca9da29e9cc4ce5596924745e12b93', 6),
    presetToken('linea', 'USDC', 'USD Coin', '0x176211869ca2b568f2a7d4ee941e073a821ee1ff', 6),
    presetToken('linea', 'DAI', 'Dai Stablecoin', '0x4af15ec2a0bd43db75dd04e62faa3b8ef36b00d5', 18),
    presetToken('linea', 'WBTC', 'Wrapped BTC', '0x3aab2285ddcddad8edf438c1bab47e1a9d05a9b4', 8),
  ],
  zksync: [
    nativeToken('zksync', 'ETH', 'Ether'),
    CHAIN_CONFIGS.zksync.wrappedNativeToken!,
    presetToken('zksync', 'USDT', 'Tether USD', '0x493257fd37edb34451f62edf8d2a0c418852ba4c', 6),
    presetToken('zksync', 'USDC', 'USD Coin', '0x1d17cbcf0d3a2f6b4f03c50131591bcff9a65492', 6),
    presetToken('zksync', 'WBTC', 'Wrapped BTC', '0xbbeb516fb02a01611cbbe0453fe3c580d7281011', 8),
  ],
  solana: [
    nativeToken('solana', 'SOL', 'Solana'),
    presetToken('solana', 'USDC', 'USD Coin', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6),
    presetToken('solana', 'USDT', 'Tether USD', 'Es9vMFrzaCERmJfrF4H2FYD4J96DUPx4dHcpny8wfZfG', 6),
  ],
};

export const BSC_COMMON_TOKENS = COMMON_TOKENS_BY_CHAIN.bsc;

export const TOKEN_COLORS: Record<string, string> = {
  ETH: '#627eea',
  WETH: '#627eea',
  BNB: '#d7a814',
  WBNB: '#d7a814',
  POL: '#8247e5',
  WPOL: '#8247e5',
  MATIC: '#8247e5',
  WMATIC: '#8247e5',
  AVAX: '#e84142',
  WAVAX: '#e84142',
  FTM: '#1969ff',
  WFTM: '#1969ff',
  USDT: '#20a67a',
  USDC: '#2e7bcf',
  BUSD: '#c99716',
  FDUSD: '#12a987',
  DAI: '#f0b90b',
  'DAI.E': '#f0b90b',
  WBTC: '#f7931a',
  'BTC.B': '#f7931a',
  CBBTC: '#f7931a',
  ARB: '#28a0f0',
  OP: '#ff0420',
  CAKE: '#b47a52',
  SOL: '#14f195',
};

export function normalizeTokenAddress(address: string | null | undefined, chainKey?: ChainKey): string {
  const raw = String(address || '').trim();
  const evmValue = raw.toLowerCase();
  if (chainKey === 'solana') {
    if (!raw || raw === ZERO_ADDRESS || evmValue === OKX_NATIVE_TOKEN_ADDRESS) return SOLANA_NATIVE_TOKEN_ADDRESS;
    return raw;
  }
  const value = evmValue;
  if (!value || value === ZERO_ADDRESS) return OKX_NATIVE_TOKEN_ADDRESS;
  return value;
}

export function isNativeToken(address: string | null | undefined, chainKey?: ChainKey): boolean {
  const normalized = normalizeTokenAddress(address, chainKey);
  return chainKey === 'solana'
    ? normalized === SOLANA_NATIVE_TOKEN_ADDRESS
    : normalized === OKX_NATIVE_TOKEN_ADDRESS;
}

export function isEvmChain(chainKey: ChainKey): chainKey is EvmChainKey {
  return EVM_CHAIN_KEYS.includes(chainKey as EvmChainKey);
}

export function isSupportedSwapChain(chainKey: ChainKey): boolean {
  const chain = CHAIN_CONFIGS[chainKey];
  if (chainKey === 'solana') return !chain.disabled && Boolean(chain.rpcUrls[0]);
  return isEvmChain(chainKey) && !chain.disabled && Boolean(chain.chainId && chain.chainIdHex && chain.rpcUrls[0]);
}

export function isValidEvmAddress(address: string | null | undefined): boolean {
  return isAddress(String(address || '').trim());
}

export function isSolanaChain(chainKey: ChainKey): boolean {
  return chainKey === 'solana';
}

export function isValidSolanaAddress(address: string | null | undefined): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(address || '').trim());
}

export function getChainNativeSymbol(chainKey: ChainKey): string {
  return CHAIN_CONFIGS[chainKey].nativeCurrency?.symbol || '';
}

export function getCommonTokens(chainKey: ChainKey): TokenInfo[] {
  return COMMON_TOKENS_BY_CHAIN[chainKey] || [];
}

export function getDefaultFromToken(chainKey: ChainKey): TokenInfo {
  return getCommonTokens(chainKey)[0] || nativeToken(chainKey, getChainNativeSymbol(chainKey) || 'TOKEN');
}

export function getDefaultToToken(chainKey: ChainKey): TokenInfo {
  const commonTokens = getCommonTokens(chainKey);
  return commonTokens[2] || commonTokens[1] || commonTokens[0] || getDefaultFromToken(chainKey);
}

export function getConfiguredFeePercent(): string {
  return process.env.NEXT_PUBLIC_OKX_FEE_PERCENT?.trim() || REQUIRED_OKX_FEE_PERCENT;
}

export function getConfiguredReferrerAddress(): string {
  return process.env.NEXT_PUBLIC_OKX_FROM_TOKEN_REFERRER_WALLET_ADDRESS?.trim()
    || DEFAULT_OKX_REFERRER_WALLET_ADDRESS;
}

export function getConfiguredSolanaReferrerAddress(): string {
  return process.env.NEXT_PUBLIC_OKX_SOLANA_REFERRER_WALLET_ADDRESS?.trim()
    || DEFAULT_OKX_SOLANA_REFERRER_WALLET_ADDRESS;
}

export function getOkxBaseUrl(): string {
  return process.env.NEXT_PUBLIC_OKX_BASE_URL?.trim() || 'https://web3.okx.com';
}

export function getDefaultChainKey(): ChainKey {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_CHAIN?.trim().toLowerCase() as ChainKey | undefined;
  if (configured && isSupportedSwapChain(configured)) return configured;
  return 'bsc';
}

export function mergeTokenLists(tokens: TokenInfo[]): TokenInfo[] {
  const byChainAndAddress = new Map<string, TokenInfo>();
  for (const token of tokens) {
    const address = normalizeTokenAddress(token.address, token.chainKey);
    const key = `${token.chainKey}:${address}`;
    const existing = byChainAndAddress.get(key);
    byChainAndAddress.set(key, {
      ...existing,
      ...token,
      address,
      symbol: (token.symbol || existing?.symbol || 'TOKEN').trim().toUpperCase(),
      name: (token.name || existing?.name || token.symbol || 'Token').trim(),
      decimals: Number.isFinite(token.decimals) ? token.decimals : existing?.decimals ?? 18,
      logoUrl: token.logoUrl ?? existing?.logoUrl ?? null,
    });
  }
  return Array.from(byChainAndAddress.values());
}
