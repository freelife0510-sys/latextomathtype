import JSZip from 'jszip';
import { convertLatexToOMML } from './mathConverter';

// Helper to escape XML
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
 * Parses and processes a text containing LaTeX and TikZ
 * Returns the XML representing Word Runs (<w:r>) and OMML (<m:oMath>)
 */
function processTextNode(text: string): string {
  // Regex to match block equations $$...$$ or \[...\]
  const blockRegex = /\$\$(.*?)\$\$|\\\[(.*?)\\\]/gs;
  // Regex to match inline equations $...$
  const inlineRegex = /\$(.*?)\$/gs;
  
  // Note: parsing text sequentially allows us to mix text and equations
  let htmlResult = text;
  
  // A simple strategy is to use a token replacer to prevent overlapping matches
  const tokens: {id: string, xml: string}[] = [];
  let tokenCounter = 0;

  // Replace block math
  htmlResult = htmlResult.replace(blockRegex, (match, p1, p2) => {
    const latex = (p1 || p2).trim();
    if (!latex) return match;
    const omml = convertLatexToOMML(latex, true);
    const tokenId = `__MATH_TOKEN_${tokenCounter++}__`;
    tokens.push({ id: tokenId, xml: omml });
    return tokenId;
  });

  // Replace inline math
  htmlResult = htmlResult.replace(inlineRegex, (match, p1) => {
    const latex = p1.trim();
    if (!latex) return match;
    const omml = convertLatexToOMML(latex, false);
    const tokenId = `__MATH_TOKEN_${tokenCounter++}__`;
    tokens.push({ id: tokenId, xml: omml });
    return tokenId;
  });

  // Split by tokens and reconstruct
  const parts = htmlResult.split(/(__MATH_TOKEN_\d+__)/);
  let finalXml = '';
  
  for (const part of parts) {
    if (part.startsWith('__MATH_TOKEN_')) {
      const token = tokens.find(t => t.id === part);
      if (token) {
        finalXml += token.xml;
      }
    } else if (part.length > 0) {
      // Regular text needs to be wrapped in <w:r><w:t>
      finalXml += `<w:r><w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`;
    }
  }

  return finalXml;
}

/**
 * Processes a DOCX file, replacing LaTeX with OMML
 */
export async function processDocxFile(file: File, onProgress?: (msg: string) => void): Promise<Blob> {
  if (onProgress) onProgress("Đang đọc file Word...");
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  const docXmlFile = loadedZip.file("word/document.xml");
  if (!docXmlFile) {
    throw new Error("File không đúng định dạng Word (.docx)");
  }

  if (onProgress) onProgress("Đang phân tích và chuyển đổi mã LaTeX...");
  let docXml = await docXmlFile.async("string");

  // A generic paragraph regex is `<w:p>...</w:p>`
  // But w:p might have attributes. 
  // To avoid complex XML parsing that breaks elements, we'll parse paragraphs using DOMParser
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXml, "application/xml");
  
  const paragraphs = xmlDoc.getElementsByTagName("w:p");
  
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    // Gather all text from w:t nodes
    const texts = Array.from(p.getElementsByTagName("w:t")).map(t => t.textContent || '');
    const rawText = texts.join('');
    
    // Check if the paragraph contains latex markers
    if (rawText.includes('$') || rawText.includes('\\[')) {
      // It has latex! 
      // We process the full text of the paragraph and rebuild the inner elements.
      const newInnerXml = processTextNode(rawText);
      
      // Remove all run nodes <w:r> containing text
      // Note: This is an oversimplification. We might lose text formatting (bold/italic) applied to parts of the text
      // A more robust approach would keep formatting, but rebuilding from plain text is safer for math injection without a complex engine.
      
      // Let's replace the inner HTML of the paragraph
      // We need to keep w:pPr (paragraph properties) if it exists
      const wppr = p.getElementsByTagName("w:pPr")[0];
      
      // Create a temporary element to hold the new XML
      // Since DOMParser doesn't support setting innerHTML on XML documents directly with standard strings easily,
      // we serialize and replace. We'll do a string replacement for the paragraph instead to preserve namespaces correctly.
      
      const serializer = new XMLSerializer();
      const pStr = serializer.serializeToString(p);
      const wpprStr = wppr ? serializer.serializeToString(wppr) : '';
      
      // Replace the entire <w:p> with our new content
      const newPStr = `<w:p>${wpprStr}${newInnerXml}</w:p>`;
      
      // Modify the original string (docXml was already loaded)
      // Wait, since we are doing string replacement, it's better to modify docXml cumulatively. 
      // Replace the entire paragraph string in the document XML string.
      docXml = docXml.replace(pStr, newPStr);
    }
  }

  // Save the modified document.xml back to the zip
  if (onProgress) onProgress("Đang đóng gói file mới...");
  loadedZip.file("word/document.xml", docXml);

  return await loadedZip.generateAsync({ type: 'blob' });
}
