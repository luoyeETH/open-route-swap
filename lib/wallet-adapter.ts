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
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import {
  CHAIN_CONFIGS,
  OKX_NATIVE_TOKEN_ADDRESS,
  SOLANA_NATIVE_TOKEN_ADDRESS,
  type ChainKey,
  type TokenInfo,
  getChainNativeSymbol,
  isNativeToken,
  isSolanaChain,
  isSupportedSwapChain,
  normalizeTokenAddress,
} from '@/lib/chains';
import type { OkxSolanaInstruction } from '@/lib/okx-client';

export type Eip1193Provider = {
  request: (request: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type SolanaWalletProvider = {
  publicKey?: PublicKey | { toString: () => string } | string | null;
  isOKXWallet?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: PublicKey | { toString: () => string } | string | null } | void>;
  disconnect?: () => Promise<void>;
  signTransaction: <T extends VersionedTransaction>(transaction: T) => Promise<T>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type WalletState = {
  address: string | null;
  chainId: number | null;
  connected: boolean;
  kind: 'evm' | 'solana' | null;
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
    okxwallet?: {
      solana?: SolanaWalletProvider;
    };
    solana?: SolanaWalletProvider;
  }
}

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
] as const;

const SOLANA_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const SOLANA_TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  return window.ethereum || null;
}

export function getInjectedSolanaProvider(): SolanaWalletProvider | null {
  if (typeof window === 'undefined') return null;
  return window.okxwallet?.solana || window.solana || null;
}

export function getReadProvider(chainKey: ChainKey): JsonRpcProvider {
  const rpcUrl = CHAIN_CONFIGS[chainKey].rpcUrls[0];
  if (!rpcUrl) throw new Error('当前链缺少 RPC');
  return new JsonRpcProvider(rpcUrl);
}

export function getSolanaConnection(): Connection {
  const rpcUrl = CHAIN_CONFIGS.solana.rpcUrls[0];
  if (!rpcUrl) throw new Error('Solana 缺少 RPC');
  return new Connection(rpcUrl, 'confirmed');
}

function publicKeyToString(value: SolanaWalletProvider['publicKey']): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.toString();
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
    kind: 'evm',
  };
}

export async function connectSolanaWallet(): Promise<WalletState> {
  const injected = getInjectedSolanaProvider();
  if (!injected) {
    throw new Error('未检测到 Solana 钱包，请安装 OKX Wallet、Phantom 或兼容 Solana 的浏览器钱包');
  }
  const result = await injected.connect();
  const address = publicKeyToString(result?.publicKey ?? injected.publicKey);
  return {
    address,
    chainId: null,
    connected: Boolean(address),
    kind: 'solana',
  };
}

export async function getWalletState(): Promise<WalletState> {
  const injected = getInjectedProvider();
  if (!injected) return { address: null, chainId: null, connected: false, kind: null };
  const accounts = await injected.request({ method: 'eth_accounts' }) as string[];
  const chainIdHex = await injected.request({ method: 'eth_chainId' }) as string;
  return {
    address: accounts?.[0] || null,
    chainId: Number.parseInt(chainIdHex, 16),
    connected: Boolean(accounts?.[0]),
    kind: accounts?.[0] ? 'evm' : null,
  };
}

export async function getSolanaWalletState(): Promise<WalletState> {
  const injected = getInjectedSolanaProvider();
  if (!injected) return { address: null, chainId: null, connected: false, kind: null };
  try {
    const result = await injected.connect({ onlyIfTrusted: true });
    const address = publicKeyToString(result?.publicKey ?? injected.publicKey);
    return {
      address,
      chainId: null,
      connected: Boolean(address),
      kind: address ? 'solana' : null,
    };
  } catch {
    const address = publicKeyToString(injected.publicKey);
    return {
      address,
      chainId: null,
      connected: Boolean(address),
      kind: address ? 'solana' : null,
    };
  }
}

