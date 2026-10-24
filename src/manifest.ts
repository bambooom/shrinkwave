export type Browser = "chrome" | "firefox";

const icons = {
  "16": "icons/icon-16.png",
  "32": "icons/icon-32.png",
  "48": "icons/icon-48.png",
  "128": "icons/icon-128.png",
};
const toolbarIcon = { "16": icons["16"], "32": icons["32"] };

// Each browser rejects or warns about the other's keys, so emit one manifest per target.
export function manifest(browser: Browser, version: string) {
  const base = {
    manifest_version: 3,
    name: "__MSG_extName__",
    short_name: "Shrinkwave",
    version,
    description: "__MSG_extDescription__",
    default_locale: "en",
    icons,
    action: { default_title: "__MSG_actionTitle__", default_icon: toolbarIcon },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  };

  if (browser === "chrome") {
    return {
      ...base,
      side_panel: { default_path: "index.html" },
      background: { service_worker: "background.js", type: "module" },
      permissions: ["downloads", "sidePanel", "contextMenus"],
    };
  }

  return {
    ...base,
    sidebar_action: {
      default_panel: "index.html",
      default_title: "__MSG_actionTitle__",
      default_icon: toolbarIcon,
      open_at_install: false,
    },
    background: { scripts: ["background.js"], type: "module" },
    permissions: ["downloads", "contextMenus"],
    browser_specific_settings: {
      gecko: { id: "shrinkwave@example.com", strict_min_version: "121.0" },
    },
  };
}
