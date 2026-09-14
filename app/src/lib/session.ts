/**
 * Deterministic NYSE regular session calendar helper.
 * Regular trading session: Monday - Friday, 09:30 - 16:00 US Eastern Time.
 */

export function isNyseMarketOpen(): { isOpen: boolean; message: string } {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const day = et.getDay(); // 0 = Sun, 6 = Sat
  const hour = et.getHours();
  const minute = et.getMinutes();
  const currentMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30; // 09:30 AM ET
  const closeMinutes = 16 * 60;    // 04:00 PM ET

  if (day === 0 || day === 6) {
    return { isOpen: false, message: "Weekend — NYSE Closed" };
  }
  if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    return { isOpen: true, message: "NYSE Regular Session Open (9:30-16:00 ET)" };
  }
  if (currentMinutes < openMinutes) {
    return { isOpen: false, message: "Pre-Market (Opens 9:30 AM ET)" };
  }
  return { isOpen: false, message: "After-Hours — NYSE Closed" };
}
