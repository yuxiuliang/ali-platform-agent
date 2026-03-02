const COMMON_MESSAGE_ITEM_SELECTORS = [
  "[data-e2e='message-item']",
  "[data-testid*='message-item']",
  ".message-item",
  ".im-message-item",
  ".chat-message-item",
  ".im-msg-item",
  "[class*='message-item']",
  "[class*='msg-item']",
  "[class*='chat-item']"
];

const COMMON_TEXT_NODE_SELECTORS = [
  ".message-content",
  ".msg-content",
  ".content",
  ".bubble",
  ".text",
  "p",
  "span"
];

const COMMON_USER_HINTS = ["buyer", "user", "customer", "client", "买家", "用户", "顾客", "客户", "访客"];
const COMMON_SERVICE_HINTS = [
  "seller",
  "service",
  "agent",
  "merchant",
  "客服",
  "商家",
  "店主",
  "机器人",
  "系统",
  "self",
  "mine"
];

const PLATFORM_PROFILES = [
  {
    name: "taobao",
    hostPatterns: [/([.]|^)taobao[.]com$/, /([.]|^)tmall[.]com$/],
    chatHints: ["chat", "wangwang", "aliim", "im", "kefu", "service", "message"],
    messageItemSelectors: [
      ".aliwangwang-message",
      ".wangwang-chat-item",
      ".chat-msg-item",
      "[class*='aliim'][class*='item']"
    ],
    textNodeSelectors: [".chat-msg-text", ".bubble-content", ".message-body", ".msg-text"],
    userHints: ["from-user", "from-buyer", "taobao-buyer", "visitor"],
    serviceHints: ["from-self", "from-seller", "seller-service", "xiaomi", "店小蜜"]
  },
  {
    name: "xianyu",
    hostPatterns: [/([.]|^)xianyu[.]com$/],
    chatHints: ["chat", "message", "im", "talk", "session"],
    messageItemSelectors: [
      ".chat-msg-item",
      ".message-list-item",
      ".session-message-item",
      "[class*='xy-chat'][class*='item']"
    ],
    textNodeSelectors: [".chat-msg-text", ".msg-main", ".bubble-main", ".msg-body"],
    userHints: ["from-other", "peer", "buyer-side"],
    serviceHints: ["from-self", "self-side", "seller-side"]
  },
  {
    name: "fliggy",
    hostPatterns: [/([.]|^)fliggy[.]com$/, /([.]|^)alitrip[.]com$/],
    chatHints: ["chat", "service", "message", "im", "kefu", "consult"],
    messageItemSelectors: [".fliggy-chat-item", ".travel-msg-item", ".service-msg-item"],
    textNodeSelectors: [".travel-msg-text", ".service-msg-text", ".bubble-inner", ".msg-text"],
    userHints: ["traveler", "tourist", "guest", "visitor", "from-customer"],
    serviceHints: ["advisor", "service-agent", "from-service"]
  }
];

const GENERIC_PROFILE = {
  name: "generic",
  hostPatterns: [],
  chatHints: ["chat", "message", "im", "kefu", "service"],
  messageItemSelectors: [],
  textNodeSelectors: [],
  userHints: [],
  serviceHints: []
};

let lastDispatchedMessage = "";
let scanTimer = 0;
let isScanning = false;
let observerStarted = false;

