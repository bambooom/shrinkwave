import type { AppMessage, Tool } from "./types";

const extension = chrome;
// Firefox exposes the sidebar through `browser.sidebarAction` instead of `chrome.sidePanel`.
const sidebarAction = (globalThis as { browser?: { sidebarAction?: { toggle(): Promise<void> } } }).browser
  ?.sidebarAction;
const appUrl = extension.runtime.getURL("index.html");
const menuTools: Record<string, Tool> = { "open-compress": "compress", "open-stitch": "stitch" };

async function findAppTab() {
  // getContexts (Chrome 116+) sees our own tabs without the "tabs" permission.
  if (!extension.runtime.getContexts) return undefined;
  const [context] = await extension.runtime.getContexts({ contextTypes: [extension.runtime.ContextType.TAB] });
  return context?.tabId;
}

async function openInTab(tool: Tool) {
  const tabId = await findAppTab();

  if (tabId !== undefined && tabId >= 0) {
    const tab = await extension.tabs.update(tabId, { active: true });
    if (tab?.windowId) await extension.windows.update(tab.windowId, { focused: true });
    const message: AppMessage = { type: "set-tool", tool };
    await extension.tabs.sendMessage(tabId, message).catch(() => undefined);
    return;
  }

  await extension.tabs.create({ url: `${appUrl}?tool=${tool}` });
}

function createMenus() {
  extension.contextMenus.removeAll(() => {
    for (const [id, tool] of Object.entries(menuTools)) {
      extension.contextMenus.create({
        id,
        title: extension.i18n.getMessage(tool === "compress" ? "menuOpenCompress" : "menuOpenStitch"),
        contexts: ["action"],
      });
    }
  });
}

if (extension.sidePanel?.setPanelBehavior) {
  // The action click then opens the panel itself and onClicked never fires.
  extension.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
} else {
  extension.action.onClicked.addListener(() => {
    // toggle() must run synchronously inside the user gesture.
    if (sidebarAction) void sidebarAction.toggle();
    else void openInTab("compress");
  });
}

extension.runtime.onInstalled.addListener(createMenus);
extension.runtime.onStartup.addListener(createMenus);
extension.contextMenus.onClicked.addListener((info) => {
  const tool = menuTools[String(info.menuItemId)];
  if (tool) void openInTab(tool);
});

extension.runtime.onMessage.addListener((message: AppMessage) => {
  if (message?.type === "open-tab") void openInTab(message.tool);
});
