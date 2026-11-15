# Workspace HUD for DeepSeek Harness

[![CI](https://github.com/LiuProMax/dsh-workspace-hud/actions/workflows/ci.yml/badge.svg)](https://github.com/LiuProMax/dsh-workspace-hud/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

一个置顶、可拖拽的浮窗插件，给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web UI 常驻显示三件事：

- 当前工作区的文件；
- 当前账户的余额；
- Token 消耗，分成 **账户** 与 **工作区** 两个口径。

![工作区概览](assets/preview.png)

[English](README.md) | 中文

## 功能

- **工作区文件**：当前会话工作目录的目录树（目录按需展开），文件带大小；点击文件在 Harness 右侧预览中打开。每 8 秒自动刷新。
- **账户余额**：已登录账户的钱包余额、赠送余额、账户名与更新时间。每 60 秒或窗口重新聚焦时刷新。
- **Token 消耗，两个口径**：并排显示 **账户**（本机所有会话）与 **工作区**（同一 `cwd` 的会话）两个累计值，点击任一数值即可把下方的「输入 / 输出 / 缓存读取 / 缓存写入」明细切到该口径。
- **实时数字**：打开中的会话直接读实时投影，对话流式输出时数字同步增长。
- **置顶但不碍事**：拖标题栏可移动，双击回到默认位置；位置、折叠、隐藏和 Token 口径都记录在 `localStorage`。
- **跟随主题**：只使用 `--dsw-*` 设计 token，明暗主题与宿主排版一致。
- **零依赖、零构建、无额外网络请求**。

## 要求

- DeepSeek Harness 桌面版（开发环境为 Windows 上的 `0.2.0-rc.2`）。
- 余额依赖桌面版账户服务（`remote.account`）；纯 Web 部署下插件不会挂载。
- Node.js 20+ 仅用于仓库自检，运行时使用 Harness 客户端的 React。

## 安装

### 方式 A：通过「插件」页从 GitHub 安装（桌面版推荐）

1. 打开 Harness 侧栏的 **插件** 页面。
2. 选择安装，粘贴以下任一形式：
   - `github:LiuProMax/dsh-workspace-hud`
   - `https://github.com/LiuProMax/dsh-workspace-hud`
3. 确认安装。Harness 会实时重组 profile，浮窗出现在右上角。

### 方式 B：手工安装到桌面版 profile

克隆或下载本仓库后，运行对应平台的安装脚本。脚本会把包复制进桌面 profile，并把包名加进 `dsh.profile.bundles`；运行中的 Harness 会热更新，无需重启。

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

```bash
# macOS / Linux
bash ./install.sh
```

脚本只改写 profile 的 `dsh.profile.bundles` 列表；改完插件代码后重新运行一次即可更新已安装副本。

### 方式 C：非桌面版 profile

```bash
dsh plugin --profile <profile> add github:LiuProMax/dsh-workspace-hud
```

桌面版的 profile 由 Electron 应用独占管理，`dsh plugin` 会拒绝；桌面版请用方式 A 或 B。

## 使用

| 操作 | 结果 |
|---|---|
| 拖动标题栏 | 移动浮窗，位置会记住 |
| 双击标题栏 | 回到默认的右上角位置 |
| 点击文件行 | 在右侧预览中打开该文件 |
| 点击目录行 | 展开 / 收起该目录 |
| 点击 **账户** / **工作区** | 切换 Token 明细口径 |
| 刷新按钮 | 重新读取文件、余额和 Token |
| 折叠按钮 | 收起 / 展开主体 |
| 关闭按钮 | 隐藏浮窗，原位置留下「概览」胶囊 |
| 点击胶囊 | 恢复浮窗 |

## 实现方式

插件挂载一个宿主行（`workspace-hud`），其包同时声明 `dsh.client` 浏览器半。浏览器半把 React 组件注册到 `shell.overlay` 槽位——Harness 在所有面板之上渲染的那一层。数据全部走已有的公开服务：

| 区域 | 来源 |
|---|---|
| 工作区路径 | 主视图会话的 `cwd`（`ctx.sessions.list`） |
| 文件树 | `ctx.remote.workspaceFiles.list`，只读 |
| 余额 | `ctx.remote.account.getBalance` / `getProfile` |
| Token | `ctx.remote.session.list` 每条会话的 `projections.values.tokenUsage`，并用实时投影覆盖 |

组件流程、存储键与拖拽实现见 [docs/how-it-works.md](docs/how-it-works.md)。

## 隐私

- 只读取 Harness 已经暴露给它自己 Web UI 的数据，不写文件、不执行命令。
- 无统计、无外部请求；唯一的网络流量是 Harness 自己的账户与会话服务。
- 本地状态只有 `localStorage["dsh.workspace-hud.v1"]`（位置、可见性、Token 口径）。

## 已知边界

- **账户消耗是本机口径**：Harness 不向客户端暴露云端账单用量，所以账户值是本机持久化会话的累计；没有工作目录的会话、以及 `session.list` 不返回的子代理会话不计入。
- **缓存投影有轻微滞后**：从未打开过的旧会话使用投影缓存检查点（最多滞后 200 条事件或 5 秒）；打开中的会话始终实时。
- **余额仅限桌面版**：没有 `remote.account` 的纯 Web 部署不会挂载本插件。
- **账户客户端版本固定**为开发时的 `0.2.0-rc.2`；未来账户契约变化时余额可能显示不可用，其余功能不受影响。

## 开发

插件是纯 JavaScript，没有编译步骤。

```bash
git clone https://github.com/LiuProMax/dsh-workspace-hud.git
cd dsh-workspace-hud
npm run check          # 校验 manifest、patch 与 client 注册
node --check index.js
node --check client.js
```

在运行中的桌面版里验证改动：编辑 `client.js` 后重新运行 `install.ps1` / `install.sh`。Harness 的 client HMR 会轮询已安装包并原地替换浮窗，组件内部状态会重置，会话与浮窗状态保留。

## 贡献

欢迎提交 issue 与 PR。提交前请运行 `npm run check`，并保持浮窗只使用 Harness 的主题 token 与公开客户端服务。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
