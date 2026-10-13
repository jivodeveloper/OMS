import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";

/** Intent.FLAG_GRANT_READ_URI_PERMISSION */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  heic: "image/heic",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
};

const mimeFor = (name: string, fallback?: string) => {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] || fallback || "*/*";
};

/**
 * Hand a LOCAL file to whatever app on the device opens that kind.
 *
 * Not `Linking.openURL`: on Android that fires a bare ACTION_VIEW with no
 * FLAG_GRANT_READ_URI_PERMISSION and no MIME type, so the receiving app gets a
 * `content://` URI from our non-exported FileSystemFileProvider that it is not
 * allowed to read — the PDF viewer opens on a blank page. Here the intent
 * carries both the read grant and the type.
 *
 * Resolves `false` when no installed app can open the file, so callers keep
 * their "saved, but nothing can open it" message.
 */
export async function openFile(
  uri: string,
  name: string,
  mimeType?: string,
): Promise<boolean> {
  if (Platform.OS !== "android") {
    const can = await Linking.canOpenURL(uri).catch(() => false);
    if (can) await Linking.openURL(uri);
    return can;
  }

  // A file:// URI throws FileUriExposedException in the receiving app.
  const data = uri.startsWith("file://") ? await FileSystem.getContentUriAsync(uri) : uri;
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data,
      type: mimeFor(name, mimeType),
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
    return true;
  } catch {
    // ActivityNotFoundException — nothing installed handles this type.
    return false;
  }
}
