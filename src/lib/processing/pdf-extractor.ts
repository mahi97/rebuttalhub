export async function processPDF(fileBuffer: Buffer): Promise<{
  text: string;
  markdown: string;
  pageCount: number;
}> {
  // Use lib path directly — importing the main entry point triggers pdf-parse's
  // test runner which tries to read files from disk and fails in serverless envs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdf = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;

  const data = await pdf(fileBuffer);

  // pdf-parse can return null/undefined for image-only or encrypted PDFs
  const rawText = data.text ?? '';
  const pageCount = data.numpages ?? 0;

  // PostgreSQL rejects null bytes (\u0000) and some other invalid Unicode
  // sequences that PDFs commonly contain. Strip them before saving.
  const text = sanitizeForPostgres(rawText);
  const markdown = text ? convertPdfTextToMarkdown(text) : '';

  return { text, markdown, pageCount };
}

function sanitizeForPostgres(text: string): string {
  return text
    // Remove null bytes — PostgreSQL refuses to store \u0000 in text columns
    .replace(/\u0000/g, '')
    // Remove other C0/C1 control characters except tab, newline, carriage return
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    // Remove lone surrogates that form invalid Unicode (common in some PDFs)
    .replace(/[\uD800-\uDFFF]/g, '');
}

function convertPdfTextToMarkdown(text: string): string {
  const lines = text.split('\n');
  const mdLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      mdLines.push('');
      continue;
    }

    // Detect section headers
    const sectionPattern = /^(Abstract|Introduction|Related Work|Background|Method(?:ology)?|Approach|Experiments?|Results?|Discussion|Conclusion|Acknowledgments?|References|Appendix|Supplementary)/i;

    if (sectionPattern.test(line) && line.length < 80) {
      mdLines.push(`\n## ${titleCase(line)}\n`);
      continue;
    }

    const numberedSection = line.match(/^(\d+\.?\s+)([A-Z][a-zA-Z\s]+)$/);
    if (numberedSection && line.length < 80) {
      mdLines.push(`\n## ${line}\n`);
      continue;
    }

    const subSection = line.match(/^(\d+\.\d+\.?\s+)([A-Z][a-zA-Z\s]+)$/);
    if (subSection && line.length < 80) {
      mdLines.push(`\n### ${line}\n`);
      continue;
    }

    mdLines.push(line);
  }

  return mdLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
