const STORAGE_KEY = "kurashi-electricity-records-v1";
const FIELDS = [
  { key: "solarKwh", label: "太陽光発電量", unit: "kWh", kind: "energy" },
  { key: "usageKwh", label: "家庭消費量", unit: "kWh", kind: "energy" },
  { key: "soldKwh", label: "売電量", unit: "kWh", kind: "energy" },
  { key: "boughtKwh", label: "買電量", unit: "kWh", kind: "energy" },
  { key: "billYen", label: "電気料金", unit: "円", kind: "money" },
  { key: "revenueYen", label: "売電収入", unit: "円", kind: "money" },
];
const RATE_FIELDS = [
  { key: "basicChargeYen", label: "基本料金", unit: "円", kind: "money" },
  { key: "weekdayDayRateYen", label: "平日昼の単価", unit: "円/kWh", kind: "rate" },
  { key: "holidayRateYen", label: "休日の単価", unit: "円/kWh", kind: "rate" },
];
const HEADERS = {
  date: ["date", "日付", "年月日"],
  solarKwh: ["solarkwh", "太陽光発電量", "太陽光発電", "発電量"],
  usageKwh: ["usagekwh", "家庭消費量", "家庭消費", "消費量"],
  soldKwh: ["soldkwh", "売電量"],
  boughtKwh: ["boughtkwh", "買電量", "購入電力量"],
  billYen: ["billyen", "電気料金", "電気代"],
  revenueYen: ["revenueyen", "売電収入", "売電額"],
  basicChargeYen: ["basicchargeyen", "基本料金"],
  weekdayDayRateYen: ["weekdaydayrateyen", "weekdaydayrateyenperkwh", "平日昼の単価", "平日昼単価"],
  holidayRateYen: ["holidayrateyen", "holidayrateyenperkwh", "休日の単価", "休日単価"],
};
const FIELD_ICONS = {
  solarKwh: "☀️",
  usageKwh: "💧",
  soldKwh: "📤",
  boughtKwh: "📥",
  billYen: "🧾",
  revenueYen: "💴",
};

const form = document.querySelector("#entry-form");
const recordsBody = document.querySelector("#records-body");
const statusMessage = document.querySelector("#import-status");
const canvas = document.querySelector("#year-chart");
const context = canvas.getContext("2d");
const allTimeCanvas = document.querySelector("#all-time-chart");
const allTimeContext = allTimeCanvas.getContext("2d");
let records = loadRecords();
let editingDate = null;
let editingLegacyUsage = null;

