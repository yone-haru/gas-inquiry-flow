/**
 * メール/Slack送信とテンプレート展開。テストモード時は送信せずログのみ記録する。
 *
 * 呼び出し方は2段階に分かれている。
 * - sendNotification_(): F-02/F-03/F-04 から呼ぶ通常経路。テストモード中は実送信せずログのみ記録する。
 * - dispatchNotification_(): 実際に送信するだけの下位関数。main.js の「テスト通知を送る」は
 *   テストモードの設定に関わらず実際に届くかを確認したいので、こちらを直接呼ぶ。
 */

/**
 * テンプレート本文・件名の {{プレースホルダ}} を実際の値に置換する。
 * 未定義のプレースホルダは空文字に置換し、ログに警告を出す（要件定義書 3.4章）。
 * @param {string} text
 * @param {Object<string, string>} placeholderValues
 * @param {number} [logRetentionRows]
 * @return {string}
 */
function expandTemplate_(text, placeholderValues, logRetentionRows) {
  return String(text).replace(/\{\{([^{}]+)\}\}/g, function (match, key) {
    if (Object.prototype.hasOwnProperty.call(placeholderValues, key)) {
      var value = placeholderValues[key];
      return value === null || value === undefined ? "" : String(value);
    }
    recordLog_(
      "テンプレート展開",
      1,
      LOG_RESULT.FAILURE,
      "未定義のプレースホルダ「{{" + key + "}}」を空文字に置換しました。",
      logRetentionRows
    );
    return "";
  });
}

/**
 * 「通知テンプレート」シートからテンプレートIDで1件取得する。
 * @param {string} templateId TEMPLATE_IDS のいずれか
 * @return {{subject: string, body: string}}
 */
function getTemplate_(templateId) {
  var sheet = getSheetOrThrow_(SHEET_NAMES.TEMPLATE);
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var columnCount = TEMPLATE_COL.BODY - TEMPLATE_COL.ID + 1;
    var rows = sheet.getRange(2, TEMPLATE_COL.ID, lastRow - 1, columnCount).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][TEMPLATE_COL.ID - 1] === templateId) {
        return {
          subject: rows[i][TEMPLATE_COL.SUBJECT - 1],
          body: rows[i][TEMPLATE_COL.BODY - 1],
        };
      }
    }
  }
  throw new Error(
    "テンプレートID「" + templateId + "」が「通知テンプレート」シートに見つかりません。初期セットアップを実行してください。"
  );
}

/**
 * メールを送信する。失敗しても例外を投げず false を返す（要件定義書 6.5章）。
 * @param {string} email
 * @param {string} subject
 * @param {string} body
 * @return {boolean} 成功したか
 */
function sendEmail_(email, subject, body) {
  if (!email) return false;
  try {
    MailApp.sendEmail(email, subject, body);
    return true;
  } catch {
    return false;
  }
}

/**
 * Slack Incoming Webhook に投稿する。失敗しても例外を投げず false を返す（要件定義書 6.5, 6.6章）。
 * @param {string} webhookUrl
 * @param {{slackMention: string}} recipient slackMention が空でもよい
 * @param {string} subject
 * @param {string} body
 * @return {boolean} 成功したか（レスポンスコード200を成功とみなす）
 */
function sendSlack_(webhookUrl, recipient, subject, body) {
  try {
    var mentionPrefix = recipient && recipient.slackMention ? recipient.slackMention + "\n" : "";
    var text = mentionPrefix + subject + "\n" + body;
    var response = UrlFetchApp.fetch(webhookUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true,
    });
    return response.getResponseCode() === 200;
  } catch {
    return false;
  }
}

/**
 * 設定に従って実際に送信する（テストモードは見ない。呼び出し元が判断すること）。
 * 通知方法がSlackで送信に失敗した場合はメールにフォールバックする（要件定義書 6.6章）。
 * @param {string} subject
 * @param {string} body
 * @param {{email: string, slackMention: string}} recipient
 * @param {Object} config
 * @return {Array<{method: string, success: boolean}>}
 */
