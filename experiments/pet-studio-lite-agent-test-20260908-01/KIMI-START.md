# Kimi Code 启动说明

## 推荐方式：终端交互模式

### 1. 打开终端

在 macOS 打开“终端”，复制下面整段命令并回车：

```bash
cd /Users/jinke00001/Desktop
git clone https://github.com/dylan-labs/nom-pet.git pet-kimi-m1-20260908-01
cd /Users/jinke00001/Desktop/pet-kimi-m1-20260908-01
git checkout --detach 10c7f136d942cc42ae5b2b4d1e3aa6d5994c455a
git switch -c kimi/pet-studio-lite-m1
kimi -y
```

`-y` 表示 Kimi 在需要执行有影响的操作时仍会向你确认，比完全自动模式更稳妥。

如果目录已经存在，不要覆盖或删除它。把目录名改为 `pet-kimi-m1-20260908-02`，并在运行记录里写明新目录名。

### 2. 把任务书交给 Kimi

Kimi 启动后，先发送这一句：

```text
请完整读取下面这个任务书并严格执行；先检查仓库和固定基线，再直接实现、测试和记录。除真正需要我做产品选择或系统授权外，不要中途停下来问我。任务书：/Users/jinke00001/Desktop/pet/experiments/pet-studio-lite-agent-test-20260908-01/KIMI-PROMPT.md
```

如果 Kimi 无法读取该绝对路径，就打开 `KIMI-PROMPT.md`，全选并粘贴到 Kimi。

### 3. 权限提示怎么处理

- 读取和修改 `/Users/jinke00001/Desktop/pet-kimi-m1-20260908-01`：允许。
- 安装该项目的 npm 依赖：允许。
- 读取本任务书：允许。
- 删除或修改 `/Users/jinke00001/Desktop/pet`：不允许。
- 读取未来的 `pet-codex-m1-*`：不允许。
- 修改系统安全设置、开机启动、全局 npm、系统应用：不允许。
- 登录账号、上传私有素材、发布 GitHub Release：不允许。

### 4. Kimi 说完成后

请不要只看它的总结。让它执行并把结果告诉你：

```text
请做最终交付检查：运行任务书要求的全部自动验证；启动实际预览让我体验；确认 AGENT-REPORT.md 和 RUN-METRICS.json 已填写；列出仍未验证的内容。不要把 macOS 结果表述成 Windows 已通过。
```

然后按 `SCORECARD.md` 体验并打分。保留整个 Kimi 目录，不要清理、合并或把代码复制回原项目。

### 5. 遇到中断

再次运行：

```bash
cd /Users/jinke00001/Desktop/pet-kimi-m1-20260908-01
kimi -y
```

然后发送：

```text
请检查当前 git diff、测试结果和 AGENT-REPORT.md，从上次停止处继续。不要重做已经验证通过的内容，也不要改变任务范围。
```

不要新建第二个实现目录，除非原目录损坏且已在 `RUN-RECORD.md` 记录原因。