function normalizeText(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function likelyTimestampOnly(text) {
  return /^(\d{1,2}:\d{2})(:\d{2})?$/.test(text) || text === "刚刚";
}

function resolveProfile() {
  const host = String(window.location.hostname || "").toLowerCase();
  for (const profile of PLATFORM_PROFILES) {
    if (profile.hostPatterns.some((pattern) => pattern.test(host))) {
      return profile;
    }
  }
  return GENERIC_PROFILE;
}

const ACTIVE_PROFILE = resolveProfile();

const MESSAGE_ITEM_SELECTORS = [...ACTIVE_PROFILE.messageItemSelectors, ...COMMON_MESSAGE_ITEM_SELECTORS];
const TEXT_NODE_SELECTORS = [...ACTIVE_PROFILE.textNodeSelectors, ...COMMON_TEXT_NODE_SELECTORS];
const USER_HINTS = [...ACTIVE_PROFILE.userHints, ...COMMON_USER_HINTS];
const SERVICE_HINTS = [...ACTIVE_PROFILE.serviceHints, ...COMMON_SERVICE_HINTS];
const CHAT_HINTS = [...ACTIVE_PROFILE.chatHints, ...GENERIC_PROFILE.chatHints];

function looksLikeChatPage() {
  const pageText = `${window.location.pathname} ${window.location.search} ${document.title}`.toLowerCase();
  return CHAT_HINTS.some((hint) => pageText.includes(hint));
}

function collectMessageItems() {
  const set = new Set();
  const result = [];

  for (const selector of MESSAGE_ITEM_SELECTORS) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!set.has(node)) {
        set.add(node);
        result.push(node);
      }
    }
  }

  if (result.length === 0) {
    const fallback = document.querySelectorAll("li, div");
    for (const node of fallback) {
      const className = String(node.className || "").toLowerCase();
      if (className.includes("msg") || className.includes("message") || className.includes("chat")) {
        result.push(node);
      }
    }
  }

  return result;
}

function extractTextFromNode(node) {
  const rootText = normalizeText(node.innerText || "");
  let best = rootText;
  const children = node.querySelectorAll(TEXT_NODE_SELECTORS.join(","));
  for (const child of children) {
    const text = normalizeText(child.innerText || child.textContent || "");
    if (text.length > best.length) {
      best = text;
    }
  }
  return best.slice(0, 500);
}

function scoreAsUser(node) {
  let score = 0;
  const metadata = [
    node.className || "",
    node.getAttribute("data-role") || "",
    node.getAttribute("data-sender") || "",
    node.getAttribute("aria-label") || ""
  ]
    .join(" ")
    .toLowerCase();

  for (const hint of USER_HINTS) {
    if (metadata.includes(hint.toLowerCase())) {
      score += 3;
    }
  }
  for (const hint of SERVICE_HINTS) {
    if (metadata.includes(hint.toLowerCase())) {
      score -= 4;
    }
  }

  // 大多数 IM 布局里，左侧通常是买家消息，右侧通常是客服消息。
  const rect = node.getBoundingClientRect();
  if (rect.width > 16 && rect.height > 10) {
    if (rect.left <= window.innerWidth * 0.45) {
      score += 1;
    }
    if (rect.left >= window.innerWidth * 0.55) {
      score -= 1;
    }
  }
  return score;
}

function extractLatestUserMessage() {
  const items = collectMessageItems();
  if (items.length === 0) {
    return "";
  }

  const candidates = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const text = extractTextFromNode(item);
    if (!text || text.length < 2 || likelyTimestampOnly(text)) {
      continue;
    }
    const score = scoreAsUser(item);
    candidates.push({ text, score, index: i });
  }

  if (candidates.length === 0) {
    return "";
  }

  const userCandidates = candidates.filter((entry) => entry.score > 0);
  const selected = (userCandidates.length > 0 ? userCandidates : candidates).at(-1);
  if (!selected || selected.score < -1) {
    return "";
  }
  return selected.text;
}

function reportLatestUserMessage(text) {
  if (!text || text === lastDispatchedMessage) {
    return;
  }
  lastDispatchedMessage = text;

  chrome.runtime.sendMessage(
    {
      type: "ASSISTANT_NEW_USER_MESSAGE",
      payload: {
        text
      }
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

function runScan() {
  if (isScanning || !looksLikeChatPage()) {
    return;
  }
  isScanning = true;
  try {
    const latest = extractLatestUserMessage();
    if (latest) {
      reportLatestUserMessage(latest);
    }
  } finally {
    isScanning = false;
  }
}

function scheduleScan() {
  if (scanTimer) {
    return;
  }
  scanTimer = window.setTimeout(() => {
    scanTimer = 0;
    runScan();
  }, 260);
}

function startObserver() {
  if (observerStarted || !document.body) {
    return;
  }
  observerStarted = true;

  const observer = new MutationObserver(() => {
    scheduleScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  runScan();
  window.setInterval(runScan, 3200);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleScan();
    }
  });
}

function bootstrap() {
  startObserver();
  if (!looksLikeChatPage()) {
    window.setInterval(() => {
      if (looksLikeChatPage()) {
        scheduleScan();
      }
    }, 2000);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
