import CryptoJS from "crypto-js";

// Cifrado reversible AES. La clave vive en el bundle de la app (sin backend
// propio no hay forma de evitarlo), así que protege el DNI ante una fuga de
// la base de datos, pero no ante alguien que decompile la app.
const SECRET_KEY = process.env.EXPO_PUBLIC_DNI_SECRET_KEY ?? "cambiar-esta-clave";

export function encriptarDato(valor: string): string {
  if (!valor) return "";
  return CryptoJS.AES.encrypt(valor.trim(), SECRET_KEY).toString();
}

export function desencriptarDato(valorEncriptado: string): string {
  if (!valorEncriptado) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(valorEncriptado, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return "";
  }
}