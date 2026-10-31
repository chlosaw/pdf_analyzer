import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export const FIXTURES = path.join(import.meta.dirname, '.fixtures');

async function makePdf(pages: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = pdf.addPage([595, 842]);
    text.split('\n').forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 18, size: 12, font }));
  }
  return pdf.save();
}

export default async function globalSetup() {
  await mkdir(FIXTURES, { recursive: true });
  await writeFile(
    path.join(FIXTURES, 'freedonia.pdf'),
    await makePdf([
      'Annual report of the Freedonia Railway Company.\nThis report covers trains, stations and staff for the year.',
      'The capital of Freedonia is Fredville.\nFredville station serves twelve thousand passengers every day.',
      'Ticket prices rose by four percent.\nMaintenance spending on bridges doubled compared to last year.'
    ])
  );
  await writeFile(path.join(FIXTURES, 'scanned.pdf'), await makePdf(['', '']));
}
