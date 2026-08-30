/**
 * 「設定」シートの読み込みとバリデーション。
 * 読み込み時に必ずバリデーションを行い、不正な値があればセルを赤くして何が問題かを明示する（要件定義書 3.2章）。
 */

var CONFIG_INVALID_BG = "#f4cccc";
var CONFIG_VALID_BG = "#ffffff";

/**
 * 「設定」シートB列のセル値を文字列に正規化する。
 * `setValues()` で "TRUE"/"FALSE" という文字列を書き込んでも、Google スプレッドシート側が
 * ユーザー入力と同様に自動認識し、実際には真偽値（boolean）型のセルになることがある
 * （テストモードの初期値がまさにこれに該当する）。`getValues()` で読み戻すと `true`/`false` という
 * JS の boolean が返り、素朴に `String()` すると "true"/"false"（小文字）になって
 * "TRUE"/"FALSE" 前提の比較が壊れるため、ここで大文字の文字列に戻す。
 * @param {*} cellValue
 * @return {string}
 */
function normalizeConfigValue_(cellValue) {
  if (typeof cellValue === "boolean") {
    return cellValue ? "TRUE" : "FALSE";
  }
  return String(cellValue).trim();
}

/**
 * 設定キーごとのバリデータ。value は B列の文字列（空文字の可能性あり）。
 * 問題があればエラーメッセージの文字列を返す。問題なければ null を返す。
 */
function getConfigValidators_() {
  var rules = {};

  rules[CONFIG_KEYS.NOTIFY_METHOD] = function (value) {
    var allowed = ["メール", "Slack", "両方"];
    if (allowed.indexOf(value) === -1) {
      return "「メール」「Slack」「両方」のいずれかを入力してください。";
    }
    return null;
  };

  rules[CONFIG_KEYS.SLACK_WEBHOOK_URL] = function (value, config) {
    var notifyMethod = config[CONFIG_KEYS.NOTIFY_METHOD];
    var needsSlack = notifyMethod === "Slack" || notifyMethod === "両方";
    if (!needsSlack) return null;
    if (!value || value.indexOf("https://") !== 0) {
      return "通知方法にSlackを含める場合は https:// から始まるWebhook URLを入力してください。";
    }
    return null;
  };

  rules[CONFIG_KEYS.ADMIN_EMAIL] = function (value) {
    if (!value) return null; // 空は許容（エスカレーション未使用として扱う）
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return "メールアドレスの形式が正しくありません。";
    }
    return null;
  };

  rules[CONFIG_KEYS.REMIND_HOUR] = makePositiveIntegerValidator_(
    "0〜23 の整数を入力してください。",
    0,
    23
  );
  rules[CONFIG_KEYS.SLA_DAYS_QUOTE] = makePositiveIntegerValidator_(
    "1以上の整数（営業日数）を入力してください。",
    1,
    null
  );
  rules[CONFIG_KEYS.SLA_DAYS_BUG] = makePositiveIntegerValidator_(
    "1以上の整数（営業日数）を入力してください。",
    1,
    null
  );
  rules[CONFIG_KEYS.SLA_DAYS_OTHER] = makePositiveIntegerValidator_(
    "1以上の整数（営業日数）を入力してください。",
    1,
    null
  );
  rules[CONFIG_KEYS.REMIND_TARGET_DAYS] = makePositiveIntegerValidator_(
    "0以上の整数を入力してください。",
    0,
    null
  );
  rules[CONFIG_KEYS.LOG_RETENTION_ROWS] = makePositiveIntegerValidator_(
    "1以上の整数を入力してください。",
    1,
    null
  );

  rules[CONFIG_KEYS.BUSINESS_DAYS] = function (value) {
    if (!value) return "「月,火,水,木,金」のようにカンマ区切りで曜日を入力してください。";
    var validDays = ["日", "月", "火", "水", "木", "金", "土"];
    var days = value.split(",").map(function (d) {
      return d.trim();
    });
    for (var i = 0; i < days.length; i++) {
      if (validDays.indexOf(days[i]) === -1) {
        return "「" + days[i] + "」は曜日として認識できません。日〜土の漢字1文字をカンマ区切りで入力してください。";
      }
    }
    return null;
  };

  rules[CONFIG_KEYS.HOLIDAYS] = function (value) {
    if (!value) return null; // 空は許容
    var dates = value.split(",").map(function (d) {
      return d.trim();
    });
    for (var i = 0; i < dates.length; i++) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dates[i])) {
        return "「" + dates[i] + "」は YYYY-MM-DD 形式で入力してください（例: 2026-12-29）。";
      }
    }
    return null;
  };

  rules[CONFIG_KEYS.TEST_MODE] = function (value) {
    if (value !== "TRUE" && value !== "FALSE") {
      return "TRUE か FALSE を入力してください。";
    }
    return null;
  };

  return rules;
}

