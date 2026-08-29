/**
 * 初期セットアップ（シート生成、ヘッダー・プルダウン・条件付き書式、トリガー登録）。
 * 何度実行しても壊れない（冪等）こと。既存データがある場合は消さずに、不足している要素だけを追加する。
 */

/**
 * @param {string} name SHEET_NAMES のいずれか
 * @return {Sheet}
 */
function getSheetOrThrow_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) {
    throw new Error(
      "「" + name + "」シートが見つかりません。カスタムメニューの「初期セットアップ」を先に実行してください。"
    );
  }
  return sheet;
}

/**
 * シートが無ければ作成し、ヘッダー行（1行目）を設定する。既存のデータ行には触れない。
 * @param {Spreadsheet} ss
 * @param {string} name
 * @param {string[]} header
 * @return {Sheet}
 */
function ensureSheet_(ss, name, header) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * 「問い合わせ一覧」シートを整備する。ステータス列にプルダウンと条件付き書式を設定する。
 * @param {Spreadsheet} ss
 */
function setupInquirySheet_(ss) {
  var sheet = ensureSheet_(ss, SHEET_NAMES.INQUIRY, INQUIRY_HEADER);

  // プルダウンと条件付き書式は、今後追加される行にも効くよう広めの固定範囲（2〜1000行目）に適用する。
  var formatRowCount = 999;
  var statusRange = sheet.getRange(2, INQUIRY_COL.STATUS, formatRowCount, 1);

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_VALUES, true)
    .setAllowInvalid(false)
    .build();
  statusRange.setDataValidation(rule);

  var conditionalRules = [];
  STATUS_VALUES.forEach(function (status) {
    conditionalRules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(status)
        .setBackground(STATUS_COLOR[status])
        .setRanges([statusRange])
        .build()
    );
  });
  // 他シートの条件付き書式ルールを壊さないよう、この列に対する既存ルールだけ除いてから積み直す。
  var otherRules = sheet.getConditionalFormatRules().filter(function (r) {
    return r.getRanges().every(function (range) {
      return range.getColumn() !== INQUIRY_COL.STATUS;
    });
  });
  sheet.setConditionalFormatRules(otherRules.concat(conditionalRules));

  return sheet;
}

/**
 * 「設定」シートを整備する。既にキーが存在する行の値は上書きしない。不足しているキーだけ追加する。
 * @param {Spreadsheet} ss
 */
function setupConfigSheet_(ss) {
  var sheet = ensureSheet_(ss, SHEET_NAMES.CONFIG, CONFIG_HEADER);

  var lastRow = sheet.getLastRow();
  var existingKeys = {};
  if (lastRow >= 2) {
    var keys = sheet.getRange(2, CONFIG_COL.KEY, lastRow - 1, 1).getValues();
    keys.forEach(function (row) {
      var key = String(row[0]).trim();
      if (key) existingKeys[key] = true;
    });
  }

  var rowsToAdd = CONFIG_DEFAULTS.filter(function (row) {
    return !existingKeys[row[0]];
  });
  if (rowsToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, CONFIG_HEADER.length).setValues(rowsToAdd);
  }

  return sheet;
}

/**
 * 「担当者」シートを整備する（ヘッダーのみ。担当者データは利用者が入力する）。
 * @param {Spreadsheet} ss
 */
function setupStaffSheet_(ss) {
  return ensureSheet_(ss, SHEET_NAMES.STAFF, STAFF_HEADER);
}

/**
 * 「通知テンプレート」シートを整備する。テンプレートIDが未登録の場合のみ既定文面を追加する
 * （利用者がカスタマイズ済みの本文を上書きしないため）。
 * @param {Spreadsheet} ss
 */
function setupTemplateSheet_(ss) {
  var sheet = ensureSheet_(ss, SHEET_NAMES.TEMPLATE, TEMPLATE_HEADER);

  var lastRow = sheet.getLastRow();
  var existingIds = {};
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, TEMPLATE_COL.ID, lastRow - 1, 1).getValues();
    ids.forEach(function (row) {
      var id = String(row[0]).trim();
      if (id) existingIds[id] = true;
    });
  }

  var defaults = getDefaultTemplates_();
  var rowsToAdd = defaults.filter(function (row) {
    return !existingIds[row[TEMPLATE_COL.ID - 1]];
  });
  if (rowsToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, TEMPLATE_HEADER.length).setValues(rowsToAdd);
  }

  return sheet;
}

