import { loadFFmpeg, extractAudio } from './ffmpeg.js';

// 文件大小上限（按平台区分，单位 MB）
const SIZE_LIMITS = {
  android: 200,
  ios: 100,
  desktop: 500,
};

// 获取当前平台
function getPlatform() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'desktop';
}

// 格式化文件大小
function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// DOM 引用
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const extractBtn = document.getElementById('extractBtn');
const downloadBtn = document.getElementById('downloadBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const status = document.getElementById('status');
const formatBtns = document.querySelectorAll('.format-btn');

let selectedFile = null;
let selectedFormat = 'mp3';
let resultBlob = null;

// 设置状态文字
function setStatus(text, type = '') {
  status.textContent = text;
  status.className = 'status' + (type ? ' ' + type : '');
}

// 设置进度
function setProgress(percent, text) {
  progressFill.style.width = percent + '%';
  progressText.textContent = text || `${percent}%`;
}

// 文件选择处理
function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith('video/')) {
    setStatus('请选择视频文件', 'error');
    return;
  }

  const platform = getPlatform();
  const limit = SIZE_LIMITS[platform];
  const sizeMB = file.size / 1024 / 1024;

  if (sizeMB > limit) {
    setStatus(`文件过大（${formatSize(file.size)}），当前平台建议不超过 ${limit}MB`, 'error');
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatSize(file.size);
  fileInfo.classList.add('show');
  extractBtn.disabled = false;
  resultBlob = null;
  downloadBtn.classList.remove('show');
  setStatus('');
}

// 选择文件事件
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

// 格式切换
formatBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    formatBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedFormat = btn.dataset.format;
    // 切换格式后隐藏上次的下载按钮
    resultBlob = null;
    downloadBtn.classList.remove('show');
  });
});

// 提取音频
extractBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  extractBtn.disabled = true;
  progressWrap.classList.add('show');
  setProgress(0, '正在下载处理引擎（约 31MB），请耐心等待...');

  try {
    // 加载 ffmpeg 核心（首次需下载约 31MB）
    await loadFFmpeg();
    setProgress(0, '正在提取音频...');

    // 提取音频
    resultBlob = await extractAudio(selectedFile, (percent) => {
      setProgress(percent);
    }, selectedFormat);

    setProgress(100, '提取完成');
    setStatus('音频提取完成，点击下方按钮下载', 'success');

    // 显示下载按钮
    const ext = selectedFormat;
    const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
    downloadBtn.textContent = `下载 ${baseName}.${ext}`;
    downloadBtn.classList.add('show');
  } catch (err) {
    console.error(err);
    setStatus('提取失败：' + (err.message || '未知错误'), 'error');
    setProgress(0, '处理失败');
  } finally {
    extractBtn.disabled = false;
  }
});

// 下载
downloadBtn.addEventListener('click', () => {
  if (!resultBlob) return;
  const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
  const url = URL.createObjectURL(resultBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}.${selectedFormat}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Service Worker：dev 模式主动注销旧 SW（避免拦截 Vite 请求），生产模式注册
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    // dev 模式：主动注销所有旧 Service Worker
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => reg.unregister());
      if (registrations.length) {
        console.log('[AudioStrip] 已注销旧的 Service Worker，请刷新页面');
      }
    });
  }
}
