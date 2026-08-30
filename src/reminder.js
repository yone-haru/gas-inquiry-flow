/**
 * 日次リマインド。100行単位のバッチ処理＋4分30秒での安全中断＋継続トリガーでの再開、
 * 期限超過エスカレーションを扱う（要件定義書 6.1章）。
 */

/**
 * 列番号（1始まり）をスプレッドシートの列文字（A, B, ..., Z, AA, ...）に変換する。
 * @param {number} columnNumber
 * @return {string}
 */
function columnNumberToLetter_(columnNumber) {
  var letter = "";
  var n = columnNumber;
  while (n > 0) {
    var remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/**
 * 登録済みの継続トリガーがあれば削除する。
 * @param {GoogleAppsScript.Properties.Properties} props
 */
function deleteContinuationTrigger_(props) {
  var triggerId = props.getProperty(PROP_KEYS.REMINDER_CONTINUATION_TRIGGER_ID);
  if (triggerId) {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getUniqueId() === triggerId) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    props.deleteProperty(PROP_KEYS.REMINDER_CONTINUATION_TRIGGER_ID);
  }
}

/**
 * 担当者名から送信先情報（email, slackMention）を解決する。
 * 管理者の場合または担当者シートに存在しない場合は管理者情報を返す。
 * @param {string} name
 * @param {Object<string, {name: string, email: string, slackMention: string}>} staffMap
 * @param {Object} config
 * @return {{name: string, email: string, slackMention: string}}
 */
function resolveRecipientByName_(name, staffMap, config) {
  if (!name || name === "管理者" || !staffMap[name]) {
    return {
      name: name || "管理者",
      email: config.adminEmail,
      slackMention: "",
    };
  }
  return staffMap[name];
}

/**
 * 収集した行番号からシートの該当行データを一括再取得し、担当者別のリマインド/期限超過マップを組み立てる。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number[]} reminderRows
 * @param {number[]} overdueRows
 * @return {{reminderByAssignee: Object, overdueByAssignee: Object, updatedRows: number[]}}
 */
function buildGroupedReminderData_(sheet, reminderRows, overdueRows) {
  var reminderByAssignee = {};
  var overdueByAssignee = {};
  var updatedRows = [];

  var rowSet = {};
  var allRows = [];
  var r;
  for (r = 0; r < reminderRows.length; r++) {
    if (!rowSet[reminderRows[r]]) {
      rowSet[reminderRows[r]] = true;
      allRows.push(reminderRows[r]);
    }
  }
  for (r = 0; r < overdueRows.length; r++) {
    if (!rowSet[overdueRows[r]]) {
      rowSet[overdueRows[r]] = true;
      allRows.push(overdueRows[r]);
    }
  }

  if (allRows.length === 0) {
    return {
      reminderByAssignee: reminderByAssignee,
      overdueByAssignee: overdueByAssignee,
      updatedRows: updatedRows,
    };
  }

  updatedRows = allRows;

  var minRow = Math.min.apply(null, allRows);
  var maxRow = Math.max.apply(null, allRows);
  var numRows = maxRow - minRow + 1;
  var columnCount = INQUIRY_COL.NOTE - INQUIRY_COL.TIMESTAMP + 1;
  var values = sheet.getRange(minRow, 1, numRows, columnCount).getValues();

  var rowDataMap = {};
  for (var i = 0; i < values.length; i++) {
    rowDataMap[minRow + i] = values[i];
  }

  for (var remIdx = 0; remIdx < reminderRows.length; remIdx++) {
    var remRowNum = reminderRows[remIdx];
    var remRowData = rowDataMap[remRowNum];
    if (!remRowData) continue;

    var remAssignee = remRowData[INQUIRY_COL.ASSIGNEE - 1] || "未割り当て";
    var remDueDate = remRowData[INQUIRY_COL.DUE_DATE - 1];
    var remDueDateStr = remDueDate instanceof Date ? formatDateYmd_(remDueDate) : String(remDueDate || "");

    if (!reminderByAssignee[remAssignee]) {
      reminderByAssignee[remAssignee] = [];
    }
    reminderByAssignee[remAssignee].push({
      rowIndex: remRowNum,
      managementId: remRowData[INQUIRY_COL.MANAGEMENT_ID - 1],
      name: remRowData[INQUIRY_COL.NAME - 1],
      dueDateStr: remDueDateStr,
    });
  }

  for (var ovIdx = 0; ovIdx < overdueRows.length; ovIdx++) {
    var ovRowNum = overdueRows[ovIdx];
    var ovRowData = rowDataMap[ovRowNum];
    if (!ovRowData) continue;

    var ovAssignee = ovRowData[INQUIRY_COL.ASSIGNEE - 1] || "未割り当て";
    var ovDueDate = ovRowData[INQUIRY_COL.DUE_DATE - 1];
    var ovDueDateStr = ovDueDate instanceof Date ? formatDateYmd_(ovDueDate) : String(ovDueDate || "");

    if (!overdueByAssignee[ovAssignee]) {
      overdueByAssignee[ovAssignee] = [];
    }
    overdueByAssignee[ovAssignee].push({
      rowIndex: ovRowNum,
      managementId: ovRowData[INQUIRY_COL.MANAGEMENT_ID - 1],
      name: ovRowData[INQUIRY_COL.NAME - 1],
      dueDateStr: ovDueDateStr,
    });
  }

  return {
    reminderByAssignee: reminderByAssignee,
    overdueByAssignee: overdueByAssignee,
    updatedRows: updatedRows,
  };
}

/**
 * 集計したリマインド・期限超過対象を行ごとにまとめて通知送信し、最終リマインド日時を一括更新する。
 * @param {{reminderByAssignee: Object, overdueByAssignee: Object, updatedRows: number[]}} groupedData
 * @param {Object} config
 */
function sendGroupedNotifications_(groupedData, config) {
  var staffSheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.STAFF);
  var staffMap = {};
  if (staffSheet && staffSheet.getLastRow() >= 2) {
    var columnCount = STAFF_COL.ACTIVE - STAFF_COL.TYPE + 1;
    var staffRows = staffSheet.getRange(2, STAFF_COL.TYPE, staffSheet.getLastRow() - 1, columnCount).getValues();
    for (var i = 0; i < staffRows.length; i++) {
      var sName = staffRows[i][STAFF_COL.NAME - 1];
      var sEmail = staffRows[i][STAFF_COL.EMAIL - 1];
      var sSlack = staffRows[i][STAFF_COL.SLACK_MENTION - 1];
      if (sName) {
        staffMap[sName] = {
          name: sName,
          email: sEmail,
          slackMention: sSlack,
        };
      }
    }
  }

  var sheetUrl = SpreadsheetApp.getActive().getUrl();

  // 1. リマインド通知（担当者ごと）
  var reminderTemplate = getTemplate_(TEMPLATE_IDS.REMINDER);
  for (var reminderAssignee in groupedData.reminderByAssignee) {
    if (!Object.prototype.hasOwnProperty.call(groupedData.reminderByAssignee, reminderAssignee)) continue;
    var reminderItems = groupedData.reminderByAssignee[reminderAssignee];
    if (!reminderItems || reminderItems.length === 0) continue;

    var reminderRecipient = resolveRecipientByName_(reminderAssignee, staffMap, config);
    var reminderPlaceholders = {
      担当者名: reminderRecipient.name,
      シートURL: sheetUrl,
    };
    var reminderSubject = expandTemplate_(reminderTemplate.subject, reminderPlaceholders, config.logRetentionRows);
    var reminderBaseBody = expandTemplate_(reminderTemplate.body, reminderPlaceholders, config.logRetentionRows);

    var reminderLines = reminderItems
      .map(function (item) {
        return "・" + item.managementId + "（" + (item.name || "") + "様、期限: " + item.dueDateStr + "）";
      })
      .join("\n");
    var reminderFullBody = reminderBaseBody + "\n\n対象一覧:\n" + reminderLines;

    sendComposedNotification_(reminderSubject, reminderFullBody, reminderRecipient, config, "日次リマインド");
  }

  // 2. 期限超過通知（担当者ごと）
  var overdueTemplate = getTemplate_(TEMPLATE_IDS.OVERDUE);
  var allOverdueItems = [];
  for (var overdueAssignee in groupedData.overdueByAssignee) {
    if (!Object.prototype.hasOwnProperty.call(groupedData.overdueByAssignee, overdueAssignee)) continue;
    var overdueItems = groupedData.overdueByAssignee[overdueAssignee];
    if (!overdueItems || overdueItems.length === 0) continue;

    var overdueRecipient = resolveRecipientByName_(overdueAssignee, staffMap, config);
    var overduePlaceholders = {
      担当者名: overdueRecipient.name,
      シートURL: sheetUrl,
    };
    var overdueSubject = expandTemplate_(overdueTemplate.subject, overduePlaceholders, config.logRetentionRows);
    var overdueBaseBody = expandTemplate_(overdueTemplate.body, overduePlaceholders, config.logRetentionRows);

    var overdueLines = overdueItems
      .map(function (item) {
        return "・" + item.managementId + "（" + (item.name || "") + "様、期限: " + item.dueDateStr + "）";
      })
      .join("\n");
    var overdueFullBody = overdueBaseBody + "\n\n対象一覧:\n" + overdueLines;

    sendComposedNotification_(overdueSubject, overdueFullBody, overdueRecipient, config, "日次リマインド");

    for (var oIdx = 0; oIdx < overdueItems.length; oIdx++) {
      allOverdueItems.push({
        assignee: overdueAssignee,
        managementId: overdueItems[oIdx].managementId,
        name: overdueItems[oIdx].name,
        dueDateStr: overdueItems[oIdx].dueDateStr,
      });
    }
  }

  // 3. 期限超過エスカレーション通知（管理者へ全件まとめ）
  if (allOverdueItems.length > 0 && config.adminEmail) {
    var adminRecipient = { name: "管理者", email: config.adminEmail, slackMention: "" };
    var adminSubject = "【要対応】期限超過の問い合わせが" + allOverdueItems.length + "件あります";
    var adminLines = allOverdueItems
      .map(function (item) {
        return "・担当: " + item.assignee + " / " + item.managementId + "（" + (item.name || "") + "様、期限: " + item.dueDateStr + "）";
      })
      .join("\n");
    var adminBody =
      "期限を超過した未完了の問い合わせがあります。至急ご確認ください。\n\n対象一覧:\n" +
      adminLines +
      "\n\nシートURL: " +
      sheetUrl;

    sendComposedNotification_(adminSubject, adminBody, adminRecipient, config, "日次リマインド");
  }

  // 4. 送信対象行のK列（最終リマインド日時）を一括更新
  if (groupedData.updatedRows && groupedData.updatedRows.length > 0) {
    var inquirySheet = getSheetOrThrow_(SHEET_NAMES.INQUIRY);
    var colLetter = columnNumberToLetter_(INQUIRY_COL.LAST_REMINDED_AT);
    var a1List = groupedData.updatedRows.map(function (row) {
      return colLetter + row;
    });
    inquirySheet.getRangeList(a1List).setValue(new Date());
  }
}