/**
 * 通知テンプレートの初期文面。プレースホルダは notify.js（Day2）で展開する。
 * @return {Array<Array<string>>}
 */
function getDefaultTemplates_() {
  return [
    [
      TEMPLATE_IDS.NEW_INQUIRY,
      "【新規受付】{{管理ID}} {{お名前}}様より{{種別}}",
      "新しい問い合わせを受け付けました。\n\n管理ID: {{管理ID}}\nお名前: {{お名前}}\n種別: {{種別}}\n内容: {{内容}}\n対応期限: {{対応期限}}\n担当者: {{担当者名}}\n\nシートURL: {{シートURL}}",
    ],
    [
      TEMPLATE_IDS.REMINDER,
      "【リマインド】対応期限が近い問い合わせがあります",
      "対応期限が近づいている、または未対応の問い合わせがあります。\n担当者: {{担当者名}}\n\nシートURL: {{シートURL}}\nシートで対象行をご確認ください。",
    ],
    [
      TEMPLATE_IDS.OVERDUE,
      "【要対応】対応期限を過ぎた問い合わせがあります",
      "対応期限を過ぎた未完了の問い合わせがあります。至急ご確認ください。\n担当者: {{担当者名}}\n\nシートURL: {{シートURL}}",
    ],
    [
      TEMPLATE_IDS.DAILY_SUMMARY,
      "【日次サマリ】問い合わせ対応状況",
      "本日の問い合わせ対応状況をお知らせします。\n\nシートURL: {{シートURL}}",
    ],
  ];
}

/**
 * 「実行ログ」シートを整備する。
 * @param {Spreadsheet} ss
 */
function setupLogSheet_(ss) {
  return ensureSheet_(ss, SHEET_NAMES.LOG, LOG_HEADER);
}

/**
 * F-02（フォーム送信）・F-03（日次リマインド）のトリガーを登録する。
 * 既存の同名トリガーは一旦削除してから登録し直すため、重複登録にならない（冪等・「トリガーを再設定」からも呼ばれる）。
 * @param {Object} config
 */
