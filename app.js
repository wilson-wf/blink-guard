/*
 * AI 智能坐姿护眼学习助手 —— "眨眨" 护眼小怪兽（PWA 桌宠版）
 * 作者：〔宝宝姓名〕
 * 平台：手机浏览器（iOS Safari / 安卓 Chrome），无需笔记本
 * 架构：单手机端到端运行，MediaPipe Pose 人体姿态检测（正面/侧面/背面均可用）
 *
 * 界面：桌宠模式 —— 卡通小怪兽"眨眨"在前台，摄像头在后台检测
 */

// ============ 调试日志面板（拦截 console 输出到页面 + 推送到 console.re 远程） ============
(function initDebugPanel() {
  const debugLog = [];
  const MAX_LOGS = 200;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  // console.re 日志缓冲区：connector.js 加载前的日志先缓存，加载完后批量推送
  const consoleReBuffer = [];
  const MAX_BUFFER = 300;
  let consoleReReady = false;

  function argsToMsg(args) {
    return args.map(a => {
      if (a instanceof Error) return a.message;
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch(e) { return String(a); } }
      return String(a);
    }).join(' ');
  }

  function addToDebugPanel(level, args) {
    const time = new Date().toLocaleTimeString();
    const line = `[${time}] [${level}] ${argsToMsg(args)}`;
    debugLog.push(line);
    if (debugLog.length > MAX_LOGS) debugLog.shift();
    const panel = document.getElementById('debugLog');
    if (panel) {
      panel.textContent = debugLog.join('\n');
      panel.scrollTop = panel.scrollHeight;
    }
  }

  // 把日志推送到 console.re 远程服务器
  function pushToConsoleRe(level, args) {
    try {
      const msg = argsToMsg(args);
      const re = window.console && window.console.re;
      const canSend = re && typeof re.log === 'function';
      if (!canSend) {
        // connector.js 还没加载好，先缓存
        consoleReBuffer.push({ level, msg });
        if (consoleReBuffer.length > MAX_BUFFER) consoleReBuffer.shift();
        return;
      }
      // 可用 → 先把缓冲区里积压的日志全部推送（按时间顺序）
      if (consoleReBuffer.length) {
        const batch = consoleReBuffer.splice(0, consoleReBuffer.length);
        for (const item of batch) {
          if (item.level === 'WARN' && re.warn) re.warn(item.msg);
          else if (item.level === 'ERROR' && re.error) re.error(item.msg);
          else re.log(item.msg);
        }
      }
      // 推送当前这条
      if (level === 'WARN' && re.warn) re.warn(msg);
      else if (level === 'ERROR' && re.error) re.error(msg);
      else re.log(msg);
    } catch(e) { /* 忽略推送失败 */ }
  }

  // 轮询检测 console.re connector.js 是否加载完成，加载完后把缓冲区日志推送出去
  function checkConsoleReReady() {
    const re = window.console && window.console.re;
    if (re && typeof re.log === 'function') {
      if (!consoleReReady) {
        consoleReReady = true;
        // 触发一次日志推送，把缓冲区刷出去
        console.log('[Debug] console.re 已连接，远程日志开始推送');
      }
    }
  }
  // 每 500ms 检测一次，最多检测 30 秒
  let _checkCount = 0;
  const _checkTimer = setInterval(() => {
    checkConsoleReReady();
    _checkCount++;
    if (_checkCount > 60 || consoleReReady) clearInterval(_checkTimer);
  }, 500);

  console.log = function(...args) { addToDebugPanel('LOG', args); pushToConsoleRe('LOG', args); originalLog.apply(console, args); };
  console.warn = function(...args) { addToDebugPanel('WARN', args); pushToConsoleRe('WARN', args); originalWarn.apply(console, args); };
  console.error = function(...args) { addToDebugPanel('ERROR', args); pushToConsoleRe('ERROR', args); originalError.apply(console, args); };

  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('debugBtn');
    const panel = document.getElementById('debugPanel');
    if (btn && panel) {
      btn.onclick = () => { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; };
      document.getElementById('debugCloseBtn').onclick = () => { panel.style.display = 'none'; };
      document.getElementById('debugClearBtn').onclick = () => { debugLog.length = 0; document.getElementById('debugLog').textContent = ''; };
    }
  });

  console.log('[Debug] 日志面板已启动，页面右下角🐞按钮可查看');
})();

// ============ 环境信息日志（方便远程诊断） ============
// 日志缓冲区机制保证：即使 connector.js 还没加载完，环境信息也会被缓存，加载后自动推送
function logEnv() {
  console.log('[Env] UA:', navigator.userAgent);
  console.log('[Env] 平台:', navigator.platform);
  console.log('[Env] 语言:', navigator.language);
  console.log('[Env] SpeechRecognition:', !!(window.SpeechRecognition || window.webkitSpeechRecognition) ? '支持' : '不支持');
  console.log('[Env] speechSynthesis:', 'speechSynthesis' in window ? '支持' : '不支持');
  console.log('[Env] getUserMedia:', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? '支持' : '不支持');
  console.log('[Env] isSecureContext:', window.isSecureContext);
}
logEnv();

// ============ Supabase 用户登录与云端配置同步 ============
const SUPABASE_URL = 'https://ibwbebrwyjjukmmsfipa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlid2JlYnJ3eWpqdWttbXNmaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzODA3OTMsImV4cCI6MjEwNTk1Njc5M30.ExEFlGoweEqlx1wjNeHPBTaqlhfBUF7BP6VRIX616vg';
let supabaseClient = null;
let currentUser = null;

function initSupabase() {
  if (typeof window.supabase === 'undefined') {
    console.warn('[Auth] Supabase SDK 未加载，跳过登录功能');
    return false;
  }
  if (supabaseClient) return true; // 防止重复初始化
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  console.log('[Auth] Supabase 客户端已初始化');
  return true;
}

// Supabase SDK 改为 async 加载后，需要轮询等待它就绪再初始化登录态
// 这样不阻塞首屏渲染，登录功能在 SDK 加载完后自动就绪
let _supabaseWaitCount = 0;
function initSupabaseWhenReady() {
  if (initSupabase()) {
    initAuthState();
    return;
  }
  _supabaseWaitCount++;
  if (_supabaseWaitCount > 200) { // 约 20 秒超时
    console.warn('[Auth] Supabase SDK 等待超时，登录功能不可用（可能 CDN 被屏蔽）');
    return;
  }
  setTimeout(initSupabaseWhenReady, 100);
}

// 把手机号转成虚拟邮箱（Supabase 需要邮箱格式，不发短信就用 @blink.local 占位）
function phoneToEmail(phone) {
  return phone.replace(/\D/g, '') + '@blink.local';
}

// 当前是否已登录
function isLoggedIn() {
  return !!currentUser;
}
function getCurrentPhone() {
  if (!currentUser) return '';
  return (currentUser.email || '').replace('@blink.local', '');
}

// ============ 参数配置 ============
const CONFIG = {
  FACE_WIDTH_REAL_CM: 14.0,
  FOCAL_PX: 600.0,
  DIST_TOO_CLOSE: 40.0,
  DIST_TOO_FAR: 70.0,
  // 姿态偏离基线的警告阈值（基于校准后的相对量）
  TORSO_WARN: 20.0,          // 躯干倾斜超过此值（驼背/前倾/趴着）
  SHOULDER_TILT_WARN: 15.0,  // 肩膀高低差超过此值（歪身子/侧躺）
  HEAD_FORWARD_WARN: 20.0,   // 头部前探超过此值（头前倾）
  // 距离过近判定：身体大小相对基线的倍率
  CLOSE_BODY_RATIO: 1.35,
  // 校准
  CALIB_DURATION_MS: 3000,   // 校准时长 3 秒
  CALIB_MIN_SAMPLES: 8,      // 校准最少采样数
  // 情景感知
  SCENE_HISTORY_FRAMES: 30,  // 场景判断用的历史帧数（约1-2秒）
  SCENE_MOVE_THRESHOLD: 0.08, // 位置方差超过此值判定为"在移动"（归一化坐标）
  FALL_HEIGHT_DROP: 0.25,    // 髋部高度下降超过此比例判定为摔倒
  FALL_HOLD_FRAMES: 45,      // 低位持续帧数（约1.5秒）确认摔倒
  DANGER_CLOSE_RATIO: 1.8,   // 身体大小超过基线此倍数=太靠近镜头
  BAD_HOLD_MS: 3000,
  WARN_INTERVAL_MS: 10000,
  WORK_DURATION: 20 * 60,
  REST_DURATION: 20,
  CANVAS_W: 640,
  CANVAS_H: 480,
};

// ============ DOM ============
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const loadingEl = document.getElementById('loading');
const noCameraEl = document.getElementById('noCamera');
const progressFill = document.getElementById('progressFill');
const timeText = document.getElementById('timeText');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const restBtn = document.getElementById('restBtn');
const camBtn = document.getElementById('camBtn');
const voiceBtn = document.getElementById('voiceBtn');
const closeCam = document.getElementById('closeCam');
const camPanel = document.getElementById('camPanel');
const badCountEl = document.getElementById('badCount');
const closeCountEl = document.getElementById('closeCount');
const restCountEl = document.getElementById('restCount');
const logList = document.getElementById('logList');
const clearLogBtn = document.getElementById('clearLog');
const installBtn = document.getElementById('installBtn');
const bubbleText = document.getElementById('bubbleText');
const petStatus = document.getElementById('petStatus');
const pet = document.getElementById('pet');

canvas.width = CONFIG.CANVAS_W;
canvas.height = CONFIG.CANVAS_H;

// ============ 状态 ============
const state = {
  running: false,
  paused: false,
  inRest: false,
  workSeconds: 0,
  restSeconds: 0,
  badCount: 0,
  closeCount: 0,
  restCount: 0,
  badHoldStart: 0,
  lastWarnTime: 0,
  speechUnlocked: false,
  tickHandle: null,
  // 校准相关
  calibrating: false,
  calibStartTime: 0,
  calibSamples: [],
  calibrated: false,
  baselineTorso: 0,
  baselineShoulderTilt: 0,
  baselineHeadForward: 0,
  baselineBodySize: 0,
  // 情景感知模式
  mode: 'auto',           // 'auto' | 'learn' | 'play'
  detectedScene: 'unknown', // 'learning' | 'playing'
  positionHistory: [],    // 最近 N 帧的人体中心位置，用于判断是否在移动
  heightHistory: [],      // 最近 N 帧的髋部高度，用于摔倒检测
  fallWarnTime: 0,        // 上次摔倒提醒时间
  stillFrames: 0,         // 连续静止帧数
  lastScene: 'unknown',
};

// ============ 语音 ============
let chineseVoice = null;
let speechEnabled = false;
let audioCtx = null;
let speakQueue = [];      // 语音队列
let isSpeaking = false;   // 是否正在播放
let lastSpeechError = ''; // 最近一次错误
let voicesLoaded = false; // 语音列表是否已加载
let ttsSupported = false;  // 浏览器是否支持 TTS
let ttsHasChinese = false; // 是否有中文语音
let asrSupported = false;  // 浏览器是否支持语音识别(SpeechRecognition)
let micPermission = 'unknown'; // 麦克风权限状态: granted | denied | prompt | unknown
let micTestStream = null;  // 麦克风测试用的 stream

function updateVoiceStatus() {
  const el = document.getElementById('voiceStatus');
  if (!el) return;
  if (!ttsSupported) {
    el.textContent = '🔇 语音不可用';
    el.className = 'voice-status bad';
    el.title = '当前浏览器不支持语音合成，将使用蜂鸣音提示';
    return;
  }
  if (!voicesLoaded) {
    el.textContent = '🔊 语音加载中…';
    el.className = 'voice-status warn';
    return;
  }
  if (!ttsHasChinese) {
    // 无本地中文语音，但有在线 TTS 兜底
    el.textContent = '🌐 在线语音';
    el.className = 'voice-status ok';
    el.title = '无本地中文语音引擎，已自动切换到在线语音合成（需联网）';
    return;
  }
  if (!speechEnabled) {
    el.textContent = '🔊 点击按钮激活';
    el.className = 'voice-status warn';
    el.title = '点击"开始护眼"或"语音诊断"激活语音';
    return;
  }
  el.textContent = '🔊 语音可用';
  el.className = 'voice-status ok';
  el.title = '语音功能正常';
}