function isValidDate(value) {
  if (typeof value !== "string") return false;
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    return month >= 1 && month <= 12 && year >= 1;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateRecord(input, rowNumber) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${rowNumber}行目: レコードの形式が正しくありません。`);
  }
  const rawDate = String(input.date ?? "").trim();
  const slashDate = /^(\d{4})\/(\d{1,2})$/.exec(rawDate);
  const inputDate = slashDate
    ? `${slashDate[1]}-${slashDate[2].padStart(2, "0")}`
    : rawDate;
  if (!isValidDate(inputDate)) {
    throw new Error(`${rowNumber}行目: 対象月は YYYY-MM または YYYY/M 形式で入力してください。`);
  }
  const date = inputDate.slice(0, 7);
  const record = { date };
  for (const { key } of [...FIELDS.filter((field) => field.key !== "usageKwh"), ...RATE_FIELDS]) {
    const value = input[key];
    if (value === undefined || value === null || value === "") {
      record[key] = null;
      continue;
    }
    const number = typeof value === "number" ? value : Number(String(value).replaceAll(",", "").trim());
    if (!Number.isFinite(number) || number < 0) {
      throw new Error(`${rowNumber}行目: ${key} は0以上の数値で指定してください。`);
    }
    record[key] = number;
  }

  const [solar, sold, bought] = ["solarKwh", "soldKwh", "boughtKwh"].map((key) => record[key]);
  if ([solar, sold, bought].every((value) => value !== null)) {
    const calculated = Math.round((solar - sold + bought) * 100) / 100;
    if (calculated < 0) {
      throw new Error(`${rowNumber}行目: 発電量 − 売電量 ＋ 買電量が0未満です。入力値を確認してください。`);
    }
    record.usageKwh = calculated;
  } else {
    const legacyUsage = input.usageKwh;
    if (legacyUsage === undefined || legacyUsage === null || legacyUsage === "") {
      record.usageKwh = null;
    } else {
      const number = typeof legacyUsage === "number" ? legacyUsage : Number(String(legacyUsage).replaceAll(",", "").trim());
      if (!Number.isFinite(number) || number < 0) {
        throw new Error(`${rowNumber}行目: usageKwh は0以上の数値で指定してください。`);
      }
      record.usageKwh = number;
    }
  }

  if ([...FIELDS, ...RATE_FIELDS].every(({ key }) => record[key] === null)) {
    throw new Error(`${rowNumber}行目: 電力量・料金または単価を1項目以上入力してください。`);
  }
  return record;
}

function loadRecords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("保存データの形式が正しくありません。");
    const monthlyRecords = aggregateRecords(parsed.map((item, index) => validateRecord(item, index + 1)));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(monthlyRecords));
    } catch (error) {
      showStatus(`月単位の記録へ変換しましたが、保存データを更新できませんでした: ${error.message}`, true);
    }
    return monthlyRecords;
  } catch (error) {
    showStatus(`保存データを読み込めませんでした: ${error.message}`, true);
    return [];
  }
}

function saveRecords(nextRecords) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords));
  } catch (error) {
    showStatus(`ブラウザーに保存できませんでした: ${error.message}`, true);
    return false;
  }
  records = nextRecords;
  refresh();
  return true;
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function currentYear() {
  return Number(document.querySelector("#year-select").value);
}

function selectedMetric() {
  return FIELDS.find((field) => field.key === document.querySelector("#metric-select").value) ?? FIELDS[0];
}

function selectedAllTimeMetric() {
  return FIELDS.find((field) => field.key === document.querySelector("#all-time-metric-select").value) ?? FIELDS[0];
}

function recordsInYear(year) {
  return records.filter((record) => Number(record.date.slice(0, 4)) === year);
}

function sumFor(items, key) {
  let total = 0;
  let count = 0;
  for (const item of items) {
    if (item[key] !== null && item[key] !== undefined) {
      total += item[key];
      count += 1;
    }
  }
  return count ? total : null;
}

function solarImpact(items) {
  const completeRecords = items.filter((record) =>
    record.solarKwh !== null && record.soldKwh !== null && record.soldKwh <= record.solarKwh
  );
  const generated = sumFor(completeRecords, "solarKwh");
  const sold = sumFor(completeRecords, "soldKwh");
  const selfConsumed = generated === null
    ? null
    : Math.round((generated - sold) * 100) / 100;
  const selfConsumptionRate = generated > 0 && selfConsumed !== null
    ? (selfConsumed / generated) * 100
    : null;
  const soldRate = generated > 0 && sold !== null
    ? (sold / generated) * 100
    : null;
  const ratesByDate = recordsWithEffectiveRates(items);
  let estimatedSavings = 0;
  let estimatedMonths = 0;
  completeRecords.forEach((record) => {
    const rates = ratesByDate.get(record.date);
    if (!rates || rates.weekdayDayRateYen === null || rates.holidayRateYen === null) return;
    const [year, month] = record.date.split("-").map(Number);
    const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let weekdays = 0;
    let weekends = 0;
    for (let day = 1; day <= dayCount; day += 1) {
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      if (weekday === 0 || weekday === 6) weekends += 1;
      else weekdays += 1;
    }
    const weightedRate = (weekdays * rates.weekdayDayRateYen + weekends * rates.holidayRateYen) / dayCount;
    estimatedSavings += Math.round((record.solarKwh - record.soldKwh) * weightedRate);
    estimatedMonths += 1;
  });
  const estimatedSavingsYen = estimatedMonths ? Math.round(estimatedSavings) : null;
  return { selfConsumed, selfConsumptionRate, soldRate, estimatedSavingsYen };
}

function recordsWithEffectiveRates(items) {
  const dates = new Set(items.map((record) => record.date));
  const latestRates = Object.fromEntries(RATE_FIELDS.map(({ key }) => [key, null]));
  const ratesByDate = new Map();
  records.forEach((record) => {
    RATE_FIELDS.forEach(({ key }) => {
      if (record[key] !== null && record[key] !== undefined) latestRates[key] = record[key];
    });
    if (dates.has(record.date)) ratesByDate.set(record.date, { ...latestRates });
  });
  return ratesByDate;
}

function formatNumber(value, kind) {
  if (value === null || value === undefined) return "—";
  const digits = kind === "money" ? 0 : 1;
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: digits }).format(value);
}

function formatDate(date) {
  const [year, month] = date.split("-");
  return `${year}年${Number(month)}月`;
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function aggregateRecords(items) {
  const grouped = new Map();
  items.forEach((item) => {
    const record = grouped.get(item.date) ?? {
      date: item.date,
      ...Object.fromEntries([...FIELDS, ...RATE_FIELDS].map(({ key }) => [key, null])),
    };
    FIELDS.forEach(({ key }) => {
      if (item[key] !== null && item[key] !== undefined) {
        record[key] = (record[key] ?? 0) + item[key];
      }
    });
    RATE_FIELDS.forEach(({ key }) => {
      if (item[key] !== null && item[key] !== undefined) record[key] = item[key];
    });
    grouped.set(item.date, record);
  });
  return [...grouped.values()]
    .map((record) => validateRecord(record, record.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function fillYearSelect() {
  const select = document.querySelector("#year-select");
  const previous = select.value;
  const thisYear = new Date().getFullYear();
  const years = new Set([thisYear]);
  records.forEach((record) => {
    const year = Number(record.date.slice(0, 4));
    years.add(year);
    years.add(year - 1);
  });
  if (previous) years.add(Number(previous));
  const orderedYears = [...years].filter(Number.isInteger).sort((a, b) => b - a);
  select.innerHTML = orderedYears.map((year) => `<option value="${year}">${year}年</option>`).join("");
  const latestRecordYear = records.length
    ? Math.max(...records.map((record) => Number(record.date.slice(0, 4))))
    : thisYear;
  select.value = orderedYears.includes(Number(previous))
    ? previous
    : String(recordsInYear(thisYear).length ? thisYear : latestRecordYear);
}

function renderSummary() {
  const year = currentYear();
  const currentRecords = recordsInYear(year);
  const previousRecords = recordsInYear(year - 1);
  const impact = solarImpact(currentRecords);
  const annualRevenue = sumFor(currentRecords, "revenueYen");
  const annualSolarBenefit = impact.estimatedSavingsYen !== null && annualRevenue !== null
    ? impact.estimatedSavingsYen + annualRevenue
    : null;
  document.querySelector("#comparison-caption").textContent = `${year - 1}年との比較`;
  const grid = document.querySelector("#metric-grid");
  const fieldCards = FIELDS.map((field) => {
    const current = sumFor(currentRecords, field.key);
    const previous = sumFor(previousRecords, field.key);
    let comparison = "前年のデータなし";
    if (current !== null && previous !== null) {
      const difference = current - previous;
      const percent = previous === 0
        ? (difference === 0 ? "±0%" : "前年0のため比率なし")
        : `${difference > 0 ? "+" : ""}${((difference / previous) * 100).toFixed(1)}%`;
      const direction = difference === 0 ? "same" : difference > 0 ? "up" : "down";
      const prefix = difference > 0 ? "+" : difference < 0 ? "−" : "±";
      comparison = `<span class="${direction}">${prefix}${formatNumber(Math.abs(difference), field.kind)} ${field.unit} (${percent})</span> 前年比`;
    } else if (current !== null) {
      comparison = "前年のデータなし";
    } else if (previous !== null) {
      comparison = "今年のデータなし";
    }
    return `<article class="metric-card metric-${field.key}"><div class="metric-card-heading"><span class="summary-icon" aria-hidden="true">${FIELD_ICONS[field.key]}</span><p class="metric-label">${field.label}</p></div><p class="metric-value">${formatNumber(current, field.kind)}<small>${field.unit}</small></p><p class="metric-compare">${comparison}</p></article>`;
  }).join("");
  const solarBenefitCards = [
    { icon: "💡", label: "概算節約額", value: impact.estimatedSavingsYen, description: "太陽光の自家消費による概算" },
    { icon: "✨", label: "売電収入＋節約額 合計", value: annualSolarBenefit, description: "売電収入を含む概算合計" },
  ].map((item) =>
    `<article class="metric-card"><div class="metric-card-heading"><span class="summary-icon" aria-hidden="true">${item.icon}</span><p class="metric-label">${item.label}</p></div><p class="metric-value">${formatNumber(item.value, "money")}<small>${item.value === null ? "" : "円"}</small></p><p class="metric-compare">${item.description}</p></article>`
  ).join("");
  grid.innerHTML = fieldCards + solarBenefitCards;

  document.querySelector("#solar-impact-grid").innerHTML = [
    { icon: "🏠", label: "太陽光の自家消費量", value: impact.selfConsumed, unit: "kWh", kind: "energy" },
    { icon: "🌿", label: "発電量に占める自家消費の割合", value: impact.selfConsumptionRate, unit: "%", kind: "percent" },
    { icon: "📤", label: "発電量に占める売電の割合", value: impact.soldRate, unit: "%", kind: "percent" },
  ].map((item) => `<article class="impact-card"><div class="metric-card-heading"><span class="summary-icon" aria-hidden="true">${item.icon}</span><p class="metric-label">${item.label}</p></div><p class="metric-value">${item.value === null ? "—" : formatNumber(item.value, item.kind)}<small>${item.value === null ? "" : item.unit}</small></p></article>`).join("");

  const allTimeImpact = solarImpact(records);
  const allTimeRevenue = sumFor(records, "revenueYen");
  const allTimeSolarBenefit = allTimeImpact.estimatedSavingsYen !== null && allTimeRevenue !== null
    ? allTimeImpact.estimatedSavingsYen + allTimeRevenue
    : null;
  const allTimeValues = [
    ...FIELDS.map((field) => ({ icon: FIELD_ICONS[field.key], label: field.label, value: sumFor(records, field.key), unit: field.unit, kind: field.kind })),
    { icon: "💡", label: "概算節約額", value: allTimeImpact.estimatedSavingsYen, unit: "円", kind: "money" },
    { icon: "✨", label: "売電収入＋節約額 合計", value: allTimeSolarBenefit, unit: "円", kind: "money" },
  ];
  document.querySelector("#all-time-grid").innerHTML = allTimeValues.map((item) =>
    `<article class="metric-card"><div class="metric-card-heading"><span class="summary-icon" aria-hidden="true">${item.icon}</span><p class="metric-label">${item.label}</p></div><p class="metric-value">${formatNumber(item.value, item.kind)}<small>${item.value === null ? "" : item.unit}</small></p></article>`
  ).join("");
  const dates = records.map((record) => record.date).sort();
  document.querySelector("#all-time-caption").textContent = dates.length
    ? `${formatDate(dates[0])}〜${formatDate(dates[dates.length - 1])}・${dates.length}か月分`
    : "記録がありません";
}

function fillMonthSelect() {
  const select = document.querySelector("#month-select");
  const previous = select.value || "all";
  select.innerHTML = '<option value="all">年間すべて</option>' +
    Array.from({ length: 12 }, (_, index) => `<option value="${String(index + 1).padStart(2, "0")}">${index + 1}月</option>`).join("");
  select.value = previous;
}

function renderRecords() {
  const year = currentYear();
  const month = document.querySelector("#month-select").value;
  const visible = records
    .filter((record) => record.date.startsWith(String(year)) && (month === "all" || record.date.slice(5, 7) === month))
    .sort((a, b) => a.date.localeCompare(b.date));
  const effectiveRates = recordsWithEffectiveRates(visible);
  document.querySelector("#records-empty").hidden = visible.length > 0;
  recordsBody.innerHTML = visible.map((record) => {
    const regularCells = FIELDS.map((field) => `<td>${formatNumber(record[field.key], field.kind)}</td>`);
    const rateCells = RATE_FIELDS.map((field) => {
      const value = effectiveRates.get(record.date)?.[field.key] ?? null;
      const inherited = record[field.key] === null && value !== null;
      return `<td>${formatNumber(value, field.kind)}${inherited ? " *" : ""}</td>`;
    });
    const cells = [...regularCells, ...rateCells].join("");
    return `<tr><td>${formatDate(record.date)}</td>${cells}<td><div class="row-actions"><button type="button" data-action="edit" data-date="${record.date}">編集</button><button type="button" class="delete-button" data-action="delete" data-date="${record.date}">削除</button></div></td></tr>`;
  }).join("");
}

function monthValues(year, key) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return sumFor(records.filter((record) => record.date.startsWith(`${year}-${month}`)), key);
  });
}

function renderChart() {
  const plotRect = canvas.parentElement.getBoundingClientRect();
  const width = plotRect.width;
  const height = plotRect.height - 21;
  if (!width || !height) return;
  canvas.classList.remove("chart-rise");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const year = currentYear();
  const field = selectedMetric();
  const current = monthValues(year, field.key);
  const previous = monthValues(year - 1, field.key);
  const values = [...current, ...previous].filter((value) => value !== null);
  const empty = values.length === 0;
  document.querySelector("#chart-empty").hidden = !empty;
  document.querySelector("#current-year-legend").textContent = `${year}年`;
  document.querySelector("#previous-year-legend").textContent = `${year - 1}年`;

  const maxValue = empty ? 1 : Math.max(...values, 1);
  const step = maxValue <= 10 ? 2 : maxValue <= 100 ? 20 : maxValue <= 1000 ? 200 : 1000;
  const axisTop = Math.ceil(maxValue / step) * step || step;
  const decimals = field.kind === "money" ? 0 : 1;
  document.querySelector("#y-axis-labels").innerHTML = [axisTop, axisTop * .75, axisTop * .5, axisTop * .25, 0]
    .map((value) => `<span>${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: decimals }).format(value)}${field.unit}</span>`)
    .join("");

  context.clearRect(0, 0, width, height);
  if (empty) return;
  const top = 7;
  const bottom = 5;
  const plotHeight = height - top - bottom;
  const groupWidth = width / 12;
  const barWidth = Math.max(3, Math.min(12, groupWidth * .25));
  const bars = [
    { values: previous, color: "#dfc682", offset: -barWidth * .65 },
    { values: current, color: "#65a57b", offset: barWidth * .65 },
  ];
  bars.forEach(({ values: series, color, offset }) => {
    context.fillStyle = color;
    series.forEach((value, index) => {
      if (value === null) return;
      const barHeight = Math.max(1, (value / axisTop) * plotHeight);
      const center = groupWidth * (index + .5);
      context.beginPath();
      context.roundRect(center + offset - barWidth / 2, height - bottom - barHeight, barWidth, barHeight, [3, 3, 0, 0]);
      context.fill();
    });
  });
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    void canvas.offsetWidth;
    canvas.classList.add("chart-rise");
  }
  canvas.title = `${year}年と${year - 1}年の${field.label}を月ごとに比較`;
}

function renderAllTimeChart() {
  const plotRect = allTimeCanvas.parentElement.getBoundingClientRect();
  const width = plotRect.width;
  const height = plotRect.height - 21;
  if (!width || !height) return;
  allTimeCanvas.classList.remove("chart-rise");
  const ratio = window.devicePixelRatio || 1;
  allTimeCanvas.width = Math.round(width * ratio);
  allTimeCanvas.height = Math.round(height * ratio);
  allTimeContext.setTransform(ratio, 0, 0, ratio, 0, 0);

  const field = selectedAllTimeMetric();
  const recordYears = records.map((record) => Number(record.date.slice(0, 4)));
  const years = recordYears.length
    ? Array.from({ length: Math.max(...recordYears) - Math.min(...recordYears) + 1 }, (_, index) => Math.min(...recordYears) + index)
    : [];
  const values = years.map((year) => sumFor(recordsInYear(year), field.key));
  const availableValues = values.filter((value) => value !== null);
  const empty = availableValues.length === 0;
  allTimeCanvas.title = `全期間の${field.label}の年間合計推移`;
  document.querySelector("#all-time-chart-empty").hidden = !empty;
  document.querySelector("#all-time-y-axis-labels").innerHTML = "";
  document.querySelector("#all-time-x-axis").innerHTML = "";

  const maxValue = empty ? 1 : Math.max(...availableValues, 1);
  const step = maxValue <= 10 ? 2 : maxValue <= 100 ? 20 : maxValue <= 1000 ? 200 : 1000;
  const axisTop = Math.ceil(maxValue / step) * step || step;
  const decimals = field.kind === "money" ? 0 : 1;
  document.querySelector("#all-time-y-axis-labels").innerHTML = [axisTop, axisTop * .75, axisTop * .5, axisTop * .25, 0]
    .map((value) => `<span>${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: decimals }).format(value)}${field.unit}</span>`)
    .join("");

  allTimeContext.clearRect(0, 0, width, height);
  if (empty) return;
  const labelLimit = Math.max(2, Math.floor(width / 60));
  const labelStep = Math.max(1, Math.ceil(years.length / labelLimit));
  const tickIndexes = new Set([0, years.length - 1]);
  years.forEach((_, index) => {
    if (index % labelStep === 0) tickIndexes.add(index);
  });
  document.querySelector("#all-time-x-axis").innerHTML = [...tickIndexes]
    .sort((a, b) => a - b)
    .map((index) => `<span>${years[index]}年</span>`)
    .join("");

  const top = 7;
  const bottom = 5;
  const plotHeight = height - top - bottom;
  const groupWidth = width / years.length;
  const barWidth = Math.max(1, Math.min(18, groupWidth * .55));
  allTimeContext.fillStyle = "#65a57b";
  values.forEach((value, index) => {
    if (value === null) return;
    const barHeight = Math.max(1, (value / axisTop) * plotHeight);
    const center = groupWidth * (index + .5);
    allTimeContext.beginPath();
    allTimeContext.roundRect(center - barWidth / 2, height - bottom - barHeight, barWidth, barHeight, [3, 3, 0, 0]);
    allTimeContext.fill();
  });
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    void allTimeCanvas.offsetWidth;
    allTimeCanvas.classList.add("chart-rise");
  }
}

function refresh() {
  fillYearSelect();
  fillMonthSelect();
  renderSummary();
  renderRecords();
  renderChart();
  renderAllTimeChart();
}

function showPeriodFor(date, month = "all") {
  const period = date.slice(0, 7);
  document.querySelector("#year-select").value = period.slice(0, 4);
  document.querySelector("#month-select").value = month;
  renderSummary();
  renderRecords();
  renderChart();
}

function readFormRecord() {
  const data = new FormData(form);
  const record = { date: data.get("date") };
  [...FIELDS, ...RATE_FIELDS].forEach(({ key }) => {
    const value = String(data.get(key) ?? "").trim();
    record[key] = value === "" ? null : value;
  });
  return validateRecord(record, "入力");
}

function resetForm() {
  form.reset();
  editingDate = null;
  editingLegacyUsage = null;
  document.querySelector("#record-date").value = localDateString();
  renderCalculatedUsage();
  document.querySelector("#save-button").textContent = "記録を保存";
  document.querySelector("#cancel-edit").hidden = true;
}

function renderCalculatedUsage() {
  const solar = document.querySelector("#solarKwh").value.trim();
  const sold = document.querySelector("#soldKwh").value.trim();
  const bought = document.querySelector("#boughtKwh").value.trim();
  const usageInput = document.querySelector("#usageKwh");
  if ([solar, sold, bought].some((value) => value === "")) {
    usageInput.value = editingLegacyUsage ?? "";
    return;
  }

  const values = [solar, sold, bought].map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    usageInput.value = "";
    return;
  }
  const calculated = Math.round((values[0] - values[1] + values[2]) * 100) / 100;
  if (calculated < 0) {
    usageInput.value = "";
    return;
  }
  usageInput.value = String(calculated);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSVの引用符が閉じられていません。");
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (rows.length < 2) throw new Error("CSVに読み込めるデータ行がありません。");

  const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, "").toLowerCase());
  const columnIndex = {};
  Object.entries(HEADERS).forEach(([key, aliases]) => {
    const index = headers.findIndex((header) => aliases.some((alias) => header === alias.toLowerCase()));
    if (index >= 0) columnIndex[key] = index;
  });
  if (columnIndex.date === undefined) throw new Error("CSVに date（日付）の列がありません。");

  return rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`${index + 2}行目: 列の数が見出しと一致しません。`);
    const item = {};
    Object.entries(columnIndex).forEach(([key, column]) => {
      item[key] = cells[column]?.trim() ?? "";
    });
    return validateRecord(item, index + 2);
  });
}

function parseJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSONを解析できません: ${error.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.records;
  if (!Array.isArray(list) || list.length === 0) throw new Error("JSONは1件以上のレコード配列にしてください。");
  return list.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return validateRecord(item, index + 1);
    const normalized = {};
    Object.entries(HEADERS).forEach(([key, aliases]) => {
      const sourceKey = Object.keys(item).find((candidate) =>
        aliases.some((alias) => candidate.trim().toLowerCase() === alias.toLowerCase()));
      if (sourceKey !== undefined) normalized[key] = item[sourceKey];
    });
    return validateRecord(normalized, index + 1);
  });
}

async function importFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error("ファイルは10MB以下にしてください。");
  const text = await file.text();
  const importedRows = file.name.toLowerCase().endsWith(".json") ? parseJson(text) : parseCsv(text.replace(/^\uFEFF/, ""));
  const imported = aggregateRecords(importedRows);
  const next = new Map(records.map((record) => [record.date, record]));
  let added = 0;
  let updated = 0;
  imported.forEach((record) => {
    if (next.has(record.date)) updated += 1;
    else added += 1;
    next.set(record.date, record);
  });
  if (!saveRecords([...next.values()].sort((a, b) => a.date.localeCompare(b.date)))) return;
  const latestDate = imported.reduce((latest, record) => record.date > latest ? record.date : latest, imported[0].date);
  showPeriodFor(latestDate);
  showStatus(`${added}件を追加、${updated}件を更新しました。`);
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const allFields = [...FIELDS, ...RATE_FIELDS];
  const header = ["date", ...allFields.map(({ key }) => key)].join(",");
  const lines = records.map((record) => [record.date, ...allFields.map(({ key }) => record[key] ?? "")].join(","));
  downloadFile("kurashi-denki-data.csv", `\uFEFF${[header, ...lines].join("\r\n")}`, "text/csv;charset=utf-8");
}

function exportJson() {
  downloadFile("kurashi-denki-data.json", JSON.stringify({ records }, null, 2), "application/json");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const record = readFormRecord();
    const next = new Map(records.map((item) => [item.date, item]));
    if (editingDate && editingDate !== record.date) next.delete(editingDate);
    next.set(record.date, record);
    if (saveRecords([...next.values()].sort((a, b) => a.date.localeCompare(b.date)))) {
      showPeriodFor(record.date, record.date.slice(5, 7));
      showStatus(`${formatDate(record.date)}の記録を保存しました。`);
      resetForm();
    }
  } catch (error) {
    showStatus(error.message, true);
  }
});

document.querySelector("#cancel-edit").addEventListener("click", resetForm);
["solarKwh", "soldKwh", "boughtKwh"].forEach((key) => {
  document.querySelector(`#${key}`).addEventListener("input", () => {
    editingLegacyUsage = null;
    renderCalculatedUsage();
  });
});
document.querySelector("#file-input").addEventListener("change", async (event) => {
  const fileInput = event.currentTarget;
  try {
    await importFile(fileInput.files[0]);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    fileInput.value = "";
  }
});

recordsBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, date } = button.dataset;
  const record = records.find((item) => item.date === date);
  if (!record) return;
  if (action === "edit") {
    editingDate = date;
    editingLegacyUsage = record.usageKwh;
    document.querySelector("#record-date").value = record.date;
    [...FIELDS, ...RATE_FIELDS].forEach(({ key }) => {
      form.elements.namedItem(key).value = record[key] ?? "";
    });
    renderCalculatedUsage();
    document.querySelector("#save-button").textContent = "変更を保存";
    document.querySelector("#cancel-edit").hidden = false;
    document.querySelector("#record-date").focus();
    return;
  }
  if (action === "delete" && window.confirm(`${formatDate(date)}の記録を削除しますか？`)) {
    const next = records.filter((item) => item.date !== date);
    if (saveRecords(next)) showStatus(`${formatDate(date)}の記録を削除しました。`);
  }
});

document.querySelector("#year-select").addEventListener("change", () => {
  renderSummary();
  renderRecords();
  renderChart();
});
document.querySelector("#month-select").addEventListener("change", renderRecords);
document.querySelector("#metric-select").addEventListener("change", renderChart);
document.querySelector("#all-time-metric-select").addEventListener("change", renderAllTimeChart);
document.querySelector("#download-csv").addEventListener("click", () => {
  const inputFields = FIELDS.filter((field) => field.key !== "usageKwh");
  downloadFile("kurashi-denki-template.csv", `date,${[...inputFields, ...RATE_FIELDS].map(({ key }) => key).join(",")}\r\n`, "text/csv;charset=utf-8");
});
document.querySelector("#download-json").addEventListener("click", () => {
  downloadFile("kurashi-denki-template.json", JSON.stringify({ records: [] }, null, 2), "application/json");
});
window.addEventListener("resize", () => {
  renderChart();
  renderAllTimeChart();
});
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  records = loadRecords();
  refresh();
});

document.querySelector("#record-date").value = localDateString();
renderCalculatedUsage();
document.querySelector("#export-csv").addEventListener("click", exportCsv);
document.querySelector("#export-json").addEventListener("click", exportJson);
refresh();
