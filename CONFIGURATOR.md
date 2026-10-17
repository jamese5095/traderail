# TradeRail · 智能合约方案配置

在业务操作之前，为订单选择双方直接付款或三方部分贷款，设置金额并预览资金流。确认后进入已有的手机配对与链上结算流程。

## 配置与资金规则

| 参数 | 默认值 | 约束 |
| --- | --- | --- |
| 贸易货款 | 100,000 MockUSDC | 大于零，最高 1,000,000，最多六位小数 |
| 贷款本金 | 50,000 MockUSDC | 三方模式需要，大于零且小于货款 |
| 约定利息 | 1,000 MockUSDC | 非负，本金与利息合计不能超过货款 |
| 付款账期 | 60 天 | 本版固定；从买方确认应付款时计算 |

三方模式先由资金方向供应商支付本金。买方到期支付完整货款时，合约在同笔交易内向资金方支付本金加利息，并向供应商支付剩余货款。双方模式全部货款支付给供应商。

页面配置现有协议的订单参数，不生成 Solidity 或新的合约地址。当前参与方仍由各环境预配置的签名账户确定；更换页面地址不会授予付款权限。

## 实现

- `frontend/components/contract-config.tsx`：结构选择、金额输入和资金流预览。
- `frontend/lib/payables-terms.ts`：统一金额规则、六位精度和整数计算。
- `backend/settlement-v4/service.ts`：保存并校验参数，绑定凭证摘要，以相应金额调用原有合约。
- `frontend/components/payables-demo.tsx`：桌面、手机与资金动画读取同一订单参数。

生成配置只保存本地草稿。首次提交链上交易后，服务端拒绝更改金额与模式。创建和重复提交沿用订单身份和已签交易，避免重复执行。

## 运行

开源用户优先使用 `npm run demo:sandbox`，或者按 README 准备独立测试网环境。已有预配置账户的环境默认网页端口为 3003：

```sh
npm run build
PORT=3003 npm start
```

入口为 `http://localhost:3003/?configure=1`。手机专用 HTTPS 网关可另开终端：

```sh
PORT=3003 PHONE_GATEWAY_PORT=3005 npm run phone
```

会话、账户、签名密钥和测试交易记录不随源码发布。MockUSDC 没有美元价值；服务端测试签名只适用于受控环境。

## 隔离集成测试

`npm run test:terms` 不需要区块链。以下完整流程验证使用专用 Anvil 与临时账户目录，不读取公开测试网角色配置。需要 Node.js 22 和 Anvil；端口 8548 与 3013 必须空闲。不要把该脚本指向已有业务实例。

终端一启动一次性链：

```sh
anvil --host 127.0.0.1 --port 8548 --silent
```

终端二在仓库根目录准备隔离环境并启动测试服务：

```sh
export TRADERAIL_PROFILE_DIR="$(mktemp -d)"
node --input-type=module -e "const {prepareDemo}=await import('./scripts/lib/prepare-demo.mjs');await prepareDemo('sandbox',{rpcOverride:'http://127.0.0.1:8548'});"
npm run build
TRADERAIL_PROFILE=sandbox PORT=3013 npm start
```

终端三运行：

```sh
node tests/config-flow-smoke.mjs
```

该脚本先校验链 ID 为 31337，在隔离本地节点推进确认区块，覆盖自定义金额精确分账、手机参数同步、创建与提交幂等、凭证摘要更新及上链后参数锁定。完成后停止两个测试服务；重新初始化时使用新的临时目录和新的 Anvil 实例。
