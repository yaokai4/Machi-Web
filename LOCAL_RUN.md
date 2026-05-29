# 本地启动 Machi Web

Web 端需要两个服务同时运行：

- Python 后端：`127.0.0.1:8787`
- Next.js 前端：`localhost:3000`

## 1. 启动后端

打开一个终端：

```bash
cd /Users/yaokai/Desktop/IT/IOS/kaizi
python3 -u web/server.py
```

看到类似下面日志就说明后端起来了：

```text
Machi backend starting on http://127.0.0.1:8787
```

## 2. 启动前端

再打开一个新终端：

```bash
cd /Users/yaokai/Desktop/IT/IOS/kaizi/web/app
npm run build
npm run start
```

访问：

```text
http://localhost:3000
```

## 3. 如果页面变成裸 HTML 或 Application error

通常是旧的 3000 进程还在跑，先停掉再启动：

```bash
lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill

cd /Users/yaokai/Desktop/IT/IOS/kaizi/web/app
npm run build
npm run start
```

## 4. 检查运行状态

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:8787 -sTCP:LISTEN

cd /Users/yaokai/Desktop/IT/IOS/kaizi/web/app
npm run doctor
```

