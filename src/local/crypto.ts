/** Хеширование паролей PBKDF2-SHA256 через Web Crypto (пароли в открытом виде не хранятся). */
const ITER = 150_000;
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(password, salt, ITER))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, iter, salt, hash] = stored.split("$");
  if (alg !== "pbkdf2") return false;
  const got = b64(await derive(password, unb64(salt), Number(iter)));
  if (got.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export const passwordRules = {
  message: "Пароль: не короче 10 символов, должны быть буквы и цифры",
  test: (p: string) => p.length >= 10 && /[A-Za-zА-Яа-яЁё]/.test(p) && /\d/.test(p),
};
