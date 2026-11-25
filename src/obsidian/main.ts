import { Compartment, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import {
  MarkdownView,
  Notice,
  Plugin,
  TFile,
} from "obsidian";
import { yCollab } from "y-codemirror.next";
import * as Y from "yjs";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type CollaborationSettings,
} from "./settings.js";
import { CollaborationSettingTab } from "./settings-tab.js";
import { globalLabel, inspectSession } from "./diagnostics.js";
import { CollaborationDiagnosticsModal, type DiagnosticReport } from "./diagnostics-modal.js";
import {
  createRoomId,
  hasYamlFrontmatter,
  isInCollaborationFolder,
} from "./room-id.js";
import {
  createCollaborationSession,
  destroyCollaborationSession,
  isSessionSeeded,
  seedSessionFromText,
  type CollaborationSession,
} from "./session.js";

const LOCKED_EDITOR = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];

// Removing this plugin's lock compartment restores Obsidian and other plugins'
// own read-only / editable facets instead of overriding them with false/true.
const EDITABLE_EDITOR: Extension = [];

export default class FinanceWikiCollaborationPlugin extends Plugin {
  settings: CollaborationSettings = { ...DEFAULT_SETTINGS };
  private runtimeSettings: CollaborationSettings = { ...DEFAULT_SETTINGS };
  private diagnosticsModal: CollaborationDiagnosticsModal | null = null;

