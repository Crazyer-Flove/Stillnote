# 开发、桌面构建与发布

## 环境

- Node.js 22 LTS、npm，使用 `npm ci` 与 `package-lock.json`。
- Windows 10/11 x64 用于 EXE 构建和验证。初次安装/打包需要访问 npm、Electron 和 electron-builder 的下载服务。
- GitHub 发布需要仓库写权限；仓库更名另需管理员权限。

## 结构

| 路径 | 职责 |
| --- | --- |
| `src/App.tsx` | 工作区、笔记库、保存和页面协调 |
| `src/components/` | 编辑器、搜索、设置、资源与导出界面 |
| `src/utils/` | 本机存储、备份、导入预览、文件夹冲突保护 |
| `desktop/main.cjs` | Electron 窗口、静态资源协议与受限桌面 IPC |
| `desktop/preload.cjs` | 仅暴露应用信息和创建快捷方式 |
| `desktop/security.cjs` | 来源验证与资源路径约束 |
| `server.ts` | 浏览器开发服务与生产静态服务，默认仅监听本机 |
| `scripts/` | 跨平台构建、桌面资源准备与清理 |
| `tests/` | 数据安全、兼容性、功能与桌面边界回归 |

桌面版不运行 Express，不把 Node.js 权限交给页面。沙箱、上下文隔离保持开启；网页内容不能直接读取任意本机路径或执行命令。外部链接交给系统浏览器，内嵌网页不得调用桌面 IPC。

## 常用命令

```bash
npm ci
npm run dev
npm run lint
npm test
npm run build
npm start
npm run desktop:dev
npm run desktop:unpacked
npm run desktop:build
```

`npm run build` 生成前端和 `dist/server.cjs`，生产服务默认端口 3000。`HOST`、`PORT` 可按 `.env.example` 配置。把 `HOST` 设为对外地址会将服务暴露到网络，请由部署者配置访问控制。

`desktop:prepare` 将前端和桌面壳复制到 `.desktop-app/`，不包含服务端、源代码、开发依赖或本机配置。electron-builder 使用此精简目录生成 `release/` 下的便携版与 NSIS 安装版。应用 ID 与用户数据目录应在未来版本保持稳定。

`npm run clean` 只清理固定构建输出，不删除用户数据。旧的 Bun 锁文件不作为当前发布流程依据。

## 验证

本次验证通过类型检查、27 项自动化测试、生产构建和实际便携 EXE 启动诊断。测试覆盖旧数据、备份回滚、重复导入、文件冲突、图片历史引用、筛选校验、会话快照和桌面协议/IPC 边界。

发行版内置隔离诊断，不读取用户配置，不在真实桌面创建快捷方式：

```powershell
$report = Join-Path $env:TEMP 'stillnote-smoke'
$app = Start-Process '.\release\Stillnote-1.2.0-Windows-x64-Portable.exe' -ArgumentList "--self-test-dir=$report" -WindowStyle Hidden -PassThru
$app.WaitForExit(60000)
Get-Content (Join-Path $report 'result.json')
```

诊断检查页面加载、预加载桥、安全上下文和临时快捷方式目标。它不能替代所有交互验收。浏览器演示截图见 `docs/images/`；未进行数万条笔记压力测试、完整屏幕阅读器审计或所有 Windows 版本兼容性验证。

## GitHub Release

`.github/workflows/release.yml` 在 `v*` 标签上运行 Windows 构建、检查与便携版诊断，然后通过当前仓库的 `GITHUB_TOKEN` 发布 EXE 和 `SHA256SUMS.txt`。令牌由 Actions 注入，不写入源码。

首次发布前确认包版本、标签和发布说明一致，再推送提交及 `v1.2.0` 标签。不要提交 `node_modules/`、`.tools/`、`.desktop-app/`、本机配置、诊断 profile 或 EXE；安装包通过 Releases 分发。仓库重命名为 Stillnote 后，同步检查 Git remote、README 链接和包元数据。

当前构建未签名。若后续启用代码签名，应使用 GitHub Secrets 存储证书与密码，并单独说明签名主体，不得将证书提交到仓库。


## 1.2.0 原生目录与布局

桌面目录由 desktop/folders.cjs 注册受限 IPC：只有用户通过原生对话框选定的根目录可访问，按工作区存储在本机 folders.json；路径逐级校验并拒绝符号链接。前端 desktopDirectory.ts 适配已有的预览、冲突保护和导入接口。Notes/Images/Backups 固定在同一根目录内；JSON 快照保持可移植图片。

新增测试覆盖内置工作区无损合并、选择记忆与越界拒绝、图片独立落盘及回读。用户真实目录未用于测试。网页版仍遵循浏览器文件授权限制。
