import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

// Cachea el logo como data URI base64 para no releerlo del disco en cada export.
let cache: string | null = null;

export async function obtenerLogoBase64(): Promise<string> {
  if (cache) return cache;
  const asset = Asset.fromModule(require("../assets/images/LogoRecortado.jpg"));
  await asset.downloadAsync();
  const base64 = await FileSystem.readAsStringAsync(asset.localUri!, {
    encoding: FileSystem.EncodingType.Base64,
  });
  cache = `data:image/jpeg;base64,${base64}`;
  return cache;
}