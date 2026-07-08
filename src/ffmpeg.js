import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
// 使用 Vite 的 ?worker&url 导入 worker，绕过 @ffmpeg/ffmpeg 内部
// new URL("./worker.js", import.meta.url) 在 Vite 预构建下路径解析错误的问题
import workerUrl from '@ffmpeg/ffmpeg/worker?worker&url';

const ffmpeg = new FFmpeg();
let loaded = false;

// 音频格式对应的编码参数
const FORMAT_ARGS = {
  mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  aac: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
};

const MIME_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
};

/**
 * 加载 ffmpeg.wasm 核心（单线程版本，约 31MB）
 * @param {(msg: string) => void} onLog - 日志回调（可选）
 */
export async function loadFFmpeg(onLog) {
  if (loaded) return;

  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }

  // 从 CDN 加载 ffmpeg core（避免本地 32MB 文件超出 Cloudflare Pages 25MB 限制）
  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    classWorkerURL: workerUrl,
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  loaded = true;
}

/**
 * 从视频文件中提取音频
 * @param {File} file - 视频文件
 * @param {(percent: number) => void} onProgress - 进度回调（0-100）
 * @param {string} format - 输出格式：mp3 / wav / aac
 * @returns {Promise<Blob>} 音频 Blob
 */
export async function extractAudio(file, onProgress, format = 'mp3') {
  const ext = file.name.split('.').pop() || 'mp4';
  const input = `input.${ext}`;
  const output = `output.${format}`;
  const args = FORMAT_ARGS[format] || FORMAT_ARGS.mp3;

  const progressHandler = ({ progress }) => {
    if (onProgress) {
      const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
      onProgress(percent);
    }
  };
  ffmpeg.on('progress', progressHandler);

  try {
    await ffmpeg.writeFile(input, await fetchFile(file));
    await ffmpeg.exec(['-i', input, ...args, output]);
    const data = await ffmpeg.readFile(output);

    // 清理虚拟文件系统，释放内存
    await ffmpeg.deleteFile(input);
    await ffmpeg.deleteFile(output);

    return new Blob([data.buffer], { type: MIME_TYPES[format] || MIME_TYPES.mp3 });
  } finally {
    ffmpeg.off('progress', progressHandler);
  }
}
