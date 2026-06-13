export function formatCurrency(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return `${String.fromCharCode(0x20a6)}${amount.toLocaleString("en-NG")}`;
}
