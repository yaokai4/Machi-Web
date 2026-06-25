# Machi 支付沙盒端到端验证手册

覆盖三条充值/购买链路：Web (Stripe)、iOS (App Store StoreKit)、Android Global (Google Play Billing)。

核心不变量（每条链路都要验证）：
- **价格只来自服务端 DB**（plan / guide_products / wallet_topup_products）。客户端从不传价。
- **点数只在服务端验证后入账**，且对 provider 交易号/事件号**幂等**（重试不会重复到账）。
- **拒付/退款**会扣回点数；余额不足则把钱包置 `restricted`（见 `settle_wallet_chargeback`）。

---

## 0. 自动化层（无需任何凭据，CI 必跑）

这部分把「金额计算 + 到账/扣款/退款幂等 + 权益解锁」全部在纯函数/内存库里覆盖，先全绿再做真实沙盒：

```bash
cd web
python3 scripts/test_wallet_points.py            # 账本/到账幂等/Apple&Google 校验/拒付/点数购买
python3 scripts/test_stripe_hardening.py          # webhook 签名/轮换/过期 + 服务端价格唯一真相
python3 scripts/test_my_library.py                # 购买后聚合（我的资料/服务/订单）
python3 scripts/test_client_config_rate_buckets.py
python3 scripts/test_idempotency.py
```

iOS 单元/UI、Android `:app:assembleGlobalDebug` 见各自仓库 README。

> 真实沙盒（下面 1–3 节）需要 Stripe 测试密钥 / App Store Connect 沙盒账号 / Play Console license tester，**无法在本地全自动跑**，按需手动执行。

---

## 1. Web · Stripe 测试模式

### 配置（仅测试 key，永不进 Git）
```bash
export STRIPE_SECRET_KEY=sk_test_xxx
export STRIPE_WEBHOOK_SECRET=whsec_xxx      # 来自 stripe listen，见下
export KAIX_ENV=development
```

### 转发 webhook 到本地
```bash
stripe login
stripe listen --forward-to localhost:8788/api/payments/webhook/stripe
# 把打印出的 whsec_... 填进 STRIPE_WEBHOOK_SECRET 后重启后端
```

### 钱包充值闭环
1. 登录 Web，进 `/wallet`，点一个充值包 → `POST /api/wallet/topups/stripe-checkout`（服务端按 pack_key 定价）。
2. Stripe Checkout 用测试卡 `4242 4242 4242 4242`（任意未来日期 + 任意 CVC）。
3. 回跳 `/wallet?wallet_session=...` → 前端调 `POST /api/wallet/topups/stripe-confirm`。
4. **并发幂等验证**：confirm 与 webhook 几乎同时到达——余额只应增加一次。可在 confirm 之后手动再 `stripe trigger checkout.session.completed`，确认 `wallet_topup_orders.status` 仍为 `paid` 且账本无重复 `topup` 行。
5. 若带 `returnTo=/guide/products/<slug>`，充值成功应跳回该商品页。

### 资料购买（Stripe）
- 进 `/guide/products/<slug>` → 「Stripe 购买」→ `POST /api/payments/stripe/guide-checkout`（服务端价）。回跳 `?guide_session=...` 由 `confirmCheckout` 结算，解锁后出现在 `/guide/my-library`。

### 零小数币种
- 把某 plan/pack 币种设为 `JPY`，确认发往 Stripe 的 `unit_amount` 是「整円」（`_stripe_minor_units` 把 value×100 ÷100）。`test_stripe_hardening.py::test_minor_units` 已覆盖。

### 异常用例
- 测试卡 `4000 0000 0000 0341`（charge 失败）→ 订单不结算、不到账、UI 显示可恢复提示。
- 退款：Stripe Dashboard 退款 → webhook `charge.refunded` → 订单转 `refunded`、点数扣回（不足则钱包 `restricted`）。

---

## 2. iOS · App Store（StoreKit 本地配置 + 沙盒）

