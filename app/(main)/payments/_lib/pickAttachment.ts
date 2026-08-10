import { Platform } from "react-native";

import { appAlert } from "@/src/components/common/AppDialog";

/**
 * These three are NATIVE modules: importing them at the top level throws
 * "Cannot find native module 'ExpoDocumentPicker'" the moment this file is
 * evaluated, if the installed app binary predates their installation. Because
 * the import sits at module scope, that crash takes down the whole screen
 * before the user has touched anything.
 *
 * Requiring them lazily, inside a guard, means a stale binary produces one
 * actionable message on the source the user tapped — and the other sources keep
 * working if only one module is missing.
 */
type NativeModule = "camera/gallery" | "files";

const loadImagePicker = () => {
  try {
    return require("expo-image-picker") as typeof import("expo-image-picker");
  } catch {
    return null;
  }
};

const loadDocumentPicker = () => {
  try {
    return require("expo-document-picker") as typeof import("expo-document-picker");
  } catch {
    return null;
  }
};

const loadFileSystem = () => {
  try {
    return require("expo-file-system") as typeof import("expo-file-system");
  } catch {
    return null;
  }
};

/** One consistent message when the installed build lacks a native module. */
function warnMissingModule(which: NativeModule) {
  appAlert(
    "Update required",
    `The ${which} picker is not available in this build of the app.\n\n` +
      `It was added after this version was installed. Please install the ` +
      `latest build to attach files.`,
  );
}

/**
 * One picked file, in the shape a multipart upload needs.
 *
 * `uri`/`name`/`mimeType` are exactly what React Native's FormData wants for a
 * file part, so the caller never has to reshape this.
 */
export interface PickedFile {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Server-side limits, mirrored here so a user learns a file is too big BEFORE
 * uploading it over mobile data rather than after.
 *
 * MUST stay in step with attachments/storage.py — ALLOWED_EXTENSIONS and
 * MAX_UPLOAD_BYTES. The server re-checks both (and sniffs magic bytes), so this
 * is a courtesy, never the real guard.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "pdf"];

/** Quality that keeps a cheque legible while staying well under the size cap. */
const IMAGE_QUALITY = 0.7;

const extensionOf = (name: string) =>
  name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";

const mimeFor = (name: string, fallback = "application/octet-stream") => {
  switch (extensionOf(name)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "pdf":
      return "application/pdf";
    default:
      return fallback;
  }
};

const uniqueId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Size of a local file.
 *
 * The pickers do report `fileSize`/`size`, but not on every platform and not
 * for every source — a camera capture on Android often omits it. Falling back
 * to a filesystem stat means the limit is enforced consistently instead of
 * being skipped whenever the field happens to be missing.
 */
async function sizeOf(uri: string, reported?: number | null): Promise<number> {
  if (typeof reported === "number" && reported > 0) return reported;
  const FileSystem = loadFileSystem();
  if (!FileSystem) return 0;   // unknown size — the server still enforces it
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof (info as { size?: number }).size === "number"
      ? (info as { size: number }).size
      : 0;
  } catch {
    return 0; // Unknown — let the server be the judge rather than blocking.
  }
}

/** Human-readable size, e.g. "1.4 MB". */
export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Apply the shared rules to a candidate file.
 * Returns the file, or null after telling the user exactly what was wrong.
 */
async function accept(
  uri: string,
  rawName: string,
  reportedSize?: number | null,
  reportedMime?: string | null,
): Promise<PickedFile | null> {
  const name = (rawName || `upload-${uniqueId()}.jpg`).replace(/\s+/g, "_");
  const ext = extensionOf(name);

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    appAlert(
      "Unsupported file",
      `“${name}” is a .${ext || "?"} file. Please choose a ${ALLOWED_EXTENSIONS.join(
        ", ",
      )} file.`,
    );
    return null;
  }

  const size = await sizeOf(uri, reportedSize);
  if (size > MAX_UPLOAD_BYTES) {
    appAlert(
      "File too large",
      `“${name}” is ${formatSize(size)}. The maximum is ${MAX_UPLOAD_MB} MB.\n\n` +
        `Try taking the photo again — captured photos are compressed automatically.`,
    );
    return null;
  }

  return {
    id: uniqueId(),
    uri,
    name,
    mimeType: reportedMime || mimeFor(name),
    size,
  };
}

