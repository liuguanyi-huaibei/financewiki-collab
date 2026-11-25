import { Plugin, PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type { CollaborationSettings } from "./settings.js";
import { parseSignalingServers } from "./settings.js";

export interface SettingsHost {
  settings: CollaborationSettings;
  saveSettings(): Promise<void>;
  openDiagnostics(): void;
}

export class CollaborationSettingTab extends PluginSettingTab {
  private readonly host: SettingsHost;

  constructor(
    app: App,
    plugin: Plugin & SettingsHost,
  ) {
    super(app, plugin);
    this.host = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("financewiki-settings");
    containerEl.createEl("h2", { text: "FinanceWiki 团队协同" });
    containerEl.createEl("p", {
      text: "当前为 M2 测试版：仅管理指定目录内无 YAML 属性的 Markdown 笔记。正式 Wiki 页面待 M3 支持。所有设置保存后需重载插件才生效。",
      cls: "setting-item-description",
    });

    new Setting(containerEl).setName("运行状态").setDesc("查看信令连接、P2P 数据通道、成员与本地状态。")
      .addButton(b => b.setButtonText("打开协同管理").setCta().onClick(() => this.host.openDiagnostics()));
    containerEl.createEl("h3", {text: "团队工作区"});
    new Setting(containerEl)
      .setName("工作区 ID")
      .setDesc("团队所有设备必须使用相同的工作区 ID。")
      .addText((text) =>
        text
          .setValue(this.host.settings.workspaceId)
          .onChange(async (value) => {
            this.host.settings.workspaceId = value.trim() || "financewiki-team";
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("协同目录")
      .setDesc("相对于 Vault 根目录的路径，默认 Collab-Test。其他目录不参与本阶段协同。")
      .addText((text) =>
        text
          .setValue(this.host.settings.collaborationFolder)
          .onChange(async (value) => {
            this.host.settings.collaborationFolder =
              value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim() ||
              "Collab-Test";
            await this.host.saveSettings();
          }),
      );

    containerEl.createEl("h3", {text: "网络与安全"});
    new Setting(containerEl)
      .setName("信令服务器")
      .setDesc("每行一个 ws:// 或 wss:// 地址。留空仅允许本机标签页发现；不会自动使用公共信令服务。")
      .addTextArea((text) => {
        text
          .setValue(this.host.settings.signalingServers.join("\n"))
          .onChange(async (value) => {
            try {
              this.host.settings.signalingServers =
                parseSignalingServers(value);
              text.inputEl.removeClass("financewiki-invalid-setting");
              await this.host.saveSettings();
            } catch {
              text.inputEl.addClass("financewiki-invalid-setting");
            }
          });
        text.inputEl.rows = 4;
      });

    new Setting(containerEl)
      .setName("房间加密密码")
      .setDesc("团队共享的可选信令加密密码，所有设备应保持一致。明文保存在本机插件 data.json 中；不等同于成员身份认证，请勿使用账户密码。")
      .addText((text) => {
        text
          .setValue(this.host.settings.roomPassword)
          .onChange(async (value) => {
            this.host.settings.roomPassword = value;
            await this.host.saveSettings();
          });
        text.inputEl.type = "password";
      });

    containerEl.createEl("h3", {text: "成员与显示"});
    new Setting(containerEl)
      .setName("成员显示名称")
      .setDesc("显示在协同成员列表及远程光标中；建议每台设备使用不同名称。")
      .addText((text) =>
        text
          .setValue(this.host.settings.userName)
          .onChange(async (value) => {
            this.host.settings.userName = value.trim() || "FinanceWiki member";
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("光标颜色")
      .setDesc("六位十六进制颜色，例如 #30bced。")
      .addText((text) =>
        text
          .setValue(this.host.settings.userColor)
          .onChange(async (value) => {
            if (/^#[0-9a-fA-F]{6}$/.test(value)) {
              this.host.settings.userColor = value;
              await this.host.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("最大对端连接数")
      .setDesc("小团队建议保持默认 20；y-webrtc 使用网状连接。范围 2–64。")
      .addText((text) => {
        text
          .setValue(String(this.host.settings.maxConnections))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isInteger(parsed) && parsed >= 2 && parsed <= 64) {
              this.host.settings.maxConnections = parsed;
              await this.host.saveSettings();
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "2"; text.inputEl.max = "64";
      });
  }
}
