const STORAGE_KEYS = {
  state: "assistant_state",
  logs: "assistant_logs",
  prefs: "assistant_prefs",
  templates: "assistant_templates"
};

const VALID_TONES = ["professional", "friendly", "firm"];
const VALID_SCENES = ["size", "shipping", "logistics", "return_exchange", "negative_review", "general"];

const DEFAULT_PREFS = {
  tone: "professional",
  autoGenerateEnabled: true,
  autoCopyEnabled: false,
  enhancerEnabled: false,
  modelEndpoint: "",
  serviceToken: "",
  modelTimeoutMs: 1800,
  sceneOverrideEnabled: false,
  sceneOverride: "auto"
};

const TONE_LABELS = {
  professional: "专业",
  friendly: "亲和",
  firm: "强硬"
};

const SCENE_LABELS = {
  size: "尺码咨询",
  shipping: "发货时效",
  logistics: "物流查询",
  return_exchange: "退换售后",
  negative_review: "差评安抚",
  general: "通用咨询"
};

// 规则分类器 V2：加权命中 + 互斥扣分，减少“发货/物流”等场景互相误判。
const SCENE_RULES = [
  {
    scene: "size",
    weightedKeywords: [
      { keyword: "尺码", weight: 4 },
      { keyword: "码数", weight: 4 },
      { keyword: "穿多大", weight: 5 },
      { keyword: "选哪个码", weight: 5 },
      { keyword: "偏大", weight: 3 },
      { keyword: "偏小", weight: 3 },
      { keyword: "身高", weight: 2 },
      { keyword: "体重", weight: 2 },
      { keyword: "三围", weight: 3 },
      { keyword: "肩宽", weight: 2 }
    ],
    negativeKeywords: ["发货", "物流", "退款", "退货", "差评", "投诉"]
  },
  {
    scene: "shipping",
    weightedKeywords: [
      { keyword: "发货", weight: 4 },
      { keyword: "什么时候发", weight: 5 },
      { keyword: "几天发", weight: 5 },
      { keyword: "当天发", weight: 4 },
      { keyword: "催发", weight: 4 },
      { keyword: "加急", weight: 3 },
      { keyword: "出库", weight: 3 },
      { keyword: "备货", weight: 2 },
      { keyword: "现货", weight: 2 },
      { keyword: "什么时候寄", weight: 4 }
    ],
    negativeKeywords: ["物流", "快递", "单号", "签收", "售后", "退款"]
  },
  {
    scene: "logistics",
    weightedKeywords: [
      { keyword: "物流", weight: 4 },
      { keyword: "快递", weight: 3 },
      { keyword: "单号", weight: 4 },
      { keyword: "到哪了", weight: 5 },
      { keyword: "到哪里了", weight: 5 },
      { keyword: "签收", weight: 4 },
      { keyword: "派送", weight: 4 },
      { keyword: "揽收", weight: 3 },
      { keyword: "在路上", weight: 3 },
      { keyword: "卡住了", weight: 3 }
    ],
    negativeKeywords: ["什么时候发", "几天发", "退货", "退款", "差评"]
  },
  {
    scene: "return_exchange",
    weightedKeywords: [
      { keyword: "退货", weight: 5 },
      { keyword: "退款", weight: 5 },
      { keyword: "换货", weight: 5 },
      { keyword: "售后", weight: 4 },
      { keyword: "退回", weight: 4 },
      { keyword: "退钱", weight: 4 },
      { keyword: "七天无理由", weight: 5 },
      { keyword: "质量问题", weight: 4 },
      { keyword: "有瑕疵", weight: 4 },
      { keyword: "不想要了", weight: 3 }
    ],
    negativeKeywords: ["尺码推荐", "什么时候发", "单号", "签收"]
  },
  {
    scene: "negative_review",
    weightedKeywords: [
      { keyword: "差评", weight: 5 },
      { keyword: "投诉", weight: 5 },
      { keyword: "不满意", weight: 4 },
      { keyword: "垃圾", weight: 4 },
      { keyword: "坑人", weight: 4 },
      { keyword: "曝光", weight: 4 },
      { keyword: "维权", weight: 5 },
      { keyword: "平台介入", weight: 5 },
      { keyword: "我要举报", weight: 5 },
      { keyword: "给你一星", weight: 5 }
    ],
    negativeKeywords: ["尺码", "发货", "物流", "换货流程"]
  }
];

