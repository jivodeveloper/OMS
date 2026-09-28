/**
 * PORTED FROM THE WEB CLIENT — `OMS-Frontend/src/pages/advancePayments/attachments.ts`.
 *
 * Kept identical on purpose: the rules that decide what a request may be, what
 * it comes to and what may be done to it are the same product on both clients,
 * and two hand-written copies drift. Only the imports and the file type differ
 * (React Native has no `File`). Change it on the web first, then re-copy.
 */
/**
 * A file on a request or a payout: one just chosen (`file`, not yet sent) or
 * one the server already holds (`serverId`). The lists show both alike; saving
 * sends the new ones and removes the saved ones that were taken off.
 */
/**
 * A file as this app gets one: `expo-document-picker` and `expo-image-picker`
 * both hand back a uri, and that — with a name and type — is what React
 * Native's FormData sends. The web's `File` does not exist here.
 */
export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  /** Chosen in this browser, to be uploaded on save. */
  file?: PickedFile;
  /** Held by the server: `advance_payment_request_file.id`. */
  serverId?: number;
}

/** A newly chosen file, as the lists hold it. */
export function attachFile(file: PickedFile): FileAttachment {
  return {
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
    name: file.name,
    size: file.size,
    file,
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
