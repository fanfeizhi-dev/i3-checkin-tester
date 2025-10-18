# i3-checkin-tester

一个用于批量测试 I3 Daily Check-in 功能的独立自动化项目，支持多钱包真实上链签到 + Playwright 页面连接验证。

---

## 📋 项目特点

- ✅ **完全独立**：不修改你的网站代码，单独运行
- ✅ **真实上链**：使用 ethers.js 直接调用合约 `dailyCheckin()`
- ✅ **Playwright 注入**：模拟钱包 provider，在页面完成"连接"和 UI 操作
- ✅ **分阶段测试**：先 5 个钱包演练，再 30 个钱包正式运行
- ✅ **灵活配置**：链配置、站点 UI、运行计划全部 JSON 化
- ✅ **节流控制**：避免 RPC 限速和 nonce 冲突

---

## 🏗️ 项目结构

```
i3-checkin-tester/
├─ README.md                      # 本文档
├─ package.json                   
├─ .gitignore                     
├─ .env.example                   # 环境变量模板
│
├─ config/
│  ├─ chains.json                 # 链配置（BNB 主网/opBNB）
│  ├─ sites.json                  # 站点 URL 和 UI 选择器
│  └─ runplans.json               # 运行计划（5个/30个钱包）
│
├─ abis/
│  └─ I3CheckInCore.json          # 合约 ABI（仅需用到的方法）
│
├─ wallets/
│  ├─ mnemonic.txt                # 测试助记词（本地不入库）
│  └─ addresses.sample.csv        # 地址清单示例
│
├─ scripts/
│  ├─ derive-addresses.js         # 派生钱包地址
│  ├─ fund-wallets.js             # 批量转账 BNB
│  ├─ bulk-checkin.js             # 批量上链签到
│  ├─ inject/
│  │  ├─ mock-provider.js         # EIP-1193 provider 注入脚本
│  │  └─ bridge-protocol.md       # 页面-Node 桥接协议文档
│  ├─ runner-playwright.spec.ts   # Playwright 测试脚本
│  ├─ orchestrate-5-first.js      # 5 钱包演练编排
│  └─ orchestrate-30-main.js      # 30 钱包正式编排
│
├─ playwright.config.ts
└─ utils/
   ├─ address-book.js             # 地址管理
   ├─ signer-factory.js           # Wallet 实例 + Nonce 管理
   ├─ tx-helpers.js               # 交易辅助函数
   ├─ ui-actions.js               # Playwright UI 操作封装
   └─ time.js                     # 等待/节流工具
```

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

**主要依赖：**
- `ethers` (v6.x) - 链交互
- `@playwright/test` - 浏览器自动化
- `dotenv` - 环境变量管理

**安装 Playwright 浏览器：**
```bash
npx playwright install chromium
```

---

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

填写以下关键信息：

```env
# 链配置
RPC_BNB_MAINNET=https://bsc-dataseed1.binance.org
CHECKIN_CONTRACT_BNB=0x你的合约地址

# 钱包
FUND_PRIVATE_KEY=0x你的资金钱包私钥（用于转账 BNB）
TEST_MNEMONIC="word1 word2 ... word12"  # 测试助记词

# 运行参数
WALLET_COUNT=30
PER_TX_DELAY_MS=100

# 站点配置
SITE_URL=https://your-domain.example/checkin
CONNECT_BTN=#connectWalletBtn
CHECKIN_BTN=#checkinBtn
POST_CONNECT_ACTION=reload  # none | reload | routeSwitch
```

> ⚠️ **安全提示**：`.env` 文件已在 `.gitignore` 中，切勿提交到代码仓库！

---

### 3. 配置 JSON 文件

#### `config/chains.json`
```json
{
  "bnb": {
    "name": "BNB Smart Chain",
    "chainId": 56,
    "rpcHttps": "https://bsc-dataseed1.binance.org",
    "checkinContract": "0x你的合约地址"
  }
}
```

#### `config/sites.json`
```json
{
  "mainSite": {
    "url": "https://your-domain.example/checkin",
    "connectButtonSelector": "#connectWalletBtn",
    "checkinButtonSelector": "#checkinBtn",
    "postConnectAction": "reload"
  }
}
```

#### `config/runplans.json`
```json
{
  "rehearsal": {
    "name": "5钱包演练",
    "walletCount": 5,
    "perTxDelayMs": 100,
    "openUi": true,
    "sendOnPage": false
  },
  "production": {
    "name": "30钱包正式",
    "walletCount": 30,
    "perTxDelayMs": 150,
    "openUi": true,
    "sendOnPage": false
  }
}
```

---

## 📖 使用方法

### 方式一：一键编排（推荐）

#### 5 钱包演练
```bash
node scripts/orchestrate-5-first.js
```

**执行流程：**
1. 派生前 5 个钱包地址
2. 给每个地址转 0.002-0.005 BNB
3. 真实上链执行 `dailyCheckin()`
4. 打开页面，注入 provider，点击连接
5. （可选）点击页面签到按钮刷新 UI

**预估费用：** ~0.00015 BNB (5 × 0.00003)

---

#### 30 钱包正式运行
```bash
node scripts/orchestrate-30-main.js
```

**预估费用：** ~0.0009 BNB (30 × 0.00003)

---

### 方式二：分步执行

适合调试或只运行部分功能：

#### 步骤 1：派生地址
```bash
node scripts/derive-addresses.js --n=5
```

#### 步骤 2：分发 BNB
```bash
node scripts/fund-wallets.js
```

#### 步骤 3：真实上链签到
```bash
node scripts/bulk-checkin.js
```

#### 步骤 4：页面连接测试
```bash
npx playwright test scripts/runner-playwright.spec.ts
```

---

## 🔧 核心功能说明

