const extension = chrome;
// Firefox exposes the sidebar through `browser.sidebarAction` instead of `chrome.sidePanel`.
const sidebarAction = (globalThis as { browser?: { sidebarAction?: { toggle(): Promise<void> } } }).browser
  ?.sidebarAction;

async function openInTab() {
  const url = extension.runtime.getURL("index.html");
  const tabs = await extension.tabs.query({ url });

  if (tabs[0]?.id) {
    await extension.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId) await extension.windows.update(tabs[0].windowId, { focused: true });
    return;
  }

  await extension.tabs.create({ url });
}

if (extension.sidePanel?.setPanelBehavior) {
  // The action click then opens the panel itself and onClicked never fires.
  extension.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
} else {
  extension.action.onClicked.addListener(() => {
    // toggle() must run synchronously inside the user gesture.
    if (sidebarAction) void sidebarAction.toggle();
    else void openInTab();
  });
}

extension.runtime.onMessage.addListener((message: unknown) => {
  if (message === "open-tab") void openInTab();
});
