import { describe, expect, it } from 'vitest';
import { getSaveFeedback, SAVE_FEEDBACK_STATES } from './saveFeedback';

const messages = {
  saving: 'Сохраняется...',
  saved: 'Изменения сохранены.',
  saveFailed: 'Не удалось сохранить изменения.',
};

describe('person save feedback', () => {
  it('displays a live saving state and disables the button', () => {
    expect(getSaveFeedback(SAVE_FEEDBACK_STATES.saving, messages)).toEqual({
      message: 'Сохраняется...',
      className: 'statusLine',
      isSaving: true,
    });
  });

  it('displays a successful save state and re-enables the button', () => {
    expect(getSaveFeedback(SAVE_FEEDBACK_STATES.success, messages)).toEqual({
      message: 'Изменения сохранены.',
      className: 'statusLine',
      isSaving: false,
    });
  });

  it('displays an error state and re-enables the button', () => {
    expect(getSaveFeedback(SAVE_FEEDBACK_STATES.error, messages)).toEqual({
      message: 'Не удалось сохранить изменения.',
      className: 'errorLine',
      isSaving: false,
    });
  });
});
