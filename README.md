# Open Route Swap

Open Route Swap 是一个基于 OKX DEX API 的轻量级 Swap 前端，用来把 OKX 聚合器的报价和路由能力，以更透明、可自部署的方式提供给钱包用户。

为什么要做这个项目：OKX DEX 网页界面会对部分兑换路径收取界面费用，官方费率表包含 `0%`、`0.25%` 和 `0.85%` 三档。通过 OKX DEX API 构造交易时，用户不走 OKX DEX 网页界面费；OKX 的 API 文档也说明 Trial API Tier 在试用期内可免费访问。这个项目适合想自己部署一个简单 Swap 页面、保留 OKX 路由能力，同时减少额外界面费用影响的场景。

重要提醒：OKX Boost 规则明确写到 `API trading is not counted`。也就是说，通过本项目前端发起的 API 交易，不应被预期计入 OKX Boost 交易量统计。

## 功能

- 支持多条 EVM 链和 Solana 主网。
- 使用浏览器钱包签名交易，不在前端保存或导入私钥。
- EVM 链使用 OKX `/swap` 交易数据，自动处理 ERC20 授权。
- Solana 使用 OKX `/swap-instruction`，由浏览器 Solana 钱包签名 v0 transaction。
- 内置报价、余额、MAX、确认弹窗和交易记录。
- 默认配置 `0.01%` partner fee，可按自己的 OKX fee 配置调整代码和环境变量。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。

页面内需要配置 OKX API Key、Secret、Passphrase，或者使用 signer proxy。生产部署不建议把 Secret 暴露在浏览器环境里。

## 部署

推荐部署为普通 Next.js 应用：

```bash
npm install
npm run build
npm run start
```

生产环境建议：

- 使用 signer proxy 代替浏览器内签 OKX 请求。
- 使用稳定 RPC，避免公共 RPC 限流影响报价、余额和发交易。
- 配置自己的 EVM referrer 地址和 Solana referrer 地址。
- 部署后先用小额交易分别测试 EVM 和 Solana 路径。

## 环境变量

最小部署通常只需要：

```bash
NEXT_PUBLIC_OKX_SIGNER_PROXY_URL=
NEXT_PUBLIC_OKX_FROM_TOKEN_REFERRER_WALLET_ADDRESS=
NEXT_PUBLIC_OKX_SOLANA_REFERRER_WALLET_ADDRESS=
```

如果需要覆盖默认 RPC：

```bash
NEXT_PUBLIC_ETHEREUM_RPC_URL=https://ethereum.publicnode.com
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed.binance.org
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-rpc.com
NEXT_PUBLIC_ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
NEXT_PUBLIC_OPTIMISM_RPC_URL=https://mainnet.optimism.io
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc
NEXT_PUBLIC_FANTOM_RPC_URL=https://rpc.ftm.tools
NEXT_PUBLIC_LINEA_RPC_URL=https://rpc.linea.build
NEXT_PUBLIC_ZKSYNC_RPC_URL=https://mainnet.era.zksync.io
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## 费用与统计说明

本项目不是 OKX 官方网页 DEX，而是调用 OKX DEX API 构造用户钱包交易。OKX DEX 网页界面费、API 费用、partner fee、正滑点和 Boost 统计规则都可能随 OKX 官方政策变化，部署前应以官方页面为准。

当前实现默认在 swap 请求中设置 `feePercent=0.01`。这不是 OKX DEX 网页界面的 `0.85%` interface fee，而是项目自己的 partner fee 配置。

参考资料：

- [OKX DEX 服务费](https://web3.okx.com/zh-hans/dex-fees)
- [OKX DEX API Fee](https://web3.okx.com/build/dev-docs-v5/dex-api/dex-api-fee)
- [What’s OKX Boost?](https://web3.okx.com/nl/help/what-is-okx-boost)
