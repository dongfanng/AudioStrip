# 浏览器端视频音频提取技术方案

## 一、项目背景

- **需求**：从视频文件中提取音频流（如 MP3）
- **典型文件**：3-4 分钟视频，约 20-30MB
- **目标平台**：以 Android Chrome 为主
- **部署平台**：Cloudflare Pages（静态托管）
- **运行环境**：用户浏览器端
- **核心约束**：无需服务器，零成本，保护用户隐私

---

## 二、技术选型

| 方案 | 核心技术 | 部署方式 | 月成本 | 移动端支持 | 实现复杂度 |
|:---|:---|:---|:---|:---|:---|
| **ffmpeg.wasm** | WebAssembly 版 FFmpeg | Cloudflare Pages | ¥0 | Android 良好 / iOS 有限 | 中 |
| WebCodecs API | 浏览器原生编解码 | Cloudflare Pages | ¥0 | iOS 不支持 | 高 |
| VPS + 原生 FFmpeg | 系统级 FFmpeg | VPS（如 DigitalOcean） | ~¥35 | 全平台完美 | 低 |
| Cloudflare Containers | Docker + FFmpeg | Cloudflare Containers | ~¥35+ | 全平台完美 | 中 |

**最终推荐**：`ffmpeg.wasm` 单线程版本 + Cloudflare Pages，满足零成本、无服务器的核心诉求。

---

## 三、推荐方案概述

### 核心思路
- 将 FFmpeg 编译为 WebAssembly，直接在浏览器中运行
- 所有音视频处理在用户本地完成，文件不上传任何服务器
- 前端页面托管在 Cloudflare Pages，利用其全球 CDN 和免费额度

### 架构流程
1. 用户通过浏览器访问页面
2. 选择本地视频文件
3. 页面加载 `ffmpeg.wasm` 核心（约 31MB）
4. 在浏览器内存中执行 FFmpeg 命令提取音频
5. 生成 MP3 文件并提供下载

### 关键依赖
- `@ffmpeg/ffmpeg`：核心 WASM 封装库
- `@ffmpeg/util`：辅助工具（文件读取、URL 转换）
- `@ffmpeg/core`：单线程 WASM 核心文件（约 31MB）

### 线程模式选择

| 版本 | 包名 | 是否需要 COEP/COOP | 稳定性 | 适用场景 |
|:---|:---|:---|:---|:---|
| 单线程 | `@ffmpeg/core` | 否 | ✅ 稳定 | **本项目首选** |
| 多线程 | `@ffmpeg/core-mt` | 是（需 SharedArrayBuffer） | ⚠️ 官方称不稳定 | 需要并行处理的大文件场景 |

> 单线程版本无需配置跨域隔离头，部署更简单，兼容性更好。对于 3-4 分钟的小文件，单线程性能已足够。

---

## 四、项目架构

### 构建工具：Vite

采用 **Vite + 原生 JavaScript**，不引入框架。选择 Vite 的原因：

- ffmpeg.wasm 0.12+ 官方示例基于 ESM，Vite 原生支持 ESM，`import` 方式调用更自然
- 提供开发热更新，调试体验好
- 生产构建自动压缩 JS/CSS、生成资源哈希
- 对 Service Worker 和静态资源（WASM 文件）处理友好
- 配置极简，对纯 JS 项目几乎零配置

### 项目结构

```
AudioStrip/
├── index.html          # 入口页面
├── package.json
├── vite.config.js      # Vite 配置
├── public/
│   ├── ffmpeg/         # @ffmpeg/core 的 wasm 文件（本地打包，避免 CDN 依赖）
│   └── icon.svg        # 站点图标
└── src/
    ├── main.js         # 应用入口、UI 交互
    ├── ffmpeg.js       # ffmpeg 加载与音频提取逻辑
    └── sw.js           # Service Worker（缓存 WASM 核心）
```

### 模块职责

| 模块 | 职责 |
|:---|:---|
| `index.html` | 页面结构、文件选择、进度展示、下载入口 |
| `src/main.js` | UI 交互、文件大小预检、调用 ffmpeg 模块、触发下载 |
| `src/ffmpeg.js` | 加载 ffmpeg.wasm 核心、执行音频提取命令、上报进度 |
| `src/sw.js` | 缓存 WASM 核心与静态资源，实现二次访问秒加载 |
| `public/ffmpeg/` | 本地存放 `@ffmpeg/core` 的 wasm 文件，避免跨域和 CDN 风险 |

### 关键依赖版本

| 依赖 | 作用 |
|:---|:---|
| `vite` | 构建工具与开发服务器 |
| `@ffmpeg/ffmpeg` | ffmpeg.wasm JavaScript 封装 |
| `@ffmpeg/util` | 文件读取、URL 转换等工具 |
| `@ffmpeg/core` | 单线程 WASM 核心（本地打包至 public 目录） |

