# i3-checkin-tester

一个独立、可配置、双链可切换的批量"真上链签到"工具：地址派生可控（`--start/--append`）、分发额度和余额阈值按链区分、脚本默认只跑链上流程且带节流与安全保护，必要时再补上页面 UI 自动化——稳定、大批量地模拟真实用户"连接+签到"行为，且不改你线上站点任何代码。

---

## 📋 项目特点

- ✅ **完全独立**：不修改你的网站代码，单独运行
- ✅ **真实上链**：使用 ethers.js 直接调用合约 `dailyCheckin()`
- ✅ **双链支持**：BNB 主网 / opBNB 一键切换（`CHAIN=bnb|opbnb`）
- ✅ **灵活派生**：支持 `--start` / `--append` 参数，可控制地址索引范围
- ✅ **按链配置**：分发额度、余额阈值自动适配不同链（BNB vs opBNB）
- ✅ **安全保护**：自动跳过合约地址、余额不足检查、节流控制
- ✅ **专注链上**：默认流程仅 `derive → fund → checkin`，UI 自动化可选

---

## 🆕 最新更新（v2.0）

### 1. 运行目标从"站点+链上双轨"改为"专注链上"
- Playwright UI 连接/点击功能转为可选模块
- 默认流程：派生地址 → 分发 BNB → 真上链签到
- 需要页面验证时再按需启用 UI 自动化

### 2. 支持多链切换（BNB / opBNB）
- 新增 `CHAIN=bnb|opbnb` 运行方式
- `chains.json` 使用环境变量占位符（`${RPC_*}` / `${CHECKIN_CONTRACT_*}`）
- `.env` 中配置双链 RPC 和合约地址，一套脚本切换使用

### 3. 分发额度按链区分 & 可配置
- **BNB 默认**：每地址 `0.00004 BNB`（可用 `FUND_PER_BNB` 覆盖）
- **opBNB 默认**：每地址 `0.000001 BNB`（可用 `FUND_PER_OPBNB` 覆盖）
- 自动跳过合约地址，避免误转

### 4. 签到脚本增强（更稳定）
- 支持 `CHAIN` 选择，自动加载对应链配置
- 按链设置余额阈值：
  - BNB 默认 `0.00003`（可用 `MIN_CHECKIN_BNB` 覆盖）
  - opBNB 默认 `0.00000001`（可用 `MIN_CHECKIN_OPBNB` 覆盖）
- 对 "Already checked in today" 等可预期错误友好处理
- 同样增加合约地址保护

### 5. 地址派生更灵活
- 支持 `--start` 参数：指定起始索引（避免总是从 index=0 开始）
- 支持 `--append` 参数：追加到现有地址清单
- 标准路径：`m/44'/60'/0'/0/i`
- 输出到 `addresses.batch.json` 作为后续统一数据源

### 6. 编排与批次数量
- 提供 `orchestrate-2-first.js`（2钱包演练）
- 提供 `orchestrate-10-main.js`（10钱包正式）
- 默认只串行执行链上动作并节流
- `runplans.json` 保留 UI 配置但不再默认使用

### 7. 脚本命令与依赖精简
- **快捷命令**：
  - `npm run fund:bnb` / `npm run fund:op`
  - `npm run checkin:bnb` / `npm run checkin:op`
- Playwright 改为可选依赖（需要时手动安装）
- 使用 `ethers v6` 与原生 ESM
- 要求 Node.js >= 18

### 8. 环境变量与安全
- `.env.example` 明确标注 BNB/opBNB 的所有配置项
- `.gitignore` 保证 `.env` 与 `wallets/mnemonic.txt` 不入库

---

## 🏗️ 项目结构

