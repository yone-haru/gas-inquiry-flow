/**
 * 営業日計算（設定シートの「営業日」「休業日」を考慮したSLA期限の算出）。
 */

var WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * @param {Date} date
 * @param {string[]} businessDays 例: ["月","火","水","木","金"]
 * @param {string[]} holidays 例: ["2026-12-29"]（YYYY-MM-DD）
 * @return {boolean}
 */
function isBusinessDay_(date, businessDays, holidays) {
  var dayLabel = WEEKDAY_JP[date.getDay()];
  if (businessDays.indexOf(dayLabel) === -1) return false;

  var dateStr = formatDateYmd_(date);
  if (holidays.indexOf(dateStr) !== -1) return false;

  return true;
}

/**
 * @param {Date} date
 * @return {string} YYYY-MM-DD
 */
function formatDateYmd_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

/**
 * 起点日から指定営業日数だけ進めた日付を返す。土日・休業日をまたぐ場合は翌営業日に繰り越す。
 * @param {Date} startDate
 * @param {number} businessDaysToAdd 1以上
 * @param {string[]} businessDays
 * @param {string[]} holidays
 * @return {Date}
 */
function addBusinessDays_(startDate, businessDaysToAdd, businessDays, holidays) {
  var result = new Date(startDate.getTime());
  var remaining = businessDaysToAdd;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay_(result, businessDays, holidays)) {
      remaining--;
    }
  }
  return result;
}
