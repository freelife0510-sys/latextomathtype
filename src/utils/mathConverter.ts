import katex from 'katex';
import { mml2omml } from 'mathml2omml';

// Helper to escape XML special characters
function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Converts a LaTeX string to a Word OMML string.
 */
export function convertLatexToOMML(latex: string, isBlock: boolean = false): string {
  try {
    // 1. Render LaTeX to MathML using KaTeX
    const htmlAndMathml = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: isBlock,
      output: 'htmlAndMathml',
      strict: false,
    });

    // 2. Extract the MathML part from the generated string
    const mathmlMatch = htmlAndMathml.match(/<math[^>]*>[\s\S]*?<\/math>/);
    if (!mathmlMatch) {
      throw new Error("Could not generate MathML from KaTeX");
    }
    
    let mathml = mathmlMatch[0];

    // Ensure proper xmlns is present (KaTeX might omit it depending on config)
    if (!mathml.includes('xmlns="http://www.w3.org/1998/Math/MathML"')) {
      mathml = mathml.replace('<math', '<math xmlns="http://www.w3.org/1998/Math/MathML"');
    }

    // 3. Convert MathML to OMML using mathml2omml
    let omml = mml2omml(mathml);

    // FIX: mathml2omml does not escape XML special characters in <m:t>, causing Word file corruption
    // Be careful to only match `<m:t>` or `<m:t ...>`, and NOT `<m:type>` or other tags starting with m:t
    omml = omml.replace(/<m:t(>|\s[^>]*>)([\s\S]*?)<\/m:t>/g, (match, attrs, text) => {
      // attrs will be ">" or " xml:space=\"preserve\">"
      const closingBracketIndex = attrs.lastIndexOf('>');
      const actualAttrs = attrs.substring(0, closingBracketIndex);
      return `<m:t${actualAttrs}>${escapeXml(text)}</m:t>`;
    });

    // 4. Return the OMML string (this can be injected directly into docx XML w:p/m:oMath)
    return omml;
  } catch (err) {
    console.error("Error converting LaTeX to OMML:", err);
    // Return a fallback warning or the original text wrapped in a run
    return `<w:r><w:t>Error processing LaTeX: ${escapeXml(latex)}</w:t></w:r>`;
  }
}
