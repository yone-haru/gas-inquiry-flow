/**
 * `globals` パッケージに GAS 用の env が無いため、このプロジェクトで使う組み込みオブジェクトを手動で列挙する。
 * 新しい GAS API（例: FormApp, CalendarApp）を使い始めたらここに追加すること。
 */
const gasGlobals = {
  SpreadsheetApp: "readonly",
  PropertiesService: "readonly",
  LockService: "readonly",
  MailApp: "readonly",
  GmailApp: "readonly",
  UrlFetchApp: "readonly",
  Utilities: "readonly",
  Logger: "readonly",
  HtmlService: "readonly",
  ScriptApp: "readonly",
  Session: "readonly",
  CacheService: "readonly",
  console: "readonly",
};

/**
 * GAS の実行時は全ファイルが1つのグローバルスコープを共有する（V8ランタイムでは、トップレベルの
 * `var` と関数宣言だけがファイルをまたいで見える。`let`/`const` はファイルごとに閉じるので使わない）。
 * ESLint はファイル単位でしか解析しないため、他ファイルで定義している識別子をここに列挙して
 * 「未定義」誤検知を防ぐ。新しいトップレベルの `var`/関数を増やしたら、ここにも追記すること。
 */
const projectGlobals = {
  // constants.js
  SHEET_NAMES: "readonly",
  MENU_NAME: "readonly",
  INQUIRY_COL: "readonly",
  INQUIRY_HEADER: "readonly",
  INQUIRY_TYPES: "readonly",
  STATUS: "readonly",
  STATUS_VALUES: "readonly",
  STATUS_COLOR: "readonly",
  CONFIG_COL: "readonly",
  CONFIG_HEADER: "readonly",
  CONFIG_KEYS: "readonly",
  CONFIG_DEFAULTS: "readonly",
  STAFF_COL: "readonly",
  STAFF_HEADER: "readonly",
  TEMPLATE_COL: "readonly",
  TEMPLATE_HEADER: "readonly",
  TEMPLATE_IDS: "readonly",
  TEMPLATE_PLACEHOLDERS: "readonly",
  LOG_COL: "readonly",
  LOG_HEADER: "readonly",
  LOG_RESULT: "readonly",
  PROP_KEYS: "readonly",
  MANAGEMENT_ID_PREFIX: "readonly",
  SAMPLE_DATA_ROW_COUNT: "readonly",
  // config.js
  validateConfigSheet: "readonly",
  getConfig_: "readonly",
  // businessDays.js
  addBusinessDays_: "readonly",
  formatDateYmd_: "readonly",
  // inquiry.js
  formatManagementId_: "readonly",
  getMaxManagementIdSeq_: "readonly",
  generateManagementId_: "readonly",
  getEligibleStaff_: "readonly",
  pickNextRoundRobinStaff_: "readonly",
  assignStaff_: "readonly",
  calculateDueDate_: "readonly",
  onFormSubmitHandler: "readonly",
  // logger.js
  recordLog_: "readonly",
  DEFAULT_LOG_RETENTION_ROWS: "readonly",
  // notify.js
  expandTemplate_: "readonly",
  getTemplate_: "readonly",
  sendEmail_: "readonly",
  sendSlack_: "readonly",
  dispatchNotification_: "readonly",
  sendNotification_: "readonly",
  // setup.js
  getSheetOrThrow_: "readonly",
  runInitialSetup: "readonly",
  checkConfigMenu: "readonly",
  resetTriggersMenu: "readonly",
  generateSampleData: "readonly",
  // main.js / reminder.js（トリガーのハンドラ関数名。setup.js から文字列参照される）
  onOpen: "readonly",
  onEdit: "readonly",
  sendTestNotificationMenu: "readonly",
  runReminderNowMenu: "readonly",
  runDailyReminder: "readonly",
};

/**
 * GAS には ES Modules が無い（clasp push は各ファイルをそのまま Apps Script エディタに並べるだけで、
 * import/export は使えない）。sourceType は "script" 固定にすること。
 */
module.exports = [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        ...gasGlobals,
        ...projectGlobals,
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
    },
  },
];