/**
 * 時間駆動トリガー本体（F-03, F-04）。
 * 未対応・対応中の問い合わせを走査し、担当者ごとに集約してリマインド・期限超過通知を送る。
 * 6分制限対策として4分30秒で安全中断し、継続トリガーで再開する（要件定義書 6.1章）。
 * @return {{status: string, message: string, count?: number}}
 */
function runDailyReminder() {
  var lock = LockService.getScriptLock();
  var gotLock = lock.tryLock(30 * 1000);
  if (!gotLock) {
    recordLog_("日次リマインド", 0, LOG_RESULT.FAILURE, "他の処理と競合し、ロックを取得できませんでした。", DEFAULT_LOG_RETENTION_ROWS);
    return {
      status: "lock_failed",
      message: "他の処理と競合し、ロックを取得できませんでした。",
    };
  }

  var config;
  try {
    config = getConfig_();
    var sheet = getSheetOrThrow_(SHEET_NAMES.INQUIRY);
    var lastRow = sheet.getLastRow();

    var now = new Date();
    var todayStr = formatDateYmd_(now);
    var remindLimitDate = new Date(now.getTime());
    remindLimitDate.setDate(remindLimitDate.getDate() + config.remindTargetDays);
    var remindLimitStr = formatDateYmd_(remindLimitDate);

    var props = PropertiesService.getScriptProperties();
    var cursorJson = props.getProperty(PROP_KEYS.REMINDER_CURSOR);
    var state = null;
    if (cursorJson) {
      try {
        var parsed = JSON.parse(cursorJson);
        if (
          parsed &&
          parsed.targetDate === todayStr &&
          typeof parsed.nextRow === "number" &&
          Array.isArray(parsed.reminderRows) &&
          Array.isArray(parsed.overdueRows)
        ) {
          state = parsed;
        }
      } catch {
        // parse error -> reset below
      }
    }

    if (!state) {
      deleteContinuationTrigger_(props);
      props.deleteProperty(PROP_KEYS.REMINDER_CURSOR);
      state = {
        targetDate: todayStr,
        nextRow: 2,
        reminderRows: [],
        overdueRows: [],
      };
    }

    var startTime = Date.now();
    var maxExecutionTime = 4.5 * 60 * 1000; // 4分30秒で安全中断

    while (state.nextRow <= lastRow) {
      if (Date.now() - startTime > maxExecutionTime) {
        props.setProperty(PROP_KEYS.REMINDER_CURSOR, JSON.stringify(state));
        deleteContinuationTrigger_(props);
        var trigger = ScriptApp.newTrigger("runDailyReminder").timeBased().after(60 * 1000).create();
        props.setProperty(PROP_KEYS.REMINDER_CONTINUATION_TRIGGER_ID, trigger.getUniqueId());

        var processedCount = Math.max(0, state.nextRow - 2);
        var interruptMsg = "実行時間制限（4分30秒）に近づいたため、" + (state.nextRow - 1) + "行目で安全中断しました。1分後に継続します。";
        recordLog_(
          "日次リマインド",
          processedCount,
          LOG_RESULT.SKIPPED,
          interruptMsg,
          config.logRetentionRows
        );
        return {
          status: "interrupted",
          message: interruptMsg,
        };
      }

      var batchSize = Math.min(100, lastRow - state.nextRow + 1);
      var columnCount = INQUIRY_COL.NOTE - INQUIRY_COL.TIMESTAMP + 1;
      var batchValues = sheet.getRange(state.nextRow, 1, batchSize, columnCount).getValues();

      for (var i = 0; i < batchValues.length; i++) {
        var row = batchValues[i];
        var currentRow = state.nextRow + i;

        var status = row[INQUIRY_COL.STATUS - 1];
        if (status !== STATUS.NOT_STARTED && status !== STATUS.IN_PROGRESS) continue;

        var dueDate = row[INQUIRY_COL.DUE_DATE - 1];
        if (!(dueDate instanceof Date)) continue;

        var lastRemindedAt = row[INQUIRY_COL.LAST_REMINDED_AT - 1];
        if (lastRemindedAt instanceof Date && formatDateYmd_(lastRemindedAt) === todayStr) continue;

        var dueDateStr = formatDateYmd_(dueDate);

        if (dueDateStr < todayStr) {
          state.overdueRows.push(currentRow);
        } else if (dueDateStr <= remindLimitStr) {
          state.reminderRows.push(currentRow);
        }
      }

      state.nextRow += batchSize;
    }

    // 全件走査完了: 対象行のデータを再取得してグループ化し、通知送信とK列更新
    var groupedData = buildGroupedReminderData_(sheet, state.reminderRows, state.overdueRows);
    sendGroupedNotifications_(groupedData, config);
    props.deleteProperty(PROP_KEYS.REMINDER_CURSOR);
    deleteContinuationTrigger_(props);

    var targetCount = groupedData.updatedRows.length;
    var successMsg = "日次リマインド処理が完了しました。";
    recordLog_(
      "日次リマインド",
      targetCount,
      LOG_RESULT.SUCCESS,
      successMsg,
      config.logRetentionRows
    );
    return {
      status: "success",
      message: successMsg,
      count: targetCount,
    };
  } catch (err) {
    recordLog_("日次リマインド", 0, LOG_RESULT.FAILURE, String(err), DEFAULT_LOG_RETENTION_ROWS);
    if (typeof config !== "undefined" && config) {
      notifyAdminOfSystemError_(config, "日次リマインド", String(err));
    }
    return {
      status: "error",
      message: String(err),
    };
  } finally {
    lock.releaseLock();
  }
}