```
i3-checkin-tester/
├─ README.md                      # 本文档
├─ package.json                   # 含快捷命令（fund:bnb, checkin:op 等）
├─ .gitignore                     
├─ .env.example                   # 环境变量模板（含双链配置）
│
├─ config/
│  ├─ chains.json                 # 链配置（使用 ${RPC_*} 占位符）
│  ├─ sites.json                  # 站点 URL 和 UI 选择器（可选）
│  └─ runplans.json               # 运行计划（保留但不默认使用）
│
├─ abis/
│  └─ I3CheckInCore.json          # 合约 ABI（仅需用到的方法）
│
├─ wallets/
│  ├─ mnemonic.txt                # 测试助记词（本地不入库）
│  └─ addresses.batch.json        # 派生地址清单（由 derive-addresses.js 生成）
│
├─ scripts/
│  ├─ derive-addresses.js         # 派生钱包地址（支持 --start/--append）
│  ├─ fund-wallets.js             # 批量转账 BNB（支持 CHAIN 切换）
│  ├─ bulk-checkin.js             # 批量上链签到（支持 CHAIN 切换）
│  ├─ inject/                     # Playwright 注入脚本（可选）
│  │  ├─ mock-provider.js         
│  │  └─ bridge-protocol.md       
│  ├─ runner-playwright.spec.ts   # Playwright 测试脚本（可选）
│  ├─ orchestrate-2-first.js      # 2 钱包演练编排
│  └─ orchestrate-10-main.js      # 10 钱包正式编排
│
├─ playwright.config.ts           # Playwright 配置（可选）
└─ utils/
   ├─ address-book.js             # 地址管理（读取 addresses.batch.json）
   ├─ signer-factory.js           # Wallet 实例 + Nonce 管理
   ├─ tx-helpers.js               # 交易辅助函数
   ├─ ui-actions.js               # Playwright UI 操作封装（可选）
   └─ time.js                     # 等待/节流工具
```

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

**核心依赖：**
- `ethers` (v6.x) - 链交互
- `dotenv` - 环境变量管理

**可选依赖（需要 UI 自动化时）：**
```bash
npm install -D @playwright/test
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
# ============ 链配置 ============
# BNB 主网
RPC_BNB_MAINNET=https://bsc-dataseed1.binance.org
CHECKIN_CONTRACT_BNB=0x你的BNB合约地址

# opBNB 主网
RPC_OPBNB_MAINNET=https://opbnb-mainnet-rpc.bnbchain.org
CHECKIN_CONTRACT_OPBNB=0x你的opBNB合约地址

# ============ 钱包配置 ============
# 资金钱包私钥（用于分发 BNB，需在所选链上有余额）
FUND_PRIVATE_KEY=0x你的资金钱包私钥

# 测试助记词（用于派生地址）
TEST_MNEMONIC="word1 word2 ... word12"

# ============ 分发配置 ============
# 每个地址分发额度（可选，有默认值）
FUND_PER_BNB=0.00004        # BNB 主网默认
FUND_PER_OPBNB=0.000001     # opBNB 默认

# ============ 签到配置 ============
# 签到前余额阈值（可选，有默认值）
MIN_CHECKIN_BNB=0.00003     # BNB 主网默认
MIN_CHECKIN_OPBNB=0.00000001  # opBNB 默认

# ============ 运行参数 ============
PER_TX_DELAY_MS=100         # 交易间隔（毫秒）

# ============ 站点配置（可选，仅 UI 自动化时需要） ============
SITE_URL=https://your-domain.example/checkin
CONNECT_BTN=#connectWalletBtn
CHECKIN_BTN=#checkinBtn
POST_CONNECT_ACTION=reload
```

> ⚠️ **安全提示**：`.env` 文件已在 `.gitignore` 中，切勿提交到代码仓库！

---

### 3. 配置链信息

`config/chains.json` 已使用环境变量占位符：

```json
{
  "bnb": {
    "name": "BNB Smart Chain",
    "chainId": 56,
    "rpcHttps": "${RPC_BNB_MAINNET}",
    "checkinContract": "${CHECKIN_CONTRACT_BNB}"
  },
  "opbnb": {
    "name": "opBNB",
    "chainId": 204,
    "rpcHttps": "${RPC_OPBNB_MAINNET}",
    "checkinContract": "${CHECKIN_CONTRACT_OPBNB}"
  }
}
```

> 💡 无需手动修改此文件，所有配置在 `.env` 中完成

---

## 📖 使用方法

### 核心流程（推荐）

#### 步骤 1：派生地址

```bash
# 生成 2 个地址（index 0-1）用于演练
node scripts/derive-addresses.js --n=2 --start=0

# 生成 10 个地址（index 2-11）用于正式运行
node scripts/derive-addresses.js --n=10 --start=2

# 在现有清单后追加 3 个地址（index 12-14）
node scripts/derive-addresses.js --n=3 --start=12 --append
```

**输出：** `wallets/addresses.batch.json`

---

#### 步骤 2：分发 BNB（选择链）

```bash
# BNB 主网
CHAIN=bnb npm run fund
# 或直接运行
CHAIN=bnb node scripts/fund-wallets.js

# opBNB 主网
CHAIN=opbnb npm run fund
```

