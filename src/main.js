/**
 * onOpen、各トリガーから呼ばれるエントリポイント。カスタムメニューの定義はここに置く。
 */

/**
 * スプレッドシートを開いたときにカスタムメニューを追加する（要件定義書 4章）。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU_NAME)
    .addItem("初期セットアップ", "runInitialSetup")
    .addItem("設定を確認", "checkConfigMenu")
    .addItem("テスト通知を送る", "sendTestNotificationMenu")
    .addItem("リマインドを今すぐ実行", "runReminderNowMenu")
    .addItem("サンプルデータを作成", "generateSampleData")
    .addItem("トリガーを再設定", "resetTriggersMenu")
    .addToUi();
}

/**
 * カスタムメニュー「テスト通知を送る」の実体。Day2（notify.js）で実装する。
 */
function sendTestNotificationMenu() {
  SpreadsheetApp.getUi().alert(MENU_NAME, "この機能は Day2 で実装予定です（notify.js）。", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * カスタムメニュー「リマインドを今すぐ実行」の実体。Day3（reminder.js）で実装する。
 */
function runReminderNowMenu() {
  SpreadsheetApp.getUi().alert(MENU_NAME, "この機能は Day3 で実装予定です（reminder.js）。", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * F-05 完了処理。「問い合わせ一覧」でステータスが「完了」に変更された行に、完了日時を自動記録する。
 * 単純トリガーのため UI 操作・外部サービス呼び出しは行わない。
 * ステータス列・完了日時列とも1回の getValues()/setValues() でまとめて読み書きする
 * （要件定義書6.2章: ループ内で getRange().getValue()/setValue() を呼ばない。範囲貼り付け等で
 * 複数行が一度に編集された場合に行数分のAPI呼び出しが発生するのを避けるため）。
 * @param {Object} e onEdit イベントオブジェクト
 */
function onEdit(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    if (sheet.getName() !== SHEET_NAMES.INQUIRY) return;

    var editedFirstCol = range.getColumn();
    var editedLastCol = editedFirstCol + range.getNumColumns() - 1;
    if (INQUIRY_COL.STATUS < editedFirstCol || INQUIRY_COL.STATUS > editedLastCol) return;

    var firstRow = range.getRow();
    var numRows = range.getNumRows();
    if (firstRow === 1) {
      numRows -= 1; // ヘッダー行を除く
      firstRow = 2;
    }
    if (numRows <= 0) return;

    var statusRange = sheet.getRange(firstRow, INQUIRY_COL.STATUS, numRows, 1);
    var statusValues = statusRange.getValues();
    var completedAtRange = sheet.getRange(firstRow, INQUIRY_COL.COMPLETED_AT, numRows, 1);
    var completedAtValues = completedAtRange.getValues();

    var now = new Date();
    var changed = false;
    for (var i = 0; i < numRows; i++) {
      if (statusValues[i][0] === STATUS.DONE) {
        completedAtValues[i][0] = now;
        changed = true;
      }
    }
    if (changed) completedAtRange.setValues(completedAtValues);
  } catch (err) {
    // 単純トリガーのため UI には出せない。ログシートへの記録のみ行う。
    recordLog_("完了処理(onEdit)", 0, LOG_RESULT.FAILURE, String(err));
  }
}
