/**
 * 「実行ログ」シートへの記録とログローテーション（設定シートの「ログ保持行数」を超えたら古い行から削除）。
 * 成功時も記録する（要件定義書 3.5章: トラブル時にこのシートを見れば原因が分かる状態にする）。
 */

var DEFAULT_LOG_RETENTION_ROWS = 1000;

/**
 * @param {string} processName 処理名（例: "初期セットアップ", "日次リマインド"）
 * @param {number} targetCount 対象件数
 * @param {string} result LOG_RESULT のいずれか
 * @param {string} message
 * @param {number} [logRetentionRows] 未指定時は DEFAULT_LOG_RETENTION_ROWS を使う
 */
function recordLog_(processName, targetCount, result, message, logRetentionRows) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.LOG);
  if (!sheet) return; // ログシート自体が無い状態（初期セットアップ未実行）では何もしない

  sheet.appendRow([new Date(), processName, targetCount, result, message]);

  var retentionRows = logRetentionRows || DEFAULT_LOG_RETENTION_ROWS;
  var lastRow = sheet.getLastRow();
  var dataRowCount = lastRow - 1; // ヘッダー行を除く
  if (dataRowCount > retentionRows) {
    var excessRows = dataRowCount - retentionRows;
    sheet.deleteRows(2, excessRows); // 古い行 = 上側の行から削除
  }
}