### 1. 钱包派生 (`derive-addresses.js`)
- 从助记词派生 HD 钱包地址（路径 `m/44'/60'/0'/0/i`）
- 输出地址和私钥到内存（由 `address-book.js` 管理）

### 2. 资金分发 (`fund-wallets.js`)
- 使用资金钱包（`FUND_PRIVATE_KEY`）批量转账
- **串行 + 节流**：避免 nonce 冲突
- 每个地址转 0.002-0.005 BNB（根据需要调整）

### 3. 批量签到 (`bulk-checkin.js`)
- 使用 ethers.js 直接调用合约 `dailyCheckin()`
- **真实上链**：主网 BNB 交易，消耗 gas
- 仅打印 txHash，不做断言（你的网站会记录结果）

### 4. 页面连接 (`runner-playwright.spec.ts`)
- 通过 `page.addInitScript` 注入 EIP-1193 provider
- 模拟钱包连接：返回当前测试地址
- 桥接签名/交易：
  - `personal_sign` / `eth_signTypedData_v4`：Node 侧真签名
  - `eth_sendTransaction`：Node 侧发送（页面不直接发）
- 点击连接按钮 + （可选）签到按钮刷新 UI

---

## ⚙️ 运行策略

### 推荐执行顺序
```
派生地址 → 分发 BNB → 上链签到 → 页面连接 → UI 刷新
```

**为什么这样？**
- 先上链，页面连接时就能读到"已签到"状态
- 避免页面发交易（用 Node 侧控制更稳定）

### 费用估算
| 批次 | 钱包数 | 单次 Gas | 总费用 (BNB) |
|------|--------|----------|--------------|
| 演练 | 5      | 0.00003  | ~0.00015     |
| 正式 | 30     | 0.00003  | ~0.00090     |

> 💡 实际费用取决于 gas price 和合约逻辑，此为参考值

### 节流配置
- **默认**：100ms/次
- **调整**：修改 `runplans.json` 的 `perTxDelayMs`
- **建议**：50-200ms 之间（避免 RPC 限速）

---

## 🔐 安全须知

1. ✅ **私钥管理**
   - `FUND_PRIVATE_KEY` 和 `TEST_MNEMONIC` 仅存本地
   - 已在 `.gitignore` 中排除 `.env` 和 `wallets/mnemonic.txt`

2. ✅ **测试钱包**
   - 使用独立测试助记词，不要用主钱包
   - 每个测试地址只需少量 BNB（0.002-0.005）

3. ✅ **网络隔离**
   - 主网测试前，建议先在测试网（如 opBNB Testnet）验证

---

## 📝 日志说明

项目只打印**最小日志**：
- ✅ 地址派生：序号 + 地址
- ✅ 资金转账：txHash
- ✅ 签到交易：txHash
- ✅ 页面操作："已连接" / "已点击签到"

**不记录**：
- ❌ 签到结果（由你的网站记录）
- ❌ 详细统计（避免冗余）

---

## 🔄 切换到 opBNB

修改 `config/chains.json`：

```json
{
  "opbnb": {
    "name": "opBNB",
    "chainId": 204,
    "rpcHttps": "https://opbnb-mainnet-rpc.bnbchain.org",
    "checkinContract": "0x你的opBNB合约地址"
  }
}
```

然后在 `.env` 中切换：
```env
RPC_BNB_MAINNET=https://opbnb-mainnet-rpc.bnbchain.org
CHECKIN_CONTRACT_BNB=0x你的opBNB合约地址
```

---

## 🛠️ 故障排查

### 问题 1：Nonce 冲突
**原因**：并发发送交易或 RPC 缓存  
**解决**：
- 增大 `PER_TX_DELAY_MS`（建议 ≥150ms）
- 确保 `fund-wallets.js` 和 `bulk-checkin.js` 串行执行

### 问题 2：页面连接失败
**原因**：选择器错误或页面未加载完成  
**解决**：
- 检查 `sites.json` 的 `connectButtonSelector`
- 在 `runner-playwright.spec.ts` 中增加 `page.waitForSelector`

### 问题 3：Gas 不足
**原因**：转账金额过少  
**解决**：
- 增加单次转账金额（在 `fund-wallets.js` 中修改）
- 建议每个地址至少 0.005 BNB

### 问题 4：RPC 限速
**原因**：请求频率过高  
**解决**：
- 增大 `PER_TX_DELAY_MS` 到 200ms 以上
- 更换更稳定的 RPC 端点（推荐使用付费 RPC）

---

## 📚 参考文档

- [Ethers.js v6 文档](https://docs.ethers.org/v6/)
- [Playwright 文档](https://playwright.dev/)
- [EIP-1193 标准](https://eips.ethereum.org/EIPS/eip-1193)
- [BNB Chain 开发者文档](https://docs.bnbchain.org/)

---

## 🤝 贡献

这是一个内部测试工具，暂不接受外部贡献。

---

## 📄 License

MIT License - 仅供内部测试使用

---

## 💡 常见问题

### Q: 为什么要分"5个演练"和"30个正式"？
A: 小批次测试可以快速验证流程，避免大批量出错造成资金浪费。

### Q: 可以只运行上链部分，不打开页面吗？
A: 可以！只运行 `node scripts/bulk-checkin.js` 即可。

### Q: 如何查看每个钱包的签到状态？
A: 项目不记录状态，请在你的网站后台查看。

### Q: 支持其他链吗？
A: 支持！只需在 `config/chains.json` 添加配置，修改 `.env` 即可。

---

## 🎯 下一步

1. ✅ 填写 `.env` 和 `config/*.json`
2. ✅ 运行 `node scripts/orchestrate-5-first.js` 验证流程
3. ✅ 确认无误后执行 `node scripts/orchestrate-30-main.js`

祝测试顺利！🚀