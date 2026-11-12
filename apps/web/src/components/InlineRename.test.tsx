// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InlineRename } from './InlineRename';

const setup = () => {
  const onSave = vi.fn();
  const onDone = vi.fn();
  render(<InlineRename value="report.pdf" label="New name for report.pdf" onSave={onSave} onDone={onDone} />);
  return { onSave, onDone, input: screen.getByLabelText('New name for report.pdf') };
};

describe('InlineRename (keyboard)', () => {
  it('saves the trimmed name on Enter', async () => {
    const { onSave, onDone, input } = setup();
    expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.type(input, '  Rail 2024.pdf {Enter}');
    expect(onSave).toHaveBeenCalledExactlyOnceWith('Rail 2024.pdf');
    expect(onDone).toHaveBeenCalled();
  });

  it('cancels on Escape without saving', async () => {
    const { onSave, onDone, input } = setup();
    await userEvent.type(input, 'changed{Escape}');
    expect(onSave).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it("doesn't save an empty or unchanged name", async () => {
    const { onSave, input } = setup();
    await userEvent.type(input, '{Enter}');
    await userEvent.clear(input);
    await userEvent.type(input, '   {Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });
});
