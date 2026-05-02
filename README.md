# open-route-swap

基于 OKX DEX API 的轻量级开源 Swap 前端。支持多条 EVM 链，固定平台费 `0.01%`。

## 运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。

## 费率

默认 swap 请求会设置 `feePercent=0.01`，用于启用 OKX fee 配置，减少正滑点被 OKX 作为基础设施费收取的情况。

OKX 官方文档说明：

- [API Fee](https://web3.okx.com/build/dev-docs-v5/dex-api/dex-api-fee)：Trial tier 下，如果 OKX DEX API 拿到优于报价的成交价格，产生的正滑点会作为基础设施费用由 OKX 保留，最高不超过交易额的 10%。
- [API Fee](https://web3.okx.com/build/dev-docs-v5/dex-api/dex-api-fee)：Start-up tier 下，如果 swap 配置了 partner fee，正滑点默认返回给用户；如果不配置 partner fee，正滑点仍会作为 OKX 基础设施费用保留。
- [Adding Fees](https://web3.okx.com/build/dev-docs-v5/dex-api/dex-api-addfee)：swap 请求可配置 `feePercent` 参数，多数链每笔最高 3%，Solana 最高 10%。

## 配置

可选：

```bash
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed.binance.org
NEXT_PUBLIC_ETHEREUM_RPC_URL=https://ethereum.publicnode.com
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-rpc.com
NEXT_PUBLIC_ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
NEXT_PUBLIC_OPTIMISM_RPC_URL=https://mainnet.optimism.io
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc
NEXT_PUBLIC_FANTOM_RPC_URL=https://rpc.ftm.tools
NEXT_PUBLIC_LINEA_RPC_URL=https://rpc.linea.build
NEXT_PUBLIC_ZKSYNC_RPC_URL=https://mainnet.era.zksync.io
NEXT_PUBLIC_OKX_BASE_URL=https://web3.okx.com
NEXT_PUBLIC_OKX_SIGNER_PROXY_URL=
```

公开 RPC 已在代码内置；只有需要自定义节点、限流更高的 RPC 或私有网关时才需要覆盖。

OKX Key 默认在页面内输入，仅保存到当前浏览器会话。公开环境变量和浏览器存储都不能保护 Secret，生产演示建议使用 signer proxy。
