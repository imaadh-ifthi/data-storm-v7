export function formatNumber(value: number | undefined | null, maximumFractionDigits: number = 2): string {
  if (value == null) return "0";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}