function dispatchNotification_(subject, body, recipient, config) {
  var wantsSlack = config.notifyMethod === "Slack" || config.notifyMethod === "両方";
  var wantsEmail = config.notifyMethod === "メール" || config.notifyMethod === "両方";
  var results = [];

  var slackOk = false;
  if (wantsSlack && config.slackWebhookUrl) {
    slackOk = sendSlack_(config.slackWebhookUrl, recipient, subject, body);
    results.push({ method: "Slack", success: slackOk });
  }

  if (wantsEmail) {
    results.push({ method: "メール", success: sendEmail_(recipient.email, subject, body) });
  } else if (wantsSlack && !slackOk) {
    // 通知方法がSlack単独で、Slack送信ができなかった場合のみメールにフォールバックする。
    results.push({ method: "メール(フォールバック)", success: sendEmail_(recipient.email, subject, body) });
  }

  return results;
}

/**
 * 組み立て済みの件名・本文で通知を送信する（テストモード時は実送信せずログのみ記録）。
 * 日次リマインドやエスカレーションなど、テンプレートの単純展開以外の文面で送信するときに使用する。
 * @param {string} subject
 * @param {string} body
 * @param {{name: string, email: string, slackMention: string}} recipient
 * @param {Object} config
 * @param {string} [processName] ログに記録する処理名（デフォルト: "通知送信"）
 */
function sendComposedNotification_(subject, body, recipient, config, processName) {
  var proc = processName || "通知送信";

  if (config.testMode) {
    recordLog_(
      proc + "(テストモード)",
      1,
      LOG_RESULT.SKIPPED,
      "宛先: " + (recipient.email || "(メールアドレス無し)") + " / 件名: " + subject,
      config.logRetentionRows
    );
    return;
  }

  var results = dispatchNotification_(subject, body, recipient, config);
  var allOk = results.length > 0 && results.every(function (r) {
    return r.success;
  });
  var summary = results
    .map(function (r) {
      return r.method + ":" + (r.success ? "成功" : "失敗");
    })
    .join(", ");
  recordLog_(
    proc,
    1,
    allOk ? LOG_RESULT.SUCCESS : LOG_RESULT.FAILURE,
    summary || "送信対象なし（通知方法の設定を確認してください）",
    config.logRetentionRows
  );
}

/**
 * F-02/F-03/F-04 から呼ぶ通知送信の入口。テンプレート展開を行い、テストモード中は実送信せず
 * 送信予定の内容をログに記録するだけにする（要件定義書 F-06）。
 * @param {string} templateId TEMPLATE_IDS のいずれか
 * @param {{name: string, email: string, slackMention: string}} recipient
 * @param {Object<string, string>} placeholderValues
 * @param {Object} config
 */
function sendNotification_(templateId, recipient, placeholderValues, config) {
  var template = getTemplate_(templateId);
  var subject = expandTemplate_(template.subject, placeholderValues, config.logRetentionRows);
  var body = expandTemplate_(template.body, placeholderValues, config.logRetentionRows);

  sendComposedNotification_(subject, body, recipient, config, "通知送信");
}

/**
 * 管理者にシステムエラーを通知する。
 * 要件定義書 6.5章: 管理者へのエラー通知は1日1通までに制限する。
 * @param {Object} [config]
 * @param {string} processName 処理名（例: "新規受付処理", "日次リマインド"）
 * @param {string} message エラー内容
 */
function notifyAdminOfSystemError_(config, processName, message) {
  if (!config || !config.adminEmail) return;

  var todayStr = formatDateYmd_(new Date());
  var props = PropertiesService.getScriptProperties();
  var sentDate = props.getProperty(PROP_KEYS.ADMIN_ERROR_MAIL_SENT_DATE);
  if (sentDate === todayStr) return;

  // 1日1通制限のため、成否に関わらず日付を記録する
  props.setProperty(PROP_KEYS.ADMIN_ERROR_MAIL_SENT_DATE, todayStr);

  try {
    MailApp.sendEmail(
      config.adminEmail,
      "【システムエラー】" + processName + "で問題が発生しました",
      message
    );
  } catch {
    // エラー通知の失敗は例外を外に投げない
  }
}

