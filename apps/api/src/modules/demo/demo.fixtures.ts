import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { ingestDocument } from '../../jobs/ingestDocument';
import { prisma } from '../../lib/db';
import { storage } from '../../lib/storage';
import { extractPages } from '../documents/pdf';

/** Sample PDFs given to the demo account and to every "Try the demo" sandbox. */
export const DEMO_DOCUMENTS: { name: string; pages: string[][] }[] = [
  {
    name: 'Northwind Solar - Annual Report 2025.pdf',
    pages: [
      [
        'Northwind Solar - Annual Report 2025',
        'Letter from the CEO',
        'Dear shareholders, 2025 was the year Northwind Solar became profitable. Revenue grew 38 percent to 412 million euros, and we reported our first full-year net profit of 21 million euros.',
        'Our chief executive since 2021, Maria Lindqvist, will remain in the role through 2028. The board approved a dividend of 0.40 euros per share, payable on 15 May 2026.'
      ],
      [
        'Operations',
        'We installed 9,400 residential rooftop systems in 2025, up from 6,100 in 2024. Average installation time fell from eleven days to seven days after we opened regional warehouses in Hamburg and Lyon.',
        'Commercial projects contributed 31 percent of revenue. The largest was a 14 megawatt rooftop array for the Port of Rotterdam, completed in September.',
        'Customer satisfaction, measured by Net Promoter Score, rose from 41 to 56.'
      ],
      [
        'Risks',
        'The main risk to our 2026 outlook is the price of solar panels. About 70 percent of our panels come from two suppliers, so a disruption at either would delay installations.',
        'Interest rates also matter: higher rates make customer financing more expensive and slow residential demand. A shortage of qualified electricians limits how fast we can grow in Germany.'
      ],
      [
        'Outlook for 2026',
        'We expect revenue between 500 and 540 million euros in 2026. We plan to enter the Spanish market in the second quarter and to launch a home battery product, Northwind Store, in the autumn.',
        'Capital expenditure is planned at 35 million euros, mostly for two new warehouses and a training centre for installers.'
      ]
    ]
  },
  {
    name: 'Northwind Employee Handbook.pdf',
    pages: [
      [
        'Northwind Employee Handbook',
        'Time off',
        'Full-time employees receive 28 days of paid vacation per year, plus public holidays. Up to five unused days can be carried over to the next year and must be used by 31 March.',
        'Parental leave is 16 weeks at full pay for every parent, which can be taken within two years of the birth or adoption.'
      ],
      [
        'Remote work',
        'Office-based staff may work remotely up to three days per week. Installers and warehouse staff work on site. Each employee receives a one-time home office budget of 600 euros.',
        'Working from another country is allowed for up to 30 days per year with approval from your manager and the People team.'
      ],
      [
        'Expenses and travel',
        'Book travel through the company portal. Train is preferred for journeys under five hours. Hotel costs are reimbursed up to 150 euros per night, or 220 euros in London and Paris.',
        'Submit expense claims within 30 days with a photo of each receipt. Claims are paid with the next monthly salary.'
      ]
    ]
  }
];

const wrap = (text: string, width = 88) =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1);
    if (last !== undefined && (last + ' ' + word).length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
    return lines;
  }, []);

async function buildPdf(pages: string[][]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const paragraphs of pages) {
    const page = pdf.addPage([595, 842]);
    let y = 780;
    paragraphs.forEach((paragraph, i) => {
      const isHeading = i === 0 || paragraph.length < 40;
      for (const line of wrap(paragraph)) {
        page.drawText(line, { x: 56, y, size: isHeading ? 15 : 11, font: isHeading ? bold : font });
        y -= isHeading ? 24 : 16;
      }
      y -= 10;
    });
  }
  return Buffer.from(await pdf.save());
}

/** Builds, stores and indexes one sample document for a user. Resolves once it is READY (or FAILED). */
export async function createSampleDocument(userId: string, sample: (typeof DEMO_DOCUMENTS)[number]) {
  const buffer = await buildPdf(sample.pages);
  const { pageCount, pages } = await extractPages(buffer);
  const id = randomUUID();
  const storageKey = `${userId}/${id}.pdf`;
  await storage.put(storageKey, buffer, 'application/pdf');
  await prisma.document.create({
    data: { id, userId, name: sample.name, storageKey, sizeBytes: buffer.length, pageCount }
  });
  await ingestDocument(id, pages);
}