function registerTriggers_(config) {
  var ss = SpreadsheetApp.getActive();
  var targetFunctionNames = ["onFormSubmitHandler", "runDailyReminder"];

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (targetFunctionNames.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("onFormSubmitHandler").forSpreadsheet(ss).onFormSubmit().create();

  ScriptApp.newTrigger("runDailyReminder")
    .timeBased()
    .atHour(config.remindHour)
    .everyDays(1)
    .create();
}

/**
 * カスタムメニュー「初期セットアップ」の実体（F-01）。
 * シート生成・書式設定・設定初期値の投入・トリガー登録までを一括で行う。
 */
function runInitialSetup() {
  var ss = SpreadsheetApp.getActive();

  setupInquirySheet_(ss);
  setupConfigSheet_(ss);
  setupStaffSheet_(ss);
  setupTemplateSheet_(ss);
  setupLogSheet_(ss);

  var config = getConfig_(); // CONFIG_DEFAULTS はすべてバリデーションを通る値なので、ここで例外にはならない
  registerTriggers_(config);

  recordLog_("初期セットアップ", 5, LOG_RESULT.SUCCESS, "5シートを整備し、トリガーを登録しました。", config.logRetentionRows);

  var message =
    "初期セットアップが完了しました。\n\n" +
    "次にやること:\n" +
    "1. 「担当者」シートに担当者を登録する\n" +
    "2. 「設定」シートの内容を確認・調整する（特にSlack Webhook URLや管理者メールアドレス）\n" +
    "3. 動作確認が終わったら「設定」シートの「テストモード」をFALSEにする\n\n" +
    "テストモードがTRUEの間は、メール・Slackへの送信は行われません。";
  SpreadsheetApp.getUi().alert(MENU_NAME, message, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * カスタムメニュー「設定を確認」の実体。
 */
function checkConfigMenu() {
  var result = validateConfigSheet();
  var ui = SpreadsheetApp.getUi();
  if (result.isValid) {
    ui.alert(MENU_NAME, "設定シートに問題は見つかりませんでした。", ui.ButtonSet.OK);
    return;
  }
  var summary = result.errors
    .map(function (e) {
      return "・" + e.key + ": " + e.message;
    })
    .join("\n");
  ui.alert(MENU_NAME, "以下の設定に問題があります（該当セルを赤くしました）。\n\n" + summary, ui.ButtonSet.OK);
}

/**
 * カスタムメニュー「トリガーを再設定」の実体。
 */
function resetTriggersMenu() {
  var config = getConfig_();
  registerTriggers_(config);
  recordLog_("トリガー再設定", 2, LOG_RESULT.SUCCESS, "トリガーを削除して張り直しました。", config.logRetentionRows);
  SpreadsheetApp.getUi().alert(MENU_NAME, "トリガーを再設定しました。", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * カスタムメニュー「サンプルデータを作成」の実体。フォームが無くても動作確認できるダミー行を生成する。
 * 管理ID・担当者一覧はループの前に1回だけ読み、あとはメモリ上で組み立ててから一括で書き込む
 * （要件定義書6.2章: ループ内で getRange().getValue()/setValue() を呼ばない）。
 */
function generateSampleData() {
  var config = getConfig_();
  var sheet = getSheetOrThrow_(SHEET_NAMES.INQUIRY);
  var startRow = sheet.getLastRow() + 1;

  var sampleNames = ["山田太郎", "佐藤花子", "鈴木一郎", "田中みどり", "高橋健"];
  var sampleContents = {};
  sampleContents[INQUIRY_TYPES[0]] = "見積もりをお願いしたいです。詳細は追ってご連絡します。";
  sampleContents[INQUIRY_TYPES[1]] = "購入した製品に不具合があるようです。確認をお願いします。";
  sampleContents[INQUIRY_TYPES[2]] = "資料の請求方法について教えてください。";

  var now = new Date();
  var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd");
  var nextSeq = getMaxManagementIdSeq_(sheet, dateStr) + 1;

  var eligibleStaffByType = {};
  INQUIRY_TYPES.forEach(function (type) {
    eligibleStaffByType[type] = getEligibleStaff_(type);
  });

  var rows = [];
  for (var i = 0; i < SAMPLE_DATA_ROW_COUNT; i++) {
    var name = sampleNames[i % sampleNames.length] + (i + 1);
    var type = INQUIRY_TYPES[i % INQUIRY_TYPES.length];
    var managementId = formatManagementId_(dateStr, nextSeq++);
    var assignee = pickNextRoundRobinStaff_(type, eligibleStaffByType[type], config);
    var dueDate = calculateDueDate_(now, type, config);

    var row = new Array(INQUIRY_HEADER.length).fill("");
    row[INQUIRY_COL.TIMESTAMP - 1] = now;
    row[INQUIRY_COL.NAME - 1] = name;
    row[INQUIRY_COL.EMAIL - 1] = "sample" + (i + 1) + "@example.com";
    row[INQUIRY_COL.TYPE - 1] = type;
    row[INQUIRY_COL.CONTENT - 1] = sampleContents[type];
    row[INQUIRY_COL.MANAGEMENT_ID - 1] = managementId;
    row[INQUIRY_COL.STATUS - 1] = STATUS.NOT_STARTED;
    row[INQUIRY_COL.ASSIGNEE - 1] = assignee.name;
    row[INQUIRY_COL.DUE_DATE - 1] = dueDate;
    rows.push(row);
  }

  sheet.getRange(startRow, 1, rows.length, INQUIRY_HEADER.length).setValues(rows);

  recordLog_("サンプルデータ作成", rows.length, LOG_RESULT.SUCCESS, rows.length + "件のダミー行を作成しました。", config.logRetentionRows);
  SpreadsheetApp.getUi().alert(MENU_NAME, rows.length + "件のサンプルデータを作成しました。", SpreadsheetApp.getUi().ButtonSet.OK);
}
