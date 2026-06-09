import fs from "fs";
import path from "path";

export function getRecordingsDir(): string {
  const dir = path.join(process.cwd(), "data", "recordings");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getRecordingCastPath(recordingId: string): string {
  return path.join(getRecordingsDir(), `${recordingId}.cast`);
}

export function recordingFileExists(recordingId: string): boolean {
  const castPath = getRecordingCastPath(recordingId);
  try {
    return fs.statSync(castPath).size > 0;
  } catch {
    return false;
  }
}