function loadVoices() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  chineseVoice = voices.find(v => /zh|Chinese|cmn/i.test(v.lang + v.name)) || null;
  voicesLoaded = voices.length > 0;
  ttsHasChinese = !!chineseVoice;
  console.log('[TTS] voices:', voices.length, 'chineseVoice:', chineseVoice?.name || '无');
  updateVoiceStatus();
}
if ('speechSynthesis' in window) {
  ttsSupported = true;
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
  setTimeout(loadVoices, 1000);
  setTimeout(loadVoices, 3000);
} else {
  ttsSupported = false;
}
updateVoiceStatus();

// ============ 在线 TTS 降级（鸿蒙等无本地中文语音引擎时使用） ============
// 百度翻译 TTS 接口，无需 API Key，返回 MP3 音频（已验证可用）
// 备用接口：有道 TTS、Google Translate TTS
// 百度 spd 参数：语速 1(慢)~15(快)，默认5
function getBaiduSpd(rate) {
  // 将 rate(0.5~2.0) 映射到 spd(1~15)
  const spd = Math.round(3 + (rate - 0.85) * 10);
  return Math.max(1, Math.min(15, spd));
}
const ONLINE_TTS_ENDPOINTS = [
  (text) => `https://fanyi.baidu.com/gettts?lan=zh&text=${encodeURIComponent(text)}&spd=${getBaiduSpd(getVoiceStyle().rate)}&source=web`,
  (text) => `https://tts.youdao.com/fanyivoice?word=${encodeURIComponent(text)}&le=zh&keyfrom=speaker-target`,
  (text) => `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=zh-CN&client=tw-ob`,
];

// 声音风格：调整音调(pitch)和语速(rate)实现不同音色
// 本地语音用 pitch/rate，在线 TTS(百度)用 playbackRate 变调 + spd 变速
const VOICE_STYLES = {
  normal:  { rate: 1.0,  pitch: 1.0, label: '普通' },
  child:   { rate: 1.2,  pitch: 1.7, label: '儿童' },   // 小朋友声音
  cartoon: { rate: 1.4,  pitch: 2.0, label: '卡通' },   // 卡通搞怪
  gentle:  { rate: 0.9,  pitch: 1.3, label: '温柔' },   // 温柔姐姐
  lively:  { rate: 1.3,  pitch: 1.5, label: '活泼' },   // 活泼少女
  robot:   { rate: 1.1,  pitch: 0.7, label: '机器人' }, // 机器人
  deep:    { rate: 0.85, pitch: 0.5, label: '低沉' },   // 低沉大叔
  jieje:   { rate: 1.0,  pitch: 1.5, label: '姐姐' },   // 小姐姐
};
let currentVoiceStyle = 'child';  // 默认儿童音

function getVoiceStyle() { return VOICE_STYLES[currentVoiceStyle] || VOICE_STYLES.normal; }
updateVoiceStyleBtn();  // 在 VOICE_STYLES 定义后初始化按钮文字

function onlineTts(text) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.referrerPolicy = 'no-referrer';  // 不发送 Referer，绕过百度的防盗链
    // 应用声音风格：playbackRate 同时改变音调和语速
    audio.playbackRate = getVoiceStyle().rate;
    let endpointIndex = 0;

    function tryNextEndpoint() {
      if (endpointIndex >= ONLINE_TTS_ENDPOINTS.length) {
        reject(new Error('所有在线TTS接口均失败'));
        return;
      }
      const url = ONLINE_TTS_ENDPOINTS[endpointIndex](text);
      endpointIndex++;
      audio.src = url;
      audio.oncanplaythrough = () => {
        audio.play().then(() => {}).catch((e) => {
          console.warn('[TTS] online play failed:', e);
          tryNextEndpoint();
        });
      };
      audio.onerror = () => {
        console.warn('[TTS] online endpoint failed, trying next...');
        tryNextEndpoint();
      };
    }

    audio.onended = () => resolve();
    tryNextEndpoint();

    // 超时兜底：8秒未播放完成则视为失败
    setTimeout(() => {
      if (!audio.paused) {
        audio.pause();
      }
    }, 8000);
  });
}

// 蜂鸣音降级（TTS 不可用时用 Web Audio 提示）
function beep(freq = 800, duration = 200) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.3;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration / 1000);
    osc.stop(audioCtx.currentTime + duration / 1000);
  } catch (e) { console.warn('蜂鸣不可用', e); }
}

// 从队列取下一条播放
function playNext() {
  if (isSpeaking) return;
  if (speakQueue.length === 0) return;
  const text = speakQueue.shift();
  isSpeaking = true;

  // 无本地中文语音时，使用在线 TTS（鸿蒙浏览器等场景）
  if (!chineseVoice) {
    onlineTts(text).then(() => {
      console.log('[TTS] online onend');
      isSpeaking = false;
      setTimeout(playNext, 100);
    }).catch((e) => {
      console.warn('[TTS] online failed:', e);
      lastSpeechError = 'online-failed';
      // 在线 TTS 也失败时，用蜂鸣音兜底
      beep(880, 150);
      isSpeaking = false;
      setTimeout(playNext, 100);
    });
    return;
  }

  // 有本地中文语音，使用 speechSynthesis
  try {
    if (!('speechSynthesis' in window)) {
      beep(880, 150);
      isSpeaking = false;
      playNext();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    // 应用声音风格
    const style = getVoiceStyle();
    u.rate = style.rate;
    u.pitch = style.pitch;
    u.volume = 1.0;
    if (chineseVoice) u.voice = chineseVoice;
    u.onstart = () => { console.log('[TTS] onstart:', text); };
    u.onend = () => {
      console.log('[TTS] onend');
      isSpeaking = false;
      setTimeout(playNext, 100);
    };
    u.onerror = (e) => {
      console.warn('[TTS] onerror:', e.error, text);
      lastSpeechError = e.error || 'unknown';
      isSpeaking = false;
      // 本地 TTS 失败时，尝试在线 TTS，再失败用蜂鸣音
      onlineTts(text).then(() => {
        setTimeout(playNext, 100);
      }).catch(() => {
        beep(880, 150);
        setTimeout(playNext, 100);
      });
    };
    window.speechSynthesis.speak(u);
    // 有些安卓设备 speak 后不触发 onstart/onend，设超时兜底
    setTimeout(() => {
      if (isSpeaking && !window.speechSynthesis.speaking) {
        console.warn('[TTS] 超时未播放，尝试在线TTS');
        isSpeaking = false;
        onlineTts(text).then(() => {
          setTimeout(playNext, 100);
        }).catch(() => {
          beep(880, 150);
          playNext();
        });
      }
    }, 1500);
  } catch (e) {
    console.warn('[TTS] speak 异常:', e);
    lastSpeechError = String(e);
    isSpeaking = false;
    // 本地异常时尝试在线 TTS
    onlineTts(text).then(() => {
      setTimeout(playNext, 100);
    }).catch(() => {
      beep(880, 150);
      setTimeout(playNext, 100);
    });
  }
}

function speak(text) {
  if (!speechEnabled) {
    beep(880, 150);
    return;
  }
  speakQueue.push(text);
  playNext();
}

// 在用户点击时解锁语音（必须在用户手势同步回调中调用）
function unlockSpeech() {
  try {
    // 解锁 Web Audio
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    // 解锁 HTMLMediaElement（用于在线 TTS 的 new Audio().play()）
    // 播放一个极短的静音音频来解锁媒体播放权限
    const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    silent.volume = 0;
    silent.play().catch(() => {});
    speechEnabled = true;
  } catch (e) {}
  updateVoiceStatus();
}

// TTS 诊断（用户可点击查看）
function ttsDiagnose() {
  const info = [];
  info.push(`【语音合成(TTS)】`);
  info.push(`speechSynthesis: ${'speechSynthesis' in window ? '✅支持' : '❌不支持'}`);
  if ('speechSynthesis' in window) {
    const voices = window.speechSynthesis.getVoices();
    info.push(`语音数: ${voices.length}`);
    info.push(`中文语音: ${chineseVoice ? '✅' + chineseVoice.name : '❌无(用在线TTS)'}`);
    info.push(`speaking: ${window.speechSynthesis.speaking}`);
    info.push(`pending: ${window.speechSynthesis.pending}`);
  }
  info.push(`TTS 模式: ${chineseVoice ? '🗣️ 本地语音' : '🌐 在线语音(百度)'}`);
  info.push(`在线TTS备用: 有道 / Google`);
  info.push(`最后错误: ${lastSpeechError || '无'}`);
  info.push(`speechEnabled: ${speechEnabled}`);
  info.push(``);
  info.push(`【语音识别(ASR)】`);
  info.push(`SpeechRecognition: ${asrSupported ? '✅支持' : '❌不支持(用文字输入)'}`);
  info.push(`麦克风权限: ${micPermission}`);
  info.push(`当前声音风格: ${getVoiceStyle().label}`);
  info.push(``);
  info.push(`【AI 大模型】`);
  const prov = LLM_PROVIDERS[getLlmProvider()];
  info.push(`平台: ${prov.name}${hasLlmKey() ? ' (✅已配置)' : ' (❌未配置)'}`);
  info.push(`模型: ${getLlmModel()}`);
  info.push(`对话历史: ${chatHistory.length} 条`);
  info.push(``);
  info.push(`提示：不支持语音识别的浏览器（如鸿蒙自带浏览器）`);
  info.push(`可以用"💬文字"按钮跟眨眨聊天。`);
  info.push(`配置大模型后眨眨就能自由对话啦～推荐硅基流动（永久免费）`);
  alert(info.join('\n'));
}

// ============ 语音识别（用户说话 → 眨眨回应） ============
let recognition = null;
let isListening = false;
let recognitionTimer = null;     // 超时定时器
let recognitionStartTimer = null;  // 启动超时定时器（onstart 没触发时的安全网）
let recognitionAttempts = 0;     // 连续失败次数
const RECOGNITION_TIMEOUT = 8000; // 8秒没结果就自动停止
const START_TIMEOUT = 3000;       // 3秒内 onstart 没触发就降级（鸿蒙常见问题）

// 检测语音识别是否支持
asrSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// 检测麦克风权限状态（不弹窗，仅查询）
async function checkMicPermission() {
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({ name: 'microphone' });
      micPermission = result.state; // 'granted' | 'denied' | 'prompt'
      result.onchange = () => { micPermission = result.state; updateMicStatus(); };
    } else {
      micPermission = 'unknown';
    }
  } catch (e) {
    micPermission = 'unknown';
  }
  updateMicStatus();
  return micPermission;
}

// 更新麦克风状态显示
function updateMicStatus() {
  const el = document.getElementById('micStatus');
  if (!el) return;
  let text = '', cls = '', title = '';
  if (!asrSupported) {
    text = '🎤 需文字输入';
    cls = 'warn';
    title = '当前浏览器不支持语音识别，请使用"文字"按钮跟眨眨聊天';
  } else if (micPermission === 'granted') {
    text = '🎤 麦克风已允许';
    cls = 'ok';
    title = '麦克风权限已允许，点击"对话"按钮即可说话';
  } else if (micPermission === 'denied') {
    text = '🎤 麦克风被拒绝';
    cls = 'bad';
    title = '麦克风权限被拒绝，请在浏览器设置中允许';
  } else if (micPermission === 'prompt') {
    text = '🎤 点击授权麦克风';
    cls = 'warn';
    title = '点击"对话"按钮时会弹出麦克风授权请求';
  } else {
    text = '🎤 麦克风状态未知';
    cls = 'warn';
    title = '无法检测麦克风权限，点击"对话"试试';
  }
  el.textContent = text;
  el.className = 'voice-status ' + cls;
  el.title = title;
}

// 启动时检测
checkMicPermission();

// 清除超时定时器
function clearRecognitionTimer() {
  if (recognitionTimer) {
    clearTimeout(recognitionTimer);
    recognitionTimer = null;
  }
  if (recognitionStartTimer) {
    clearTimeout(recognitionStartTimer);
    recognitionStartTimer = null;
  }
}

function initVoiceRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    asrSupported = false;
    updateMicStatus();
    return false;
  }
  asrSupported = true;
  recognition = new SR();
  // 尝试多种中文语言编码，提高兼容性
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    clearRecognitionTimer();  // 清除启动超时（onstart 已触发）
    isListening = true;
    recognitionAttempts = 0;
    voiceBtn.textContent = '🔴 聆听中…';
    setBubble('我在听~请说话');
    console.log('[语音识别] onstart - 开始监听');

    // 超时保护：8秒没任何回调就自动停止，并降级到 Whisper
    clearRecognitionTimer();
    recognitionTimer = setTimeout(() => {
      console.warn('[语音识别] 超时，强制停止');
      try { recognition.stop(); } catch (e) {}
      isListening = false;
      voiceBtn.textContent = '🎤 对话';
      recognitionAttempts++;
      if (recognitionAttempts >= 2) {
        // 连续超时2次，说明这个浏览器的语音识别不能用，降级到 Whisper
        console.log('[语音识别] 连续超时，降级到 Whisper WASM');
        speak('语音识别没反应，正在切换到离线识别模式…');
        startWhisperRecognition();
      } else {
        speak('没听到声音，再说一次试试');
      }
    }, RECOGNITION_TIMEOUT);
  };

  // 诊断事件：帮助判断卡在哪一步
  recognition.onaudiostart = () => console.log('[语音识别] 音频采集已开始');
  recognition.onsoundstart = () => console.log('[语音识别] 检测到声音');
  recognition.onspeechstart = () => console.log('[语音识别] 检测到语音');

  recognition.onresult = (event) => {
    clearRecognitionTimer();
    const text = event.results[0][0].transcript.trim();
    console.log('[语音识别] 识别结果:', text);
    recognitionAttempts = 0;
    handleVoiceCommand(text);
  };

  recognition.onerror = (event) => {
    clearRecognitionTimer();
    console.warn('[语音识别] 错误:', event.error);
    isListening = false;
    voiceBtn.textContent = '🎤 对话';

    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      // 鸿蒙/国产浏览器常见：有 SpeechRecognition 对象但服务不可用
      // 自动降级到 Whisper WASM 方案
      console.log('[语音识别] 服务不可用，降级到 Whisper WASM');
      speak('语音识别服务不可用，正在切换到离线识别模式…');
      startWhisperRecognition();
    } else if (event.error === 'no-speech') {
      speak('没听清，再说一次吧');
    } else if (event.error === 'audio-capture') {
      speak('麦克风被占用了，关闭其他录音应用再试');
    } else if (event.error === 'network') {
      // 网络错误也降级到 Whisper
      console.log('[语音识别] 网络错误，降级到 Whisper WASM');
      speak('网络语音识别用不了，正在切换到离线识别模式…');
      startWhisperRecognition();
    } else if (event.error === 'aborted') {
      // 用户主动停止或超时停止，不额外提示
    } else {
      // 其他错误也尝试 Whisper 降级
      console.log('[语音识别] 未知错误，降级到 Whisper WASM');
      startWhisperRecognition();
    }
  };

  recognition.onend = () => {
    clearRecognitionTimer();
    isListening = false;
    voiceBtn.textContent = '🎤 对话';
    console.log('[语音识别] onend - 监听结束');
  };

  return true;
}

// ============ Whisper WASM 语音识别（纯前端降级方案，适配鸿蒙等不支持 SpeechRecognition 的浏览器） ============
let whisperPipe = null;      // Whisper 识别管道（加载后缓存）
let whisperLoading = false;  // 是否正在加载模型
let whisperRecorder = null;  // MediaRecorder 实例
let whisperStream = null;    // 音频流
const WHISPER_MODEL = 'Xenova/whisper-tiny'; // tiny 模型约40MB，速度快

// 动态加载 Whisper 模型
async function loadWhisperModel() {
  if (whisperPipe) return whisperPipe;
  if (whisperLoading) {
    // 正在加载，等待完成
    while (whisperLoading) { await new Promise(r => setTimeout(r, 200)); }
    return whisperPipe;
  }
  whisperLoading = true;
  setBubble('正在加载语音识别模型（约40MB，首次较慢）…');
  console.log('[Whisper] 开始加载模型:', WHISPER_MODEL);
  try {
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    // 使用国内镜像加速模型下载（HuggingFace 国内访问慢）
    env.remoteHost = 'https://hf-mirror.com';
    env.remotePathTemplate = '{model}/resolve/{revision}/{file}';
    whisperPipe = await pipeline('automatic-speech-recognition', WHISPER_MODEL, {
      progress_callback: (p) => {
        if (p.status === 'progress') {
          console.log('[Whisper] 下载进度:', Math.round(p.progress * 100) + '%');
        }
      }
    });
    console.log('[Whisper] 模型加载完成');
    setBubble('语音识别模型已就绪，可以说话啦！');
    return whisperPipe;
  } catch (e) {
    console.error('[Whisper] 模型加载失败:', e);
    whisperPipe = null;
    setBubble('语音识别模型加载失败，用文字聊天吧');
    throw e;
  } finally {
    whisperLoading = false;
  }
}

// 把录音 blob 转成 Whisper 需要的 16kHz 单声道 Float32Array
async function audioBlobToWhisperInput(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  // 重采样到 16kHz
  const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const resampled = await offlineCtx.startRendering();
  audioCtx.close();
  return resampled.getChannelData(0); // Float32Array
}

// 用 Whisper 进行语音识别
async function startWhisperRecognition() {
  try {
    // 先加载模型
    const pipe = await loadWhisperModel();
    if (!pipe) return;

    // 开始录音
    whisperStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micPermission = 'granted';
    updateMicStatus();

    const chunks = [];
    whisperRecorder = new MediaRecorder(whisperStream);
    whisperRecorder.ondataavailable = e => chunks.push(e.data);

    voiceBtn.textContent = '🔴 聆听中…（5秒）';
    setBubble('我在听~请说话（5秒后自动识别）');
    console.log('[Whisper] 开始录音');

    whisperRecorder.start();

    // 录 5 秒
    await new Promise(r => setTimeout(r, 5000));

    if (whisperRecorder && whisperRecorder.state === 'recording') {
      whisperRecorder.stop();
    }
    whisperStream.getTracks().forEach(t => t.stop());

    console.log('[Whisper] 录音结束，开始识别');
    setBubble('正在识别你说的话…');
    voiceBtn.textContent = '⚙️ 识别中…';

    // 等 onstop 完成
    await new Promise(r => { whisperRecorder.onstop = r; });

    const blob = new Blob(chunks, { type: 'audio/webm' });
    const audioData = await audioBlobToWhisperInput(blob);

    const result = await pipe(audioData, { language: 'zh', task: 'transcribe' });
    const text = (result.text || '').trim();
    console.log('[Whisper] 识别结果:', text);

    voiceBtn.textContent = '🎤 对话';

    if (text) {
      handleVoiceCommand(text);
    } else {
      speak('没听清你说什么，再说一次试试，或者用文字聊天吧');
    }
  } catch (e) {
    console.error('[Whisper] 识别失败:', e);
    voiceBtn.textContent = '🎤 对话';
    if (whisperStream) whisperStream.getTracks().forEach(t => t.stop());
    speak('语音识别出了点问题，用文字跟我聊天吧');
  }
}

// 测试麦克风：录音1秒后播放，确认麦克风能正常工作
async function testMicrophone() {
  try {
    setBubble('正在测试麦克风…');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micTestStream = stream;
    micPermission = 'granted';
    updateMicStatus();

    // 用 MediaRecorder 录1秒
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play().then(() => {
        speak('麦克风正常，刚才是你自己的声音哦');
      }).catch(() => {
        speak('录到了声音但播放失败，不过麦克风应该是好的');
      });
      // 播放完后释放
      audio.onended = () => {
        URL.revokeObjectURL(url);
        stream.getTracks().forEach(t => t.stop());
      };
    };
    recorder.start();
    setTimeout(() => recorder.stop(), 1000);
    setBubble('请说一句话…');
  } catch (err) {
    console.warn('[麦克风测试] 失败:', err.name, err.message);
    micPermission = err.name === 'NotAllowedError' ? 'denied' : 'unknown';
    updateMicStatus();
    let tip = '麦克风测试失败。';
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      tip = '麦克风权限被拒绝。\n\n请在浏览器设置中允许麦克风：\n\n' +
            '方法1：点击地址栏左侧的锁形/盾牌图标 → 麦克风 → 允许\n' +
            '方法2：浏览器 → 设置 → 隐私 → 麦克风 → 允许本站点\n' +
            '方法3：鸿蒙 → 设置 → 应用 → 浏览器 → 权限 → 麦克风 → 允许';
    } else if (err.name === 'NotFoundError') {
      tip = '未检测到麦克风设备，请确认手机麦克风正常。';
    } else if (err.name === 'NotReadableError') {
      tip = '麦克风被其他应用占用，请关闭录音类应用后重试。';
    } else {
      tip = `麦克风异常：${err.name}。${err.message || ''}`;
    }
    alert(tip);
  }
}

// ============ 大模型对话（支持多平台，默认用免费模型） ============
// 支持平台：
//   siliconflow - 硅基流动，多个模型永久免费（推荐）
//   deepseek    - DeepSeek，新用户有免费额度
//   zhipu       - 智谱AI，GLM-4.7-Flash 永久免费
const LLM_PROVIDERS = {
  siliconflow: {
    name: '硅基流动',
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    models: [
      { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B（免费）', free: true },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3（免费）', free: true },
      { id: 'THUDM/glm-4-9b-chat', label: 'GLM-4-9B（免费）', free: true },
      { id: 'internlm/internlm2_5-7b-chat', label: 'InternLM2.5-7B（免费）', free: true },
    ],
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    tip: '注册即送额度，多个模型永久免费',
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    models: [
      { id: 'deepseek-chat', label: 'deepseek-chat', free: false },
      { id: 'deepseek-reasoner', label: 'deepseek-reasoner', free: false },
    ],
    defaultModel: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    tip: '新用户送免费额度，用完需充值',
  },
  zhipu: {
    name: '智谱AI',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    models: [
      { id: 'glm-4-flash', label: 'GLM-4-Flash（免费）', free: true },
      { id: 'glm-4.7-flash', label: 'GLM-4.7-Flash（免费）', free: true },
    ],
    defaultModel: 'glm-4-flash',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    tip: 'GLM-4-Flash 永久免费',
  },
};

const LLM_SYSTEM_PROMPT = `你是"眨眨"，一个可爱的AI护眼小怪兽，专门帮助小朋友保护眼睛、养成好习惯。
你的性格：活泼、温柔、有耐心，像好朋友一样陪伴小朋友。
你的功能：监督坐姿、提醒距离、定时休息、检测摔倒、场景识别（学习/玩耍）。
回复要求：
1. 用小朋友能听懂的话，语气亲切可爱，不要太正式
2. 回复简短，一般不超过30个字
3. 可以适当使用感叹号和语气词，比如"呀"、"哦"、"呢"
4. 如果小朋友说眼睛累、坐姿不好等，要温柔提醒
5. 不要暴露你是AI或大模型，你就是眨眨`;

// 最近几轮对话上下文（保持对话连贯）
let chatHistory = [];
const MAX_HISTORY = 6;

function getLlmProvider() {
  return localStorage.getItem('blink_llm_provider') || 'siliconflow';
}
function setLlmProvider(p) {
  localStorage.setItem('blink_llm_provider', p);
  saveUserSettingsToCloud();
}
function getLlmKey() {
  return localStorage.getItem('blink_llm_key') || '';
}
function setLlmKey(key) {
  localStorage.setItem('blink_llm_key', key.trim());
  saveUserSettingsToCloud();
}
function getLlmModel() {
  return localStorage.getItem('blink_llm_model') || LLM_PROVIDERS[getLlmProvider()].defaultModel;
}
function setLlmModel(m) {
  localStorage.setItem('blink_llm_model', m);
  saveUserSettingsToCloud();
}
function hasLlmKey() {
  return getLlmKey().length > 0;
}

