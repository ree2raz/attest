export function hashToken(token: string): string {
  let h = 0;
  for (const ch of token) {
    h = (h * 31 + ch.charCodeAt(0)) | 0;
  }
  return (h >>> 0).toString(16);
}
