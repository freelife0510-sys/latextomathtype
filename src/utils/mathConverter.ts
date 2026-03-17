import katex from 'katex';
import { mml2omml } from 'mathml2omml';

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
    const omml = mml2omml(mathml);

    // 4. Return the OMML string (this can be injected directly into docx XML w:p/m:oMath)
    return omml;
  } catch (err) {
    console.error("Error converting LaTeX to OMML:", err);
    // Return a fallback warning or the original text wrapped in a run
    return `<w:r><w:t>Error processing LaTeX: ${latex}</w:t></w:r>`;
  }
}
