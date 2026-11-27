# FinanceWiki Collaboration / FinanceWiki 团队协同

中文版 Obsidian 桌面端小团队实时协同插件。当前冻结版本为 **v0.2.3（实验版）**，使用 Yjs CRDT、WebRTC、用户自建 Signaling Server 与 IndexedDB。

## v0.2.3 已验证能力

- 双设备在指定协同目录中实时编辑无 YAML Frontmatter 的 Markdown 测试笔记。
- Yjs CRDT 合并并发正文更新。
- IndexedDB 本地持久化，断网期间可继续编辑。
- 应用/网络恢复后自动尝试重新发现设备并恢复协同。
- 两端离线编辑并重启后，重新联网可合并各自持久化的更新。
- Signaling Server 可独立部署；Windows 常驻管理脚本位于 **scripts/**。

自动化验证：**npm run validate**（TypeScript、49 项 Vitest 测试、构建）以及 **npm run test:signaling**（信令服务进程管理专项测试）。双设备断网重启与自动恢复还经过项目维护者实机验收。

## 当前范围与限制

本版本是团队协同 MVP，不是完整 Vault 同步系统：

- 只协同配置目录中的 Markdown 文件；YAML Frontmatter 暂不支持。
- 当前 Room ID 和 IndexedDB 数据库名由 Workspace ID 与 Vault 相对文件路径确定；重命名/移动文档不会自动保留原协同身份。
- 多文档会话尚未完成正式的生命周期、资源上限和跨设备文件目录管理验收。
- 图片、PDF 等附件、文件夹结构、成员身份认证、细粒度权限、主机自动发现、TURN 中继及完整快照恢复尚未实现或验收。
- 信令服务器本身不提供成员身份认证。**ws://** 仅适合可信受控网络；正式部署前应配置 WSS/TLS、身份认证和访问控制。
- 不要将其作为敏感或生产知识库的唯一副本；升级前备份 Markdown 与必要的 Yjs 快照。

## 安装

从 GitHub Releases 下载 **main.js**、**manifest.json**、**styles.css**，放入测试 Vault 的 **.obsidian/plugins/financewiki-collab/**，重启 Obsidian 并启用插件。也可使用社区插件 BRAT 安装指定版本。本插件尚未通过 Obsidian 官方社区审核。

## 使用

1. 建议使用独立测试 Vault，并在各设备建立相同相对路径的 **Collab-Test/Collaborative-Test-Note.md**。
2. 在插件设置中填写相同 Workspace ID、协同目录、信令地址及房间密码；每台设备使用不同成员名称。
3. 仅一台种子设备在编辑模式执行「初始化当前协同测试笔记（仅种子设备执行）」；其他设备打开同一路径的笔记加入，不要再次 Seed。
4. 点击底部协同状态栏查看会话、信令和 WebRTC 诊断。

升级前备份测试文档，完全退出 Obsidian，再替换三个插件文件。保留 **data.json** 和 IndexedDB；不要清除本地数据库或重新 Seed。

## 自建信令服务器

需要 Node.js 20+。在仓库根目录执行：

~~~sh
npm ci
npm run signaling
~~~

默认端口为 4444。将主机实际可达的 **ws://** 或 **wss://** 地址填入各设备设置。不要把 **localhost** 填给其他物理设备。

Windows 可选常驻管理脚本位于 **scripts/**。在独立部署目录安装依赖后，使用 PowerShell 执行 **scripts/manage-signaling.ps1 -Action install**，再执行 **-Action start**；**-Action status**、**-Action stop**、**-Action uninstall** 分别查看、停止和移除任务。默认当前用户登录触发；**-AtStartup** 需要相应权限。客户端设备不需要运行信令服务。

## 网络与隐私

- 用户配置的信令服务器用于设备发现和连接协商，不持久保存知识正文；留空时不自动连接公共信令服务器。
- 底层 simple-peer 默认 ICE/STUN 地址为 **stun.l.google.com:19302**、**global.stun.twilio.com:3478**，可能向这些公共服务发出网络地址发现请求。
- Yjs 正文更新及 Awareness 成员名、光标信息通过 WebRTC 数据通道交换；同设备标签页也可能通过 BroadcastChannel 通信。
- IndexedDB 保存协同状态，Obsidian 保存 Markdown 文件；设置及共享密码保存在本机插件 **data.json**。共享密码用于信令加密，不等于成员身份认证；不要使用账号密码。
- 手动导出的 Yjs 快照包含正文，应妥善保管。诊断信息可能包含内部地址和成员名。
- GitHub 仅分发插件源码和构建产物，不是知识正文同步服务。

## 开发与验证

~~~sh
npm ci
npm run validate
npm run test:signaling
~~~

**validate** 依次执行 TypeScript 检查、Vitest 测试和构建，产物位于 **dist/**。信令专项测试使用独立端口，不停止正在运行的服务。

## 后续路线

v0.2.3 冻结后，后续开发在独立分支进行。M3.1 首先完成多文档 Session Manager 与文档身份/注册表设计，必须保持现有 Room ID、IndexedDB 命名和本地数据兼容；任何身份迁移都需要显式迁移方案和双端回归测试。

## License

MIT，详见 LICENSE。依赖遵循各自的开源许可证。
