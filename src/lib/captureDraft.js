// Files stay in memory between the camera and the publishing editor.
// Nothing is uploaded until the person presses Publish in that editor.
let draft = null

export function saveCaptureDraft(value) {
  draft = value
}

export function getCaptureDraft(target) {
  return draft?.target === target ? draft : null
}

export function clearCaptureDraft() {
  draft = null
}
