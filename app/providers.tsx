'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RainbowKitProvider,
  getDefaultConfig,
  midnightTheme,
} from '@rainbow-me/rainbowkit';
import {
  bitgetWallet,
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  phantomWallet,
  rabbyWallet,
  trustWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { WagmiProvider, http } from 'wagmi';
import {
  arbitrum,
  avalanche,
  base,
  bsc,
  fantom,
  linea,
  mainnet,
  optimism,
  polygon,
  zksync,
} from 'wagmi/chains';
import { CHAIN_CONFIGS, getDefaultChainKey } from '@/lib/chains';

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()
  || 'YOUR_PROJECT_ID';

const evmChains = [
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
  fantom,
  linea,
  zksync,
] as const;

const defaultChain = CHAIN_CONFIGS[getDefaultChainKey()];
const initialRainbowKitChain = defaultChain.chainId ?? bsc.id;

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="min-h-[100dvh]" />;

  return <BrowserWalletProviders>{children}</BrowserWalletProviders>;
}

function BrowserWalletProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const wagmiConfig = useMemo(() => getDefaultConfig({
    appName: 'Open Route Swap',
    appDescription: 'Open-source OKX DEX API swap frontend',
    appUrl: 'https://openrouteswap.app',
    projectId: walletConnectProjectId,
    chains: evmChains,
    wallets: [
      {
        groupName: '推荐',
        wallets: [
          metaMaskWallet,
          okxWallet,
          rabbyWallet,
          phantomWallet,
          bitgetWallet,
          trustWallet,
        ],
      },
      {
        groupName: '更多',
        wallets: [
          coinbaseWallet,
          walletConnectWallet,
          injectedWallet,
        ],
      },
    ],
    transports: {
      [mainnet.id]: http(CHAIN_CONFIGS.ethereum.rpcUrls[0]),
      [bsc.id]: http(CHAIN_CONFIGS.bsc.rpcUrls[0]),
      [polygon.id]: http(CHAIN_CONFIGS.polygon.rpcUrls[0]),
      [arbitrum.id]: http(CHAIN_CONFIGS.arbitrum.rpcUrls[0]),
      [optimism.id]: http(CHAIN_CONFIGS.optimism.rpcUrls[0]),
      [base.id]: http(CHAIN_CONFIGS.base.rpcUrls[0]),
      [avalanche.id]: http(CHAIN_CONFIGS.avalanche.rpcUrls[0]),
      [fantom.id]: http(CHAIN_CONFIGS.fantom.rpcUrls[0]),
      [linea.id]: http(CHAIN_CONFIGS.linea.rpcUrls[0]),
      [zksync.id]: http(CHAIN_CONFIGS.zksync.rpcUrls[0]),
    },
    ssr: true,
  }), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={initialRainbowKitChain}
          locale="zh-CN"
          modalSize="compact"
          showRecentTransactions={false}
          theme={midnightTheme({
            accentColor: '#2dd4bf',
            accentColorForeground: '#042f2e',
            borderRadius: 'medium',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
        >
          <ConnectionProvider endpoint={CHAIN_CONFIGS.solana.rpcUrls[0]}>
            <WalletProvider wallets={[]} autoConnect localStorageKey="open-route-swap.solana.wallet">
              <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