// ============ 云端配置同步 ============
let cloudSaveTimer = null;
function saveUserSettingsToCloud() {
  if (!supabaseClient || !currentUser) return;
  // 防抖 500ms，避免频繁写库
  if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async () => {
    try {
      const { data, error } = await supabaseClient
        .from('user_settings')
        .upsert({
          id: currentUser.id,
          llm_provider: getLlmProvider(),
          llm_model: getLlmModel(),
          llm_key: getLlmKey(),
          pet_config: getPetConfig(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      if (error) console.warn('[Cloud] 同步失败:', error.message);
      else console.log('[Cloud] 配置已同步到云端');
    } catch (e) {
      console.warn('[Cloud] 同步异常:', e.message);
    }
  }, 500);
}

async function loadUserSettingsFromCloud() {
  if (!supabaseClient || !currentUser) return;
  try {
    const { data, error } = await supabaseClient
      .from('user_settings')
      .select('llm_provider, llm_model, llm_key, pet_config')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (error) {
      console.warn('[Cloud] 拉取配置失败:', error.message);
      return;
    }
    if (data && (data.llm_key || data.llm_provider || data.llm_model || data.pet_config)) {
      console.log('[Cloud] 从云端恢复配置');
      if (data.llm_provider) localStorage.setItem('blink_llm_provider', data.llm_provider);
      if (data.llm_model) localStorage.setItem('blink_llm_model', data.llm_model);
      if (data.llm_key) localStorage.setItem('blink_llm_key', data.llm_key);
      if (data.pet_config) {
        localStorage.setItem('blink_pet_config', JSON.stringify(data.pet_config));
        applyPetConfig(data.pet_config);
      }
      return true;
    } else {
      console.log('[Cloud] 云端无配置，使用本地配置并上传');
      // 把本地已有配置上传一次
      if (getLlmKey() || getPetConfig()) saveUserSettingsToCloud();
      return false;
    }
  } catch (e) {
    console.warn('[Cloud] 拉取异常:', e.message);
    return false;
  }
}

// ============ 眨眨打扮系统（SVG 参数化变身 + AI 图片生成） ============

// 预设风格库：8 种小朋友喜欢的造型
const PET_PRESETS = {
  default:  { name: '🐾 原版眨眨', body: '#4FC3F7', belly: '#B3E5FC', horn: '#29B6F6', decor: 'none',    mouth: 'smile' },
  dinosaur: { name: '🦖 小恐龙',   body: '#66BB6A', belly: '#C5E1A5', horn: '#2E7D32', decor: 'spikes',  mouth: 'tooth' },
  princess: { name: '👸 小公主',   body: '#F48FB1', belly: '#FCE4EC', horn: '#EC407A', decor: 'crown',   mouth: 'smile' },
  astronaut:{ name: '🚀 宇航员',   body: '#ECEFF1', belly: '#CFD8DC', horn: '#90A4AE', decor: 'helmet',  mouth: 'smile' },
  panda:    { name: '🐼 熊猫',     body: '#FFFFFF', belly: '#FFFFFF', horn: '#000000', decor: 'panda',   mouth: 'smile' },
  robot:    { name: '🤖 机器人',   body: '#90A4AE', belly: '#CFD8DC', horn: '#37474F', decor: 'antenna', mouth: 'rect'   },
  hero:     { name: '🦸 超人',     body: '#EF5350', belly: '#FFCDD2', horn: '#B71C1C', decor: 'cape',    mouth: 'smile' },
  devil:    { name: '😈 小恶魔',   body: '#7E57C2', belly: '#D1C4E9', horn: '#311B92', decor: 'pitchfork',mouth: 'tooth' },
  angel:    { name: '😇 小天使',   body: '#FFD54F', belly: '#FFF8E1', horn: '#FFA000', decor: 'halo',    mouth: 'smile' },
};

function getPetConfig() {
  try {
    const s = localStorage.getItem('blink_pet_config');
    return s ? JSON.parse(s) : PET_PRESETS.default;
  } catch (e) { return PET_PRESETS.default; }
}

function setPetConfig(cfg) {
  localStorage.setItem('blink_pet_config', JSON.stringify(cfg));
  applyPetConfig(cfg);
  saveUserSettingsToCloud();  // 自动同步到云端
}

// 把配置应用到 SVG
function applyPetConfig(cfg) {
  if (!cfg) cfg = PET_PRESETS.default;
  const body = document.getElementById('body');
  const horn1 = document.querySelector('#pet path[fill="#29B6F6"]');
  const horn2 = document.querySelectorAll('#pet path[fill="#29B6F6"]')[1];
  const belly = document.querySelector('#pet ellipse[fill="#B3E5FC"]');
  const mouth = document.getElementById('mouth');

  if (body) body.setAttribute('fill', cfg.body || '#4FC3F7');
  if (belly) belly.setAttribute('fill', cfg.belly || '#B3E5FC');
  if (horn1) horn1.setAttribute('fill', cfg.horn || '#29B6F6');
  if (horn2) horn2.setAttribute('fill', cfg.horn || '#29B6F6');

  // 嘴巴样式
  if (mouth) {
    if (cfg.mouth === 'tooth') {
      mouth.setAttribute('d', 'M80 150 L88 158 L96 150 L104 158 L112 150 L120 158');
      mouth.setAttribute('stroke', '#01579B');
    } else if (cfg.mouth === 'rect') {
      mouth.setAttribute('d', 'M82 152 L118 152 L118 158 L82 158 Z');
      mouth.setAttribute('stroke', '#263238');
    } else {
      mouth.setAttribute('d', 'M80 150 Q100 168 120 150');
      mouth.setAttribute('stroke', '#01579B');
    }
    mouth.setAttribute('stroke-width', '4');
    mouth.setAttribute('stroke-linecap', 'round');
    mouth.setAttribute('fill', 'none');
  }

  // 装饰元素：先清掉旧的，再加新的
  const decorLayer = document.getElementById('decorLayer');
  if (decorLayer) decorLayer.innerHTML = renderDecor(cfg.decor || 'none');

  // 如果是 AI 图片模式，切换显示
  const svgEl = document.querySelector('#pet svg');
  const petImg = document.getElementById('petImage');
  if (cfg.imageDataUrl) {
    if (svgEl) svgEl.style.display = 'none';
    if (petImg) {
      petImg.src = cfg.imageDataUrl;
      petImg.style.display = 'block';
    }
  } else {
    if (svgEl) svgEl.style.display = 'block';
    if (petImg) petImg.style.display = 'none';
  }
}

// 渲染装饰元素 SVG
function renderDecor(type) {
  switch (type) {
    case 'crown':
      return '<path d="M70 60 L80 40 L90 55 L100 35 L110 55 L120 40 L130 60 Z" fill="#FFD700" stroke="#FFA000" stroke-width="2"/>' +
             '<circle cx="100" cy="42" r="4" fill="#FF5252"/>';
    case 'halo':
      return '<ellipse cx="100" cy="32" rx="32" ry="6" fill="none" stroke="#FFD700" stroke-width="3"/>' +
             '<ellipse cx="100" cy="32" rx="32" ry="6" fill="none" stroke="#FFF59D" stroke-width="1" opacity="0.8"/>';
    case 'spikes':
      return '<path d="M50 80 L40 50 L55 70 L45 40 L65 65 L60 35 L75 60 L80 30 L85 60 L100 25 L105 60 L120 30 L125 60 L135 35 L140 65 L155 40 L150 70 L165 50 L160 80 Z" fill="#2E7D32" opacity="0.8"/>';
    case 'antenna':
      return '<line x1="100" y1="55" x2="100" y2="20" stroke="#37474F" stroke-width="3"/>' +
             '<circle cx="100" cy="18" r="6" fill="#F44336"/>';
    case 'cape':
      return '<path d="M40 110 Q20 140 30 200 L100 195 L170 200 Q180 140 160 110 Z" fill="#B71C1C" opacity="0.85"/>' +
             '<text x="100" y="160" font-size="20" fill="#FFD700" text-anchor="middle" font-weight="bold">Z</text>';
    case 'pitchfork':
      return '<line x1="180" y1="80" x2="160" y2="130" stroke="#311B92" stroke-width="3"/>' +
             '<path d="M175 75 L185 75 L182 65 L178 65 Z M173 80 L187 80" stroke="#311B92" stroke-width="2" fill="none"/>';
    case 'helmet':
      return '<path d="M55 100 Q100 50 145 100 L145 130 L55 130 Z" fill="rgba(255,255,255,0.4)" stroke="#90A4AE" stroke-width="2"/>' +
             '<rect x="60" y="105" width="80" height="12" fill="rgba(200,230,255,0.6)" stroke="#0288D1" stroke-width="1"/>';
    case 'panda':
      // 黑眼圈
      return '<ellipse cx="75" cy="110" rx="20" ry="14" fill="#000"/>' +
             '<ellipse cx="125" cy="110" rx="20" ry="14" fill="#000"/>';
    default:
      return '';
  }
}

// 应用预设
function applyPreset(key) {
  const p = PET_PRESETS[key];
  if (!p) return;
  const cfg = { ...p, decor: p.decor, imageDataUrl: null };  // 预设清掉 AI 图片
  delete cfg.name;
  setPetConfig(cfg);
  setBubble('我变身成 ' + p.name + ' 啦！');
  speak('我变身成' + p.name.replace(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/, '') + '啦！');
  console.log('[Pet] 切换预设:', key);
}

// AI 生成眨眨图片（基于语音/文字描述）
async function generatePetImage(desc) {
  if (!desc || desc.length < 2) {
    setBubble('要告诉我你想把我变成什么样子哦~');
    return;
  }
  setBubble('正在画 ' + desc + ' 的眨眨…（约10-20秒）');
  speak('好的，我正在画' + desc + '的眨眨，稍等一下哦');

  try {
    // 优先使用 Seedream/Doubao 文生图 API（用户需在设置里填图片 API Key）
    const imgKey = localStorage.getItem('blink_img_key') || '';
    if (imgKey) {
      const resp = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + imgKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'doubao-seedream-3-0-t2i-250415',
          prompt: '一只可爱的卡通小怪兽"眨眨"，圆滚滚的身体，大眼睛，' + desc + '，儿童画风格，色彩明亮',
          size: '512x512',
          response_format: 'b64_json',
        }),
      });
      const data = await resp.json();
      if (data.data && data.data[0] && data.data[0].b64_json) {
        const url = 'data:image/png;base64,' + data.data[0].b64_json;
        const cfg = { ...getPetConfig(), imageDataUrl: url, imageDesc: desc };
        setPetConfig(cfg);
        setBubble('画好啦！这是我变身成 ' + desc + ' 的样子~');
        speak('画好啦，看看我变成' + desc + '的样子吧');
        return;
      }
      throw new Error(data.error?.message || '图片生成失败');
    }

    // 没有 API Key 时，降级到 SVG 颜色推断
    setBubble('还没有配置图片生成 API，我先按你的描述调个颜色~');
    const cfg = inferPetConfigFromText(desc);
    setPetConfig(cfg);
    setBubble('我按"' + desc + '"调了颜色和装饰~ 配置图片 API 可以画得更像哦');
  } catch (e) {
    console.error('[Pet] AI 图片生成失败:', e);
    setBubble('画图失败了：' + e.message + '，先用颜色变身~');
    const cfg = inferPetConfigFromText(desc);
    setPetConfig(cfg);
  }
}

// 文本描述 → SVG 配置推断（关键词匹配，无 AI 时的兜底）
function inferPetConfigFromText(text) {
  const t = text.toLowerCase();
  // 找匹配的预设关键词
  const keywordMap = [
    { kw: ['恐龙', 'dino', '霸王龙'], preset: 'dinosaur' },
    { kw: ['公主', 'princess', '粉红'], preset: 'princess' },
    { kw: ['宇航', '太空', '火箭', 'space'], preset: 'astronaut' },
    { kw: ['熊猫', 'panda'], preset: 'panda' },
    { kw: ['机器人', 'robot', '机械'], preset: 'robot' },
    { kw: ['超人', 'hero', '超级'], preset: 'hero' },
    { kw: ['恶魔', 'devil', '坏'], preset: 'devil' },
    { kw: ['天使', 'angel', '神仙'], preset: 'angel' },
  ];
  for (const m of keywordMap) {
    if (m.kw.some(k => t.includes(k))) {
      const p = PET_PRESETS[m.preset];
      return { body: p.body, belly: p.belly, horn: p.horn, decor: p.decor, mouth: p.mouth, imageDataUrl: null };
    }
  }
  // 没匹配预设 → 按颜色词推断
  const colorMap = { 红:'#EF5350', 橙:'#FF9800', 黄:'#FFD54F', 绿:'#66BB6A', 青:'#26C6DA', 蓝:'#42A5F5', 紫:'#7E57C2', 粉:'#F48FB1', 黑:'#37474F', 白:'#ECEFF1', 金:'#FFD700', 银:'#B0BEC5' };
  for (const [c, hex] of Object.entries(colorMap)) {
    if (t.includes(c)) {
      return { body: hex, belly: '#FFFFFF', horn: hex, decor: 'none', mouth: 'smile', imageDataUrl: null };
    }
  }
  return { body: '#4FC3F7', belly: '#B3E5FC', horn: '#29B6F6', decor: 'none', mouth: 'smile', imageDataUrl: null };
}

