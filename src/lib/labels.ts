export function sizeLabel(size: string) {
  switch (size) {
    case "L":
      return "大";
    case "M":
      return "中";
    case "S":
      return "小";
    default:
      return size;
  }
}

export function stateLabel(state: string) {
  switch (state) {
    case "open":
      return "進行中";
    case "done":
      return "完了";
    case "cancelled":
      return "中止";
    default:
      return state;
  }
}

export function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return date;
  }

  const label = `${month}/${day}`;

  return year === new Date().getFullYear() ? label : `${year}/${label}`;
}
