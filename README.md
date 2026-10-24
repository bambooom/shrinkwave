# Shrinkwave

**English** · [中文](#中文)

A synthwave-flavored, Windows 98–style browser extension for compressing and stitching images — entirely on your device. Nothing is uploaded.

## Features

- **Compress & convert** to WebP, AVIF, JPEG or PNG (oxipng-optimized), in batches
- **Resize** by longest edge, with original and output dimensions shown side by side
- **Advanced options** per format: effort (WebP method / AVIF speed / oxipng level) and full-chroma (4:4:4 / sharp YUV) for crisp text in screenshots
- **Preview** original vs. result, and spot stale results when settings change ("Recompress")
- **Copy** results to the clipboard, save one by one, or download everything as a ZIP
- **Stitch** images vertically or horizontally into a single JPEG
- Add images by clicking, drag & drop, or paste (Ctrl/⌘+V)
- UI in English, 简体中文, 繁體中文 and 日本語

Encoding runs in Web Workers with WebAssembly codecs from [jSquash](https://github.com/jamsinclair/jSquash).

## Install from source

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run build
```

- **Chrome / Edge**: open `chrome://extensions`, enable Developer mode, click **Load unpacked** and choose `dist/`.
- **Firefox** (121+): run `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and choose `dist-firefox/manifest.json`.

Click the toolbar icon to open Shrinkwave in the side panel (sidebar in Firefox). The □ button in its title bar pops it out into a tab.

## Development

```bash
npm run dev               # Vite dev server (UI only, no extension APIs)
npm run build             # type-check + Chrome/Edge build to dist/
npm run build:firefox     # type-check + Firefox build to dist-firefox/
npm run package:chrome    # build and zip to shrinkwave-chrome.zip
npm run package:firefox   # build and zip to shrinkwave-firefox.zip
npm run icons             # regenerate public/icons/ from src/brand.ts
```

The manifest is generated per browser from `src/manifest.ts`, since Chrome and Firefox reject each other's side panel and background keys.

## Third-party licenses

- [jSquash](https://github.com/jamsinclair/jSquash) codecs — Apache-2.0
- [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font) — SIL OFL 1.1, see `public/licenses/fusion-pixel-font/`
- [fflate](https://github.com/101arrowz/fflate) — MIT

---

## 中文

[English](#shrinkwave) · **中文**

一个合成波（synthwave）配色、Windows 98 风格的浏览器扩展，用来压缩和拼接图片。所有处理都在本地完成，不上传任何文件。

## 功能

- **批量压缩 / 转换**为 WebP、AVIF、JPEG 或 PNG（PNG 使用 oxipng 无损优化）
- **按最长边缩放**，同时显示原始尺寸和输出尺寸
- **高级参数**按当前格式显示：压缩力度（WebP method / AVIF speed / oxipng 等级），以及保留色彩细节（4:4:4 / Sharp YUV），让截图里的文字更清晰
- **预览**原图和结果；修改参数后自动标出过期结果，一键「重新压缩」
- **复制**到剪贴板、单张保存，或打包下载 ZIP
- **拼接**多张图片为一张纵向或横向的 JPEG
- 支持点击选择、拖拽、粘贴（Ctrl/⌘+V）添加图片
- 界面支持 English、简体中文、繁體中文、日本語

编码在 Web Worker 中运行，使用 [jSquash](https://github.com/jamsinclair/jSquash) 的 WebAssembly 编解码器。

## 从源码安装

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run build
```

- **Chrome / Edge**：打开 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」，选择 `dist/`。
- **Firefox**（121+）：先运行 `npm run build:firefox`，打开 `about:debugging#/runtime/this-firefox`，点击「临时载入附加组件」，选择 `dist-firefox/manifest.json`。

点击工具栏图标即可在侧边栏（Firefox 为侧栏）打开 Shrinkwave，点标题栏的 □ 按钮可以弹出到标签页。

## 开发

```bash
npm run dev               # Vite 开发服务器（仅界面，无扩展 API）
npm run build             # 类型检查 + Chrome/Edge 构建到 dist/
npm run build:firefox     # 类型检查 + Firefox 构建到 dist-firefox/
npm run package:chrome    # 构建并打包为 shrinkwave-chrome.zip
npm run package:firefox   # 构建并打包为 shrinkwave-firefox.zip
npm run icons             # 根据 src/brand.ts 重新生成 public/icons/
```

manifest 由 `src/manifest.ts` 按浏览器分别生成，因为 Chrome 和 Firefox 互相不认对方的侧栏和后台脚本字段。

## 第三方许可

- [jSquash](https://github.com/jamsinclair/jSquash) 编解码器 — Apache-2.0
- [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font) 像素字体 — SIL OFL 1.1，见 `public/licenses/fusion-pixel-font/`
- [fflate](https://github.com/101arrowz/fflate) — MIT