export async function switchToChain(chainKey: ChainKey): Promise<void> {
  const injected = getInjectedProvider();
  const chain = CHAIN_CONFIGS[chainKey];
  if (!injected || !isSupportedSwapChain(chainKey) || !chain.chainIdHex || !chain.nativeCurrency) {
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
        chainName: chain.label,
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
  if (isSolanaChain(chainKey)) {
    return readSolanaTokenBalance(token, walletAddress);
  }

  const normalizedAddress = normalizeTokenAddress(token.address, chainKey);
  const decimals = token.decimals || 18;
  if (isNativeToken(normalizedAddress, chainKey)) {
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

async function readSolanaTokenBalance(token: TokenInfo, walletAddress: string): Promise<TokenBalance> {
  const normalizedAddress = normalizeTokenAddress(token.address, 'solana');
  const decimals = token.decimals || 9;
  const connection = getSolanaConnection();
  const owner = new PublicKey(walletAddress);
  if (isNativeToken(normalizedAddress, 'solana')) {
    const raw = await connection.getBalance(owner, 'confirmed');
    return {
      token: { ...token, address: SOLANA_NATIVE_TOKEN_ADDRESS, decimals },
      raw: String(raw),
      formatted: formatUnits(raw, decimals),
    };
  }

  const mint = new PublicKey(normalizedAddress);
  const programIds = [SOLANA_TOKEN_PROGRAM_ID, SOLANA_TOKEN_2022_PROGRAM_ID];
  const settled = await Promise.allSettled(
    programIds.map((programId) => connection.getParsedTokenAccountsByOwner(owner, { programId }))
  );

  let raw = 0n;
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const account of result.value.value) {
      const parsedInfo = account.account.data.parsed?.info as {
        mint?: string;
        tokenAmount?: { amount?: string };
      } | undefined;
      if (parsedInfo?.mint !== mint.toString()) continue;
      raw += BigInt(parsedInfo.tokenAmount?.amount || '0');
    }
  }

  return {
    token: { ...token, address: normalizedAddress, decimals },
    raw: raw.toString(),
    formatted: formatUnits(raw, decimals),
  };
}

export async function readTokenDecimals(tokenAddress: string, chainKey: ChainKey): Promise<number> {
  if (isNativeToken(tokenAddress, chainKey)) return chainKey === 'solana' ? 9 : 18;
  const provider = getReadProvider(chainKey);
  const contract = new Contract(normalizeTokenAddress(tokenAddress, chainKey), ERC20_ABI, provider);
  const decimals = await contract.decimals() as bigint | number;
  return Number(decimals);
}

export async function readAllowance(
  tokenAddress: string,
  owner: string,
  spender: string,
  chainKey: ChainKey
): Promise<bigint> {
  if (isNativeToken(tokenAddress, chainKey)) return 0n;
  if (!isAddress(owner) || !isAddress(spender)) throw new Error('授权地址无效');
  const provider = getReadProvider(chainKey);
  const contract = new Contract(normalizeTokenAddress(tokenAddress, chainKey), ERC20_ABI, provider);
  return await contract.allowance(owner, spender) as bigint;
}

export async function approveToken(
  tokenAddress: string,
  spender: string,
  amount: bigint,
  chainKey: ChainKey
): Promise<TransactionResponse> {
  if (isNativeToken(tokenAddress, chainKey)) throw new Error('原生代币不需要授权');
  if (!isAddress(spender)) throw new Error('OKX 授权地址无效');
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const contract = new Contract(normalizeTokenAddress(tokenAddress, chainKey), ERC20_ABI, signer);
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

function okxInstructionToSolanaInstruction(instruction: OkxSolanaInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    data: Buffer.from(instruction.data, 'base64'),
    keys: instruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
  });
}

async function loadAddressLookupTables(connection: Connection, addresses: string[]): Promise<AddressLookupTableAccount[]> {
  const uniqueAddresses = Array.from(new Set(addresses.map((address) => address.trim()).filter(Boolean)));
  if (!uniqueAddresses.length) return [];
  const accounts = await Promise.all(
    uniqueAddresses.map((address) => connection.getAddressLookupTable(new PublicKey(address)))
  );
  return accounts.flatMap((account) => (account.value ? [account.value] : []));
}

export async function sendSolanaSwapInstructions(params: {
  instructions: OkxSolanaInstruction[];
  addressLookupTableAccounts: string[];
  walletAddress: string;
}): Promise<string> {
  const wallet = getInjectedSolanaProvider();
  if (!wallet) throw new Error('未检测到 Solana 钱包');
  if (!wallet.signTransaction) throw new Error('Solana 钱包不支持 signTransaction');

  const connection = getSolanaConnection();
  const payerKey = new PublicKey(params.walletAddress);
  const [{ blockhash, lastValidBlockHeight }, lookupTables] = await Promise.all([
    connection.getLatestBlockhash('confirmed'),
    loadAddressLookupTables(connection, params.addressLookupTableAccounts),
  ]);
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: blockhash,
    instructions: params.instructions.map(okxInstructionToSolanaInstruction),
  }).compileToV0Message(lookupTables);
  const transaction = new VersionedTransaction(message);
  const signedTransaction = await wallet.signTransaction(transaction);

  const simulation = await connection.simulateTransaction(signedTransaction, { sigVerify: true });
  if (simulation.value.err) {
    throw new Error(`Solana 交易模拟失败：${JSON.stringify(simulation.value.err)}`);
  }

  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed'
  );
  if (confirmation.value.err) {
    throw new Error(`Solana 交易确认失败：${JSON.stringify(confirmation.value.err)}`);
  }
  return signature;
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

export function isWalletOnChain(chainId: number | null, chainKey: ChainKey): boolean {
  if (chainKey === 'solana') return true;
  return chainId === CHAIN_CONFIGS[chainKey].chainId;
}

export function getNativeGasSymbol(chainKey: ChainKey): string {
  return getChainNativeSymbol(chainKey) || 'Gas';
}
