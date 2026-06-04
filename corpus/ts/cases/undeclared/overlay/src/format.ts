export function slugify(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

export function truncate(input: string, max: number): string {
  return input.length <= max ? input : input.slice(0, max);
}