---

## 五、部署步骤

1. **本地构建**
   - 执行 `npm run build` 生成 `dist/` 目录
   - 构建产物包含压缩后的 HTML/JS/CSS 及本地 WASM 核心文件

2. **部署至 Cloudflare Pages**
   - 登录 Cloudflare Dashboard
   - 进入 Workers & Pages -> 创建应用程序 -> Pages
   - 上传 `dist/` 目录，或连接 Git 仓库配置自动构建
   - 完成部署，自动获得 `*.pages.dev` 域名

3. **访问与使用**
   - 通过分配的域名访问页面
   - 用户自行选择视频文件并提取音频

> 说明：单线程版本无需配置 `_headers` 跨域隔离头。若后续改用多线程版本，需额外设置 `Cross-Origin-Embedder-Policy: require-corp` 和 `Cross-Origin-Opener-Policy: same-origin`。

---

## 六、性能预期

ffmpeg.wasm 比原生 FFmpeg 慢约 10-50 倍（单线程）。针对本项目典型文件（3-4 分钟、20-30MB）的音频提取耗时估算：

| 平台 | 预估耗时 |
|:---|:---|
| 桌面 Chrome | 约 30-60 秒 |
| Android Chrome | 约 60-90 秒 |

> 建议在 UI 中通过 `ffmpeg.on('progress')` 回调向用户展示处理进度。

---

## 七、移动端兼容性说明

| 平台 | 兼容性 | 注意事项 |
|:---|:---|:---|
| Android (Chrome) | ✅ 良好 | 本项目主要目标平台，体验最佳 |
| Android (Firefox) | ✅ 支持 | 表现与 Chrome 接近 |
| iOS (Safari 15.2+) | ⚠️ 有限 | 内存限制严格，小文件可用但稳定性一般 |
| iOS (Chrome) | ⚠️ 有限 | 强制使用 WebKit 内核，继承 Safari 限制 |
| iOS (WebView) | ❌ 不支持 | SharedArrayBuffer 完全不支持 |

**针对本项目场景**：文件普遍较小（20-30MB），远低于 Android 端内存上限，OOM 风险极低。iOS 非主要目标平台，可作次要兼容或仅提示「实验性支持」。

---

## 八、方案优缺点

### 优点
- **零成本**：利用 Cloudflare Pages 免费额度
- **隐私安全**：文件完全本地处理，无上传风险
- **部署简单**：仅需静态托管，无需维护服务器，单线程版本无需额外响应头配置
- **功能完整**：支持多种视频格式，可灵活定制编码参数

### 缺点
- **加载时间**：首次使用需下载约 31MB 的 WASM 核心
- **性能受限**：依赖用户设备 CPU，处理速度较慢（见第六节）
- **iOS 兼容**：iOS 设备稳定性一般（本项目非主要平台，影响可控）

---

## 九、优化建议

1. **Service Worker 缓存 WASM 核心**
   - 首次加载约 31MB 后缓存到本地，第二次访问可秒加载
   - 成本：¥0，迁移成本低

2. **文件大小预检**
   - 上传前按平台提示上限，Android 建议不超过 200MB
   - 超限时直接拦截并提示，避免处理中途崩溃

3. **进度反馈**
   - 利用 `ffmpeg.on('progress')` 回调展示处理百分比
   - 配合加载状态提示，改善用户等待体验

---

## 十、备选方案建议

若 `ffmpeg.wasm` 方案在目标用户群体中体验不佳，可考虑：

| 备选方案 | 适用场景 | 成本变化 | 迁移成本 |
|:---|:---|:---|:---|
| **VPS 自建** | 追求稳定可靠 | ¥35/月 | 低（代码改动小） |
| **云函数中转** | iOS 用户占比高 | 低（约 ¥10/月） | 中（需编写云函数） |

> 对于本项目以 Android 为主、文件较小的场景，ffmpeg.wasm 单线程方案处于最佳舒适区，通常无需考虑备选方案。

---

## 十一、总结

本方案以 **`ffmpeg.wasm` 单线程版本 + Vite + Cloudflare Pages** 为核心，为零成本、无服务器的音视频处理提供了可行方案。针对本项目典型场景（3-4 分钟、20-30MB 视频，Android 为主），该方案处于 ffmpeg.wasm 的最佳适用范围，主要风险（iOS 兼容性、大文件 OOM）均不构成实质障碍。若后续用户规模扩大或对稳定性要求提高，可平滑迁移至 VPS 或云函数方案。

---

*文档版本：1.2*
*最后更新：2026-07-08*
