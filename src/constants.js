/**
 * シート名・列番号・設定キーなどの定数を集約するファイル。
 * 列番号をコード内に直書きしないこと（要件定義書 7章）。ここに追加してから他ファイルで参照する。
 */

var SHEET_NAMES = {
  INQUIRY: "問い合わせ一覧",
  CONFIG: "設定",
  STAFF: "担当者",
  TEMPLATE: "通知テンプレート",
  LOG: "実行ログ",
};

var MENU_NAME = "問い合わせ管理";

/** 「問い合わせ一覧」シートの列番号（1始まり）。A〜Eはフォームが生成、F以降はスクリプトが管理。 */
var INQUIRY_COL = {
  TIMESTAMP: 1, // A タイムスタンプ
  NAME: 2, // B お名前
  EMAIL: 3, // C メールアドレス
  TYPE: 4, // D 種別
  CONTENT: 5, // E 内容
  MANAGEMENT_ID: 6, // F 管理ID
  STATUS: 7, // G ステータス
  ASSIGNEE: 8, // H 担当者
  DUE_DATE: 9, // I 対応期限
  FIRST_NOTIFIED_AT: 10, // J 初回通知日時
  LAST_REMINDED_AT: 11, // K 最終リマインド日時
  COMPLETED_AT: 12, // L 完了日時
  NOTE: 13, // M 備考
};
var INQUIRY_HEADER = [
  "タイムスタンプ",
  "お名前",
  "メールアドレス",
  "種別",
  "内容",
  "管理ID",
  "ステータス",
  "担当者",
  "対応期限",
  "初回通知日時",
  "最終リマインド日時",
  "完了日時",
  "備考",
];

var INQUIRY_TYPES = ["見積依頼", "不具合報告", "その他"];

var STATUS = {
  NOT_STARTED: "未対応",
  IN_PROGRESS: "対応中",
  DONE: "完了",
};
var STATUS_VALUES = [STATUS.NOT_STARTED, STATUS.IN_PROGRESS, STATUS.DONE];
/** 条件付き書式の背景色（要件定義書 3.1章: 未対応=赤 対応中=黄 完了=グレー） */
var STATUS_COLOR = {};
STATUS_COLOR[STATUS.NOT_STARTED] = "#f4cccc";
STATUS_COLOR[STATUS.IN_PROGRESS] = "#fff2cc";
STATUS_COLOR[STATUS.DONE] = "#d9d9d9";

/** 「設定」シートの列番号 */
var CONFIG_COL = {
  KEY: 1,
  VALUE: 2,
  DESCRIPTION: 3,
};
var CONFIG_HEADER = ["設定キー", "値", "説明"];

/** 「設定」シートの設定キー文字列（B列の値を読むときのキー） */
var CONFIG_KEYS = {
  NOTIFY_METHOD: "通知方法",
  SLACK_WEBHOOK_URL: "Slack Webhook URL",
  ADMIN_EMAIL: "管理者メールアドレス",
  REMIND_HOUR: "リマインド実行時刻",
  SLA_DAYS_QUOTE: "SLA日数_見積依頼",
  SLA_DAYS_BUG: "SLA日数_不具合報告",
  SLA_DAYS_OTHER: "SLA日数_その他",
  BUSINESS_DAYS: "営業日",
  HOLIDAYS: "休業日",
  REMIND_TARGET_DAYS: "リマインド対象日数",
  TEST_MODE: "テストモード",
  LOG_RETENTION_ROWS: "ログ保持行数",
};

/** 「設定」シートの初期値（初期セットアップで書き込む）。第2引数は説明文（C列）。 */
var CONFIG_DEFAULTS = [
  [CONFIG_KEYS.NOTIFY_METHOD, "メール", "メール / Slack / 両方"],
  [CONFIG_KEYS.SLACK_WEBHOOK_URL, "", "Slack を使う場合のみ入力"],
  [CONFIG_KEYS.ADMIN_EMAIL, "", "エラー通知とエスカレーションの送信先"],
  [CONFIG_KEYS.REMIND_HOUR, "9", "0〜23 の整数"],
  [CONFIG_KEYS.SLA_DAYS_QUOTE, "1", "営業日"],
  [CONFIG_KEYS.SLA_DAYS_BUG, "1", "営業日"],
  [CONFIG_KEYS.SLA_DAYS_OTHER, "3", "営業日"],
  [CONFIG_KEYS.BUSINESS_DAYS, "月,火,水,木,金", "カンマ区切り"],
  [CONFIG_KEYS.HOLIDAYS, "", "2026-12-29,2026-12-30 のような日付のカンマ区切り"],
  [CONFIG_KEYS.REMIND_TARGET_DAYS, "1", "期限まで何日以内の案件を通知するか"],
  [CONFIG_KEYS.TEST_MODE, "TRUE", "TRUE の間は実際には送信せずログのみ記録"],
  [CONFIG_KEYS.LOG_RETENTION_ROWS, "1000", "これを超えたら古い行から自動削除"],
];

/** 「担当者」シートの列番号 */
var STAFF_COL = {
  TYPE: 1,
  NAME: 2,
  EMAIL: 3,
  SLACK_MENTION: 4,
  ACTIVE: 5,
};
var STAFF_HEADER = ["種別", "担当者名", "メールアドレス", "Slackメンション", "有効"];

/** 「通知テンプレート」シートの列番号 */
var TEMPLATE_COL = {
  ID: 1,
  SUBJECT: 2,
  BODY: 3,
};
var TEMPLATE_HEADER = ["テンプレートID", "件名", "本文"];
var TEMPLATE_IDS = {
  NEW_INQUIRY: "新規受付",
  REMINDER: "リマインド",
  OVERDUE: "期限超過",
  DAILY_SUMMARY: "日次サマリ",
};
/** テンプレート本文で使えるプレースホルダ（未定義のものは空文字に置換しログに警告） */
var TEMPLATE_PLACEHOLDERS = [
  "管理ID",
  "お名前",
  "種別",
  "内容",
  "対応期限",
  "担当者名",
  "シートURL",
];

/** 「実行ログ」シートの列番号 */
var LOG_COL = {
  TIMESTAMP: 1,
  PROCESS: 2,
  TARGET_COUNT: 3,
  RESULT: 4,
  MESSAGE: 5,
};
var LOG_HEADER = ["日時", "処理名", "対象件数", "結果", "メッセージ"];
var LOG_RESULT = {
  SUCCESS: "成功",
  FAILURE: "失敗",
  SKIPPED: "スキップ",
};

/** PropertiesService に保存するキー */
var PROP_KEYS = {
  ROUND_ROBIN_INDEX_PREFIX: "ROUND_ROBIN_INDEX_", // + 種別名
  REMINDER_CURSOR: "REMINDER_CURSOR",
  REMINDER_CONTINUATION_TRIGGER_ID: "REMINDER_CONTINUATION_TRIGGER_ID",
  ADMIN_ERROR_MAIL_SENT_DATE: "ADMIN_ERROR_MAIL_SENT_DATE",
};

/** 管理IDのプレフィックス（形式: INQ-20260829-001） */
var MANAGEMENT_ID_PREFIX = "INQ";

/** サンプルデータ生成の行数（要件定義書 4章「サンプルデータを作成」） */
var SAMPLE_DATA_ROW_COUNT = 20;
