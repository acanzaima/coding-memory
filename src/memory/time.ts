export function formatLocalTimestamp(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainder = absoluteOffset % 60;
  const offset =
    offsetRemainder === 0
      ? `GMT${sign}${offsetHours}`
      : `GMT${sign}${offsetHours}:${pad(offsetRemainder)}`;

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    offset,
  ].join(" ");
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
