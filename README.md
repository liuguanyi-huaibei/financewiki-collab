# FinanceWiki Collaboration / FinanceWiki 团队协同

中文版 Obsidian 小团队实时协同插件，使用 Yjs CRDT、WebRTC 和 IndexedDB。当前为 **0.2.2 实验测试版**，仅用于指定目录中的无 YAML frontmatter 的 Markdown 测试笔记，不是完整 Vault 同步工具。

## 安装

在 GitHub Releases 中下载 main.js、manifest.json、styles.css，放入测试 Vault 的 .obsidian/plugins/financewiki-collab/，重启 Obsidian 并启用插件。也可使用社区插件 BRAT，通过本仓库地址安装指定版本。当前尚未通过 Obsidian 官方社区审核。

## 使用

1. 建议先创建独立测试 Vault，并在各设备上建立相同相对路径的 Collab-Test/Collaborative-Test-Note.md（可使用 examples 中的模板）。
2. 在插件设置中填写相同工作区 ID、协同目录、信令地址及房间密码，各设备使用不同成员名称。
3. 仅指定的一台种子设备在编辑模式执行「初始化当前协同测试笔记（仅种子设备执行）」；其他设备打开同一路径的笔记，不再执行初始化。
4. 点击状态栏查看协同管理面板，测试双向编辑和离线重连。

升级前备份测试文档、退出 Obsidian，替换三个插件文件；保留 data.json 和 IndexedDB。不要清除本地数据库，不要再次 Seed。

## 自建信令服务器

需要 Node.js 20+。在仓库根目录执行：

```sh
npm ci
npm run signaling
```

默认端口 4444。将主机实际可达的 ws:// 或 wss:// 地址填入各设备设置。不要把 localhost 填给其他物理设备。仅在可信受控测试网络使用；示例信令服务器没有成员身份认证，不应直接暴露于公网。

Windows 可选常驻管理脚本位于 scripts/。先在独立目录部署依赖，使用 PowerShell 执行 scripts/manage-signaling.ps1 -Action install，再执行 -Action start；-Action status / stop / uninstall 分别查看、停止和移除任务。默认当前用户登录触发；-AtStartup 需要相应权限。不需要在客户端运行服务。

## 网络与隐私

- 用户配置的信令服务器用于设备发现和连接协商，不持久保存知识正文。留空时不自动连接公共信令服务器。
- 底层 simple-peer 默认 ICE/STUN 地址为 stun.l.google.com:19302、global.stun.twilio.com:3478，可能向这些公共服务发出网络地址发现请求。
- Yjs 正文更新及 Awareness 成员名、光标信息通过 WebRTC 数据通道交换；本地同设备标签页也可能通过 BroadcastChannel 通信。
- IndexedDB 保存协同状态，Obsidian 保存 Markdown 文件；设置及共享密码保存在本机插件 data.json。共享密码用于信令加密，不等于成员身份认证；不要使用账号密码。
- 手动导出的 Yjs 快照包含正文，应妥善保管。诊断信息包含内部地址和成员名。
- GitHub 仅分发插件源码和构建产物，不是知识正文同步服务。

## 当前限制

仅验收桌面端双设备在线协同及保持应用运行时的离线恢复。离线重启、多文档会话管理、文件重命名和删除、YAML 属性、附件、完整 Vault 同步、成员授权、跨网络连接仍需完善或验收。不要用于唯一副本或敏感生产资料。Manifest 声明最低版本 1.5.0，但尚未覆盖全部兼容版本的实机验证。

## 开发

```sh
npm ci
npm run validate
npm run test:signaling
```

validate 依次进行 TypeScript 检查、Vitest 测试和构建，产物位于 dist/。信令专项测试使用独立端口，不停止正在运行的服务。

本项目从 Microsoft LLM Wiki 的衍生开发项目中独立提取。保留原 MIT 许可及版权声明；依赖遵循各自的开源许可证。详见 LICENSE 及构建产物的第三方声明。
