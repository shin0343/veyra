import type { Camera, Layout, Recording } from "./types";

/**
 * Development test sources are cameras whose media is a synthetic FFmpeg pattern. They stay in
 * the workspace (their IDs, recordings and views are preserved) but default demo surfaces hide
 * them behind an explicit "Show test sources" control. Nothing is deleted or renamed.
 */
export function isTestCamera(camera: Camera | undefined) {
  return camera?.source_media?.kind === "synthetic";
}

export function testCameraIds(cameras: Camera[]) {
  return new Set(cameras.filter(isTestCamera).map((camera) => camera.id));
}

/** A recording made by a test camera. */
export function isTestRecording(recording: Recording, testIds: Set<string>) {
  return testIds.has(recording.camera_id) || !recording.source_media;
}

/** A saved view that would show a test pattern in at least one position. */
export function isTestLayout(layout: Layout, testIds: Set<string>) {
  return layout.cells.some((cell) => testIds.has(cell.camera_id));
}

export function plural(count: number, word: string, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}