### 本地 StoreKit 测试（最快，无需 App Store Connect）
- 配置文件已就绪：`Machi/StoreKitTesting/MachiVerified.storekit`，含全部 9 个 `machi_points_*` consumable + 会员订阅。
- Xcode：Product → Scheme → Edit Scheme → Run → Options → **StoreKit Configuration = MachiVerified.storekit**。
- 跑模拟器进钱包页：
  - 商品应被 `WalletStore.loadWalletAndProducts()` 拉到并显示本地化价（`displayPrices`）。
  - 购买 → StoreKit 返回 JWS → `POST /api/wallet/topups/apple/verify`（带 `signedTransaction`）→ 服务端校验后入账 → `transaction.finish()`。
  - 杀进程重启：`Transaction.unfinished` 应把未 finish 的交易重新校验（服务端幂等，不重复到账）。
- 错误态验证：把 .storekit 里 `machi_points_*` 全删 → 钱包页应显示「充值套餐尚未在 App Store 上架」而**非永久转圈**（`storeStatus == .noProducts`）；关掉后端 → walletMe 404 → 「当前版本暂未开放钱包」+ 重试。

### 真机沙盒（提交前）
- App Store Connect 建沙盒测试账号；真机「设置 → App Store → 沙盒账户」登录。
- 后端配 `APPLE_IAP_SHARED_SECRET`（或 App Store Server API 的 `APPLE_IAP_ISSUER_ID/KEY_ID/PRIVATE_KEY`）+ `APPLE_IAP_ENVIRONMENT=Sandbox`。
- 走真实 IAP，确认 `/api/wallet/topups/apple/verify` 对 sandbox 收据校验通过且幂等。

> 合规：iOS 端**只**通过 IAP 充值，绝不显示 Stripe 充值、绝不外链购买数字资料（代码已保证）。

---

## 3. Android Global · Google Play Billing

### 配置
```bash
export GOOGLE_PLAY_PACKAGE_NAME=com.yaokai.kaizi
export GOOGLE_PLAY_SERVICE_ACCOUNT_JSON='{...service account...}'   # Play Console 授权的服务账号
```
- 未配 → `google_play_configured()` 为 false → `/api/meta/client-config` 的 `androidGlobal` 不含 `google_play`，端侧隐藏充值。

### License testing
1. Play Console → 内部测试轨道上传 `:app:assembleGlobalRelease`（或内部 App 共享）。
2. Play Console → Setup → License testing 加测试 Google 账号（沙盒不真实扣款）。
3. 在 `machi_points_*` 上架为 consumable in-app product（product id 与 pack 的 `google_product_id` 一致）。
4. 测试机用 license tester 账号登录，进钱包页：
   - `GooglePlayBillingClient.queryProducts` 返回商品 + 本地化价；`billingAvailable=true`。
   - 购买（`launchPurchase` 现带 `obfuscatedAccountId = SHA-256(userId)`）→ `POST /api/wallet/topups/google/verify`（purchaseToken + packageName）→ 服务端校验后 `consume`，可重复购买。
   - 杀进程：`queryOwnedPurchases()` 重放未消费购买，服务端幂等。
5. 渠道隔离：`ChinaDebug/Huawei/Oppo/Vivo/Xiaomi` 渠道 `channelOpen=false`，钱包页应显示「当前渠道暂未开放充值」而非坏按钮。

---

## 4. 验收清单（人工过一遍）

- [ ] 三端：商品价与 DB 配置一致；改 DB 价后端到端生效；客户端传价被忽略。
- [ ] 三端：同一笔充值「confirm + webhook / 重启重放」只到账一次。
- [ ] Web：余额不足→`/wallet?returnTo=...`→充值成功→回到原商品→可解锁。
- [ ] 三端：购买后在「我的资料库 / My library」可见，数字资料可下载。
- [ ] Stripe：退款/拒付→点数扣回；扣到负→钱包 `restricted`。
- [ ] iOS/Android：后端不可用 / 商店无商品 → 明确错误/空态 + 重试，不永久 loading。
- [ ] Admin `/admin/wallet`：能看到平台负债、充值收入、退款/拒付、转化率、验证失败回调、受限钱包。
- [ ] iOS 不出现任何 Stripe 充值 / Web 购买数字资料的入口（商店合规边界）。
