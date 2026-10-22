const extension = chrome;

extension.action.onClicked.addListener(async () => {
  const url = extension.runtime.getURL("index.html");
  const tabs = await extension.tabs.query({ url });

  if (tabs[0]?.id) {
    await extension.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId) await extension.windows.update(tabs[0].windowId, { focused: true });
    return;
  }

  await extension.tabs.create({ url });
});
