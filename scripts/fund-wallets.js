// scripts/fund-wallets.js
// 为一批地址分发固定金额的 BNB/OPBNB：
// - 每个地址固定打 FUND_VALUE_BNB（例如 0.00000034）
// - 每个地址单独 try/catch，某个地址失败不会中断后面的地址
// - 跳过合约地址
// - 如果地址余额已经 >= 阈值，则跳过（支持重复跑，只补没打够钱的）
// - 简单处理 RPC `limit exceeded`，退避后重试
// - 将本次 fund summary 写入 logs/fund-summary.log

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getProvider, walletFromPk } from '../utils/signer-factory.js';
import { sleep } from '../utils/time.js';
import { ethers } from 'ethers';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// NEW: 日志目录 & fund summary 日志文件
const LOG_DIR = path.resolve(ROOT, 'logs');
const FUND_LOG_FILE = path.resolve(LOG_DIR, 'fund-summary.log');

function readJson(relPath) {
  const p = path.resolve(ROOT, relPath);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// 简单识别是否是 RPC 限流错误
function isLimitExceeded(err) {
  const code = err?.code ?? err?.error?.code;
  const msg = (err?.message || err?.error?.message || '').toLowerCase();
  return code === -32005 || msg.includes('limit exceeded');
}

// 根据 CHAIN 选择 RPC
function getRpcUrlFromEnv(chain) {
  const c = (chain || '').toLowerCase();
  if (!c || c === 'bsc' || c === 'bnb') {
    return process.env.RPC_BNB_MAINNET;
  }
  if (c === 'opbnb') {
    return process.env.RPC_OPBNB_MAINNET || process.env.RPC_BNB_MAINNET;
  }
  // 默认回退到 BNB
  return process.env.RPC_BNB_MAINNET;
}

async function main() {
  // 确保 logs 目录存在
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  const chain = process.env.CHAIN || 'bnb';
  const addrFile = process.env.ADDR_FILE || 'addresses.batch.json';
  const delay = Number(process.env.PER_TX_DELAY_MS || '200');

  const rpcUrl = getRpcUrlFromEnv(chain);
  if (!rpcUrl) {
    throw new Error(`未在 .env 中找到 ${chain} 的 RPC 配置（例如 RPC_BNB_MAINNET / RPC_OPBNB_MAINNET）`);
  }

  const fundPk = process.env.FUND_PRIVATE_KEY;
  if (!fundPk) {
    throw new Error('FUND_PRIVATE_KEY 未配置，无法进行分发');
  }

  // ✅ 必须显式指定每个地址要打多少
  const perValueStr = process.env.FUND_VALUE_BNB;
  if (!perValueStr) {
    throw new Error('FUND_VALUE_BNB 未配置，请在 .env 中设置每个地址固定分发的 BNB 数量，例如 0.00000034');
  }
  const perValueWei = ethers.parseEther(perValueStr);
  if (perValueWei <= 0n) {
    throw new Error(`FUND_VALUE_BNB=${perValueStr} 非法，请设置为大于 0 的数值字符串`);
  }

  // 读取地址列表（通常是 addresses.last.json）
  const list = readJson(addrFile);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`地址文件 ${addrFile} 为空或格式不正确`);
  }

  console.log(`[fund] 使用文件=${addrFile} 共 ${list.length} 个地址，CHAIN=${chain}`);

  const provider = getProvider(rpcUrl);
  const funder = walletFromPk(fundPk, provider);
  const funderAddr = await funder.getAddress();

  const funderBal = await provider.getBalance(funderAddr);
  console.log(`[fund] 资金钱包 ${funderAddr} 当前余额=${ethers.formatEther(funderBal)} BNB`);

  // 预留一点 gas 余额，避免打光：可通过 FUND_RESERVE_BNB 调整，默认 0.01
  const reserve = ethers.parseEther(process.env.FUND_RESERVE_BNB || '0.01');
  if (funderBal <= reserve) {
    throw new Error(
      `资金钱包余额不足（<= 预留 ${ethers.formatEther(
        reserve
      )}），请先充值再运行`
    );
  }

  const maxAffordable = (funderBal - reserve) / perValueWei;
  if (BigInt(list.length) > maxAffordable) {
    console.warn(
      `[fund-warn] 当前余额最多只能支持约 ${maxAffordable.toString()} 个地址每个打 ${perValueStr} BNB，` +
      `但本批有 ${list.length} 个地址，后面的地址可能会因为余额不足而失败`
    );
  }

  // 余额阈值：地址余额 >= perValue * FUND_MIN_RATIO 就认为已经打过了，可跳过
  const minRatio = Number(process.env.FUND_MIN_RATIO || '0.8'); // 默认 80%
  const minBalanceWei =
    (perValueWei * BigInt(Math.floor(minRatio * 1000))) / 1000n;

  let okCount = 0;
  let skipFunded = 0;
  let skipContract = 0;
  let errCount = 0;

  const MAX_RETRY = Number(process.env.FUND_MAX_RETRY || '3');

  for (const it of list) {
    const idx = it.index ?? '?';
    const addr = it.address;

    try {
      // 1) 跳过合约地址
      const code = await provider.getCode(addr);
      if (code && code !== '0x') {
        skipContract++;
        console.log(
          `[skip-contract] #${idx} ${addr} 是合约地址，跳过分发`
        );
        continue;
      }

      // 2) 如果余额已经 >= 阈值，认为已经有钱了，支持重复跑
      const bal = await provider.getBalance(addr);
      if (bal >= minBalanceWei) {
        skipFunded++;
        console.log(
          `[skip-funded] #${idx} ${addr} 当前余额=${ethers.formatEther(
            bal
          )} BNB，已达到阈值（>= ${ethers.formatEther(
            minBalanceWei
          )}），跳过分发`
        );
        continue;
      }

      // 3) 带重试的打钱
      let sentOk = false;
      let attempt = 0;

      while (!sentOk && attempt < MAX_RETRY) {
        attempt += 1;
        try {
          const tx = await funder.sendTransaction({
            to: addr,
            value: perValueWei
          });
          const rc = await tx.wait();
          console.log(
            `[fund] #${idx} ${addr} +${perValueStr} BNB tx=${tx.hash} status=${rc.status} (attempt=${attempt})`
          );
          okCount++;
          sentOk = true;
        } catch (e) {
          if (isLimitExceeded(e) && attempt < MAX_RETRY) {
            const backoffMs = 3000 * attempt;
            console.warn(
              `[fund-retry] #${idx} ${addr} 因 limit exceeded，准备第 ${attempt} 次重试，先等待 ${backoffMs}ms`
            );
            await sleep(backoffMs);
          } else {
            throw e;
          }
        }
      }

      if (!sentOk) {
        errCount++;
        console.error(
          `[fund-err] #${idx} ${addr} 在 ${MAX_RETRY} 次重试后仍未成功`
        );
      }
    } catch (e) {
      errCount++;
      console.error(
        `[fund-err] #${idx} ${addr} ERR:`,
        e?.message || e
      );
    }

    if (delay > 0) {
      await sleep(delay);
    }
  }

  console.log(
    `[fund-summary] total=${list.length} ok=${okCount} ` +
      `skipFunded=${skipFunded} skipContract=${skipContract} err=${errCount}`
  );

  // NEW: 把本次 fund summary 写入日志（CSV 风格）
  const ts = new Date().toISOString();
  const fundLogLine = [
    ts,
    chain,
    addrFile,
    list.length,
    okCount,
    skipFunded,
    skipContract,
    errCount
  ].join(',') + '\n';

  const needHeader = !fs.existsSync(FUND_LOG_FILE);
  if (needHeader) {
    fs.appendFileSync(
      FUND_LOG_FILE,
      'timestamp,chain,addr_file,total,ok,skipFunded,skipContract,err\n',
      'utf-8'
    );
  }
  fs.appendFileSync(FUND_LOG_FILE, fundLogLine, 'utf-8');
}

main().catch((e) => {
  console.error('[fund-fatal]', e);
  process.exit(1);
});
