# Tier 1 · Litestream — 廉价的 SQLite → S3 持续备份(近似 PITR)

> 在你**现有的 EC2 + SQLite** 上加一层"持续备份到 S3"的兜底,几乎不花钱(只占少量 S3)。
> 用 EC2 的 IAM Role(`S3instanceRole`)鉴权,**不放任何 AWS 密钥**。RPO≈秒级。

## 它解决什么
现在线上是单文件 `kaix.db`。机器/磁盘出事 = 可能丢数据。Litestream 持续把 WAL 增量推到
`s3://machi-s3/backups/kaix.db`,可恢复到任意时间点。这是"继续用 SQLite,但不怕丢数据"。

## 在服务器上安装(一次)
```bash
# 1. 装二进制(pin v0.3.13;"latest"=v0.5.x 资产命名不同、解包会失败)
curl -fsSL https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz \
  | sudo tar -xz -C /usr/local/bin litestream
litestream version   # 应显示 v0.3.13

# 2. 放配置 + systemd 单元(本仓库 web/deploy/ 下)
sudo cp /opt/kaix/web/deploy/litestream.yml      /etc/litestream.yml
sudo cp /opt/kaix/web/deploy/litestream.service  /etc/systemd/system/litestream.service

# 3. 确认 IAM Role 能写该桶前缀(S3instanceRole 需 s3:PutObject/GetObject/ListBucket 到 machi-s3/backups/*)

# 4. 启动并开机自启
sudo systemctl daemon-reload
sudo systemctl enable --now litestream.service
sudo systemctl status litestream.service --no-pager
```

## 验证备份在跑
```bash
litestream snapshots -config /etc/litestream.yml /opt/kaix/web/kaix.db   # 列出 S3 快照
litestream wal       -config /etc/litestream.yml /opt/kaix/web/kaix.db   # WAL 段
aws s3 ls s3://machi-s3/backups/kaix.db/ --recursive | tail
```

## 灾难恢复(把数据库还原回来)
```bash
sudo systemctl stop kaix-backend.service kaix-web.service
sudo systemctl stop litestream.service
sudo mv /opt/kaix/web/kaix.db /opt/kaix/web/kaix.db.broken 2>/dev/null || true
# 还原到最新(或加 -timestamp 还原到指定时间点)
sudo -u kaix litestream restore -config /etc/litestream.yml /opt/kaix/web/kaix.db
sudo systemctl start litestream.service
sudo systemctl start kaix-backend.service kaix-web.service
curl -fsS http://127.0.0.1:8787/readyz
```

## 注意
- **WAL 模式**:应用已用 `journal_mode=WAL`(server.py `db()`),Litestream 正是为此设计。
- **checkpoint**:Litestream 想自己掌管 checkpoint。应用当前用默认 `wal_autocheckpoint`,可正常共存;
  若想最优,可把应用 `wal_autocheckpoint` 调小/交给 Litestream(非必须,先不动)。
- **成本**:S3 存储 + 少量 PUT 请求,通常每月几美分到几毛。
- **演练**:上线后务必**真做一次 restore 演练**,确认能恢复——没演练过的备份不算备份。
- 这是**单机兜底**;真要"机器挂了也不停服",才需要 Tier 4 的 RDS Multi-AZ。