**功能：**
- 从 `FUND_PRIVATE_KEY` 地址向所有派生地址转账
- BNB 默认每地址 `0.00004`，opBNB 默认 `0.000001`
- 自动跳过合约地址
- 串行执行 + 节流（默认 100ms）

---

#### 步骤 3：批量签到（选择链）

```bash
# BNB 主网
CHAIN=bnb npm run checkin
# 或直接运行
CHAIN=bnb node scripts/bulk-checkin.js

# opBNB 主网
CHAIN=opbnb npm run checkin
```

**功能：**
- 真实上链调用 `dailyCheckin()`
- 签到前检查余额是否充足
- BNB 默认阈值 `0.00003`，opBNB 默认 `0.00000001`
- 自动跳过合约地址和余额不足地址
- 友好处理 "Already checked in" 错误

---

### 一键编排（可选）

#### 2 钱包演练
```bash
node scripts/orchestrate-2-first.js
```

**执行流程：**
1. 派生 2 个地址（index 0-1）
2. 分发 BNB（默认 BNB 链）
3. 批量签到

**预估费用：** ~0.00006 BNB (2 × 0.00003)

---

#### 10 钱包正式运行
```bash
node scripts/orchestrate-10-main.js
```

**预估费用：** ~0.0003 BNB (10 × 0.00003)

---

### UI 自动化（可选）

如需验证页面连接和 UI 操作：

```bash
# 1. 安装 Playwright（如未安装）
npm install -D @playwright/test
npx playwright install chromium

# 2. 运行 UI 测试
npx playwright test scripts/runner-playwright.spec.ts
```

**功能：**
- 注入 EIP-1193 provider
- 模拟钱包连接
- 点击页面签到按钮（仅 UI 刷新）
- 真实交易已在步骤 3 完成

---

## ⚙️ 运行策略

### 推荐执行顺序
```
派生地址 → 分发 BNB → 上链签到 → (可选) UI 验证
```

**为什么这样？**
- 先上链，页面连接时就能读到"已签到"状态
- 避免页面发交易（用 Node 侧控制更稳定）
- UI 验证可按需启用

### 费用估算

| 链 | 批次 | 钱包数 | 单次 Gas | 总费用 (BNB) |
|-----|------|--------|----------|--------------|
| BNB | 演练 | 2      | 0.00003  | ~0.00006     |
| BNB | 正式 | 10     | 0.00003  | ~0.0003      |
| opBNB | 演练 | 2    | 0.000001 | ~0.000002    |
| opBNB | 正式 | 10   | 0.000001 | ~0.00001     |

> 💡 实际费用取决于 gas price 和合约逻辑，此为参考值

### 节流配置
- **默认**：100ms/次（`PER_TX_DELAY_MS=100`）
- **调整**：修改 `.env` 中的 `PER_TX_DELAY_MS`
- **建议**：50-200ms 之间（避免 RPC 限速）

---

## 🔧 核心功能说明

### 1. 钱包派生 (`derive-addresses.js`)

**功能：**
- 从助记词派生 HD 钱包地址（路径 `m/44'/60'/0'/0/i`）
- 支持指定起始索引（`--start`）和追加模式（`--append`）
- 输出到 `wallets/addresses.batch.json`

**参数：**
- `--n=<数量>`：生成地址数量
- `--start=<索引>`：起始索引（默认 0）
- `--append`：追加到现有清单（而非覆盖）

**示例：**
```bash
# 生成 index 5-9 的 5 个地址
node scripts/derive-addresses.js --n=5 --start=5

# 在现有清单后追加 3 个地址
node scripts/derive-addresses.js --n=3 --append
```

---

### 2. 资金分发 (`fund-wallets.js`)

**功能：**
- 使用资金钱包（`FUND_PRIVATE_KEY`）批量转账
- 自动按链选择分发额度（BNB vs opBNB）
- **串行 + 节流**：避免 nonce 冲突
- 自动跳过合约地址

**环境变量：**
- `CHAIN=bnb|opbnb`（必需）
- `FUND_PER_BNB`：BNB 主网分发额度（默认 0.00004）
- `FUND_PER_OPBNB`：opBNB 分发额度（默认 0.000001）

**示例：**
```bash
# 使用默认额度
CHAIN=bnb npm run fund

# 自定义额度
FUND_PER_BNB=0.0001 CHAIN=bnb node scripts/fund-wallets.js
```

