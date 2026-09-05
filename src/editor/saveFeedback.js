export const SAVE_FEEDBACK_STATES = {
  idle: 'idle',
  saving: 'saving',
  success: 'success',
  error: 'error',
};

export function getSaveFeedback(state, messages) {
  if (state === SAVE_FEEDBACK_STATES.saving) {
    return { message: messages.saving, className: 'statusLine', isSaving: true };
  }
  if (state === SAVE_FEEDBACK_STATES.success) {
    return { message: messages.saved, className: 'statusLine', isSaving: false };
  }
  if (state === SAVE_FEEDBACK_STATES.error) {
    return { message: messages.saveFailed, className: 'errorLine', isSaving: false };
  }
  return { message: '', className: 'statusLine', isSaving: false };
}
