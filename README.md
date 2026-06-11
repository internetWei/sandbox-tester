# sandbox-tester

[![npm version](https://img.shields.io/npm/v/sandbox-tester.svg)](https://www.npmjs.com/package/sandbox-tester)
[![License: MIT](https://img.shields.io/npm/l/sandbox-tester.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/sandbox-tester.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-macOS-blue.svg)](https://www.apple.com/macos)

一行命令在 App Store Connect 自动创建 iOS 沙盒测试账号，告别手动建号。

```bash
# 自动创建 3 个沙盒账号，地区默认是美国
sandbox-tester 3

# 自动建 3 个账号，地区分别中国/美国/日本
# 完成后账号信息自动复制到剪贴板 + 桌面通知
sandbox-tester -r CHN USA JPN
```

## ✨ 特性

- **全自动**：headless 无窗口运行，登录、填表、提交、检测错误全自动
- **批量 + 多地区**：一次建 N 个账号，按地区列表分别创建（`-r CHN USA JPN`）
- **智能续号**：邮箱被 Apple 占用自动末尾 +1 重试；按 Apple 账号关联记录进度，不同账号互不干扰
- **零交互体验**：默认密码持久化，切换账号也不需要重设；首次设好之后再也不会问
- **内置 175 个地区**：完整 ISO alpha-3 代码 + 中文名，传错代码会自动列出可选项
- **设备信任保留**：`--logout --keep-cookies` 退出账号但保留 2FA 设备信任，重登免 2FA

## 📋 前置要求

| 项 | 说明 |
|---|---|
| macOS | 脚本依赖 `osascript`（桌面通知）/ `pbcopy`（剪贴板） |
| Node.js ≥ 14 | 没装：`brew install node` |
| Chrome 或 Edge 任一 | 没装：`brew install --cask google-chrome` |
| App Store Connect Admin 权限 | 创建 sandbox tester 在 Apple 后台需要 Admin role |

## 📦 安装

### 方式 1（推荐）：npm

```bash
npm install -g sandbox-tester
sandbox-tester -h
```

| 操作 | 命令 |
|---|---|
| 升级到最新版 | `npm update -g sandbox-tester` |
| 查看当前版本 | `sandbox-tester --version` |
| 卸载 | `npm uninstall -g sandbox-tester` |

### 方式 2：git clone（适合二次开发）

```bash
git clone https://github.com/internetwei/sandbox-tester.git ~/sandbox-tester
~/sandbox-tester/sandbox-tester -h
```

把 `~/sandbox-tester` 加进 `PATH`，或在 `~/bin/` 下做个软链，就能在任意目录直接敲 `sandbox-tester` 调用。
首次运行会自动把 playwright 依赖装到 `~/.local/state/sandbox-tester/`（避免污染 git/同步盘）。

### 方式 3：tarball 解压

```bash
curl -L https://github.com/internetwei/sandbox-tester/archive/refs/heads/main.tar.gz | tar xz
mv sandbox-tester-main ~/sandbox-tester
~/sandbox-tester/sandbox-tester -h
```

## 🚀 首次使用流程

第一次跑会引导你完成 4 步设置，之后就不再问：

```
$ sandbox-tester
首次运行，安装依赖（约 30 秒）...

请设置一个默认密码（之后都用它创建，除非用 -p 指定；切换账号也不会再问）。
要求 >=8 位、含大小写字母和数字，例如：WxYz123098
默认密码: ◀ 输入你的密码

后台静默打开 App Store Connect（无窗口）...
⚠️  未检测到登录态，打开浏览器窗口供登录 ...
请在窗口完成 Apple ID 登录 + 2FA，登录完成后回车继续... ◀ 在弹出的浏览器里登录

✅ 已登录: you@yourcompany.com

账号「you@yourcompany.com」首次使用，请设置一个起始邮箱（之后会自动递增、不再询问）。
建议用未在 Apple 注册过的测试域名，例如：wxyz1001@test.com
起始邮箱: ◀ 输入起始邮箱

=== 创建第 1/1 个账号（USA，起始 xxx1001@test.com）===
  ✅ 使用邮箱: xxx1001@test.com
  提交 ...

✅ 成功创建 1/1 个沙盒账号:
   xxx1001@test.com  |  WxYz123098  |  USA(美国)
📋 账号信息已复制到剪贴板
```

后续再跑就完全无感了 —— 不再问密码、不再问邮箱，直接自动续号建账号。

## 📖 命令示例

```bash
sandbox-tester                            # 接续上次成功邮箱，建 1 个（美国）
sandbox-tester 3                          # 连续建 3 个（都美国）
sandbox-tester 3 -r CHN USA JPN           # 建 3 个，地区分别中国/美国/日本
sandbox-tester -r CHN USA JPN             # 数量自动取地区数
sandbox-tester 3 -r CHN                   # 建 3 个，第 1 个中国其余美国
sandbox-tester -e wxyz2000@test.com       # 指定起始邮箱
sandbox-tester -p NewPassword99           # 修改默认密码并使用
sandbox-tester --logout                   # 退出当前账号（默认清 cookie，下次登录需 2FA）
sandbox-tester --logout --keep-cookies    # 退出但保留设备信任（下次登录免 2FA）
sandbox-tester -h                         # 完整帮助 + 全量地区代码
```

## 📁 数据存储

所有运行时数据都在 `~/.local/state/sandbox-tester/`，**不污染你的代码目录**：

| 文件 | 作用 |
|---|---|
| `playwright-state/` | 浏览器 profile，含 Apple 登录 cookie（敏感）|
| `node_modules/` | Playwright 依赖（约 17M）|
| `last-email.json` | 各 Apple 账号的上次成功邮箱（按 appleId map）|
| `password.txt` | 默认密码（明文本地存储）|
| `regions.json` | Apple 全量地区缓存 |
| `browser-channel.txt` | 上次用的 Chrome/Edge |

要彻底清除：`rm -rf ~/.local/state/sandbox-tester/`

## ⚠️ 已知限制 & 风险

- **macOS only**：依赖 `osascript` / `pbcopy`，Linux / Windows 不支持
- **不支持 Safari / Firefox**：Playwright 仅能驱动 Chromium 系（Chrome/Edge 走 CDP 协议）；Safari 走 WebDriver、Firefox 也得用 Playwright 自带的独立 binary，对 ASC 兼容性未验证
- **依赖 Apple 私域，可能随版本失效**：脚本依赖 App Store Connect 的 DOM selector、内部 session API（`/olympus/v1/session`）、cookie 名单。Apple 改版时可能需要更新 —— 遇到问题欢迎提 [issue](https://github.com/internetWei/sandbox-tester/issues/new)
- **沙盒邮箱全局唯一不可回收**：Apple sandbox tester email 一旦被全球任何开发者占用，就**永久无法释放**。建议用未在 Apple 注册过的**自有命名空间**前缀（如 `<你姓>1001@test.com`），避免被全球高频前缀（如 `test1001@test.com`）抢占

## 🤝 贡献

[Issue](https://github.com/internetWei/sandbox-tester/issues/new) 和 [PR](https://github.com/internetWei/sandbox-tester/pulls) 欢迎，但请理解这是个人维护的小工具，响应可能不及时。**Apple 改版导致脚本失效** 的优先级最高，遇到这类问题贴上：
- 错误截图（脚本自动保存到 `/tmp/sandbox-fail-*.png`）
- 终端报错日志
- 当前的 Chromium channel 和 Apple Connect 后台语言

## 📜 License

[MIT](./LICENSE) © budo