const DEFAULT_TEMPLATES = {
  size: {
    professional: [
      "您好，尺码这边建议您参考详情页尺码表，并结合您的身高体重选择；如方便的话可发我您的身高体重，我给您更精准建议。",
      "收到，尺码建议以页面标注为准。若您平时介于两个尺码之间，建议优先选择大一码，穿着会更舒适。",
      "您好，为避免尺码不合适，建议您对照胸围/肩宽/裤长等关键数据选择，如需我可一对一帮您判断。"
    ],
    friendly: [
      "亲亲，这款尺码我可以帮您快速看下，您把身高体重发我，我马上给您推荐哦。",
      "宝子，建议先看下详情页尺码表哈，如果平时两个码都能穿，一般选大一码更稳妥～",
      "我来帮您挑尺码，您说下身高体重和日常穿衣习惯，我给您一个更贴合的建议。"
    ],
    firm: [
      "尺码请严格按详情页尺码表选择，页面已提供完整参数，建议您按数据下单。",
      "您可直接对照尺码表选购，介于两个尺码时统一建议选大一码，避免偏紧。",
      "尺码标准已在页面说明，建议按身材数据选择，不建议仅凭感觉下单。"
    ]
  },
  shipping: {
    professional: [
      "您好，当前订单会按店铺承诺时效尽快安排发出，正常情况下会在承诺时间内完成发货，请您放心。",
      "收到，发货这边会按付款顺序尽快处理，出库后系统会同步物流信息。",
      "您好，我们会在平台承诺时效内安排发货，发出后您可在订单详情查看物流进度。"
    ],
    friendly: [
      "亲，已经帮您催发啦，我们会尽快给您安排出库，发出后第一时间就能看到物流啦～",
      "宝子别担心，订单会按顺序尽快发出，出库后系统会自动更新快递信息哦。",
      "这边会尽快安排发货哈，辛苦您稍等一下，发出后我也会帮您关注物流动态。"
    ],
    firm: [
      "订单将按平台承诺时效发出，请以系统显示的发货时间为准。",
      "发货按付款顺序处理，当前无法提前插单，请您以订单状态更新为准。",
      "店铺会在承诺时效内发货，时效范围外催发不生效，请知悉。"
    ]
  },
  logistics: {
    professional: [
      "您好，物流信息请以订单详情页为准，若长时间未更新，我这边可以为您提交物流核查。",
      "收到，快递状态会由物流公司实时回传，若您看到停滞超过24小时，我可协助您跟进。",
      "您好，包裹发出后会在物流系统持续更新轨迹，如出现异常延迟可随时联系我处理。"
    ],
    friendly: [
      "亲，我帮您看着物流呢，您也可以在订单里实时查看；如果长时间不动我马上给您催件～",
      "宝子别急，物流更新有时会有延迟，通常很快会刷新，我这边也会协助您跟进。",
      "我在这边帮您盯着哈，若超过一天没更新，您告诉我，我立刻提交物流核查。"
    ],
    firm: [
      "物流轨迹以快递公司回传为准，请在订单详情查看最新状态。",
      "若物流超过24小时未更新，可提供订单号，我方将提交官方核查。",
      "快递在途存在区域时效差异，请以系统节点更新为准。"
    ]
  },
  return_exchange: {
    professional: [
      "您好，关于退换货可按平台售后流程提交申请，我们会在时效内尽快为您处理。",
      "收到，若商品存在问题，建议您在订单页发起售后并上传凭证，我们会优先审核处理。",
      "您好，退换相关可通过订单售后入口申请，审核通过后会按平台规则完成退款或换货。"
    ],
    friendly: [
      "亲，退换这边可以走平台售后流程，我会帮您尽快跟进处理，不让您久等～",
      "宝子您先别急，您在订单里提交售后申请就行，我这边会第一时间帮您看。",
      "可以给您安排售后哈，按平台步骤提交后我会尽快协助您处理到位。"
    ],
    firm: [
      "退换请通过平台售后入口提交，线下处理不予受理。",
      "售后需按平台规则提供凭证并走流程，审核通过后再执行退款或换货。",
      "请在订单页发起售后申请，未按流程提交的请求无法处理。"
    ]
  },
  negative_review: {
    professional: [
      "非常抱歉给您带来不好的体验，我们会立即核实并给出处理方案，感谢您指出问题。",
      "理解您的感受，给您添麻烦了。请您把具体情况告诉我，我们会尽快为您妥善处理。",
      "抱歉影响您的体验，我们重视每一条反馈，会第一时间跟进并尽快给您明确答复。"
    ],
    friendly: [
      "真的抱歉让您不开心了，这边一定认真处理，您把情况告诉我，我马上跟进到位。",
      "亲，先向您说声抱歉，您的反馈我们很重视，我会尽快给您一个满意的处理结果。",
      "给您添麻烦了非常抱歉，我在这边全程跟进，尽量尽快帮您解决。"
    ],
    firm: [
      "您的问题已收到，我们会按平台规则核实并处理，请避免情绪化沟通。",
      "我们会在核实后给出处理方案，请您提供具体订单信息以便快速处理。",
      "请基于实际问题沟通，我们会依照平台规则在时效内完成处理。"
    ]
  },
  general: {
    professional: [
      "您好，您的咨询已收到，我这边正在为您核实处理，请稍等片刻。",
      "收到，感谢您的咨询，我会尽快给您准确答复。",
      "您好，我已了解您的问题，马上为您确认并回复。"
    ],
    friendly: [
      "亲，消息收到啦，我马上帮您确认，稍等我一下哦～",
      "宝子我在的，您这个问题我马上给您处理。",
      "这边已经收到您的咨询啦，我尽快给您答复哈～"
    ],
    firm: [
      "您的问题已收到，请稍候，核实后回复。",
      "已记录您的咨询，稍后统一答复，请耐心等待。",
      "问题收到，正在处理，请勿重复发送。"
    ]
  }
};

