import * as cheerio from 'cheerio';

export interface ParsedReview {
  reviewer: string;
  rating: string | null;
  confidence: string | null;
  rawText: string;
  sections: Record<string, string>;
  points: { section: string; text: string; priority: string }[];
}

export function parseOpenReviewHTML(html: string): ParsedReview[] {
  const $ = cheerio.load(html);
  const reviews: ParsedReview[] = [];

  // Strategy A: Structured DOM parsing using OpenReview's note structure
  $('div.note').each((_i, noteEl) => {
    const $note = $(noteEl);

    // Check if this is an Official Review (not a meta-review or other note type)
    const invitationText = $note.find('.invitation').first().text().trim();
    if (!invitationText.includes('Official Review') && !invitationText.includes('Review')) {
      // Check heading as fallback
      const headingText = $note.find('.heading h4 span').first().text().trim();
      if (!headingText.includes('Review')) return;
    }

    // Extract reviewer name
    let reviewerName = $note.find('.signatures span').last().text().trim();
    if (!reviewerName) {
      const heading = $note.find('.heading h4 span').first().text().trim();
      const match = heading.match(/by\s+(Reviewer\s+\w+)/i);
      if (match) reviewerName = match[1];
    }
    if (!reviewerName) reviewerName = `Reviewer ${reviews.length + 1}`;

    // Extract fields
    const sections: Record<string, string> = {};
    let rating: string | null = null;
    let confidence: string | null = null;
    const rawTextParts: string[] = [];

    $note.find('strong.note-content-field').each((_j, fieldEl) => {
      const fieldName = $(fieldEl).text().replace(/:$/, '').trim();
      const $parent = $(fieldEl).parent();

      // Check for scalar value
      const scalarValue = $parent.find('span.note-content-value').first();
      // Check for markdown rendered content
      const markdownValue = $parent.find('div.note-content-value.markdown-rendered').first();

      let value = '';
      if (markdownValue.length > 0) {
        value = markdownValue.html() || '';
      } else if (scalarValue.length > 0) {
        value = scalarValue.text().trim();
      }

      if (!value) return;

      const fieldLower = fieldName.toLowerCase();

      // Extract rating
      if (fieldLower.includes('overall') || fieldLower === 'rating' || fieldLower === 'recommendation') {
        rating = value;
      }
      // Extract confidence
      else if (fieldLower === 'confidence') {
        confidence = value;
      }
      // Skip metadata fields
      else if (
        fieldLower.includes('code of conduct') ||
        fieldLower.includes('llm') ||
        fieldLower.includes('submission number') ||
        fieldLower.includes('keywords') ||
        fieldLower.includes('primary area') ||
        fieldLower.includes('abstract') ||
        fieldLower.includes('supplementary') ||
        fieldLower.includes('ethics') ||
        fieldLower.includes('reciprocal') ||
        fieldLower.includes('verify author') ||
        fieldLower.includes('proceedings')
      ) {
        return;
      }
      // Content sections
      else {
        sections[fieldName] = value;
        rawTextParts.push(`## ${fieldName}\n${htmlToPlainText($, value)}`);
      }
    });

    if (rawTextParts.length === 0 && Object.keys(sections).length === 0) return;

    const rawText = rawTextParts.join('\n\n');

    // Extract individual points from sections
    const points = extractPoints($, sections);

    reviews.push({
      reviewer: reviewerName,
      rating,
      confidence,
      rawText,
      sections,
      points,
    });
  });

  // Strategy B: If no reviews found via DOM, try text-based extraction
  if (reviews.length === 0) {
    return parseOpenReviewTextBased(html);
  }

  return reviews;
}

function htmlToPlainText($: cheerio.CheerioAPI, html: string): string {
  const temp = cheerio.load(`<div id="temp">${html}</div>`);
  return temp('#temp').text().trim();
}