/**
 * Camera capture.
 *
 * Permission is requested at the moment of use, not at app start — a user who
 * never attaches a photo is never asked.
 */
export async function captureWithCamera(): Promise<PickedFile[]> {
  const ImagePicker = loadImagePicker();
  if (!ImagePicker) {
    warnMissingModule("camera/gallery");
    return [];
  }
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    appAlert(
      "Camera permission needed",
      permission.canAskAgain
        ? "Allow camera access to photograph a cheque or deposit slip."
        : "Camera access is blocked. Enable it in Settings › OMSAPP › Camera.",
    );
    return [];
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: IMAGE_QUALITY,
    exif: false,
  });
  if (result.canceled) return [];

  const asset = result.assets[0];
  const file = await accept(
    asset.uri,
    asset.fileName || `photo-${uniqueId()}.jpg`,
    asset.fileSize,
    asset.mimeType,
  );
  return file ? [file] : [];
}

/** Photo library. Multi-select, since a cheque may need front and back. */
export async function pickFromGallery(): Promise<PickedFile[]> {
  const ImagePicker = loadImagePicker();
  if (!ImagePicker) {
    warnMissingModule("camera/gallery");
    return [];
  }
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    appAlert(
      "Photos permission needed",
      permission.canAskAgain
        ? "Allow access to your photos to attach an existing image."
        : "Photo access is blocked. Enable it in Settings › OMSAPP › Photos.",
    );
    return [];
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: IMAGE_QUALITY,
    allowsMultipleSelection: true,
    selectionLimit: 5,
    exif: false,
  });
  if (result.canceled) return [];

  const files = await Promise.all(
    result.assets.map((asset, index) =>
      accept(
        asset.uri,
        asset.fileName || `image-${uniqueId()}-${index}.jpg`,
        asset.fileSize,
        asset.mimeType,
      ),
    ),
  );
  return files.filter((file): file is PickedFile => file !== null);
}

/**
 * Files app / Drive / OneDrive / any other document provider.
 *
 * This is the single entry point for every cloud source: the OS sheet lists
 * whichever providers the device has installed, so Drive appears without this
 * app integrating with it directly.
 */
export async function pickDocument(): Promise<PickedFile[]> {
  const DocumentPicker = loadDocumentPicker();
  if (!DocumentPicker) {
    warnMissingModule("files");
    return [];
  }
  const result = await DocumentPicker.getDocumentAsync({
    type: ["image/jpeg", "image/png", "application/pdf"],
    multiple: true,
    // Copy into the app's cache: a provider URI can expire or be unreadable by
    // the time the upload runs, which is a confusing failure after the fact.
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];

  const files = await Promise.all(
    result.assets.map((asset) =>
      accept(asset.uri, asset.name, asset.size, asset.mimeType),
    ),
  );
  return files.filter((file): file is PickedFile => file !== null);
}

export type PickSource = "camera" | "gallery" | "files";

/** Run one source and return whatever survived validation. */
export async function pickFrom(source: PickSource): Promise<PickedFile[]> {
  try {
    if (source === "camera") return await captureWithCamera();
    if (source === "gallery") return await pickFromGallery();
    return await pickDocument();
  } catch (error) {
    // A picker throwing is not something the user can act on, so keep the
    // message plain and let the console carry the detail.
    console.warn(`[attachment] ${source} picker failed`, error);
    appAlert(
      "Could not open",
      Platform.OS === "android"
        ? "That app could not be opened. Try another source."
        : "That source could not be opened. Try another one.",
    );
    return [];
  }
}
