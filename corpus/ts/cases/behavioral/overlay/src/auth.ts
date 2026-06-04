export function hashToken(token: string): string {
  let h = 0;
  for (const ch of token) {
    h = (h * 31 + ch.charCodeAt(0)) | 0;
  }
  return (h >>> 0).toString(16);
}

export function login(user: string, token: string): boolean {
  return user.length > 0 && hashToken(token).length > 0;
}
