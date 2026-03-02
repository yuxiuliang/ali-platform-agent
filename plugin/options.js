const STORAGE_KEYS = {
  state: "assistant_state",
  logs: "assistant_logs",
  prefs: "assistant_prefs"
};

const FALLBACK_REASON_LABELS = {
  enhancer_disabled: "模型增强未开启",
  endpoint_missing: "未配置模型接口地址",
  endpoint_invalid: "模型接口地址无效",
  unauthorized: "接口鉴权失败（请检查访问令牌）",
  service_fallback: "服务端已回退本地模板",
  timeout: "模型请求超时",
  network_error: "模型接口网络异常",
  http_status: "模型接口返回异常状态",
  parse_error: "模型接口响应解析失败",
  empty_output: "模型接口未返回可用话术"
};

const SCENE_LABELS = {
  size: "尺码咨询",
  shipping: "发货时效",
  logistics: "物流查询",
  return_exchange: "退换售后",
  negative_review: "差评安抚",
  general: "通用咨询"
};

const elements = {
  enhancerEnabled: document.getElementById("enhancerEnabled"),
  modelEndpoint: document.getElementById("modelEndpoint"),
  serviceToken: document.getElementById("serviceToken"),
  modelTimeoutMs: document.getElementById("modelTimeoutMs"),
  saveModelBtn: document.getElementById("saveModelBtn"),
  testModelBtn: document.getElementById("testModelBtn"),
  modelStatus: document.getElementById("modelStatus"),
  sceneOverrideEnabled: document.getElementById("sceneOverrideEnabled"),
  sceneOverride: document.getElementById("sceneOverride"),
  saveSceneBtn: document.getElementById("saveSceneBtn"),
  templateStats: document.getElementById("templateStats"),
  latestMeta: document.getElementById("latestMeta"),
  logList: document.getElementById("logList")
};

let statsCache = null;

function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "NO_RESPONSE" });
    });
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTimeoutInput(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 1800;
  }
  return Math.min(8000, Math.max(600, Math.round(num)));
}

function getFallbackReasonLabel(reason) {
  if (!reason) {
    return "已回退规则模板";
  }
  return FALLBACK_REASON_LABELS[reason] || `回退原因：${reason}`;
}

function renderStatus(text, level = "") {
  elements.modelStatus.className = `status${level ? ` ${level}` : ""}`;
  elements.modelStatus.textContent = text;
}

function renderLogs(logs) {
  const list = (logs || []).slice(-80).reverse();
  if (list.length === 0) {
    elements.logList.innerHTML = "<li>暂无日志</li>";
    return;
  }
  elements.logList.innerHTML = list
    .map((item) => {
      const level = item.level || "info";
      return `<li class="${level}">${escapeHtml(item.text || "")}</li>`;
    })
    .join("");
}

function renderMeta(state, stats) {
  if (stats) {
    elements.templateStats.textContent = `模板库：基础${stats.templateBaseCount}条，扩展${stats.templateExpandedCount}条`;
  } else {
    elements.templateStats.textContent = "模板库：--";
  }

  const sceneMeta = state?.latestSceneMeta;
  if (!sceneMeta) {
    elements.latestMeta.textContent = "最近识别：--";
    return;
  }
  const sceneLabel = SCENE_LABELS[sceneMeta.finalScene] || "通用咨询";
  const confidence = Math.round((sceneMeta.confidence || 0) * 100);
  const keys = sceneMeta.matchedKeywords?.length ? sceneMeta.matchedKeywords.join("、") : "无";
  elements.latestMeta.textContent = `最近识别：${sceneLabel}（置信度${confidence}% | 命中词：${keys}）`;
}

function hydratePrefs(prefs) {
  elements.enhancerEnabled.checked = Boolean(prefs?.enhancerEnabled);
  elements.modelEndpoint.value = prefs?.modelEndpoint || "";
  elements.serviceToken.value = prefs?.serviceToken || prefs?.modelApiKey || "";
  elements.modelTimeoutMs.value = String(normalizeTimeoutInput(prefs?.modelTimeoutMs || 1800));
  elements.sceneOverrideEnabled.checked = Boolean(prefs?.sceneOverrideEnabled);
  elements.sceneOverride.value = prefs?.sceneOverride || "auto";
  elements.sceneOverride.disabled = !elements.sceneOverrideEnabled.checked;
}

