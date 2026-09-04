# 历史文件锁诊断

这里保留 Phase 6 早期自写文件锁协议、对抗回归和协议探针，仅用于复盘旧 Windows 问题。
桌宠制作台的生产入口以 Electron `app.requestSingleInstanceLock()` 为唯一单实例权威；本目录不会进入默认产品包，也不会随 `npm test` 日常执行。

独立运行：

```bash
npm run diagnostics:legacy-instance-lock
```

该命令先运行旧协议行为测试，再运行真实文件系统协议探针。诊断通过只说明历史实现仍可复现，不代表 Windows 产品验收通过。
