export async function processPDF(fileBuffer: Buffer): Promise<{
  text: string;
  markdown: string;
  pageCount: number;
}> {
  // Dynamic import to avoid bundling issues on Vercel
  const pdf = (await import('pdf-parse')).default;

  const data = await pdf(fileBuffer, {
    // Avoid loading the test file that pdf-parse bundles
    max: 0,
  });

  const text = data.text;
  const pageCount = data.numpages;
  const markdown = convertPdfTextToMarkdown(text);

  return { text, markdown, pageCount };
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