const TONE_SUFFIXES = {
  professional: ["如需我继续协助，请随时告诉我。", "我会继续为您跟进处理。"],
  friendly: ["有需要随时喊我，我一直在～", "我会继续跟进，您放心哈～"],
  firm: ["请按上述说明处理，感谢配合。", "请以平台规则为准，辛苦理解。"]
};

const BANNED_WORDS = [
  "最",
  "第一",
  "国家级",
  "顶级",
  "绝对",
  "永久",
  "包治",
  "根治",
  "100%",
  "全网最低",
  "唯一"
];

const FALLBACK_REASON_LABELS = {
  enhancer_disabled: "模型增强未开启",
  endpoint_missing: "未配置模型接口地址",
  endpoint_invalid: "模型接口地址无效",
  unauthorized: "接口鉴权失败",
  service_fallback: "服务端已回退本地模板",
  timeout: "模型请求超时",
  network_error: "模型接口网络异常",
  http_status: "模型接口返回异常状态",
  parse_error: "模型接口响应解析失败",
  empty_output: "模型接口未返回可用话术"
};

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getClockText(timestamp) {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getFallbackReasonLabel(reason) {
  if (!reason) {
    return "已回退规则模板";
  }
  return FALLBACK_REASON_LABELS[reason] || `回退原因：${reason}`;
}

function countBaseTemplates(templates) {
  let count = 0;
  for (const scene of Object.keys(templates)) {
    for (const tone of Object.keys(templates[scene])) {
      count += templates[scene][tone].length;
    }
  }
  return count;
}

function estimateExpandedTemplates(templates) {
  let count = 0;
  for (const scene of Object.keys(templates)) {
    for (const tone of Object.keys(templates[scene])) {
      const baseCount = templates[scene][tone].length;
      const suffixCount = (TONE_SUFFIXES[tone] || []).length;
      count += baseCount * (1 + suffixCount);
    }
  }
  return count;
}

function buildTemplatePool(scene, tone, templates) {
  const byScene = templates[scene] || templates.general;
  const byTone = byScene[tone] || byScene.professional;
  const suffixes = TONE_SUFFIXES[tone] || [];

  const pool = [...byTone];
  for (const template of byTone) {
    for (const suffix of suffixes) {
      pool.push(`${template}${suffix}`);
    }
  }
  return [...new Set(pool)];
}

function pickTemplate(scene, tone, message, templates) {
  const pool = buildTemplatePool(scene, tone, templates);
  const index = hashString(`${scene}-${tone}-${message}`) % pool.length;
  return pool[index];
}

function classifySceneDetailed(message) {
  const text = normalizeText(message).toLowerCase();
  if (!text) {
    return {
      scene: "general",
      score: 0,
      confidence: 0,
      matchedKeywords: [],
      secondScene: "general",
      secondScore: 0
    };
  }

  const scored = SCENE_RULES.map((rule) => {
    let score = 0;
    const matchedKeywords = [];

    for (const item of rule.weightedKeywords) {
      const keyword = item.keyword.toLowerCase();
      if (text.includes(keyword)) {
        score += item.weight;
        matchedKeywords.push(item.keyword);
      }
    }
    for (const keyword of rule.negativeKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score -= 1.2;
      }
    }
    return {
      scene: rule.scene,
      score,
      matchedKeywords
    };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1] || { scene: "general", score: 0 };

  if (!best || best.score < 2) {
    return {
      scene: "general",
      score: best?.score || 0,
      confidence: 0.2,
      matchedKeywords: [],
      secondScene: second.scene,
      secondScore: second.score
    };
  }

  const margin = best.score - second.score;
  const confidence = clamp((margin + 1.4) / (best.score + 1.4), 0, 1);

  if (margin < 0.8 && best.score < 5) {
    return {
      scene: "general",
      score: best.score,
      confidence: clamp(confidence * 0.5, 0.1, 0.55),
      matchedKeywords: best.matchedKeywords,
      secondScene: second.scene,
      secondScore: second.score
    };
  }

  return {
    scene: best.scene,
    score: best.score,
    confidence,
    matchedKeywords: best.matchedKeywords,
    secondScene: second.scene,
    secondScore: second.score
  };
}

function normalizeSceneOverride(value) {
  if (!value || value === "auto") {
    return "auto";
  }
  if (VALID_SCENES.includes(value) && value !== "general") {
    return value;
  }
  return "auto";
}

function resolveSceneWithPrefs(detected, prefs) {
  const overrideEnabled = Boolean(prefs.sceneOverrideEnabled);
  const overrideScene = normalizeSceneOverride(prefs.sceneOverride);
  const shouldOverride = overrideEnabled && overrideScene !== "auto";
  if (shouldOverride) {
    return {
      finalScene: overrideScene,
      corrected: true,
      correctionType: "manual_override"
    };
  }
  return {
    finalScene: detected.scene,
    corrected: false,
    correctionType: "auto"
  };
}

function buildSceneMeta(message, prefs) {
  const detected = classifySceneDetailed(message);
  const resolved = resolveSceneWithPrefs(detected, prefs);
  const finalScene = resolved.finalScene;
  return {
    detectedScene: detected.scene,
    detectedSceneLabel: SCENE_LABELS[detected.scene] || "通用咨询",
    finalScene,
    finalSceneLabel: SCENE_LABELS[finalScene] || "通用咨询",
    confidence: detected.confidence,
    score: detected.score,
    matchedKeywords: detected.matchedKeywords,
    secondScene: detected.secondScene,
    secondScore: detected.secondScore,
    corrected: resolved.corrected,
    correctionType: resolved.correctionType
  };
}

function detectBannedWords(text) {
  const hits = [];
  for (const word of BANNED_WORDS) {
    const reg = new RegExp(escapeRegex(word), "gi");
    let match = reg.exec(text);
    while (match) {
      hits.push({
        word,
        start: match.index,
        end: match.index + match[0].length
      });
      match = reg.exec(text);
    }
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const deduped = [];
  const seen = new Set();
  for (const item of hits) {
    const key = `${item.start}-${item.end}-${item.word}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }
  return deduped;
}

async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

async function setStorage(payload) {
  return chrome.storage.local.set(payload);
}

async function getPrefs() {
  const data = await getStorage([STORAGE_KEYS.prefs]);
  const merged = {
    ...DEFAULT_PREFS,
    ...(data[STORAGE_KEYS.prefs] || {})
  };
  if (!merged.serviceToken && merged.modelApiKey) {
    merged.serviceToken = String(merged.modelApiKey).trim();
  }
  return merged;
}

async function getTemplates() {
  const data = await getStorage([STORAGE_KEYS.templates]);
  return data[STORAGE_KEYS.templates] || DEFAULT_TEMPLATES;
}

function buildDefaultState() {
  return {
    latestUserMessage: "",
    latestScene: "general",
    latestSceneMeta: {
      detectedScene: "general",
      detectedSceneLabel: SCENE_LABELS.general,
      finalScene: "general",
      finalSceneLabel: SCENE_LABELS.general,
      confidence: 0,
      score: 0,
      matchedKeywords: [],
      secondScene: "general",
      secondScore: 0,
      corrected: false,
      correctionType: "auto"
    },
    lastGeneratedReply: "",
    lastViolations: [],
    lastTone: "professional",
    lastSource: "rule",
    lastSceneMeta: null,
    lastEnhancerMeta: null,
    updatedAt: Date.now()
  };
}

async function getState() {
  const data = await getStorage([STORAGE_KEYS.state]);
  const saved = data[STORAGE_KEYS.state];
  if (!saved) {
    return buildDefaultState();
  }
  const defaults = buildDefaultState();
  return {
    ...defaults,
    ...saved,
    latestSceneMeta: saved.latestSceneMeta || defaults.latestSceneMeta
  };
}

async function appendLog(message, level = "info") {
  const data = await getStorage([STORAGE_KEYS.logs]);
  const logs = data[STORAGE_KEYS.logs] || [];
  logs.push({
    ts: Date.now(),
    level,
    text: `[${getClockText(Date.now())}] ${message}`
  });
  while (logs.length > 200) {
    logs.shift();
  }
  await setStorage({
    [STORAGE_KEYS.logs]: logs
  });
}

function safeReplyText(value, fallback) {
  const text = normalizeText(value);
  if (!text) {
    return fallback;
  }
  if (text.length > 500) {
    return `${text.slice(0, 500)}...`;
  }
  return text;
}

function isValidHttpUrl(url) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function extractReplyFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const candidate =
    payload.reply ||
    payload.data?.reply ||
    payload.output ||
    payload.content ||
    payload.text ||
    payload.result ||
    payload.message ||
    payload.choices?.[0]?.message?.content ||
    payload.choices?.[0]?.text ||
    payload.response?.reply ||
    "";
  return normalizeText(candidate);
}

function buildEnhancerMeta(patch) {
  return {
    attempted: false,
    used: false,
    fallbackReason: "",
    statusCode: 0,
    latencyMs: 0,
    errorMessage: "",
    ...patch
  };
}

async function callEnhancer(options) {
  const { message, scene, tone, localReply, prefs, forceAttempt } = options;
  const shouldAttempt = Boolean(forceAttempt) || Boolean(prefs.enhancerEnabled);
  if (!shouldAttempt) {
    return {
      reply: localReply,
      source: "rule",
      enhancerMeta: buildEnhancerMeta({
        attempted: false,
        used: false,
        fallbackReason: "enhancer_disabled"
      })
    };
  }
  if (!prefs.modelEndpoint) {
    return {
      reply: localReply,
      source: "rule",
      enhancerMeta: buildEnhancerMeta({
        attempted: true,
        used: false,
        fallbackReason: "endpoint_missing"
      })
    };
  }
  if (!isValidHttpUrl(prefs.modelEndpoint)) {
    return {
      reply: localReply,
      source: "rule",
      enhancerMeta: buildEnhancerMeta({
        attempted: true,
        used: false,
        fallbackReason: "endpoint_invalid"
      })
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = Math.max(600, Number(prefs.modelTimeoutMs) || 1800);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      message,
      scene,
      tone,
      localReply,
      instruction:
        "你是电商客服助手。请输出一段可直接发送给买家的中文回复，不要包含解释，不要分点。"
    };
    const headers = {
      "Content-Type": "application/json"
    };
    if (prefs.serviceToken) {
      headers["X-Assistant-Token"] = prefs.serviceToken;
    }

    const resp = await fetch(prefs.modelEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!resp.ok) {
      return {
        reply: localReply,
        source: "rule",
        enhancerMeta: buildEnhancerMeta({
          attempted: true,
          used: false,
          fallbackReason: resp.status === 401 ? "unauthorized" : "http_status",
          statusCode: resp.status,
          latencyMs: Date.now() - startedAt
        })
      };
    }

    let json;
    try {
      json = await resp.json();
    } catch (_error) {
      return {
        reply: localReply,
        source: "rule",
        enhancerMeta: buildEnhancerMeta({
          attempted: true,
          used: false,
          fallbackReason: "parse_error",
          statusCode: resp.status,
          latencyMs: Date.now() - startedAt
        })
      };
    }

    const serviceSource = normalizeText(json.source || json.meta?.source || "").toLowerCase();
    if (serviceSource && serviceSource !== "model") {
      return {
        reply: safeReplyText(json.reply || localReply, localReply),
        source: "rule",
        enhancerMeta: buildEnhancerMeta({
          attempted: true,
          used: false,
          fallbackReason: "service_fallback",
          statusCode: resp.status,
          latencyMs: Date.now() - startedAt,
          errorMessage: normalizeText(json.meta?.reason || "")
        })
      };
    }

    const candidate = extractReplyFromPayload(json);
    if (!candidate) {
      return {
        reply: localReply,
        source: "rule",
        enhancerMeta: buildEnhancerMeta({
          attempted: true,
          used: false,
          fallbackReason: "empty_output",
          statusCode: resp.status,
          latencyMs: Date.now() - startedAt
        })
      };
    }

    const finalReply = safeReplyText(candidate, localReply);
    return {
      reply: finalReply,
      source: "model",
      enhancerMeta: buildEnhancerMeta({
        attempted: true,
        used: true,
        statusCode: resp.status,
        latencyMs: Date.now() - startedAt
      })
    };
  } catch (error) {
    const isTimeout = error?.name === "AbortError";
    return {
      reply: localReply,
      source: "rule",
      enhancerMeta: buildEnhancerMeta({
        attempted: true,
        used: false,
        fallbackReason: isTimeout ? "timeout" : "network_error",
        latencyMs: Date.now() - startedAt,
        errorMessage: normalizeText(error?.message || "")
      })
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertState(patch) {
  const oldState = await getState();
  const next = {
    ...oldState,
    ...patch,
    updatedAt: Date.now()
  };
  await setStorage({
    [STORAGE_KEYS.state]: next
  });
  return next;
}

async function refreshSceneByPrefs() {
  const [prefs, state] = await Promise.all([getPrefs(), getState()]);
  if (!state.latestUserMessage) {
    return;
  }
  const meta = buildSceneMeta(state.latestUserMessage, prefs);
  await upsertState({
    latestScene: meta.finalScene,
    latestSceneMeta: meta
  });
}

async function handleNewUserMessage(rawText) {
  const text = normalizeText(rawText);
  if (!text) {
    return { ok: false, error: "EMPTY_MESSAGE" };
  }

  const current = await getState();
  if (current.latestUserMessage === text) {
    return { ok: true, deduped: true };
  }

  const prefs = await getPrefs();
  const sceneMeta = buildSceneMeta(text, prefs);
  await upsertState({
    latestUserMessage: text,
    latestScene: sceneMeta.finalScene,
    latestSceneMeta: sceneMeta
  });
  await appendLog(`成功捕捉用户消息：${text.slice(0, 60)}${text.length > 60 ? "..." : ""}`);
  await appendLog(
    `场景识别：${sceneMeta.detectedSceneLabel}（置信度${Math.round(sceneMeta.confidence * 100)}%）${
      sceneMeta.corrected ? "，已启用手动纠偏" : ""
    }`
  );

  return {
    ok: true,
    latestUserMessage: text,
    latestScene: sceneMeta.finalScene,
    sceneMeta
  };
}

async function handleGenerateReply(payload) {
  const tone = VALID_TONES.includes(payload?.tone) ? payload.tone : "professional";
  const state = await getState();
  if (!state.latestUserMessage) {
    return { ok: false, error: "NO_MESSAGE" };
  }

  const [prefs, templates] = await Promise.all([getPrefs(), getTemplates()]);
  const sceneMeta = buildSceneMeta(state.latestUserMessage, prefs);
  const scene = sceneMeta.finalScene;

  const localTemplate = pickTemplate(scene, tone, state.latestUserMessage, templates);
  const localReply = safeReplyText(localTemplate, "您好，消息已收到，我这边正在为您核实处理。");
  const generated = await callEnhancer({
    message: state.latestUserMessage,
    scene,
    tone,
    localReply,
    prefs
  });
  const enhancerMeta = generated.enhancerMeta || buildEnhancerMeta();
  const violations = detectBannedWords(generated.reply);

  const nextState = await upsertState({
    latestScene: scene,
    latestSceneMeta: sceneMeta,
    lastGeneratedReply: generated.reply,
    lastViolations: violations,
    lastTone: tone,
    lastSource: generated.source,
    lastSceneMeta: sceneMeta,
    lastEnhancerMeta: enhancerMeta
  });

  const toneLabel = TONE_LABELS[tone] || "专业";
  await appendLog(
    `生成话术成功：场景=${sceneMeta.finalSceneLabel}${sceneMeta.corrected ? "（手动纠偏）" : ""}，语气=${toneLabel}，来源=${
      generated.source === "model" ? "模型增强" : "规则引擎"
    }`
  );
  if (generated.source === "model") {
    await appendLog(`模型增强生效：耗时${enhancerMeta.latencyMs}ms`);
  } else if (enhancerMeta.attempted) {
    await appendLog(`模型增强未生效：${getFallbackReasonLabel(enhancerMeta.fallbackReason)}`, "warn");
  }
  if (violations.length > 0) {
    await appendLog(`检测到违禁词：${violations.map((item) => item.word).join("、")}`, "warn");
  }

  return {
    ok: true,
    data: {
      reply: generated.reply,
      scene,
      sceneLabel: SCENE_LABELS[scene] || "通用咨询",
      sceneMeta,
      enhancerMeta,
      tone,
      source: generated.source,
      violations,
      state: nextState
    }
  };
}

async function handleUpdatePrefs(payload) {
  const current = await getPrefs();
  const next = {
    ...current,
    ...(payload || {})
  };

  if (!VALID_TONES.includes(next.tone)) {
    next.tone = current.tone;
  }
  next.autoGenerateEnabled = Boolean(next.autoGenerateEnabled);
  next.autoCopyEnabled = Boolean(next.autoCopyEnabled);
  if (typeof next.modelEndpoint === "string") {
    next.modelEndpoint = next.modelEndpoint.trim();
  }
  if (typeof next.serviceToken === "string") {
    next.serviceToken = next.serviceToken.trim();
  } else if (typeof next.modelApiKey === "string") {
    next.serviceToken = next.modelApiKey.trim();
  }
  delete next.modelName;
  delete next.modelApiKey;
  if (typeof next.modelTimeoutMs !== "number") {
    next.modelTimeoutMs = Number(next.modelTimeoutMs) || current.modelTimeoutMs;
  }
  next.modelTimeoutMs = Math.min(8000, Math.max(600, next.modelTimeoutMs));
  next.sceneOverrideEnabled = Boolean(next.sceneOverrideEnabled);
  next.sceneOverride = normalizeSceneOverride(next.sceneOverride);

  await setStorage({
    [STORAGE_KEYS.prefs]: next
  });
  await refreshSceneByPrefs();
  await appendLog(
    `偏好设置已更新：语气=${TONE_LABELS[next.tone] || "专业"}，自动生成=${next.autoGenerateEnabled ? "开启" : "关闭"}，模型增强=${
      next.enhancerEnabled ? "开启" : "关闭"
    }${next.serviceToken ? "，接口鉴权=已配置" : "，接口鉴权=未配置"}，误判修正=${
      next.sceneOverrideEnabled ? "开启" : "关闭"
    }，自动复制=${next.autoCopyEnabled ? "开启" : "关闭"}${
      next.sceneOverrideEnabled && next.sceneOverride !== "auto"
        ? `（${SCENE_LABELS[next.sceneOverride] || "通用咨询"}）`
        : ""
    }`
  );
  return { ok: true, data: next };
}

async function handleTestModel(payload) {
  const prefs = await getPrefs();
  const mergedPrefs = {
    ...prefs,
    ...(payload || {}),
    enhancerEnabled: true
  };
  if (typeof mergedPrefs.modelEndpoint === "string") {
    mergedPrefs.modelEndpoint = mergedPrefs.modelEndpoint.trim();
  }
  if (typeof mergedPrefs.serviceToken === "string") {
    mergedPrefs.serviceToken = mergedPrefs.serviceToken.trim();
  } else if (typeof mergedPrefs.modelApiKey === "string") {
    mergedPrefs.serviceToken = mergedPrefs.modelApiKey.trim();
  }
  if (typeof mergedPrefs.modelTimeoutMs !== "number") {
    mergedPrefs.modelTimeoutMs = Number(mergedPrefs.modelTimeoutMs) || prefs.modelTimeoutMs;
  }

  const sampleMessage = normalizeText(payload?.message || "你好，帮我查一下这单什么时候发货？");
  const localReply = "您好，订单会在承诺时效内尽快发出，请您放心。";
  const result = await callEnhancer({
    message: sampleMessage,
    scene: "shipping",
    tone: "professional",
    localReply,
    prefs: mergedPrefs,
    forceAttempt: true
  });
  const enhancerMeta = result.enhancerMeta || buildEnhancerMeta();
  if (result.source === "model") {
    await appendLog(`模型接口测试成功：耗时${enhancerMeta.latencyMs}ms`);
  } else {
    await appendLog(`模型接口测试失败：${getFallbackReasonLabel(enhancerMeta.fallbackReason)}`, "warn");
  }

  return {
    ok: true,
    data: {
      success: result.source === "model",
      previewReply: result.reply,
      source: result.source,
      enhancerMeta
    }
  };
}

async function handleGetState() {
  const [state, prefs, logs, templates] = await Promise.all([
    getState(),
    getPrefs(),
    getStorage([STORAGE_KEYS.logs]).then((data) => data[STORAGE_KEYS.logs] || []),
    getTemplates()
  ]);
  const templateBaseCount = countBaseTemplates(templates);
  const templateExpandedCount = estimateExpandedTemplates(templates);

  return {
    ok: true,
    data: {
      state,
      prefs,
      logs,
      stats: {
        templateBaseCount,
        templateExpandedCount
      }
    }
  };
}

async function handleAppendLog(payload) {
  const text = normalizeText(payload?.text || "");
  const level = payload?.level || "info";
  if (!text) {
    return { ok: false, error: "EMPTY_LOG" };
  }
  await appendLog(text, level);
  return { ok: true };
}

async function configureSidePanel() {
  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch (_error) {
    // 低版本内核可能不支持此能力，静默降级即可
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await configureSidePanel();

  const [stateData, prefsData, logsData, templatesData] = await Promise.all([
    getStorage([STORAGE_KEYS.state]),
    getStorage([STORAGE_KEYS.prefs]),
    getStorage([STORAGE_KEYS.logs]),
    getStorage([STORAGE_KEYS.templates])
  ]);

  const patch = {};
  if (!stateData[STORAGE_KEYS.state]) {
    patch[STORAGE_KEYS.state] = buildDefaultState();
  }
  if (!prefsData[STORAGE_KEYS.prefs]) {
    patch[STORAGE_KEYS.prefs] = DEFAULT_PREFS;
  }
  if (!logsData[STORAGE_KEYS.logs]) {
    patch[STORAGE_KEYS.logs] = [];
  }
  if (!templatesData[STORAGE_KEYS.templates]) {
    patch[STORAGE_KEYS.templates] = DEFAULT_TEMPLATES;
  }
  if (Object.keys(patch).length > 0) {
    await setStorage(patch);
  }

  const templates = patch[STORAGE_KEYS.templates] || templatesData[STORAGE_KEYS.templates] || DEFAULT_TEMPLATES;
  await appendLog("插件初始化完成，当前为本地规则模式");
  await appendLog(
    `模板库已加载：基础模板${countBaseTemplates(templates)}条，扩展模板${estimateExpandedTemplates(templates)}条`
  );
});

chrome.runtime.onStartup.addListener(async () => {
  await configureSidePanel();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      const type = message?.type;
      switch (type) {
        case "ASSISTANT_NEW_USER_MESSAGE": {
          const result = await handleNewUserMessage(message?.payload?.text);
          sendResponse(result);
          return;
        }
        case "ASSISTANT_GENERATE_REPLY": {
          const result = await handleGenerateReply(message?.payload);
          sendResponse(result);
          return;
        }
        case "ASSISTANT_UPDATE_PREFS": {
          const result = await handleUpdatePrefs(message?.payload);
          sendResponse(result);
          return;
        }
        case "ASSISTANT_GET_STATE": {
          const result = await handleGetState();
          sendResponse(result);
          return;
        }
        case "ASSISTANT_APPEND_LOG": {
          const result = await handleAppendLog(message?.payload);
          sendResponse(result);
          return;
        }
        case "ASSISTANT_TEST_MODEL": {
          const result = await handleTestModel(message?.payload);
          sendResponse(result);
          return;
        }
        default:
          sendResponse({ ok: false, error: "UNKNOWN_MESSAGE_TYPE" });
      }
    } catch (error) {
      await appendLog(`运行异常：${error?.message || "未知错误"}`, "error");
      sendResponse({
        ok: false,
        error: "UNEXPECTED_ERROR",
        message: error?.message || "未知错误"
      });
    }
  })();
  return true;
});
