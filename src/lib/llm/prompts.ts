export const PARSE_REVIEWS_SYSTEM = `You are an expert at extracting structured review data from academic peer review pages. You must return valid JSON only.`;

export function parseReviewsPrompt(htmlText: string): string {
  return `Extract all individual reviewer comments from this OpenReview page content. For each review identify:
- Reviewer name/ID
- Rating and confidence
- Strengths (positive points) as a separate list
- Each individual actionable point categorized as: Weakness (W), Question (Q), Limitation (L)
- Label each point: W1, W2, Q1, Q2, L1, etc. in order
- Priority: critical (fundamental flaw), high (weakness), medium (question/limitation), low (minor)

Return ONLY valid JSON:
[{"reviewer": "Reviewer ABC", "rating": "5", "confidence": "3", "strengths": ["strength 1", "strength 2"], "points": [{"section": "Weakness", "label": "W1", "text": "...", "priority": "high"}]}]

Content:
${htmlText.slice(0, 50000)}`;
}

export const DRAFT_THANK_YOU_SYSTEM = `You are an expert academic author writing a thank-you note to a peer reviewer. Be professional, genuine, and specific. Reference the reviewer's actual positive comments. Do NOT be sycophantic.`;

export function draftThankYouPrompt(
  reviewerName: string,
  strengths: string,
  guidelines: string
): string {
  return `Write a thank-you note for ${reviewerName} based on the strengths they identified.

Reviewer's positive points:
${strengths}

${guidelines ? `Guidelines:\n${guidelines}\n` : ''}
Rules:
- 2-4 sentences maximum
- Reference specific positive points they raised
- Mention how you reflect on their concerns
- Do NOT use hollow phrases like "We are grateful for the valuable review"
- Be genuine and specific`;
}

export const DRAFT_RESPONSE_SYSTEM = `You are an expert academic author writing a rebuttal to peer reviewers. Be professional, specific, and constructive. Write concise responses. Do NOT include any thank-you note or pleasantry. Jump straight to addressing the issue.`;

export function draftResponsePrompt(
  paperContext: string,
  sectionName: string,
  label: string,
  pointText: string,
  template: string,
  guidelines: string
): string {
  return `Complete the response to this reviewer point. The draft already has the header formatted - you need to fill in the actual response content after "**Response ${label}:**".

Paper context: ${paperContext.slice(0, 3000)}

Point label: ${label}
Section: ${sectionName}
Reviewer comment: "${pointText}"

${template ? `Response template format:\n${template}\n` : ''}
${guidelines ? `Writing guidelines:\n${guidelines}\n` : ''}
Rules:
- Do NOT write any thank-you note or greeting. Jump straight into the response.
- Address the specific issue directly
- Reference concrete evidence, experiments, or revisions
- If the reviewer is mistaken, politely clarify with evidence
- Cite specific locations (Table X, §Y, Appendix Z)
- Simple answer: 2-4 sentences. Substantive criticism: 1-3 paragraphs max
- Professional academic tone, no filler
- Output ONLY the response text (no header, no label, no blockquote - those are already in the draft)`;
}

export const IMPROVE_DRAFT_SYSTEM = `You are editing an academic rebuttal response. Improve clarity, strengthen arguments, and maintain professional tone.`;

export function improveDraftPrompt(pointText: string, currentDraft: string, guidelines: string): string {
  return `Improve this draft rebuttal response:

Original reviewer comment: "${pointText}"
Current draft: "${currentDraft}"

${guidelines ? `Guidelines:\n${guidelines}\n` : ''}
Make it more concise, professional, and compelling. Fix any grammatical issues. Keep the same key arguments but strengthen them.`;
}

export const SUMMARIZE_SYSTEM = `Summarize this peer review in 2-3 sentences, highlighting the main concerns and overall sentiment.`;

export function summarizePrompt(reviewText: string): string {
  return reviewText.slice(0, 10000);
}

export const COMPILE_REBUTTAL_SYSTEM = `You are compiling individual rebuttal responses into a polished, submission-ready rebuttal document. Follow the template exactly.`;

export function compileRebuttalPrompt(
  reviewerName: string,
  thankYouNote: string,
  responses: { label: string; section: string; point: string; response: string }[],
  template: string,
  guidelines: string,
  charLimit: number
): string {
  return `Compile these responses into a rebuttal for ${reviewerName}.

Character limit: ${charLimit} characters (STRICT)

Thank-you note: ${thankYouNote || '(not yet written)'}

Responses:
${responses.map(r => `${r.label} [${r.section}]: "${r.point}"\nResponse: ${r.response}`).join('\n\n---\n\n')}

Template format to follow:
${template}

${guidelines ? `Writing guidelines:\n${guidelines}\n` : ''}
Rules:
- Start with the thank-you note
- Then each response in order (W1, W2, ..., Q1, Q2, ..., L1, L2, ...)
- Use the exact label format from the template (e.g., > **W1:** ... then **Response W1:** ...)
- Separate each with ---
- Stay under ${charLimit} characters
- Output: Markdown`;
}

export const REDUCE_LENGTH_SYSTEM = `You are condensing an academic rebuttal to meet a strict character limit. Preserve all key arguments and evidence while removing redundancy.`;

export function reduceLengthPrompt(
  rebuttalText: string,
  charLimit: number
): string {
  const currentLength = rebuttalText.length;
  const overage = currentLength - charLimit;
  return `Current rebuttal (${currentLength} chars) exceeds the ${charLimit} char limit by ${overage} characters.

Current text:
${rebuttalText}

Condense to under ${charLimit} characters. Prioritize:
1. Keep all key counter-arguments
2. Keep all promises of new experiments/revisions
3. Remove pleasantries and redundant thank-yous
4. Shorten transitions
5. Combine similar points`;
}