/**
 * @param {string} message
 * @param {number} min
 * @param {number|null} max
 */
function makePositiveIntegerValidator_(message, min, max) {
  return function (value) {
    if (!/^-?\d+$/.test(value)) return message;
    var n = parseInt(value, 10);
    if (n < min) return message;
    if (max !== null && n > max) return message;
    return null;
  };
}

/**
 * 「設定」シートを検証し、不正なセルを赤くする（正常なセルは白に戻す）。
 * @return {{isValid: boolean, errors: Array<{key: string, message: string}>}}
 */
function validateConfigSheet() {
  var sheet = getSheetOrThrow_(SHEET_NAMES.CONFIG);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { isValid: false, errors: [{ key: "(全体)", message: "設定シートにデータがありません。初期セットアップを実行してください。" }] };
  }

  var columnCount = CONFIG_COL.VALUE - CONFIG_COL.KEY + 1;
  var range = sheet.getRange(2, CONFIG_COL.KEY, lastRow - 1, columnCount);
  var values = range.getValues();

  // 1周目: 検証に使う設定値の連想配列を先に作る（ルール間で他キーの値を参照するため。例: Slack Webhook URLは通知方法に依存）
  var rawConfig = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][CONFIG_COL.KEY - 1]).trim();
    var value = normalizeConfigValue_(values[i][CONFIG_COL.VALUE - 1]);
    if (key) rawConfig[key] = value;
  }

  var validators = getConfigValidators_();
  var errors = [];
  var backgrounds = [];

  for (var r = 0; r < values.length; r++) {
    var rowKey = String(values[r][CONFIG_COL.KEY - 1]).trim();
    var rowValue = normalizeConfigValue_(values[r][CONFIG_COL.VALUE - 1]);
    var validator = validators[rowKey];
    var bg = CONFIG_VALID_BG;
    if (validator) {
      var message = validator(rowValue, rawConfig);
      if (message) {
        errors.push({ key: rowKey, message: message });
        bg = CONFIG_INVALID_BG;
      }
    }
    backgrounds.push([bg]);
  }

  sheet.getRange(2, CONFIG_COL.VALUE, values.length, 1).setBackgrounds(backgrounds);

  return { isValid: errors.length === 0, errors: errors };
}

/**
 * 設定シートを読み込み、型変換済みの設定オブジェクトを返す。
 * 不正な値がある場合は例外を投げる（呼び出し元の処理を進めさせないため）。
 * @return {Object}
 */
function getConfig_() {
  var result = validateConfigSheet();
  if (!result.isValid) {
    var summary = result.errors
      .map(function (e) {
        return "・" + e.key + ": " + e.message;
      })
      .join("\n");
    throw new Error("設定シートに不正な値があります。修正してから再実行してください。\n" + summary);
  }

  var sheet = getSheetOrThrow_(SHEET_NAMES.CONFIG);
  var lastRow = sheet.getLastRow();
  var columnCount = CONFIG_COL.VALUE - CONFIG_COL.KEY + 1;
  var values = sheet.getRange(2, CONFIG_COL.KEY, lastRow - 1, columnCount).getValues();

  var raw = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][CONFIG_COL.KEY - 1]).trim();
    var value = normalizeConfigValue_(values[i][CONFIG_COL.VALUE - 1]);
    if (key) raw[key] = value;
  }

  return {
    notifyMethod: raw[CONFIG_KEYS.NOTIFY_METHOD],
    slackWebhookUrl: raw[CONFIG_KEYS.SLACK_WEBHOOK_URL],
    adminEmail: raw[CONFIG_KEYS.ADMIN_EMAIL],
    remindHour: parseInt(raw[CONFIG_KEYS.REMIND_HOUR], 10),
    slaDays: {
      見積依頼: parseInt(raw[CONFIG_KEYS.SLA_DAYS_QUOTE], 10),
      不具合報告: parseInt(raw[CONFIG_KEYS.SLA_DAYS_BUG], 10),
      その他: parseInt(raw[CONFIG_KEYS.SLA_DAYS_OTHER], 10),
    },
    businessDays: raw[CONFIG_KEYS.BUSINESS_DAYS].split(",").map(function (d) {
      return d.trim();
    }),
    holidays: raw[CONFIG_KEYS.HOLIDAYS]
      ? raw[CONFIG_KEYS.HOLIDAYS].split(",").map(function (d) {
          return d.trim();
        })
      : [],
    remindTargetDays: parseInt(raw[CONFIG_KEYS.REMIND_TARGET_DAYS], 10),
    testMode: raw[CONFIG_KEYS.TEST_MODE] === "TRUE",
    logRetentionRows: parseInt(raw[CONFIG_KEYS.LOG_RETENTION_ROWS], 10),
  };
}
