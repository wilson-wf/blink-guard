/*
 * AI 智能坐姿护眼学习助手 —— "眨眨" 护眼小怪兽（PWA 桌宠版）
 * 作者：〔宝宝姓名〕
 * 平台：手机浏览器（iOS Safari / 安卓 Chrome），无需笔记本
 * 架构：单手机端到端运行，MediaPipe Pose 人体姿态检测（正面/侧面/背面均可用）
 *
 * 界面：桌宠模式 —— 卡通小怪兽"眨眨"在前台，摄像头在后台检测
 */

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
const ONLINE_TTS_ENDPOINTS = [
  (text) => `https://fanyi.baidu.com/gettts?lan=zh&text=${encodeURIComponent(text)}&spd=5&source=web`,
  (text) => `https://tts.youdao.com/fanyivoice?word=${encodeURIComponent(text)}&le=zh&keyfrom=speaker-target`,
  (text) => `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=zh-CN&client=tw-ob`,
];

// 声音风格：调整音调(pitch)和语速(rate)实现儿童/卡通音
// 百度 TTS 返回的是固定音色，通过 playbackRate 升高音调来模拟童声
const VOICE_STYLES = {
  normal:  { rate: 1.0, pitch: 1.0, label: '普通' },
  child:   { rate: 1.25, pitch: 1.6, label: '儿童' },  // 音调高，语速稍快
  cartoon: { rate: 1.4, pitch: 2.0, label: '卡通' },   // 音调很高，卡通效果
};
let currentVoiceStyle = 'child';  // 默认儿童音

function getVoiceStyle() { return VOICE_STYLES[currentVoiceStyle] || VOICE_STYLES.normal; }

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
  info.push(`speechSynthesis: ${'speechSynthesis' in window ? '✅支持' : '❌不支持'}`);
  if ('speechSynthesis' in window) {
    const voices = window.speechSynthesis.getVoices();
    info.push(`语音数: ${voices.length}`);
    info.push(`中文语音: ${chineseVoice ? '✅' + chineseVoice.name : '❌无'}`);
    info.push(`speaking: ${window.speechSynthesis.speaking}`);
    info.push(`pending: ${window.speechSynthesis.pending}`);
  }
  info.push(`TTS 模式: ${chineseVoice ? '🗣️ 本地语音' : '🌐 在线语音(百度)'}`);
  info.push(`在线TTS备用: 有道 / Google`);
  info.push(`最后错误: ${lastSpeechError || '无'}`);
  info.push(`speechEnabled: ${speechEnabled}`);
  alert(info.join('\n'));
}

// ============ 语音识别（用户说话 → 眨眨回应） ============
let recognition = null;
let isListening = false;

function initVoiceRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    voiceBtn.disabled = true;
    voiceBtn.textContent = '🎤 不支持';
    return false;
  }
  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    voiceBtn.textContent = '🔴 聆听中…';
    setBubble('我在听~请说话');
  };

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript.trim();
    console.log('[语音识别]', text);
    handleVoiceCommand(text);
  };

  recognition.onerror = (event) => {
    console.warn('[语音识别] 错误:', event.error);
    // 注意：getUserMedia 已经成功过，所以这里的错误不是麦克风权限问题
    // 而是浏览器没有语音识别引擎（鸿蒙浏览器常见）
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      speak('当前浏览器没有语音识别引擎，你可以用文字跟我聊天');
      // 自动弹出文字输入框
      showTextInput();
    } else if (event.error === 'no-speech') {
      speak('没听清，再说一次吧');
    } else if (event.error === 'audio-capture') {
      speak('麦克风被占用了，关闭其他录音应用再试');
    } else {
      speak('语音识别用不了，试试用文字跟我聊天吧');
      showTextInput();
    }
  };

  recognition.onend = () => {
    isListening = false;
    voiceBtn.textContent = '🎤 对话';
  };

  return true;
}

