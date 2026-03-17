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
      
      // We need to keep w:pPr (paragraph properties) if it exists
      const wppr = p.getElementsByTagName("w:pPr")[0];
      
      // Clear the paragraph children
      while (p.firstChild) {
        p.removeChild(p.firstChild);
      }
      
      // Re-append properties if they existed
      if (wppr) {
        p.appendChild(wppr);
      }
      
      // Create a temporary document to parse the new inner XML
      // We wrap it in a root element with required namespaces
      const tempXmlStr = `<w:root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${newInnerXml}</w:root>`;
      const tempDoc = parser.parseFromString(tempXmlStr, "application/xml");
      
      // Append the parsed nodes to our target paragraph
      if (tempDoc.documentElement) {
        Array.from(tempDoc.documentElement.childNodes).forEach(node => {
           p.appendChild(xmlDoc.importNode(node, true));
        });
      }
    }
  }

  // Save the modified document.xml back to the zip
  if (onProgress) onProgress("Đang đóng gói file mới...");
  
  // Serialize the modified XML DOM back exactly as intended
  const serializer = new XMLSerializer();
  const modifiedDocXml = serializer.serializeToString(xmlDoc);
  
  loadedZip.file("word/document.xml", modifiedDocXml);

  return await loadedZip.generateAsync({ type: 'blob' });
}