// 处理语音/文字中的"变身/打扮/变成"指令
function handlePetCommand(text) {
  const t = text.toLowerCase();
  // "变成 X" "变身成 X" "打扮成 X" "画一个 X"
  const m = t.match(/(?:变成|变身成|打扮成|画一个|画只|画个|装扮成)([\u4e00-\u9fa5a-zA-Z0-9\s]{1,15})/);
  if (m) {
    const desc = m[1].trim();
    // 含"画"字 → 走 AI 图片
    if (t.includes('画')) {
      generatePetImage(desc);
    } else {
      const cfg = inferPetConfigFromText(desc);
      setPetConfig(cfg);
      setBubble('我变身成 ' + desc + ' 啦！');
      speak('好的，我变身成' + desc + '啦');
    }
    return true;
  }
  // 直接说预设名
  for (const [key, p] of Object.entries(PET_PRESETS)) {
    if (key === 'default') continue;
    if (t.includes(p.name.replace(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/, '').slice(0, 2))) {
      applyPreset(key);
      return true;
    }
  }
  return false;
}

// 调用大模型获取回复
async function askLLM(userText) {
  if (!hasLlmKey()) return null;
  const provider = LLM_PROVIDERS[getLlmProvider()];
  const model = getLlmModel();
  const key = getLlmKey();

  const messages = [{ role: 'system', content: LLM_SYSTEM_PROMPT }];
  for (const h of chatHistory) messages.push(h);
  messages.push({ role: 'user', content: userText });

  try {
    setBubble('眨眨正在思考…');
    const resp = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 150,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn('[LLM] 请求失败:', resp.status, errText);
      return null;
    }
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return null;

    chatHistory.push({ role: 'user', content: userText });
    chatHistory.push({ role: 'assistant', content: reply });
    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(chatHistory.length - MAX_HISTORY);
    }
    return reply;
  } catch (e) {
    console.warn('[LLM] 异常:', e);
    return null;
  }
}

// AI 设置面板
let aiSettingsPanel = null;
function showAiSettings() {
  if (aiSettingsPanel) {
    aiSettingsPanel.style.display = 'flex';
    refreshAiSettingsPanel();
    return;
  }
  aiSettingsPanel = document.createElement('div');
  aiSettingsPanel.className = 'text-input-panel';
  aiSettingsPanel.innerHTML = `
    <div class="text-input-box">
      <div class="text-input-title">🤖 AI 大脑设置</div>
      <p style="font-size:12px;color:#666;margin:0 0 8px;">
        接入大模型后，眨眨就能跟你自由聊天啦～推荐用<b style="color:#4CAF50;">硅基流动</b>，多个模型永久免费！
      </p>
      <div style="margin-bottom:8px;">
        <label style="font-size:12px;color:#555;">选择平台：</label>
        <select id="llmProviderSelect" style="width:100%;padding:6px;border:2px solid #e0e0e0;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
        </select>
      </div>
      <div style="margin-bottom:8px;">
        <label style="font-size:12px;color:#555;">选择模型：</label>
        <select id="llmModelSelect" style="width:100%;padding:6px;border:2px solid #e0e0e0;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
        </select>
      </div>
      <p id="llmTip" style="font-size:11px;color:#888;margin:0 0 8px;"></p>
      <input type="text" id="llmKeyInput" placeholder="粘贴你的 API Key" style="width:100%;padding:8px;border:2px solid #e0e0e0;border-radius:8px;font-size:13px;box-sizing:border-box;margin-bottom:8px;" />
      <p style="font-size:11px;color:#999;margin:0 0 8px;">
        Key 只存在你手机本地，不会上传。<a id="llmKeyUrl" href="#" target="_blank" style="color:#2196F3;">获取 Key</a>
      </p>
      <div id="aiStatusText" style="font-size:12px;color:#999;margin-bottom:8px;"></div>
      <div class="text-input-btns">
        <button class="btn" id="aiSaveBtn">保存</button>
        <button class="btn" id="aiClearBtn">清除</button>
        <button class="btn" id="aiCloseBtn">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(aiSettingsPanel);
  bindAiSettingsEvents();
  refreshAiSettingsPanel();
}

function bindAiSettingsEvents() {
  const providerSelect = document.getElementById('llmProviderSelect');
  providerSelect.onchange = () => {
    setLlmProvider(providerSelect.value);
    // 切换平台时重置模型为默认
    setLlmModel(LLM_PROVIDERS[providerSelect.value].defaultModel);
    refreshAiSettingsPanel();
  };
  document.getElementById('aiSaveBtn').onclick = () => {
    const key = document.getElementById('llmKeyInput').value.trim();
    if (key) {
      setLlmKey(key);
      updateAiStatus();
      speak('AI大脑已连接，现在可以跟我聊天啦');
    } else {
      alert('请输入 API Key');
    }
  };
  document.getElementById('aiClearBtn').onclick = () => {
    localStorage.removeItem('blink_llm_key');
    document.getElementById('llmKeyInput').value = '';
    updateAiStatus();
    speak('已清除AI设置');
  };
  document.getElementById('aiCloseBtn').onclick = () => {
    aiSettingsPanel.style.display = 'none';
  };
}

function refreshAiSettingsPanel() {
  const providerSelect = document.getElementById('llmProviderSelect');
  const modelSelect = document.getElementById('llmModelSelect');
  const tip = document.getElementById('llmTip');
  const keyUrl = document.getElementById('llmKeyUrl');
  const keyInput = document.getElementById('llmKeyInput');

  // 填充平台列表
  providerSelect.innerHTML = Object.entries(LLM_PROVIDERS).map(([k, v]) =>
    `<option value="${k}">${v.name}</option>`
  ).join('');
  providerSelect.value = getLlmProvider();

  // 填充当前平台的模型列表
  const provider = LLM_PROVIDERS[getLlmProvider()];
  modelSelect.innerHTML = provider.models.map(m =>
    `<option value="${m.id}">${m.label}</option>`
  ).join('');
  modelSelect.value = getLlmModel();

  // 显示提示和获取链接
  tip.textContent = '说明：' + provider.tip;
  keyUrl.href = provider.keyUrl;
  keyInput.value = getLlmKey();
  updateAiStatus();
}

function updateAiStatus() {
  const el = document.getElementById('aiStatusText');
  if (!el) return;
  if (hasLlmKey()) {
    const provider = LLM_PROVIDERS[getLlmProvider()];
    el.textContent = `✅ 已配置 ${provider.name}，大模型对话已启用`;
    el.style.color = '#4CAF50';
  } else {
    el.textContent = '⚠️ 未配置 Key，将使用固定指令回复';
    el.style.color = '#FF9800';
  }
}

// ============ 用户登录面板 ============
let loginPanel = null;
function showLoginPanel() {
  if (loginPanel) { loginPanel.style.display = 'flex'; return; }
  loginPanel = document.createElement('div');
  loginPanel.className = 'text-input-panel';
  loginPanel.innerHTML = `
    <div class="text-input-box">
      <div class="text-input-title">👤 登录 / 注册</div>
      <p style="font-size:12px;color:#666;margin:0 0 8px;">
        登录后，你的 AI 配置会自动同步到云端，换手机也不丢～
      </p>
      <input type="tel" id="loginPhone" placeholder="手机号" maxlength="11"
        style="width:100%;padding:8px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;" />
      <input type="password" id="loginPwd" placeholder="设置密码（至少6位）"
        style="width:100%;padding:8px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:4px;" />
      <p id="loginMsg" style="font-size:12px;color:#999;margin:0 0 8px;min-height:16px;"></p>
      <div class="text-input-btns">
        <button class="btn" id="loginSubmitBtn" style="background:#4CAF50;color:#fff;">登录 / 注册</button>
        <button class="btn" id="loginCloseBtn">关闭</button>
      </div>
      <p style="font-size:10px;color:#aaa;margin:8px 0 0;">
        提示：密码忘记无法找回（不发验证码），请记牢哦～
      </p>
    </div>
  `;
  document.body.appendChild(loginPanel);
  document.getElementById('loginSubmitBtn').onclick = handleLoginSubmit;
  document.getElementById('loginCloseBtn').onclick = () => { loginPanel.style.display = 'none'; };
}

function setLoginMsg(text, color) {
  const el = document.getElementById('loginMsg');
  if (el) { el.textContent = text; el.style.color = color || '#999'; }
}

async function handleLoginSubmit() {
  if (!supabaseClient) { setLoginMsg('登录服务未就绪，请检查网络', '#f44'); return; }
  const phone = document.getElementById('loginPhone').value.trim().replace(/\D/g, '');
  const pwd = document.getElementById('loginPwd').value;
  if (!/^\d{11}$/.test(phone)) { setLoginMsg('请输入11位手机号', '#f44'); return; }
  if (pwd.length < 6) { setLoginMsg('密码至少6位', '#f44'); return; }

  const btn = document.getElementById('loginSubmitBtn');
  btn.disabled = true; btn.textContent = '处理中…';
  setLoginMsg('正在登录…', '#2196F3');

  const email = phoneToEmail(phone);
  // 先尝试登录
  const { error: signInErr } = await supabaseClient.auth.signInWithPassword({ email, password: pwd });
  if (!signInErr) {
    setLoginMsg('登录成功！', '#4CAF50');
    setTimeout(() => { if (loginPanel) loginPanel.style.display = 'none'; }, 600);
    btn.disabled = false; btn.textContent = '登录 / 注册';
    return;
  }
  // 登录失败→说明是新用户，自动注册
  setLoginMsg('新用户，正在注册…', '#2196F3');
  const { data, error: signUpErr } = await supabaseClient.auth.signUp({ email, password: pwd });
  btn.disabled = false; btn.textContent = '登录 / 注册';
  if (signUpErr) {
    setLoginMsg('注册失败：' + signUpErr.message, '#f44');
    return;
  }
  // Supabase 默认可能需要邮箱验证，我们在控制台已关闭，直接自动登录
  if (data?.user) {
    setLoginMsg('注册并登录成功！', '#4CAF50');
    setTimeout(() => { if (loginPanel) loginPanel.style.display = 'none'; }, 600);
  } else {
    setLoginMsg('注册成功，请再次点击登录', '#FF9800');
  }
}

async function handleLogout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

function updateLoginButton() {
  const btn = document.getElementById('loginBtn');
  if (!btn) return;
  if (currentUser) {
    const phone = getCurrentPhone();
    btn.textContent = '👤 ' + (phone ? phone.slice(0, 3) + '****' + phone.slice(7) : '已登录');
    btn.style.background = '#4CAF50';
    btn.onclick = () => {
      if (confirm('已登录 ' + phone + '，是否退出登录？')) handleLogout();
    };
  } else {
    btn.textContent = '👤 登录';
    btn.style.background = '#FF9800';
    btn.onclick = showLoginPanel;
  }
}

// 处理用户语音指令
function handleVoiceCommand(text) {
  let reply = '';

  if (/你能做什么|你会什么|功能|帮助|怎么用|有什么用/.test(text)) {
    reply = '我是眨眨，可以帮你：监督坐姿、提醒距离、定时休息、检测摔倒，还能陪你聊天哦。你可以说"坐姿怎么样"、"休息一下"、"切换学习模式"。';
  }
  else if (/你是谁|你叫什么|介绍一下|自我介绍/.test(text)) {
    reply = '我是眨眨，你的AI护眼小怪兽！我会用摄像头看你的坐姿，帮你保护眼睛。';
  }
  else if (/你好|嗨|哈喽|在吗/.test(text)) {
    reply = '你好呀小主人，我是眨眨，有什么可以帮你的？';
  }
  else if (/谢谢|感谢|多谢|辛苦了/.test(text)) {
    reply = '不客气小主人，保护眼睛是我应该做的！';
  }
  else if (/加油|鼓励|我可以|坚持/.test(text)) {
    reply = '小主人最棒了！坚持住，眨眨给你加油！';
  }
  else if (/累|困|疲倦|疲劳/.test(text)) {
    reply = '累了就休息一下吧，远眺20秒看看远方，眨眨陪你。';
    state.inRest = true;
    state.restSeconds = CONFIG.REST_DURATION;
    speak(reply);
    setBubble(reply);
    return;
  }
  else if (/眼睛|眼酸|眼累|眼睛酸|眼睛累|眼睛疼/.test(text)) {
    reply = '眼睛累了吧？快休息一下，远眺20秒看看绿色植物。';
    state.inRest = true;
    state.restSeconds = CONFIG.REST_DURATION;
    speak(reply);
    setBubble(reply);
    return;
  }
  else if (/坐姿|姿势|坐得|怎么样|坐好没/.test(text)) {
    // 根据当前状态回复
    if (state.calibrating) {
      reply = '正在校准中，请坐端正哦';
    } else if (!state.calibrated) {
      reply = '还没开始呢，点开始护眼我帮你看看';
    } else if (state.detectedScene === 'playing' || state.mode === 'play') {
      reply = '现在是玩耍模式，注意安全哦';
    } else {
      reply = '你的坐姿很棒，继续保持！';
    }
  }
  else if (/休息|休息一下|歇一会|歇一下/.test(text)) {
    state.inRest = true;
    state.restSeconds = CONFIG.REST_DURATION;
    reply = '好的，休息一下，远眺20秒吧';
    speak(reply);
    setBubble(reply);
    return;
  }
  else if (/玩耍|玩|玩一会|玩一下/.test(text)) {
    setMode('play');
    reply = '好的，切换到玩耍模式，注意安全哦';
  }
  else if (/学习|写作业|看书|做作业/.test(text)) {
    setMode('learn');
    reply = '好的，切换到学习模式，我帮你监督坐姿';
  }
  else if (/自动/.test(text)) {
    setMode('auto');
    reply = '好的，切换到自动模式，我会自己判断哦';
  }
  else if (/时间|多久|几点|学了多久/.test(text)) {
    const mins = Math.floor(state.workSeconds / 60);
    reply = `你已经学习了${mins}分钟啦`;
  }
  else if (/统计|几次|多少次|警告|提醒/.test(text)) {
    reply = `今天提醒了你${state.badCount}次坐姿，${state.closeCount}次距离`;
  }
  else if (/再见|拜拜|走了|不说了|拜拜了/.test(text)) {
    reply = '再见小主人，记得保护眼睛哦';
  }
  else if (/开始|启动|开始护眼|开始吧/.test(text)) {
    if (!state.running) {
      // 触发开始按钮
      document.getElementById('startBtn').click();
      reply = '好的，开始护眼啦，请坐端正让我校准一下';
    } else {
      reply = '已经在护眼模式中啦';
    }
  }
  else if (/暂停|停下|停一下|先停/.test(text)) {
    if (state.running) {
      document.getElementById('pauseBtn').click();
      reply = '好的，已暂停';
    } else {
      reply = '还没开始呢';
    }
  }
  else {
    // 先检查是否是眨眨变身指令（变成/打扮/画一个）
    if (handlePetCommand(text)) return;
    // 未匹配到固定指令 → 交给大模型回复
    if (hasLlmKey()) {
      handleLlmReply(text);
      return;
    }
    reply = `你说的是"${text}"，我还不太懂呢。可以问我"你能做什么"哦~`;
  }

  speak(reply);
  setBubble(reply);
}

// 调用大模型并播报回复
async function handleLlmReply(text) {
  const reply = await askLLM(text);
  if (reply) {
    speak(reply);
    setBubble(reply);
  } else {
    const fallback = `你说的是"${text}"，我还不太懂呢。可以问我"你能做什么"哦~`;
    speak(fallback);
    setBubble(fallback);
  }
}

// 点击对话按钮
voiceBtn.addEventListener('click', async () => {
  unlockSpeech();

  // 情况1：浏览器不支持 SpeechRecognition → 用 Whisper WASM 方案
  if (!asrSupported) {
    console.log('[对话] SpeechRecognition 不可用，切换到 Whisper WASM 方案');
    await startWhisperRecognition();
    return;
  }

  if (!recognition) {
    const ok = initVoiceRecognition();
    if (!ok) {
      // SpeechRecognition 初始化失败也用 Whisper
      console.log('[对话] SpeechRecognition 初始化失败，切换到 Whisper WASM 方案');
      await startWhisperRecognition();
      return;
    }
  }

  if (isListening) {
    recognition.stop();
    return;
  }

  // 情况2：麦克风权限已知被拒绝 → 直接提示，不弹系统对话框
  if (micPermission === 'denied') {
    alert('麦克风权限已被拒绝。\n\n请在浏览器设置中允许麦克风：\n\n' +
          '方法1：点击地址栏左侧的锁形/盾牌图标 → 麦克风 → 允许\n' +
          '方法2：浏览器 → 设置 → 隐私 → 麦克风 → 允许本站点\n' +
          '方法3：鸿蒙 → 设置 → 应用 → 浏览器 → 权限 → 麦克风 → 允许\n\n' +
          '允许后刷新页面再试。也可以直接用"文字"按钮跟眨眨聊天。');
    return;
  }

  try {
    // 权限未确认时，先用 getUserMedia 触发授权弹窗
    // 权限已允许时跳过这步，直接启动识别（避免重复弹窗/冲突）
    if (micPermission !== 'granted') {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      micPermission = 'granted';
      updateMicStatus();
    }
    // 启动语音识别
    // 安全网：如果 3 秒内 onstart 没触发，说明浏览器语音识别引擎不可用（鸿蒙常见）
    // 立即降级到 Whisper WASM
    clearRecognitionTimer();
    recognitionStartTimer = setTimeout(() => {
      console.warn('[语音识别] onstart 超时，降级到 Whisper WASM');
      try { recognition.stop(); } catch (e) {}
      isListening = false;
      voiceBtn.textContent = '🎤 对话';
      speak('这个浏览器的语音识别不能用，正在切换到离线识别…');
      startWhisperRecognition();
    }, START_TIMEOUT);

    recognition.start();
  } catch (err) {
    console.warn('[麦克风] 权限请求失败:', err.name, err.message);
    micPermission = err.name === 'NotAllowedError' ? 'denied' : 'unknown';
    updateMicStatus();
    let tip = '';
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      tip = '麦克风权限被拒绝。\n\n请在浏览器设置中允许麦克风：\n\n' +
            '方法1：点击地址栏左侧的锁形/盾牌图标 → 麦克风 → 允许\n' +
            '方法2：浏览器 → 设置 → 隐私 → 麦克风 → 允许本站点\n' +
            '方法3：鸿蒙 → 设置 → 应用 → 浏览器 → 权限 → 麦克风 → 允许\n\n' +
            '允许后刷新页面。或直接用"文字"按钮跟眨眨聊天。';
    } else if (err.name === 'NotFoundError') {
      tip = '未检测到麦克风设备，请确认手机麦克风正常。\n\n可以用"文字"按钮跟眨眨聊天。';
    } else if (err.name === 'NotReadableError') {
      tip = '麦克风被其他应用占用，请关闭录音类应用后重试。';
    } else {
      tip = `麦克风异常：${err.name}。\n\n可以用"文字"按钮跟眨眨聊天。`;
    }
    alert(tip);
  }
});

// ============ 文字输入降级（浏览器不支持语音识别时使用） ============
let textInputPanel = null;

function showTextInput() {
  if (textInputPanel) { textInputPanel.style.display = 'flex'; return; }
  textInputPanel = document.createElement('div');
  textInputPanel.className = 'text-input-panel';
  textInputPanel.innerHTML = `
    <div class="text-input-box">
      <div class="text-input-title">跟眨眨说句话~</div>
      <input type="text" id="textCommandInput" placeholder="输入指令，如：坐姿怎么样" />
      <div class="text-input-btns">
        <button class="btn" id="textSendBtn">发送</button>
        <button class="btn" id="textCloseBtn">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(textInputPanel);

  const input = document.getElementById('textCommandInput');
  document.getElementById('textSendBtn').onclick = () => {
    const text = input.value.trim();
    if (text) { handleVoiceCommand(text); input.value = ''; }
  };
  document.getElementById('textCloseBtn').onclick = () => {
    textInputPanel.style.display = 'none';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = input.value.trim();
      if (text) { handleVoiceCommand(text); input.value = ''; }
    }
  });
  setTimeout(() => input.focus(), 100);
}

