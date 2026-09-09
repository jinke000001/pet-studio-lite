# Kimi 全量自主任务启动说明

此前的 `/Users/jinke00001/Desktop/pet-kimi-m1-20260908-01` 保留为引导式预演，不继续返工，也不要删除。

## 1. 新开终端并建立干净工作区

```bash
cd /Users/jinke00001/Desktop
git clone https://github.com/dylan-labs/nom-pet.git pet-kimi-full-20260908-01
cd /Users/jinke00001/Desktop/pet-kimi-full-20260908-01
git checkout --detach 10c7f136d942cc42ae5b2b4d1e3aa6d5994c455a
git switch -c kimi/pet-studio-lite-full
kimi -y
```

如果 `pet-kimi-full-20260908-01` 已存在，不要覆盖或删除；停止并先记录原因。

## 2. 只发送这一条完整委托

```text
请完整读取并执行下面的任务书，把它作为一次完整产品交付独立做到底。你可以自行拆解阶段、修改代码、运行测试、处理测试失败和反复验证，但除系统授权、账号凭据或真正无法推断的产品方向外，不要中途让我做技术判断，也不要等待外部代理评审。达到任务书的最终完成定义后再一次性汇报；如果最终确有环境阻塞，也要交付可复现成果并如实标记失败项。

任务书：/Users/jinke00001/Desktop/pet/experiments/pet-studio-lite-full-agent-test-20260908-01/FULL-TASK.md
```

这之后不要再发送“请修复某个具体问题”之类的提示。Kimi 可以自己持续工作和修自己的测试；用户只处理必要的 macOS 权限弹窗，并在需要时亲自体验它已经做好的界面。

## 3. 允许与禁止

允许：

- 读写 `/Users/jinke00001/Desktop/pet-kimi-full-20260908-01`。
- 读取这份实验目录中的任务书。
- 安装该工作区的项目依赖。
- 查公开资料和启动本工作区的应用。
- 在本工作区内生成 Windows 候选和测试证据。

禁止：

- 修改 `/Users/jinke00001/Desktop/pet`、旧 Kimi 目录、旧应用数据或外置盘。
- 读取未来 Codex 实现或向 Codex索取修复答案。
- 修改系统安全设置、安装/卸载系统应用、设置开机启动、发布远端或使用账号/密钥。

## 4. 中断恢复

Kimi 客户端意外退出时，只恢复同一会话/同一工作区并发送：

```text
请从当前工作区和你自己的任务记录继续执行原始 FULL-TASK.md，独立完成全部剩余工作；不要改变范围，也不要请求其他代理给出修复答案。
```

这只算会话恢复，不算技术指导。记录中断次数与原因。

## 5. Kimi 宣告完成后

不要先让它按 Codex 指出的清单返工。保留现场并告诉 Codex：

```text
Kimi 全量任务已宣告完成，工作目录是 /Users/jinke00001/Desktop/pet-kimi-full-20260908-01，请只做一次终局验收并记录首次交付成绩，不要替 Kimi 修改代码。
```