async function saveModelPrefs() {
  const payload = {
    enhancerEnabled: elements.enhancerEnabled.checked,
    modelEndpoint: elements.modelEndpoint.value.trim(),
    serviceToken: elements.serviceToken.value.trim(),
    modelTimeoutMs: normalizeTimeoutInput(elements.modelTimeoutMs.value)
  };
  elements.modelTimeoutMs.value = String(payload.modelTimeoutMs);
  const result = await sendMessage({
    type: "ASSISTANT_UPDATE_PREFS",
    payload
  });
  if (!result?.ok) {
    renderStatus("模型配置保存失败，请稍后重试。", "warn");
    return;
  }
  renderStatus("模型配置已保存。", "success");
}

async function saveScenePrefs() {
  const payload = {
    sceneOverrideEnabled: elements.sceneOverrideEnabled.checked,
    sceneOverride: elements.sceneOverride.value
  };
  const result = await sendMessage({
    type: "ASSISTANT_UPDATE_PREFS",
    payload
  });
  if (!result?.ok) {
    renderStatus("纠偏设置保存失败，请稍后重试。", "warn");
    return;
  }
  elements.sceneOverride.disabled = !elements.sceneOverrideEnabled.checked;
  renderStatus("纠偏设置已保存。", "success");
}

async function testModel() {
  const payload = {
    modelEndpoint: elements.modelEndpoint.value.trim(),
    serviceToken: elements.serviceToken.value.trim(),
    modelTimeoutMs: normalizeTimeoutInput(elements.modelTimeoutMs.value)
  };
  elements.modelTimeoutMs.value = String(payload.modelTimeoutMs);
  elements.testModelBtn.disabled = true;
  elements.testModelBtn.textContent = "测试中...";

  const result = await sendMessage({
    type: "ASSISTANT_TEST_MODEL",
    payload
  });

  elements.testModelBtn.disabled = false;
  elements.testModelBtn.textContent = "测试模型";

  if (!result?.ok) {
    renderStatus("模型测试失败：消息通道异常。", "warn");
    return;
  }

  const meta = result.data?.enhancerMeta;
  if (result.data?.success) {
    renderStatus(`模型测试成功，耗时 ${meta?.latencyMs || 0}ms。`, "success");
    return;
  }
  const suffix = meta?.statusCode ? `（HTTP ${meta.statusCode}）` : "";
  renderStatus(`模型测试失败：${getFallbackReasonLabel(meta?.fallbackReason)}${suffix}`, "warn");
}

async function loadData() {
  const result = await sendMessage({
    type: "ASSISTANT_GET_STATE"
  });
  if (!result?.ok) {
    renderStatus("初始化失败，请刷新重试。", "warn");
    return;
  }

  const { prefs, state, logs, stats } = result.data;
  statsCache = stats || null;
  hydratePrefs(prefs);
  renderLogs(logs);
  renderMeta(state, statsCache);
  renderStatus("模型状态：未测试");
}

function bindEvents() {
  elements.saveModelBtn.addEventListener("click", saveModelPrefs);
  elements.saveSceneBtn.addEventListener("click", saveScenePrefs);
  elements.testModelBtn.addEventListener("click", testModel);
  elements.sceneOverrideEnabled.addEventListener("change", () => {
    elements.sceneOverride.disabled = !elements.sceneOverrideEnabled.checked;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (changes[STORAGE_KEYS.prefs]) {
      hydratePrefs(changes[STORAGE_KEYS.prefs].newValue || {});
    }
    if (changes[STORAGE_KEYS.logs]) {
      renderLogs(changes[STORAGE_KEYS.logs].newValue || []);
    }
    if (changes[STORAGE_KEYS.state]) {
      renderMeta(changes[STORAGE_KEYS.state].newValue || {}, statsCache);
    }
  });
}

async function bootstrap() {
  bindEvents();
  await loadData();
}

bootstrap();