// 处理用户语音指令
function handleVoiceCommand(text) {
  let reply = '';

  if (/你好|嗨|哈喽|在吗/.test(text)) {
    reply = '你好呀小主人，我是眨眨，有什么可以帮你的？';
  }
  else if (/坐姿|姿势|坐得|怎么样/.test(text)) {
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
  else if (/休息|休息一下|歇一会/.test(text)) {
    state.inRest = true;
    state.restSeconds = CONFIG.REST_DURATION;
    reply = '好的，休息一下，远眺20秒吧';
    speak(reply);
    return;
  }
  else if (/玩耍|玩|玩一会/.test(text)) {
    setMode('play');
    reply = '好的，切换到玩耍模式，注意安全哦';
  }
  else if (/学习|写作业|看书/.test(text)) {
    setMode('learn');
    reply = '好的，切换到学习模式，我帮你监督坐姿';
  }
  else if (/自动/.test(text)) {
    setMode('auto');
    reply = '好的，切换到自动模式，我会自己判断哦';
  }
  else if (/时间|多久|几点/.test(text)) {
    const mins = Math.floor(state.workSeconds / 60);
    reply = `你已经学习了${mins}分钟啦`;
  }
  else if (/统计|几次|多少次|警告/.test(text)) {
    reply = `今天提醒了你${state.badCount}次坐姿，${state.closeCount}次距离`;
  }
  else if (/再见|拜拜|走了|不说了/.test(text)) {
    reply = '再见小主人，记得保护眼睛哦';
  }
  else {
    reply = `你说的是"${text}"，我还不太懂呢`;
  }

  speak(reply);
  setBubble(reply);
}

// 点击对话按钮
voiceBtn.addEventListener('click', async () => {
  unlockSpeech();

  if (!recognition) {
    const ok = initVoiceRecognition();
    if (!ok) {
      speak('当前浏览器不支持语音识别，你可以用文字跟我聊天');
      showTextInput();
      return;
    }
  }

  if (isListening) {
    recognition.stop();
    return;
  }

  try {
    // 关键：先用 getUserMedia 主动请求麦克风权限，触发浏览器授权弹窗
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // 拿到权限后立即关闭 stream（SpeechRecognition 会自己开麦克风）
    stream.getTracks().forEach(t => t.stop());
    // 启动语音识别
    recognition.start();
  } catch (err) {
    console.warn('[麦克风] 权限请求失败:', err.name, err.message);
    let tip = '麦克风权限获取失败。';
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      tip = '麦克风权限被拒绝。\n\n请在浏览器设置中允许本网站使用麦克风：\n\n' +
            '方法1：点击地址栏左侧的锁形/盾牌图标 → 找到"麦克风" → 改为"允许"\n' +
            '方法2：浏览器 → 设置 → 隐私 → 麦克风 → 找到本站点 → 允许\n' +
            '方法3：鸿蒙浏览器 → 设置 → 网站设置 → 麦克风 → 允许';
    } else if (err.name === 'NotFoundError') {
      tip = '未检测到麦克风设备，请确认手机麦克风正常。';
    } else if (err.name === 'NotReadableError') {
      tip = '麦克风被其他应用占用，请关闭录音类应用后重试。';
    } else {
      tip = `麦克风异常：${err.name}。请检查浏览器设置中麦克风权限。`;
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
function cycleVoiceStyle() {
  const styles = Object.keys(VOICE_STYLES);
  const idx = styles.indexOf(currentVoiceStyle);
  currentVoiceStyle = styles[(idx + 1) % styles.length];
  const s = VOICE_STYLES[currentVoiceStyle];
  speak(`你好，我是眨眨，现在是${s.label}声音`);
  updateVoiceStyleBtn();
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

// 文字对话按钮
document.getElementById('textBtn').addEventListener('click', () => {
  unlockSpeech();
  showTextInput();
});

// 声音风格切换按钮
document.getElementById('voiceStyleBtn').addEventListener('click', () => {
  unlockSpeech();
  cycleVoiceStyle();
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
