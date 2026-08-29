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
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
    },
  },
];