function extractPoints(
  $: cheerio.CheerioAPI,
  sections: Record<string, string>
): { section: string; text: string; priority: string }[] {
  const points: { section: string; text: string; priority: string }[] = [];

  for (const [sectionName, sectionHtml] of Object.entries(sections)) {
    const $section = cheerio.load(`<div id="root">${sectionHtml}</div>`);
    const sectionLower = sectionName.toLowerCase();

    // Determine the type of section for categorization
    let defaultSection = 'Other';
    let defaultPriority = 'medium';

    if (sectionLower.includes('strength')) {
      defaultSection = 'Strength';
      defaultPriority = 'low';
    } else if (sectionLower.includes('weakness')) {
      defaultSection = 'Weakness';
      defaultPriority = 'high';
    } else if (sectionLower.includes('question')) {
      defaultSection = 'Question';
      defaultPriority = 'medium';
    } else if (sectionLower.includes('limitation')) {
      defaultSection = 'Suggestion';
      defaultPriority = 'medium';
    } else if (sectionLower.includes('suggestion') || sectionLower.includes('minor')) {
      defaultSection = 'Minor Issue';
      defaultPriority = 'low';
    }

    // Parse subsections within combined "Strengths And Weaknesses" fields
    let currentSubSection = defaultSection;
    let currentPriority = defaultPriority;

    // Look for h2/h3 subsection headers
    const subsectionMap: { header: string; section: string; priority: string }[] = [];
    $section('h2, h3').each((_i, el) => {
      const text = $(el).text().trim().toLowerCase();
      let sec = defaultSection;
      let pri = defaultPriority;
      if (text.includes('strength')) { sec = 'Strength'; pri = 'low'; }
      else if (text.includes('weakness') || text.includes('concern')) { sec = 'Weakness'; pri = 'high'; }
      else if (text.includes('question')) { sec = 'Question'; pri = 'medium'; }
      else if (text.includes('suggestion') || text.includes('recommendation')) { sec = 'Suggestion'; pri = 'medium'; }
      else if (text.includes('minor') || text.includes('typo') || text.includes('nit')) { sec = 'Minor Issue'; pri = 'low'; }
      subsectionMap.push({ header: $(el).text().trim(), section: sec, priority: pri });
    });

    // Extract list items as individual points
    const processedTexts = new Set<string>();

    // Walk through elements in order
    let currentIdx = 0;
    $section('#root').children().each((_i, el) => {
      const tagName = el.type === 'tag' ? el.name : '';

      // Update current section if we hit a header
      if (tagName === 'h2' || tagName === 'h3') {
        if (currentIdx < subsectionMap.length) {
          currentSubSection = subsectionMap[currentIdx].section;
          currentPriority = subsectionMap[currentIdx].priority;
          currentIdx++;
        }
        return;
      }

      // Process list items
      if (tagName === 'ul' || tagName === 'ol') {
        $(el).children('li').each((_j, li) => {
          const text = $(li).text().trim();
          if (text && text.length > 10 && !processedTexts.has(text)) {
            processedTexts.add(text);
            points.push({
              section: currentSubSection,
              text,
              priority: currentPriority,
            });
          }
        });
        return;
      }

      // Process paragraphs as points (if they seem like substantive points)
      if (tagName === 'p') {
        const text = $(el).text().trim();
        if (text && text.length > 20 && !processedTexts.has(text)) {
          // Check if it starts with a number/bullet indicator
          const looksLikePoint = /^(\d+[\.\)]\s|[-*]\s|•\s)/.test(text) || text.length > 40;
          if (looksLikePoint) {
            processedTexts.add(text);
            points.push({
              section: currentSubSection,
              text,
              priority: currentPriority,
            });
          }
        }
      }
    });

    // If no list items found, split the entire section text by numbered patterns
    if (points.filter(p => p.section !== 'Strength').length === 0) {
      const plainText = $section('#root').text().trim();
      const numberedPoints = plainText.split(/(?=\d+[\.\)]\s)/);
      for (const pt of numberedPoints) {
        const text = pt.trim();
        if (text && text.length > 20 && !processedTexts.has(text)) {
          processedTexts.add(text);
          points.push({
            section: currentSubSection,
            text,
            priority: currentPriority,
          });
        }
      }
    }
  }

  return points;
}

