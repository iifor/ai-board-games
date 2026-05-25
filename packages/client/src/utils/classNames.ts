export function classNames(...items: (string | false | null | undefined)[]): string {
  return items.filter(Boolean).join(' ');
}