// ============ 声音风格切换 ============
let voiceStylePanel = null;

function showVoiceStylePanel() {
  if (voiceStylePanel) {
    voiceStylePanel.style.display = 'flex';
    return;
  }
  voiceStylePanel = document.createElement('div');
  voiceStylePanel.className = 'text-input-panel';
  const styles = Object.keys(VOICE_STYLES);
  const btnsHtml = styles.map(key => {
    const s = VOICE_STYLES[key];
    const active = key === currentVoiceStyle ? ' active' : '';
    return `<button class="btn style-btn${active}" data-style="${key}">${s.label}</button>`;
  }).join('');
  voiceStylePanel.innerHTML = `
    <div class="text-input-box">
      <div class="text-input-title">选个声音吧~</div>
      <div class="style-grid">${btnsHtml}</div>
      <div class="text-input-btns">
        <button class="btn" id="styleCloseBtn">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(voiceStylePanel);

  voiceStylePanel.querySelectorAll('.style-btn').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.style;
      setVoiceStyle(key);
      // 关闭面板
      voiceStylePanel.style.display = 'none';
    };
  });
  document.getElementById('styleCloseBtn').onclick = () => {
    voiceStylePanel.style.display = 'none';
  };
}

function setVoiceStyle(key) {
  if (!VOICE_STYLES[key]) return;
  currentVoiceStyle = key;
  const s = VOICE_STYLES[key];
  speak(`你好，我是眨眨，现在是${s.label}声音`);
  updateVoiceStyleBtn();
  // 更新面板按钮高亮
  if (voiceStylePanel) {
    voiceStylePanel.querySelectorAll('.style-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.style === key);
    });
  }
}

function updateVoiceStyleBtn() {
  const btn = document.getElementById('voiceStyleBtn');
  if (btn) btn.textContent = '🎵 ' + VOICE_STYLES[currentVoiceStyle].label;
}

// ============ 工具函数 ============
function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function angleDeg(ax, ay, bx, by, cx, cy) {
  const ba = { x: ax - bx, y: ay - by };
  const bc = { x: cx - bx, y: cy - by };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const mag = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y);
  const cos = Math.min(1, Math.max(-1, dot / (mag + 1e-6)));
  return Math.acos(cos) * 180 / Math.PI;
}

function fmt(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

// ============ 人体姿态估计（基于 MediaPipe Pose，正面/侧面/背面均可用） ============
// Pose 关键点索引：
// 0:鼻子  11:左肩  12:右肩  13:左肘  14:右肘
// 23:左髋  24:右髋  25:左膝  26:右膝
function computeBodyPosture(lm, w, h) {
  const px = (p) => ({ x: p.x * w, y: p.y * h, v: p.visibility || 0 });
  const nose = px(lm[0]);
  const lShoulder = px(lm[11]);
  const rShoulder = px(lm[12]);
  const lHip = px(lm[23]);
  const rHip = px(lm[24]);

  // 肩膀中点、髋部中点
  const shoulderMid = {
    x: (lShoulder.x + rShoulder.x) / 2,
    y: (lShoulder.y + rShoulder.y) / 2,
  };
  const hipMid = {
    x: (lHip.x + rHip.x) / 2,
    y: (lHip.y + rHip.y) / 2,
  };

  // 肩宽（用于归一化，消除距离影响）
  const shoulderWidth = distance(lShoulder.x, lShoulder.y, rShoulder.x, rShoulder.y);

  // --- 1. 躯干倾斜角（驼背/趴在桌上的核心指标）---
  // 肩膀中点 → 髋部中点 的连线与画面垂直方向的夹角
  // 正坐时躯干接近垂直；趴着/前倾时躯干倾斜
  const torsoDx = hipMid.x - shoulderMid.x;
  const torsoDy = hipMid.y - shoulderMid.y;
  // 与垂直方向的夹角（0 = 完全垂直正坐，越大 = 越倾斜）
  const torsoAngleDeg = Math.abs(Math.atan2(torsoDx, torsoDy) * 180 / Math.PI);

  // --- 2. 肩膀高低差（歪身子/侧躺）---
  // 归一化到肩宽，避免距离影响
  const shoulderTilt = Math.abs(lShoulder.y - rShoulder.y) / (shoulderWidth + 1e-6);
  const shoulderTiltDeg = shoulderTilt * 90;  // 转成角度量纲

  // --- 3. 头部前探程度（头前倾）---
  // 鼻子到肩膀中点的水平偏移，归一化到肩宽
  const headForward = Math.abs(nose.x - shoulderMid.x) / (shoulderWidth + 1e-6);
  const headForwardDeg = headForward * 90;

  // --- 4. 身体大小（用于判断是否靠近/远离）---
  const bodySize = shoulderWidth;

  // --- 5. 可见性判断（人是否在画面里）---
  const visOK = (lShoulder.v > 0.5 || rShoulder.v > 0.5) &&
                (lHip.v > 0.5 || rHip.v > 0.5);

  return {
    torsoAngleDeg,
    shoulderTiltDeg,
    headForwardDeg,
    bodySize,
    visOK,
    shoulderMid,
    hipMid,
  };
}

// 计算中位数（校准用，抗噪声）
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ============ 情景感知：场景判断 + 摔倒检测 ============

// 判断当前场景：学习（人基本不动）还是玩耍（人在大幅移动）
// 优化：增加滞回逻辑 + 多人跳变检测，避免场景频繁切换
let sceneConfirmCount = 0;
let lastDetectedScene = 'unknown';

function detectScene(centerX, centerY) {
  state.positionHistory.push({ x: centerX, y: centerY });
  if (state.positionHistory.length > CONFIG.SCENE_HISTORY_FRAMES) {
    state.positionHistory.shift();
  }
  if (state.positionHistory.length < 10) return 'unknown';

  // 1. 计算位置方差
  const xs = state.positionHistory.map(p => p.x);
  const ys = state.positionHistory.map(p => p.y);
  const varX = variance(xs);
  const varY = variance(ys);
  const moveAmount = Math.sqrt(varX + varY);

  // 2. 检测多人跳变：相邻帧人体位置大幅跳跃（>20%画面），说明可能是多人切换
  let multiPersonJump = false;
  if (state.positionHistory.length >= 2) {
    const last = state.positionHistory[state.positionHistory.length - 1];
    const prev = state.positionHistory[state.positionHistory.length - 2];
    const jump = Math.hypot(last.x - prev.x, last.y - prev.y);
    if (jump > 0.2) multiPersonJump = true;  // 跳跃超过画面20%
  }

  // 3. 滞回判断：玩耍阈值高，学习阈值低，避免抖动
  let candidate;
  if (multiPersonJump || moveAmount > CONFIG.SCENE_MOVE_THRESHOLD * 1.2) {
    candidate = 'playing';       // 移动大或多人跳变 → 玩耍
  } else if (moveAmount < CONFIG.SCENE_MOVE_THRESHOLD * 0.5) {
    candidate = 'learning';      // 移动很小 → 学习
  } else {
    candidate = lastDetectedScene; // 中间地带保持原判
  }

  // 4. 连续确认：需连续 5 帧一致才切换场景
  if (candidate === lastDetectedScene) {
    sceneConfirmCount++;
  } else {
    sceneConfirmCount = 1;
    lastDetectedScene = candidate;
  }

  if (sceneConfirmCount >= 5) {
    return candidate;
  }
  return state.detectedScene || 'unknown';
}

function variance(arr) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

// 摔倒检测：髋部高度突然大幅下降 + 持续低位
// 返回 'fall' | 'normal'
function detectFall(hipY) {
  state.heightHistory.push(hipY);
  if (state.heightHistory.length > CONFIG.SCENE_HISTORY_FRAMES) {
    state.heightHistory.shift();
  }
  if (state.heightHistory.length < 10) return 'normal';

  const heights = state.heightHistory;
  const recent = heights.slice(-5);
  const earlier = heights.slice(0, 10);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

  // 髋部 y 坐标越大=越靠下（在画面下方）。摔倒后人变矮，髋部 y 变大
  const heightDrop = (recentAvg - earlierAvg);

  if (heightDrop > CONFIG.FALL_HEIGHT_DROP) {
    // 持续低位确认
    state.stillFrames++;
    if (state.stillFrames >= CONFIG.FALL_HOLD_FRAMES) {
      return 'fall';
    }
  } else {
    state.stillFrames = Math.max(0, state.stillFrames - 2);
  }
  return 'normal';
}

// ============ 桌宠表情与气泡 ============
function setPetState(color, message, statusText) {
  // 清除旧状态 class
  document.body.classList.remove('state-green', 'state-orange', 'state-red', 'state-gray', 'state-rest');
  document.body.classList.add('state-' + color);
  bubbleText.textContent = message;
  petStatus.textContent = statusText || message;
  // 触发气泡弹出动画重放
  const bubble = document.getElementById('bubble');
  bubble.style.animation = 'none';
  bubble.offsetHeight; // reflow
  bubble.style.animation = '';
}

function setBubble(text) {
  bubbleText.textContent = text;
  const bubble = document.getElementById('bubble');
  bubble.style.animation = 'none';
  bubble.offsetHeight;
  bubble.style.animation = '';
}

// 眨眼动画
function blink() {
  pet.classList.add('blink');
  setTimeout(() => pet.classList.remove('blink'), 150);
}
setInterval(blink, 3500);

// ============ 人体姿态处理 ============
function onResults(results) {
  if (!state.running || state.paused) return;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  let message = state.calibrating ? '校准中…请坐端正' : '我看不到小主人哦~';
  let color = 'gray';
  let badNow = false;
  let tooClose = false;

  if (results.poseLandmarks) {
    const lm = results.poseLandmarks;
    const w = canvas.width, h = canvas.height;

    // 计算身体姿态
    const body = computeBodyPosture(lm, w, h);

    // ========== 校准阶段 ==========
    if (state.calibrating) {
      const elapsed = Date.now() - state.calibStartTime;
      if (body.visOK) {
        state.calibSamples.push({
          torso: body.torsoAngleDeg,
          shoulderTilt: body.shoulderTiltDeg,
          headForward: body.headForwardDeg,
          bodySize: body.bodySize,
        });
      }
      const remaining = Math.max(0, Math.ceil((CONFIG.CALIB_DURATION_MS - elapsed) / 1000));
      message = `校准中…请坐端正 ${remaining}s`;
      color = 'orange';

      if (elapsed >= CONFIG.CALIB_DURATION_MS && state.calibSamples.length >= CONFIG.CALIB_MIN_SAMPLES) {
        state.baselineTorso = median(state.calibSamples.map(s => s.torso));
        state.baselineShoulderTilt = median(state.calibSamples.map(s => s.shoulderTilt));
        state.baselineHeadForward = median(state.calibSamples.map(s => s.headForward));
        state.baselineBodySize = median(state.calibSamples.map(s => s.bodySize));
        state.calibrated = true;
        state.calibrating = false;
        state.calibSamples = [];
        message = '校准完成！开始监督啦~';
        color = 'green';
        speak('校准完成，我记住你的正确坐姿啦');
      }
      // 画躯干线（绿）
      drawTorsoLine(ctx, body, color, w);
      setPetState(color, message, message);
      return;
    }

    // ========== 监控阶段 ==========
    if (state.calibrated) {
      if (!body.visOK) {
        message = '小主人不在视野里哦~';
        color = 'gray';
      } else {
        // 计算人体中心位置（归一化坐标）
        const centerX = (body.shoulderMid.x + body.hipMid.x) / 2 / w;
        const centerY = (body.shoulderMid.y + body.hipMid.y) / 2 / h;
        const hipY = body.hipMid.y / h;  // 归一化髋部高度

        // 自动模式：判断当前场景
        let activeMode = state.mode;
        if (state.mode === 'auto') {
          const scene = detectScene(centerX, centerY);
          if (scene !== 'unknown') {
            state.detectedScene = scene;
            activeMode = scene === 'learning' ? 'learn' : 'play';
          }
        }

        const bodyRatio = state.baselineBodySize > 0
          ? body.bodySize / state.baselineBodySize
          : 1.0;
        const now = Date.now();

        if (activeMode === 'play') {
          // ====== 玩耍模式：安全监护 ======
          // 1. 摔倒检测
          const fallResult = detectFall(hipY);
          if (fallResult === 'fall') {
            if (now - state.fallWarnTime > CONFIG.WARN_INTERVAL_MS) {
              speak('小主人，你没事吧？小心摔倒哦！');
              state.fallWarnTime = now;
            }
            message = '摔倒了！你还好吗？';
            color = 'red';
          }
          // 2. 太靠近镜头（可能碰撞）
          else if (bodyRatio > CONFIG.DANGER_CLOSE_RATIO) {
            if (now - state.lastWarnTime > CONFIG.WARN_INTERVAL_MS) {
              speak('小心，离镜头太近啦，别撞到！');
              state.lastWarnTime = now;
            }
            message = '太近啦，小心碰撞~';
            color = 'orange';
          }
          // 3. 正常玩耍
          else {
            message = state.mode === 'auto' ? '在玩耍呢，注意安全哦~' : '玩耍中，注意安全~';
            color = 'green';
          }
        } else {
          // ====== 学习模式：坐姿监督 ======
          const dTorso = Math.abs(body.torsoAngleDeg - state.baselineTorso);
          const dShoulderTilt = Math.abs(body.shoulderTiltDeg - state.baselineShoulderTilt);
          const dHeadForward = Math.abs(body.headForwardDeg - state.baselineHeadForward);

          if (bodyRatio > CONFIG.CLOSE_BODY_RATIO) {
            tooClose = true;
            message = '坐太远啦，靠近一点~';
            color = 'red';
          } else if (dTorso > CONFIG.TORSO_WARN) {
            badNow = true;
            message = body.torsoAngleDeg > state.baselineTorso ? '驼背啦，坐直哦~' : '别趴着，坐正哦~';
            color = 'orange';
          } else if (dShoulderTilt > CONFIG.SHOULDER_TILT_WARN) {
            badNow = true;
            message = '歪身子啦，坐正哦~';
            color = 'orange';
          } else if (dHeadForward > CONFIG.HEAD_FORWARD_WARN) {
            badNow = true;
            message = '头前倾啦，抬头坐正~';
            color = 'orange';
          } else {
            message = '坐姿真棒！';
            color = 'green';
          }

          // 不良姿态持续检测
          if (badNow || tooClose) {
            if (state.badHoldStart === 0) state.badHoldStart = now;
            else if (now - state.badHoldStart >= CONFIG.BAD_HOLD_MS) {
              if (now - state.lastWarnTime > CONFIG.WARN_INTERVAL_MS) {
                speak(message);
                state.lastWarnTime = now;
                if (badNow) { state.badCount++; badCountEl.textContent = state.badCount; }
                if (tooClose) { state.closeCount++; closeCountEl.textContent = state.closeCount; }
              }
            }
          } else {
            state.badHoldStart = 0;
          }
        }
      }

      // 画躯干线
      drawTorsoLine(ctx, body, color, w);
    }
  }

  setPetState(color, message, message);
}

// 在画面上画躯干线（肩膀中点 → 髋部中点）
function drawTorsoLine(ctx, body, color, w) {
  if (!body.shoulderMid || !body.hipMid) return;
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.strokeStyle = color === 'gray' ? '#888' : color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(body.shoulderMid.x, body.shoulderMid.y);
  ctx.lineTo(body.hipMid.x, body.hipMid.y);
  ctx.stroke();
  ctx.restore();
}

// ============ 用眼计时循环 ============
function startTimer() {
  if (state.tickHandle) return;
  state.tickHandle = setInterval(() => {
    if (state.paused) return;
    if (!state.inRest) {
      state.workSeconds++;
      const prog = Math.min(state.workSeconds / CONFIG.WORK_DURATION, 1);
      progressFill.style.width = (prog * 100) + '%';
      progressFill.style.background = prog < 0.5 ? '#4CAF50' : prog < 0.85 ? '#FF9800' : '#F44336';
      timeText.textContent = `${fmt(state.workSeconds)} / ${fmt(CONFIG.WORK_DURATION)}`;
      if (state.workSeconds >= CONFIG.WORK_DURATION) {
        state.inRest = true;
        state.restSeconds = CONFIG.REST_DURATION;
        state.restCount++;
        restCountEl.textContent = state.restCount;
        speak('用眼20分钟啦，远眺20秒休息一下吧');
        setPetState('rest', '休息中…远眺20秒哦~', '休息中');
      }
    } else {
      state.restSeconds--;
      setBubble(`休息中… ${Math.max(state.restSeconds, 0)}秒`);
      petStatus.textContent = `休息中 ${Math.max(state.restSeconds, 0)}s`;
      if (state.restSeconds <= 0) {
        state.inRest = false;
        state.workSeconds = 0;
        speak('休息结束，继续加油哦');
        setPetState('green', '休息好啦，继续加油！', '护眼监督中');
      }
    }
  }, 1000);
}

function stopTimer() {
  if (state.tickHandle) { clearInterval(state.tickHandle); state.tickHandle = null; }
}

// ============ 会话日志 ============
function loadLogs() {
  try { return JSON.parse(localStorage.getItem('blink_logs') || '[]'); }
  catch (e) { return []; }
}

function saveLog() {
  const logs = loadLogs();
  logs.unshift({
    time: new Date().toLocaleString('zh-CN'),
    duration: state.workSeconds,
    bad: state.badCount,
    close: state.closeCount,
    rest: state.restCount,
  });
  localStorage.setItem('blink_logs', JSON.stringify(logs.slice(0, 50)));
  renderLogs();
}

function renderLogs() {
  const logs = loadLogs();
  if (logs.length === 0) { logList.innerHTML = '<p class="empty">暂无记录</p>'; return; }
  logList.innerHTML = logs.map(l => `
    <div class="log-item">
      <span class="log-time">${l.time}</span>
      <span>时长 ${fmt(l.duration)}</span>
      <span>不良 ${l.bad}</span>
      <span>过近 ${l.close}</span>
      <span>休息 ${l.rest}</span>
    </div>
  `).join('');
}

// ============ 启动 / 控制 ============
let pose = null;
let camera = null;

async function initPose() {
  // MediaPipe 改为按需懒加载，避免首屏同步加载几 MB 脚本拖慢渲染
  await ensureMediaPipeLoaded();
  pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
  });
  pose.setOptions({
    modelComplexity: 1,      // 平衡精度与速度
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  pose.onResults(onResults);
}

// 懒加载 MediaPipe 的 pose.js + camera_utils.js（用户开启摄像头时才加载）
function ensureMediaPipeLoaded() {
  if (window.Pose && window.Camera) return Promise.resolve();
  if (ensureMediaPipeLoaded._p) return ensureMediaPipeLoaded._p;
  ensureMediaPipeLoaded._p = new Promise((resolve, reject) => {
    const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/';
    let loaded = 0;
    const done = () => { if (++loaded === 2) resolve(); };
    const fail = (e) => reject(new Error('MediaPipe 加载失败: ' + (e?.target?.src || '')));
    const s1 = document.createElement('script');
    s1.src = base + 'pose/pose.js'; s1.async = true;
    s1.onload = done; s1.onerror = fail;
    const s2 = document.createElement('script');
    s2.src = base + 'camera_utils/camera_utils.js'; s2.async = true;
    s2.onload = done; s2.onerror = fail;
    document.head.appendChild(s1);
    document.head.appendChild(s2);
  });
  return ensureMediaPipeLoaded._p;
}

async function startCamera() {
  try {
    camera = new Camera(video, {
      onFrame: async () => {
        if (pose) await pose.send({ image: video });
      },
      width: CONFIG.CANVAS_W,
      height: CONFIG.CANVAS_H,
    });
    await camera.start();
    loadingEl.style.display = 'none';
    setPetState('green', '我准备好了，点"开始护眼"吧~', '已就绪');
  } catch (err) {
    console.error(err);
    loadingEl.style.display = 'none';
    noCameraEl.style.display = 'flex';
  }
}

startBtn.addEventListener('click', async () => {
  // 关键：语音必须在用户手势同步回调中调用，不能在 await 之后
  unlockSpeech();
  speak('我是眨眨，先帮你校准坐姿');

  if (!pose) {
    loadingEl.style.display = 'flex';
    await initPose();
    await startCamera();
  }
  state.running = true;
  state.paused = false;
  state.workSeconds = 0;
  state.badCount = 0;
  state.closeCount = 0;
  state.restCount = 0;
  badCountEl.textContent = 0;
  closeCountEl.textContent = 0;
  restCountEl.textContent = 0;
  // 进入校准模式：让用户正坐 3 秒，记录正确姿态基线
  state.calibrating = true;
  state.calibrated = false;
  state.calibStartTime = Date.now();
  state.calibSamples = [];
  setPetState('orange', '请坐端正，我看看你的正确坐姿~', '校准中 3s');
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  startTimer();
});

pauseBtn.addEventListener('click', () => {
  unlockSpeech();
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? '继续' : '暂停';
  if (state.paused) {
    setPetState('gray', '休息一下~', '已暂停');
  } else {
    setPetState('green', '继续监督~', '护眼监督中');
  }
});

restBtn.addEventListener('click', () => {
  unlockSpeech();
  state.inRest = true;
  state.restSeconds = CONFIG.REST_DURATION;
  speak('好的，现在开始休息20秒');
  setPetState('rest', '休息一下，远眺20秒~', '休息中');
});

// 点击眨眨互动
const greetings = [
  '你好呀！记得坐端正哦~',
  '眨眨在看着你呢！',
  '眼睛离屏幕远一点~',
  '加油加油，我陪着你！',
  '累了就眨眨眼睛吧~',
];
pet.addEventListener('click', () => {
  unlockSpeech();
  const g = greetings[Math.floor(Math.random() * greetings.length)];
  setBubble(g);
  speak(g);
  pet.style.animation = 'none';
  pet.offsetHeight;
  pet.style.animation = 'float 3s ease-in-out infinite';
});

// 摄像头小窗开关
camBtn.addEventListener('click', () => {
  camPanel.style.display = camPanel.style.display === 'none' ? 'block' : 'none';
});

// 模式切换按钮
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  const map = { auto: 'modeAuto', learn: 'modeLearn', play: 'modePlay' };
  document.getElementById(map[mode]).classList.add('active');
  // 重置场景追踪
  state.positionHistory = [];
  state.heightHistory = [];
  state.stillFrames = 0;
  const names = { auto: '自动模式', learn: '学习模式', play: '玩耍模式' };
  speak(`已切换到${names[mode]}`);
}
document.getElementById('modeAuto').addEventListener('click', () => setMode('auto'));
document.getElementById('modeLearn').addEventListener('click', () => setMode('learn'));
document.getElementById('modePlay').addEventListener('click', () => setMode('play'));

// TTS 诊断按钮
document.getElementById('ttsBtn').addEventListener('click', () => {
  unlockSpeech();
  ttsDiagnose();
});

// 麦克风测试按钮
document.getElementById('micTestBtn').addEventListener('click', () => {
  unlockSpeech();
  testMicrophone();
});

// 文字对话按钮
document.getElementById('textBtn').addEventListener('click', () => {
  unlockSpeech();
  showTextInput();
});

// 声音风格切换按钮
document.getElementById('voiceStyleBtn').addEventListener('click', () => {
  unlockSpeech();
  showVoiceStylePanel();
});

// AI 设置按钮
document.getElementById('aiSettingsBtn').addEventListener('click', () => {
  unlockSpeech();
  showAiSettings();
});

// ============ 打扮面板事件绑定 ============
const decorOptions = [
  { key: 'none',      label: '无' },
  { key: 'crown',     label: '👑 皇冠' },
  { key: 'halo',      label: '😇 光环' },
  { key: 'spikes',    label: '🦖 背刺' },
  { key: 'antenna',   label: '🤖 天线' },
  { key: 'cape',      label: '🦸 披风' },
  { key: 'pitchfork', label: '😈 三叉戟' },
  { key: 'helmet',    label: '🚀 头盔' },
  { key: 'panda',     label: '🐼 黑眼圈' },
];

// 初始化打扮面板
function initDressupPanel() {
  // 预设按钮
  const grid = document.getElementById('presetGrid');
  if (grid) {
    grid.innerHTML = '';
    Object.entries(PET_PRESETS).forEach(([key, p]) => {
      const btn = document.createElement('button');
      btn.textContent = p.name;
      btn.style.cssText = 'padding:10px 4px;border:1px solid #ddd;background:' + p.body + ';color:' + (p.body === '#FFFFFF' || p.body === '#FFD54F' ? '#333' : '#fff') + ';border-radius:8px;cursor:pointer;font-size:13px;';
      btn.onclick = () => applyPreset(key);
      grid.appendChild(btn);
    });
  }

  // 装饰按钮
  const decorBtns = document.getElementById('decorBtns');
  if (decorBtns) {
    decorBtns.innerHTML = '';
    decorOptions.forEach(d => {
      const btn = document.createElement('button');
      btn.textContent = d.label;
      btn.style.cssText = 'padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;color:#333;border-radius:4px;cursor:pointer;font-size:12px;';
      btn.onclick = () => {
        const cfg = { ...getPetConfig(), decor: d.key, imageDataUrl: null };
        setPetConfig(cfg);
        setBubble('装饰切换为：' + d.label);
      };
      decorBtns.appendChild(btn);
    });
  }

  // 自定义颜色应用
  const applyBtn = document.getElementById('applyCustomBtn');
  if (applyBtn) {
    applyBtn.onclick = () => {
      const cfg = {
        body: document.getElementById('bodyColor').value,
        belly: document.getElementById('bellyColor').value,
        horn: document.getElementById('hornColor').value,
        decor: getPetConfig().decor || 'none',
        mouth: getPetConfig().mouth || 'smile',
        imageDataUrl: null,
      };
      setPetConfig(cfg);
      setBubble('颜色换好啦！');
    };
  }

  // 保存图片 API Key
  const saveImgBtn = document.getElementById('saveImgKeyBtn');
  if (saveImgBtn) {
    saveImgBtn.onclick = () => {
      const v = document.getElementById('imgKeyInput').value.trim();
      if (v) {
        localStorage.setItem('blink_img_key', v);
        saveImgBtn.textContent = '已保存 ✓';
        saveImgBtn.style.background = '#4CAF50';
        setTimeout(() => { saveImgBtn.textContent = '保存图片 API Key'; saveImgBtn.style.background = '#FF9800'; }, 1500);
      }
    };
    // 已有的 key 回填
    const existing = localStorage.getItem('blink_img_key');
    if (existing) document.getElementById('imgKeyInput').value = existing;
  }

  // 恢复默认
  const resetBtn = document.getElementById('resetPetBtn');
  if (resetBtn) {
    resetBtn.onclick = () => {
      applyPreset('default');
      document.getElementById('dressupPanel').style.display = 'none';
    };
  }
}

document.getElementById('dressupBtn').addEventListener('click', () => {
  unlockSpeech();
  initDressupPanel();
  document.getElementById('dressupPanel').style.display = 'block';
});
document.getElementById('dressupCloseBtn').addEventListener('click', () => {
  document.getElementById('dressupPanel').style.display = 'none';
});

// 页面加载完应用保存的眨眨配置
window.addEventListener('DOMContentLoaded', () => {
  applyPetConfig(getPetConfig());
});

closeCam.addEventListener('click', () => {
  camPanel.style.display = 'none';
});

clearLogBtn.addEventListener('click', () => {
  if (confirm('确定清空历史日志吗？')) {
    localStorage.removeItem('blink_logs');
    renderLogs();
  }
});

// 退出保存
window.addEventListener('beforeunload', () => {
  if (state.running) saveLog();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.running) saveLog();
});

// ============ PWA 安装 ============
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = 'inline-block';
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.style.display = 'none';
});

// ============ 初始化 ============
renderLogs();
setPetState('gray', '你好呀，我是眨眨~点"开始护眼"吧', '等待启动');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.warn);
}

// ============ 登录态初始化 ============
// Supabase SDK 是 async 加载的，这里轮询等待 SDK 就绪后再初始化登录态
updateLoginButton();
initSupabaseWhenReady();

async function initAuthState() {
  if (!supabaseClient) { updateLoginButton(); return; }
  // 恢复已有会话
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    console.log('[Auth] 已恢复登录:', getCurrentPhone());
    updateLoginButton();
    await loadUserSettingsFromCloud();
  }
  // 监听登录/登出变化
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log('[Auth] 状态变化:', event);
    if (session?.user) {
      currentUser = session.user;
      updateLoginButton();
      if (event === 'SIGNED_IN') {
        const restored = await loadUserSettingsFromCloud();
        if (restored) {
          setBubble('欢迎回来，配置已从云端恢复');
          speak('欢迎回来，你的AI配置已恢复');
        } else {
          setBubble('登录成功，配置已自动同步');
        }
      }
    } else {
      currentUser = null;
      updateLoginButton();
      if (event === 'SIGNED_OUT') {
        setBubble('已退出登录，配置仅保存在本地');
      }
    }
  });
}