function parseOpenReviewTextBased(html: string): ParsedReview[] {
  // Fallback text-based parsing
  const $ = cheerio.load(html);
  const bodyText = $('body').text();

  const reviews: ParsedReview[] = [];
  const reviewBlocks = bodyText.split(/(?=Official Review.*?by\s+Reviewer\s+\w+)/i);

  for (const block of reviewBlocks) {
    if (block.length < 100) continue;

    const reviewerMatch = block.match(/by\s+(Reviewer\s+\w+)/i);
    if (!reviewerMatch) continue;

    const ratingMatch = block.match(/(?:Overall|Rating|Recommendation)[:\s]+(\d[^,\n]*)/i);
    const confidenceMatch = block.match(/Confidence[:\s]+(\d[^,\n]*)/i);

    reviews.push({
      reviewer: reviewerMatch[1],
      rating: ratingMatch?.[1]?.trim() || null,
      confidence: confidenceMatch?.[1]?.trim() || null,
      rawText: block.trim(),
      sections: { 'Full Review': block.trim() },
      points: [{
        section: 'Other',
        text: block.trim().slice(0, 500),
        priority: 'medium',
      }],
    });
  }

  return reviews;
}

export function openReviewHtmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];

  $('div.note').each((_i, noteEl) => {
    const $note = $(noteEl);
    const heading = $note.find('.heading h4 span').first().text().trim();
    if (!heading) return;

    // Only process review notes
    const invitationText = $note.find('.invitation').first().text().trim();
    if (!invitationText.includes('Review')) return;

    parts.push(`# ${heading}\n`);

    const signatures = $note.find('.signatures').first().text().trim();
    const date = $note.find('.created-date').first().text().trim();
    if (signatures) parts.push(`**${signatures}** | ${date}\n`);

    $note.find('strong.note-content-field').each((_j, fieldEl) => {
      const fieldName = $(fieldEl).text().replace(/:$/, '').trim();
      const $parent = $(fieldEl).parent();

      const skipFields = ['code of conduct', 'llm', 'submission number', 'keywords',
        'primary area', 'abstract', 'supplementary', 'ethics', 'reciprocal',
        'verify author', 'proceedings'];
      if (skipFields.some(s => fieldName.toLowerCase().includes(s))) return;

      const markdownValue = $parent.find('div.markdown-rendered').first();
      const scalarValue = $parent.find('span.note-content-value').first();

      if (markdownValue.length > 0) {
        parts.push(`## ${fieldName}\n`);
        parts.push(htmlContentToMarkdown(markdownValue.html() || '') + '\n');
      } else if (scalarValue.length > 0) {
        parts.push(`**${fieldName}:** ${scalarValue.text().trim()}\n`);
      }
    });

    parts.push('\n---\n');
  });

  return parts.join('\n');
}

function htmlContentToMarkdown(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function processNode(el: any): string {
    if (el.type === 'text') {
      return el.data || '';
    }
    if (el.type !== 'tag') return '';

    const tag = el.name;
    const $el = $(el);
    const children = $el.contents().toArray().map(processNode).join('');

    switch (tag) {
      case 'h1': return `# ${children}\n\n`;
      case 'h2': return `## ${children}\n\n`;
      case 'h3': return `### ${children}\n\n`;
      case 'h4': return `#### ${children}\n\n`;
      case 'p': return `${children}\n\n`;
      case 'strong':
      case 'b': return `**${children}**`;
      case 'em':
      case 'i': return `*${children}*`;
      case 'code': return `\`${children}\``;
      case 'pre': return `\n\`\`\`\n${children}\n\`\`\`\n`;
      case 'ul': return `${children}\n`;
      case 'ol': return `${children}\n`;
      case 'li': {
        const parent = $el.parent();
        if (parent.is('ol')) {
          const idx = $el.index() + 1;
          return `${idx}. ${children.trim()}\n`;
        }
        return `- ${children.trim()}\n`;
      }
      case 'a': return `[${children}](${$el.attr('href') || ''})`;
      case 'br': return '\n';
      case 'hr': return '\n---\n';
      case 'blockquote': return `> ${children.trim()}\n\n`;
      default: return children;
    }
  }

  return $('#root').contents().toArray().map(processNode).join('').trim();
}
