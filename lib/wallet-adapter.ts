import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  TransactionResponse,
  formatUnits,
  isAddress,
  parseUnits,
} from 'ethers';
import {
  CHAIN_CONFIGS,
  OKX_NATIVE_TOKEN_ADDRESS,
  type ChainKey,
  type TokenInfo,
  isNativeToken,
  normalizeTokenAddress,
} from '@/lib/chains';

export type Eip1193Provider = {
  request: (request: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type WalletState = {
  address: string | null;
  chainId: number | null;
  connected: boolean;
};

export type TokenBalance = {
  token: TokenInfo;
  raw: string;
  formatted: string;
  valueUsd?: number | null;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
] as const;

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  return window.ethereum || null;
}

export function getReadProvider(chainKey: ChainKey): JsonRpcProvider {
  const rpcUrl = CHAIN_CONFIGS[chainKey].rpcUrls[0];
  return new JsonRpcProvider(rpcUrl);
}

export async function connectWallet(): Promise<WalletState> {
  const injected = getInjectedProvider();
  if (!injected) {
    throw new Error('未检测到浏览器钱包，请安装 MetaMask、OKX Wallet 或兼容 EIP-1193 的钱包');
  }
  const accounts = await injected.request({ method: 'eth_requestAccounts' }) as string[];
  const chainIdHex = await injected.request({ method: 'eth_chainId' }) as string;
  return {
    address: accounts?.[0] || null,
    chainId: Number.parseInt(chainIdHex, 16),
    connected: Boolean(accounts?.[0]),
  };
}

export async function getWalletState(): Promise<WalletState> {
  const injected = getInjectedProvider();
  if (!injected) return { address: null, chainId: null, connected: false };
  const accounts = await injected.request({ method: 'eth_accounts' }) as string[];
  const chainIdHex = await injected.request({ method: 'eth_chainId' }) as string;
  return {
    address: accounts?.[0] || null,
    chainId: Number.parseInt(chainIdHex, 16),
    connected: Boolean(accounts?.[0]),
  };
}

export async function switchToChain(chainKey: ChainKey): Promise<void> {
  const injected = getInjectedProvider();
  const chain = CHAIN_CONFIGS[chainKey];
  if (!injected || !chain.chainIdHex || !chain.nativeCurrency) {
    throw new Error('当前链暂不支持浏览器钱包切换');
  }

  try {
    await injected.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.chainIdHex }],
    });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? Number((error as { code?: unknown }).code)
      : null;
    if (code !== 4902) throw error;
    await injected.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chain.chainIdHex,
        chainName: 'BNB Smart Chain',
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: chain.rpcUrls,
        blockExplorerUrls: chain.blockExplorerUrl ? [chain.blockExplorerUrl] : [],
      }],
    });
  }
}

function getBrowserProvider(): BrowserProvider {
  const injected = getInjectedProvider();
  if (!injected) throw new Error('未检测到浏览器钱包');
  return new BrowserProvider(injected);
}

export async function readTokenBalance(token: TokenInfo, walletAddress: string, chainKey: ChainKey): Promise<TokenBalance> {
  const normalizedAddress = normalizeTokenAddress(token.address);
  const decimals = token.decimals || 18;
  if (isNativeToken(normalizedAddress)) {
    const provider = getReadProvider(chainKey);
    const raw = await provider.getBalance(walletAddress);
    return {
      token: { ...token, address: OKX_NATIVE_TOKEN_ADDRESS, decimals },
      raw: raw.toString(),
      formatted: formatUnits(raw, decimals),
    };
  }

  const provider = getReadProvider(chainKey);
  const contract = new Contract(normalizedAddress, ERC20_ABI, provider);
  const raw = await contract.balanceOf(walletAddress) as bigint;
  return {
    token: { ...token, address: normalizedAddress, decimals },
    raw: raw.toString(),
    formatted: formatUnits(raw, decimals),
  };
}

export async function readTokenDecimals(tokenAddress: string, chainKey: ChainKey): Promise<number> {
  if (isNativeToken(tokenAddress)) return 18;
  const provider = getReadProvider(chainKey);
  const contract = new Contract(normalizeTokenAddress(tokenAddress), ERC20_ABI, provider);
  const decimals = await contract.decimals() as bigint | number;
  return Number(decimals);
}

export async function readAllowance(
  tokenAddress: string,
  owner: string,
  spender: string,
  chainKey: ChainKey
): Promise<bigint> {
  if (isNativeToken(tokenAddress)) return 0n;
  if (!isAddress(owner) || !isAddress(spender)) throw new Error('授权地址无效');
  const provider = getReadProvider(chainKey);
  const contract = new Contract(normalizeTokenAddress(tokenAddress), ERC20_ABI, provider);
  return await contract.allowance(owner, spender) as bigint;
}

export async function approveToken(
  tokenAddress: string,
  spender: string,
  amount: bigint
): Promise<TransactionResponse> {
  if (isNativeToken(tokenAddress)) throw new Error('原生 BNB 不需要授权');
  if (!isAddress(spender)) throw new Error('OKX 授权地址无效');
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(normalizeTokenAddress(tokenAddress), ERC20_ABI, signer);
  return await contract.approve(spender, amount) as TransactionResponse;
}

export async function sendSwapTransaction(tx: {
  to: string;
  data: string;
  value?: string | null;
  gas?: string | null;
}): Promise<TransactionResponse> {
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  return await signer.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value || '0'),
    gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
  });
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

export function isBscWallet(chainId: number | null): boolean {
  return chainId === CHAIN_CONFIGS.bsc.chainId;
}