  private readonly sessions = new Map<string, CollaborationSession>();
  private readonly editorViews = new Map<string, Set<EditorView>>();
  private readonly bindingCompartment = new Compartment();
  private statusBarItem!: HTMLElement;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(
      (await this.loadData()) as Partial<CollaborationSettings> | null,
    );
    this.runtimeSettings = {...this.settings, signalingServers: [...this.settings.signalingServers]};

    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass("financewiki-collab-status");
    this.statusBarItem.setText("协同：就绪");
    this.statusBarItem.setAttribute("role", "button");
    this.statusBarItem.setAttribute("tabindex", "0");
    this.registerDomEvent(this.statusBarItem, "click", () => this.openDiagnostics());
    this.registerDomEvent(this.statusBarItem, "keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.openDiagnostics();
      }
    });
    this.addRibbonIcon("network", "FinanceWiki 协同管理", () => this.openDiagnostics());
    this.registerInterval(window.setInterval(() => this.refreshStatusBar(), 1000));

    this.registerEditorExtension([
      this.bindingCompartment.of(LOCKED_EDITOR),
      this.createEditorBindingExtension(),
    ]);

    this.addSettingTab(new CollaborationSettingTab(this.app, this));
    this.addCommand({
      id: "seed-current-test-note",
      name: "初始化当前协同测试笔记（仅种子设备执行）",
      callback: () => void this.seedCurrentNote(),
    });
    this.addCommand({
      id: "show-current-room-id",
      name: "查看当前协同房间 ID",
      callback: () => this.showCurrentRoomId(),
    });
    this.addCommand({
      id: "show-collaboration-status",
      name: "打开协同管理与诊断",
      callback: () => this.openDiagnostics(),
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () =>
        this.refreshStatusBar(),
      ),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.refreshStatusBar()),
    );
    this.refreshStatusBar();
  }

  onunload(): void {
    this.diagnosticsModal?.close();
    for (const session of this.sessions.values()) {
      void destroyCollaborationSession(session);
    }
    this.sessions.clear();
    this.editorViews.clear();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshStatusBar();
  }

  openDiagnostics(): void {
    this.diagnosticsModal?.close();
    this.diagnosticsModal = new CollaborationDiagnosticsModal(
      this.app, () => this.getDiagnosticReport(), (room) => this.exportSnapshot(room),
    );
    this.diagnosticsModal.open();
  }

  private getDiagnosticReport(): DiagnosticReport {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = activeView?.file;
    const activeRoom = file && file.extension === "md"
      && isInCollaborationFolder(file.path, this.runtimeSettings.collaborationFolder)
      && !hasYamlFrontmatter(activeView.getViewData())
      ? createRoomId(this.runtimeSettings.workspaceId, file.path) : null;
    return {
      workspace: this.runtimeSettings.workspaceId,
      device: this.runtimeSettings.userName,
      activeRoom,
      configuredServers: [...this.runtimeSettings.signalingServers],
      sessions: [...this.sessions.values()].map(inspectSession),
    };
  }

  private async exportSnapshot(roomId: string): Promise<string> {
    const session = this.sessions.get(roomId);
    if (!session || !session.persistence.synced || !isSessionSeeded(session)) {
      throw new Error("文档未初始化或本地状态尚未加载");
    }
    const adapter = this.app.vault.adapter;
    const folder = this.app.vault.configDir + "/plugins/" + this.manifest.id + "/backups";
    if (!await adapter.exists(folder)) await adapter.mkdir(folder);
    const timestamp = new Date().toISOString();
    const path = folder + "/snapshot-" + timestamp.replace(/[:.]/g, "-")
      + "-" + crypto.randomUUID() + ".json";
    const bytes = Y.encodeStateAsUpdate(session.doc);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    await adapter.write(path, JSON.stringify({
      format: "financewiki-yjs-update-v1", roomId, timestamp,
      encoding: "base64", update: btoa(binary),
    }));
    return path;
  }

  private createEditorBindingExtension() {
    const plugin = this;

    return ViewPlugin.fromClass(
      class {
        private file: TFile | null = null;
        private session: CollaborationSession | null = null;
        private metaObserver:
          | ((event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => void)
          | null = null;
        private active = false;
        private destroyed = false;
        private attempts = 0;

        constructor(private readonly view: EditorView) {
          queueMicrotask(() => this.initialize());
        }

        private initialize(): void {
          if (this.destroyed) return;

          const file = plugin.resolveFileForEditorView(this.view);
          if (!file) {
            this.attempts += 1;
            if (this.attempts < 10) {
              window.setTimeout(() => this.initialize(), 50);
            } else {
              this.setEditable();
            }
            return;
          }

          this.file = file;
          if (
            !isInCollaborationFolder(
              file.path,
              plugin.runtimeSettings.collaborationFolder,
            )
          ) {
            this.setEditable();
            return;
          }

          if (hasYamlFrontmatter(this.view.state.doc.toString())) {
            plugin.markFrontmatterUnsupported(file.path);
            this.setEditable();
            return;
          }

          plugin.registerEditorView(file.path, this.view);
          this.session = plugin.getOrCreateSession(file);
          this.metaObserver = () => this.activateWhenSeeded();
          this.session.meta.observe(this.metaObserver);

          void this.session.persistence.whenSynced
            .then(() => this.activateWhenSeeded())
            .catch((error: unknown) => {
              if (this.destroyed || !this.session) return;
              this.session.localError = true;
              new Notice(
                "FinanceWiki 本地状态加载失败：" +
                  (error instanceof Error ? error.message : String(error)),
              );
              // Never unlock a collaborative editor before local state is loaded.
              plugin.refreshStatusBar();
            });

          this.activateWhenSeeded();
          plugin.refreshStatusBar();
        }

        private activateWhenSeeded(): void {
          if (
            this.destroyed ||
            this.active ||
            !this.session ||
            !this.session.persistence.synced ||
            this.session.localError ||
            !isSessionSeeded(this.session)
          ) {
            plugin.refreshStatusBar();
            return;
          }

          const sharedText = this.session.text.toString();
          const currentText = this.view.state.doc.toString();
          const effects = plugin.bindingCompartment.reconfigure(
            yCollab(this.session.text, this.session.provider.awareness),
          );

          this.active = true;
          if (sharedText !== currentText) {
            this.view.dispatch({
              changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: sharedText,
              },
              effects,
            });
          } else {
            this.view.dispatch({ effects });
          }

          plugin.refreshStatusBar();
        }

        private setEditable(): void {
          if (this.destroyed) return;
          this.view.dispatch({
            effects: plugin.bindingCompartment.reconfigure(EDITABLE_EDITOR),
          });
        }

        destroy(): void {
          this.destroyed = true;
          if (this.session && this.metaObserver) {
            this.session.meta.unobserve(this.metaObserver);
          }
          if (this.file) {
            plugin.unregisterEditorView(this.file.path, this.view);
          }
        }
      },
    );
  }

  private resolveFileForEditorView(view: EditorView): TFile | null {
    let resolved: TFile | null = null;

    this.app.workspace.iterateAllLeaves((leaf) => {
      const candidate = leaf.view;
      if (
        candidate instanceof MarkdownView &&
        candidate.containerEl.contains(view.dom)
      ) {
        resolved = candidate.file;
      }
    });

    return resolved;
  }

  private registerEditorView(filePath: string, view: EditorView): void {
    let views = this.editorViews.get(filePath);
    if (!views) {
      views = new Set<EditorView>();
      this.editorViews.set(filePath, views);
    }
    views.add(view);
  }

  private unregisterEditorView(filePath: string, view: EditorView): void {
    const views = this.editorViews.get(filePath);
    if (!views) return;
    views.delete(view);
    if (views.size === 0) this.editorViews.delete(filePath);
  }

  private getOrCreateSession(file: TFile): CollaborationSession {
    const roomId = createRoomId(this.runtimeSettings.workspaceId, file.path);
    const existing = this.sessions.get(roomId);
    if (existing) return existing;

    const session = createCollaborationSession(roomId, this.runtimeSettings);
    this.sessions.set(roomId, session);

    session.provider.on("status", ({ connected }) => {
      session.searchingForPeers = connected;
      this.refreshStatusBar();
    });
    session.provider.on("synced", ({ synced }) => {
      session.synced = synced;
      this.refreshStatusBar();
    });
    session.provider.on("peers", ({ webrtcPeers, bcPeers }) => {
      session.peerIds = new Set([...webrtcPeers, ...bcPeers]);
      this.refreshStatusBar();
    });
    void session.persistence.whenSynced.then(() => this.refreshStatusBar()).catch(() => {
      session.localError = true;
      this.refreshStatusBar();
    });

    return session;
  }

  private async seedCurrentNote(): Promise<void> {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = markdownView?.file;
    if (!markdownView || !file || file.extension !== "md") {
      new Notice("请先以编辑模式打开 Markdown 测试笔记。");
      return;
    }
    if (
      !isInCollaborationFolder(
        file.path,
        this.runtimeSettings.collaborationFolder,
      )
    ) {
      new Notice(
        "M2 仅管理指定协同目录中的测试笔记：" +
          this.runtimeSettings.collaborationFolder,
      );
      return;
    }

    const editorView = this.getActiveEditorView(file.path, markdownView);
    if (!editorView) {
      new Notice("当前编辑器尚未就绪，请重新打开笔记后重试。");
      return;
    }

    const initialText = editorView.state.doc.toString();
    if (hasYamlFrontmatter(initialText)) {
      new Notice(
        "M2 不同步 YAML 属性，请使用无属性的测试笔记；正式 Wiki 页面留待 M3。",
      );
      return;
    }

    const session = this.getOrCreateSession(file);
    try {
      await session.persistence.whenSynced;
      seedSessionFromText(session, initialText);
      new Notice(
        "本机已初始化协同文档。其他设备可打开相同工作区和相对路径加入。",
      );
    } catch (error) {
      new Notice(
        isSessionSeeded(session) ? "文档已经初始化，请勿重复执行。"
          : "初始化失败，请保留现有内容并查看诊断：" + String(error),
      );
    }
    this.refreshStatusBar();
  }

  private getActiveEditorView(
    filePath: string,
    markdownView: MarkdownView,
  ): EditorView | null {
    const views = this.editorViews.get(filePath);
    if (!views) return null;
    for (const view of views) {
      if (markdownView.containerEl.contains(view.dom)) return view;
    }
    return null;
  }

  private showCurrentRoomId(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice("请先打开 Markdown 笔记。");
      return;
    }
    const roomId = createRoomId(this.runtimeSettings.workspaceId, file.path);
    new Notice("协同房间 ID：" + roomId);
  }

  private markFrontmatterUnsupported(filePath: string): void {
    this.statusBarItem.setText("协同：此笔记含 YAML 属性，暂不支持");
    this.statusBarItem.setAttribute(
      "aria-label",
      "M2 仅支持无 YAML 属性的测试笔记：" +
        filePath,
    );
  }

  private refreshStatusBar(): void {
    const report = this.getDiagnosticReport();
    const label = "协同：" + globalLabel(report.sessions, report.activeRoom);
    this.statusBarItem.setText(label);
    this.statusBarItem.setAttribute("aria-label", label + "；点击查看诊断");
    this.statusBarItem.title = label + "；点击查看诊断";
  }
}
