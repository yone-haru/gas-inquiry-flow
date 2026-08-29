/**
 * 新規受付処理。管理ID採番、担当者割当（ラウンドロビン）、対応期限の計算、通知の呼び出し。
 *
 * フォーム送信時トリガー本体（F-02, 通知送信を含む）は Day2 で実装する。
 * このファイルには、その前提となる採番・割当・期限計算を用意する。
 *
 * 採番・担当者取得は「1回読んで、メモリ上で使い回す」形にしてある（要件定義書6.2章: ループ内で
 * getRange().getValue() を呼ばない）。1件ずつ来るF-02では generateManagementId_/assignStaff_ を
 * そのまま呼べばよいが、複数件をまとめて処理する箇所（サンプルデータ生成、Day3のバッチ処理）では
 * getMaxManagementIdSeq_ / getEligibleStaff_ を1回だけ呼び、以降は formatManagementId_ /
 * pickNextRoundRobinStaff_ でメモリ上だけで組み立てること。
 */

/**
 * 管理IDの「INQ-20260829-」部分までを付けて完成させる。
 * @param {string} dateStr yyyyMMdd
 * @param {number} seq 1以上の連番
 * @return {string}
 */
function formatManagementId_(dateStr, seq) {
  var seqStr = ("000" + seq).slice(-3);
  return MANAGEMENT_ID_PREFIX + "-" + dateStr + "-" + seqStr;
}

/**
 * 指定日付（yyyyMMdd）で採番済みの管理IDのうち、最大の連番を返す（未採番なら0）。
 * @param {Sheet} sheet
 * @param {string} dateStr yyyyMMdd
 * @return {number}
 */
function getMaxManagementIdSeq_(sheet, dateStr) {
  var prefix = MANAGEMENT_ID_PREFIX + "-" + dateStr + "-";
  var lastRow = sheet.getLastRow();
  var maxSeq = 0;
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, INQUIRY_COL.MANAGEMENT_ID, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i][0]);
      if (id.indexOf(prefix) === 0) {
        var seq = parseInt(id.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
  }
  return maxSeq;
}

/**
 * 管理IDを採番する（形式: INQ-20260829-001。日付ごとに連番）。1件だけ採番したいとき用。
 * @param {Sheet} sheet
 * @param {Date} receivedAt
 * @return {string}
 */
function generateManagementId_(sheet, receivedAt) {
  var dateStr = Utilities.formatDate(receivedAt, Session.getScriptTimeZone(), "yyyyMMdd");
  var nextSeq = getMaxManagementIdSeq_(sheet, dateStr) + 1;
  return formatManagementId_(dateStr, nextSeq);
}

/**
 * 「担当者」シートから、指定種別かつ有効な担当者一覧を取得する。
 * @param {string} type 種別（見積依頼 / 不具合報告 / その他）
 * @return {Array<{name: string, email: string, slackMention: string}>}
 */
function getEligibleStaff_(type) {
  var sheet = getSheetOrThrow_(SHEET_NAMES.STAFF);
  var lastRow = sheet.getLastRow();
  var eligible = [];

  if (lastRow >= 2) {
    var columnCount = STAFF_COL.ACTIVE - STAFF_COL.TYPE + 1;
    var rows = sheet.getRange(2, STAFF_COL.TYPE, lastRow - 1, columnCount).getValues();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var rowType = row[STAFF_COL.TYPE - 1];
      var active = String(row[STAFF_COL.ACTIVE - 1]).toUpperCase() === "TRUE";
      if (rowType === type && active) {
        eligible.push({
          name: row[STAFF_COL.NAME - 1],
          email: row[STAFF_COL.EMAIL - 1],
          slackMention: row[STAFF_COL.SLACK_MENTION - 1],
        });
      }
    }
  }

  return eligible;
}

/**
 * 事前取得済みの候補一覧からラウンドロビンで1人選ぶ。該当者がいない場合は管理者を返す。
 * 直近の割当位置は PropertiesService に保持する（要件定義書 3.3章）。
 * @param {string} type
 * @param {Array<{name: string, email: string, slackMention: string}>} eligible getEligibleStaff_ の結果
 * @param {Object} config
 * @return {{name: string, email: string, slackMention: string}}
 */
function pickNextRoundRobinStaff_(type, eligible, config) {
  if (eligible.length === 0) {
    return {
      name: "管理者",
      email: config.adminEmail,
      slackMention: "",
    };
  }

  var props = PropertiesService.getScriptProperties();
  var propKey = PROP_KEYS.ROUND_ROBIN_INDEX_PREFIX + type;
  var lastIndex = parseInt(props.getProperty(propKey), 10);
  if (isNaN(lastIndex)) lastIndex = -1;

  var nextIndex = (lastIndex + 1) % eligible.length;
  props.setProperty(propKey, String(nextIndex));

  return eligible[nextIndex];
}

/**
 * 種別に応じて担当者をラウンドロビンで割り当てる。1件だけ割り当てたいとき用
 * （内部で getEligibleStaff_ + pickNextRoundRobinStaff_ を呼ぶだけ）。
 * @param {string} type
 * @param {Object} config
 * @return {{name: string, email: string, slackMention: string}}
 */
function assignStaff_(type, config) {
  return pickNextRoundRobinStaff_(type, getEligibleStaff_(type), config);
}

/**
 * 受信日と種別（SLA日数）から対応期限を計算する。営業日ベース、土日・休業日は繰り越す。
 * @param {Date} receivedAt
 * @param {string} type
 * @param {Object} config
 * @return {Date}
 */
function calculateDueDate_(receivedAt, type, config) {
  var slaDays = config.slaDays[type];
  if (!slaDays) slaDays = config.slaDays.その他; // 未知の種別はその他扱い（フォームの選択式が壊れない限り通常は起きない）
  return addBusinessDays_(receivedAt, slaDays, config.businessDays, config.holidays);
}

/**
 * フォーム送信時トリガー本体。Day2（F-02）で実装する。
 * @param {Object} e フォーム送信イベント
 */
function onFormSubmitHandler(e) {
  // TODO(Day2, F-02): generateManagementId_ / assignStaff_ / calculateDueDate_ で新規行を埋めた後、
  // notify.js で「新規受付」通知を送る。
}
