/**
 * Canonicalise a phone number for storage and lookup so a value typed in the
 * dashboard (e.g. "+234 902 868 6300") matches what WhatsApp delivers in the
 * webhook `from` field (e.g. "2349028686300").
 *
 * Rules:
 *  - keep digits only (drops "+", spaces, dashes, parentheses)
 *  - expand the common Nigerian local format "0XXXXXXXXXX" to "234XXXXXXXXXX"
 *
 * Always store and query using this canonical form.
 */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // NG local format: 0XXXXXXXXXX (11 digits) -> 234XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("0")) {
    return `234${digits.slice(1)}`;
  }
  return digits;
}