---

### 3. 批量签到 (`bulk-checkin.js`)

**功能：**
- 使用 ethers.js 直接调用合约 `dailyCheckin()`
- **真实上链**：主网交易，消耗 gas
- 签到前检查余额是否充足
- 自动跳过合约地址和余额不足地址
- 友好处理可预期错误（如 "Already checked in today"）

**环境变量：**
- `CHAIN=bnb|opbnb`（必需）
- `MIN_CHECKIN_BNB`：BNB 主网余额阈值（默认 0.00003）
- `MIN_CHECKIN_OPBNB`：opBNB 余额阈值（默认 0.00000001）

**示例：**
```bash
# 使用默认阈值
CHAIN=bnb npm run checkin

# 自定义阈值
MIN_CHECKIN_BNB=0.00005 CHAIN=bnb node scripts/bulk-checkin.js
```

**日志输出：**
- ✅ 成功：`txHash` + 区块浏览器链接
- ⚠️ 跳过：余额不足 / 合约地址 / 已签到
- ❌ 失败：详细错误信息

---

### 4. 页面连接 (`runner-playwright.spec.ts`，可选)

**功能：**
- 通过 `page.addInitScript` 注入 EIP-1193 provider
- 模拟钱包连接：返回当前测试地址
- 桥接签名/交易（如需要）
- 点击连接按钮 + 签到按钮（仅 UI 刷新）

**使用场景：**
- 验证页面能正确识别已签到状态
- 测试 UI 交互流程
- 检查页面错误处理

---

## 🔐 安全须知

1. ✅ **私钥管理**
   - `FUND_PRIVATE_KEY` 和 `TEST_MNEMONIC` 仅存本地
   - 已在 `.gitignore` 中排除 `.env` 和 `wallets/mnemonic.txt`
   - 切勿提交到代码仓库或分享给他人

2. ✅ **测试钱包**
   - 使用独立测试助记词，不要用主钱包
   - 每个测试地址只需少量 BNB
   - 定期清理不再使用的测试地址

3. ✅ **合约地址保护**
   - 自动检测并跳过合约地址
   - 避免误转到合约导致资金锁定

4. ✅ **网络隔离**
   - 主网测试前，建议先在测试网验证
   - 小批次演练后再进行大批量操作

---

## 📝 日志说明

项目只打印**最小日志**：

**派生地址：**
```
✅ Index 0: 0x1234...5678
✅ Index 1: 0xabcd...ef01
📄 已保存到 wallets/addresses.batch.json
```

**资金转账：**
```
💰 [BNB] 分发 0.00004 BNB 到 0x1234...5678
✅ TxHash: 0xabc...def
```

**签到交易：**
```
📝 [1/10] 0x1234...5678
✅ 签到成功 | TxHash: 0xabc...def | 浏览器: https://...
⚠️ [2/10] 0xabcd...ef01 - 已今日签到，跳过
```

**不记录**：
- ❌ 签到结果详情（由你的网站记录）
- ❌ 统计汇总（避免冗余）

---

## 🛠️ 故障排查

### 问题 1：Nonce 冲突
**症状：** `replacement fee too low` / `nonce too low`  
**原因：** 并发发送交易或 RPC 缓存  
**解决：**
- 增大 `PER_TX_DELAY_MS`（建议 ≥150ms）
- 确保 `fund-wallets.js` 和 `bulk-checkin.js` 串行执行
- 等待前一笔交易确认后再发下一笔

### 问题 2：余额不足
**症状：** `insufficient funds for gas`  
**原因：** 分发金额过少或 gas price 突然上涨  
**解决：**
- BNB 主网：增加 `FUND_PER_BNB`（建议 ≥0.0001）
- opBNB：检查 `FUND_PER_OPBNB` 是否足够
- 确保资金钱包有充足余额

### 问题 3：RPC 限速
**症状：** `429 Too Many Requests` / 请求超时  
**原因：** 请求频率过高  
**解决：**
- 增大 `PER_TX_DELAY_MS` 到 200ms 以上
- 更换更稳定的 RPC 端点（推荐使用付费 RPC）
- 减少并发数量

### 问题 4：合约调用失败
**症状：** `execution reverted` / `Already checked in today`  
**原因：** 合约逻辑限制  
**解决：**
- 检查是否已签到（工具会自动跳过）
- 确认合约地址正确
- 验证链选择正确（BNB vs opBNB）

