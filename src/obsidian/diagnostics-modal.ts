import { App, Modal, Notice, Setting } from "obsidian";
import type { SessionHealth } from "./diagnostics.js";
import { sessionLabel } from "./diagnostics.js";

export interface DiagnosticReport {
  workspace: string;
  device: string;
  activeRoom: string | null;
  configuredServers: string[];
  sessions: SessionHealth[];
}

export class CollaborationDiagnosticsModal extends Modal {
  private timer: number | undefined;

  constructor(app: App, private readonly report: () => DiagnosticReport,
    private readonly exportSnapshot: (roomId: string) => Promise<string>) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("FinanceWiki 协同管理");
    this.contentEl.addClass("financewiki-dashboard");
    const live = this.contentEl.createDiv();
    const actions = this.contentEl.createDiv();
    const render = () => {
      const data = this.report();
      live.empty();
      live.createEl("p", {text: "工作区：" + data.workspace + "  |  本机：" + data.device});
      live.createEl("p", {text: "实时诊断（每秒刷新）；连接数按文档统计，不等于团队人数。"});
      live.createEl("h3", {text: "信令服务"});
      live.createEl("p", {text: data.configuredServers.join(" · ") || "未配置"});
      if (!data.sessions.length) live.createEl("p", {text: "暂无协同会话；打开协同测试笔记后可查看连接详情。"});
      for (const s of data.sessions) {
        const card = live.createDiv({cls:"financewiki-session-card"});
        card.createEl("strong", {text: s.roomId});
        card.createEl("p", {text: sessionLabel(s, s.roomId !== data.activeRoom), cls:"financewiki-session-status"});
        const rows = [
          ["信令 WebSocket", s.signalingConnected + "/" + s.signalingConfigured + " 已连接"],
          ["WebRTC 数据通道", s.connectedPeers + " 已连接 / " + s.pendingPeers + " 建连中"],
          ["初始同步握手", s.syncedPeers + "/" + s.connectedPeers + " 已完成"],
          ["本机标签页", String(s.localPeers)],
          ["本地状态", s.localError ? "加载异常，请保留数据库" : s.localReady ? "已加载（非逐笔写入确认）" : "尚未就绪"],
          ["文档初始化", s.seeded ? "已初始化" : "等待种子"],
          ["感知成员", s.members.join("、") || "暂无远端感知信息"],
        ];
        for (const [name, value] of rows) {
          const row = card.createDiv({cls:"financewiki-diagnostic-row"});
          row.createSpan({text:name}); row.createSpan({text:value});
        }
      }
    };
    render();
    this.timer = window.setInterval(render, 1000);
    actions.createEl("h3", {text:"协同操作"});
    new Setting(actions).setName("诊断信息")
      .setDesc("复制当前状态，不包含正文和房间密码；成员名和内网地址仍属于内部信息。")
      .addButton(b=>b.setButtonText("复制诊断").onClick(async()=>{
        try { await navigator.clipboard.writeText(JSON.stringify(this.report(), null, 2)); new Notice("诊断信息已复制"); }
        catch { new Notice("复制失败，请检查剪贴板权限"); }
      }));
    new Setting(actions).setName("信令服务启动")
      .setDesc("仅主机安装常驻管理后可通过 Windows 计划任务启动；成员设备无需运行服务。")
      .addButton(b=>b.setButtonText("复制启动命令").onClick(async()=>{
        try { await navigator.clipboard.writeText("Start-ScheduledTask -TaskName 'FinanceWiki-Signaling'"); new Notice("启动命令已复制，请在主机 PowerShell 执行"); }
        catch { new Notice("复制失败"); }
      }));
    new Setting(actions).setName("导出当前文档快照")
      .setDesc("仅导出本机已加载的 Yjs 状态至插件备份目录，包含正文，需妥善保管。暂不提供自动恢复。")
      .addButton(b=>b.setButtonText("导出快照").onClick(async()=>{
        const data = this.report();
        const room = data.activeRoom ?? (data.sessions.length === 1 ? data.sessions[0]!.roomId : null);
        if (!room) { new Notice("请先激活要备份的协同笔记"); return; }
        try { const path = await this.exportSnapshot(room); new Notice("快照已导出：" + path, 10000); }
        catch (error) { new Notice("导出失败：" + String(error)); }
      }));
    actions.createEl("p", {text:"重连：先恢复网络并观察数据通道；主机信令服务由计划任务管理。手动强制重连留待后续加固。不要重复执行初始化。"});
  }

  onClose(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.contentEl.empty();
  }
}