### 问题 5：地址总是重复
**症状：** 每次派生都是相同的地址  
**原因：** 未使用 `--start` 参数，总是从 index=0 开始  
**解决：**
```bash
# 错误：总是生成 index 0-1
node scripts/derive-addresses.js --n=2

# 正确：生成 index 0-1, 2-3, 4-5...
node scripts/derive-addresses.js --n=2 --start=0
node scripts/derive-addresses.js --n=2 --start=2
node scripts/derive-addresses.js --n=2 --start=4
```

### 问题 6：页面连接失败（UI 自动化）
**症状：** 页面无法识别钱包  
**原因：** Provider 注入失败或选择器错误  
**解决：**
- 检查 `sites.json` 的 `connectButtonSelector`
- 在 `runner-playwright.spec.ts` 中增加 `page.waitForSelector`
- 确认 Playwright 已正确安装

---

## 📚 参考文档

- [Ethers.js v6 文档](https://docs.ethers.org/v6/)
- [Playwright 文档](https://playwright.dev/)
- [EIP-1193 标准](https://eips.ethereum.org/EIPS/eip-1193)
- [BNB Chain 开发者文档](https://docs.bnbchain.org/)
- [opBNB 文档](https://opbnb.bnbchain.org/)

---

## 🔄 链切换速查表

| 操作 | BNB 主网 | opBNB 主网 |
|------|---------|-----------|
| 派生地址 | `node scripts/derive-addresses.js --n=10` | 同左（链无关） |
| 分发 BNB | `CHAIN=bnb npm run fund` | `CHAIN=opbnb npm run fund` |
| 批量签到 | `CHAIN=bnb npm run checkin` | `CHAIN=opbnb npm run checkin` |
| 默认分发额度 | 0.00004 BNB | 0.000001 BNB |
| 默认签到阈值 | 0.00003 BNB | 0.00000001 BNB |
| 区块浏览器 | [BscScan](https://bscscan.com) | [opBNBScan](https://opbnbscan.com) |

---

## 💡 常见问题

### Q: 为什么要分"2个演练"和"10个正式"？
A: 小批次测试可以快速验证流程，避免大批量出错造成资金浪费。先用 2 个地址验证整个流程，确认无误后再扩展到 10 个或更多。

### Q: 可以只运行上链部分，不打开页面吗？
A: 可以！默认流程就是这样。只运行：
```bash
node scripts/derive-addresses.js --n=10
CHAIN=bnb npm run fund
CHAIN=bnb npm run checkin
```

### Q: 如何查看每个钱包的签到状态？
A: 项目不记录状态，请在你的网站后台查看。工具只负责发送交易，状态由合约和网站管理。

### Q: 支持其他链吗（如 Ethereum、Polygon）？
A: 支持！只需在 `config/chains.json` 添加配置，并在 `.env` 中设置对应的 RPC 和合约地址即可。

### Q: 如何避免地址重复？
A: 使用 `--start` 参数指定起始索引：
```bash
# 第一批：index 0-9
node scripts/derive-addresses.js --n=10 --start=0

# 第二批：index 10-19
node scripts/derive-addresses.js --n=10 --start=10
```

### Q: opBNB 和 BNB 可以混用吗？
A: 不可以。两条链是独立的，需要：
1. 资金钱包在对应链上有余额
2. 使用正确的 `CHAIN` 参数
3. 配置正确的合约地址

### Q: 如何批量检查签到状态？
A: 可以编写额外脚本读取合约状态，或使用你网站的 API。工具侧重发送交易，不做状态查询。

---

## 🎯 最佳实践

1. **首次使用流程**
   ```bash
   # 1. 生成 2 个测试地址
   node scripts/derive-addresses.js --n=2 --start=0
   
   # 2. BNB 主网小额测试
   CHAIN=bnb npm run fund
   CHAIN=bnb npm run checkin
   
   # 3. 确认成功后扩展到 10 个
   node scripts/derive-addresses.js --n=10 --start=2
   CHAIN=bnb npm run fund
   CHAIN=bnb npm run checkin
   ```

2. **双链交替测试**
   ```bash
   # BNB 主网
   CHAIN=bnb npm run fund
   CHAIN=bnb npm run checkin
   
   # opBNB 主网（使用同一批地址）
   CHAIN=opbnb npm run fund
   CHAIN=opbnb npm run checkin
   ```

3. **大批量运行建议**
   - 分批执行：每批 10-20 个地址
   - 增加节流：`PER_TX_DELAY_MS=200`
   - 使用付费 RPC：更稳定、限速更宽松
   - 监控资金钱包余额：及时充值

4. **安全检查清单**
   - [ ] `.env` 已添加到 `.gitignore`
   - [ ] 使用独立测试助记词（非主钱包）
   - [ ] 资金钱包仅存少量 BNB（按需充值）
   - [ ] 定期清理不再使用的测试地址
   - [ ] 测试网验证后再上主网

---

## 📋 变更记录

### v2.0 (当前版本) - 2024
**重大更新：专注链上 + 双链支持**

- ✨ **核心变更**：运行目标从"站点+链上双轨"改为"专注链上"
  - UI 自动化（Playwright）改为可选模块
  - 默认流程：`derive → fund → checkin`
  - 需要页面验证时再按需启用

- 🌐 **双链支持**：BNB / opBNB 一键切换
  - 新增 `CHAIN=bnb|opbnb` 运行方式
  - `chains.json` 使用环境变量占位符
  - 一套脚本，多链复用

- 💰 **按链配置分发额度**
  - BNB 默认：`0.00004 BNB`（可用 `FUND_PER_BNB` 覆盖）
  - opBNB 默认：`0.000001 BNB`（可用 `FUND_PER_OPBNB` 覆盖）
  - 自动跳过合约地址保护

- 🔧 **签到脚本增强**
  - 支持 `CHAIN` 选择
  - 按链设置余额阈值（BNB: `0.00003`, opBNB: `1e-8`）
  - 友好处理 "Already checked in today" 错误
  - 增加合约地址保护

- 🎯 **地址派生更灵活**
  - 新增 `--start` 参数：指定起始索引
  - 新增 `--append` 参数：追加到现有清单
  - 避免"总是生成相同地址"的困惑

- 📦 **脚本命令优化**
  - 新增快捷命令：`fund:bnb`, `fund:op`, `checkin:bnb`, `checkin:op`
  - Playwright 改为可选依赖
  - 使用 `ethers v6` 与原生 ESM

- 🔒 **安全性提升**
  - `.env.example` 明确标注所有配置项
  - `.gitignore` 保护敏感文件
  - 自动检测并跳过合约地址

### v1.0 - 初始版本
- 基础功能：派生地址、分发 BNB、批量签到
- Playwright UI 自动化
- 单链支持（仅 BNB 主网）

---

## 🤝 贡献

这是一个内部测试工具，暂不接受外部贡献。

---

## 📄 License

MIT License - 仅供内部测试使用

---

## 📞 支持

如遇问题，请：
1. 查看 [故障排查](#-故障排查) 章节
2. 检查 [常见问题](#-常见问题)
3. 联系项目维护者

---

## 🎯 快速命令速查

```bash
# ============ 地址派生 ============
node scripts/derive-addresses.js --n=2 --start=0      # 生成 2 个地址（index 0-1）
node scripts/derive-addresses.js --n=10 --start=2     # 生成 10 个地址（index 2-11）
node scripts/derive-addresses.js --n=3 --append       # 追加 3 个地址

# ============ BNB 主网 ============
CHAIN=bnb npm run fund                                # 分发 BNB
CHAIN=bnb npm run checkin                             # 批量签到

# ============ opBNB 主网 ============
CHAIN=opbnb npm run fund                              # 分发 BNB
CHAIN=opbnb npm run checkin                           # 批量签到

# ============ 一键编排 ============
node scripts/orchestrate-2-first.js                   # 2 钱包演练
node scripts/orchestrate-10-main.js                   # 10 钱包正式

# ============ UI 自动化（可选） ============
npm install -D @playwright/test                       # 安装 Playwright
npx playwright install chromium                       # 安装浏览器
npx playwright test scripts/runner-playwright.spec.ts # 运行 UI 测试
```

---

## 🌟 下一步

1. ✅ 填写 `.env` 配置（参考 `.env.example`）
2. ✅ 生成测试地址：`node scripts/derive-addresses.js --n=2 --start=0`
3. ✅ 小批量验证：`CHAIN=bnb npm run fund && CHAIN=bnb npm run checkin`
4. ✅ 确认成功后扩展批次
5. ✅ （可选）启用 UI 自动化验证

**祝测试顺利！🚀**