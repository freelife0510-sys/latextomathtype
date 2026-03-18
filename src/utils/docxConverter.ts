import JSZip from 'jszip';
import { convertLatexToOMML } from './mathConverter';
import { convertTikzToImageUrl } from './tikzConverter';
import { fetchImageAsArrayBuffer, addImageToDocx } from './imageInjector';

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
  
  let htmlResult = text;
  const tokens: {id: string, xml: string}[] = [];
  let tokenCounter = 0;

  htmlResult = htmlResult.replace(blockRegex, (match, p1, p2) => {
    const latex = (p1 || p2).trim();
    if (!latex) return match;
    const omml = convertLatexToOMML(latex, true);
    const tokenId = `__MATH_TOKEN_${tokenCounter++}__`;
    tokens.push({ id: tokenId, xml: omml });
    return tokenId;
  });

  htmlResult = htmlResult.replace(inlineRegex, (match, p1) => {
    const latex = p1.trim();
    if (!latex) return match;
    const omml = convertLatexToOMML(latex, false);
    const tokenId = `__MATH_TOKEN_${tokenCounter++}__`;
    tokens.push({ id: tokenId, xml: omml });
    return tokenId;
  });

  const parts = htmlResult.split(/(__MATH_TOKEN_\d+__)/);
  let finalXml = '';
  
  for (const part of parts) {
    if (part.startsWith('__MATH_TOKEN_')) {
      const token = tokens.find(t => t.id === part);
      if (token) {
        finalXml += token.xml;
      }
    } else if (part.length > 0) {
      finalXml += `<w:r><w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`;
    }
  }

  return finalXml;
}

async function processTikzBlock(zip: JSZip, xmlDoc: Document, nodes: Element[], code: string, preambleExtras: string = '') {
  try {
    const match = code.match(/\\begin{tikzpicture}.*?\\end{tikzpicture}/s);
    if (!match) return;
    let tikzCode = match[0];
    
    // Fix common Word AutoCorrect typography that breaks LaTeX
    tikzCode = tikzCode
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2013/g, '--') // en-dash
      .replace(/\u2014/g, '---') // em-dash
      .replace(/\u2026/g, '...'); // ellipsis
      
    // 1. Get Image URL
    const imageUrl = await convertTikzToImageUrl(tikzCode, preambleExtras);
    
    // 2. Fetch image buffer
    const buffer = await fetchImageAsArrayBuffer(imageUrl);
    
    // 3. Get Image dimensions via browser Image object
    const blob = new Blob([buffer], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
    
    const widthEmus = Math.round((img.naturalWidth || 400) * 9525);
    const heightEmus = Math.round((img.naturalHeight || 300) * 9525);
    URL.revokeObjectURL(url);
    
    // 4. Inject into Docx
    const drawingXml = await addImageToDocx(zip, buffer, widthEmus, heightEmus);
    
    // 5. Update XML nodes
    const firstP = nodes[0];
    const wppr = firstP.getElementsByTagName("w:pPr")[0];
    
    // Empty all nodes that contained the TikZ code
    nodes.forEach(p => {
      while (p.firstChild) p.removeChild(p.firstChild);
    });
    
    if (wppr) {
      firstP.appendChild(wppr);
    }
    
    // Parse drawing XML with all needed namespaces
    const parser = new DOMParser();
    const tempXmlStr = `<w:root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${drawingXml}</w:root>`;
    const tempDoc = parser.parseFromString(tempXmlStr, "application/xml");
    
    if (tempDoc.documentElement) {
      Array.from(tempDoc.documentElement.childNodes).forEach(node => {
         firstP.appendChild(xmlDoc.importNode(node, true));
      });
    }
  } catch (err) {
    console.error("Failed to process Tikz block", err);
    
    // Remember to clear the original nodes BEFORE appending the error text, 
    // Otherwise the original tikz code stays!
    nodes.forEach(p => {
      while (p.firstChild) p.removeChild(p.firstChild);
    });

    // Add text fallback if failed
    const firstP = nodes[0];
    const run = xmlDoc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:r");
    const text = xmlDoc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:t");
    text.textContent = "[Lỗi khi tạo ảnh TikZ. Vui lòng kiểm tra lại mã.]";
    run.appendChild(text);
    firstP.appendChild(run);
  }
}

/**
 * Processes a DOCX file, replacing LaTeX with OMML and TikZ with Images
 */
export async function processDocxFile(file: File, onProgress?: (msg: string) => void): Promise<Blob> {
  if (onProgress) onProgress("Đang đọc file Word...");
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  const docXmlFile = loadedZip.file("word/document.xml");
  if (!docXmlFile) {
    throw new Error("File không đúng định dạng Word (.docx)");
  }

  if (onProgress) onProgress("Đang phân tích mã LaTeX và TikZ...");
  const docXml = await docXmlFile.async("string");

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXml, "application/xml");
  
  const paragraphs = Array.from(xmlDoc.getElementsByTagName("w:p"));
  
  // Extract all text to find preamble packages/commands
  const docText = paragraphs.map(p => Array.from(p.getElementsByTagName("w:t")).map(t => t.textContent || '').join('')).join('\n');
  
  // Extract preamble commands (usepackage, usetikzlibrary, pgfplotsset, tdplotsetmaincoords)
  // We use more forgiving regex to handle possible spaces inserted by Word
  const usepackages = docText.match(/\\usepackage(?:\[[^\]]*\])?\s*{[^}]+}/g) || [];
  const usetikzlibs = docText.match(/\\usetikzlibrary(?:\[[^\]]*\])?\s*{[^}]+}/g) || [];
  const tdplots = docText.match(/\\tdplotsetmaincoords\s*{[^}]+}\s*{[^}]+}/g) || [];
  const pgfplots = docText.match(/\\pgfplotsset\s*{[^}]+}/g) || [];
  const defs = docText.match(/\\def\\[a-zA-Z]+\s*{[^}]+}/g) || [];
  
  const preambleExtras = [...usepackages, ...usetikzlibs, ...tdplots, ...pgfplots, ...defs].join('\n');
  
  let inTikz = false;
  let currentTikzNodes: Element[] = [];
  let currentTikzCode = '';
  
  // Track promises to wait for all asynchronous image generations
  const blockPromises: Promise<void>[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const texts = Array.from(p.getElementsByTagName("w:t")).map(t => t.textContent || '');
    const rawText = texts.join('');
    
    if (!inTikz) {
      if (rawText.includes('\\begin{tikzpicture}')) {
        inTikz = true;
        currentTikzNodes = [p];
        currentTikzCode = rawText;
        
        if (rawText.includes('\\end{tikzpicture}')) {
          inTikz = false;
          blockPromises.push(processTikzBlock(loadedZip, xmlDoc, currentTikzNodes, currentTikzCode, preambleExtras));
          currentTikzNodes = [];
          currentTikzCode = '';
        }
      } else if (rawText.includes('$') || rawText.includes('\\[')) {
        const newInnerXml = processTextNode(rawText);
        const wppr = p.getElementsByTagName("w:pPr")[0];
        
        while (p.firstChild) p.removeChild(p.firstChild);
        if (wppr) p.appendChild(wppr);
        
        const tempXmlStr = `<w:root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${newInnerXml}</w:root>`;
        const tempDoc = parser.parseFromString(tempXmlStr, "application/xml");
        
        if (tempDoc.documentElement) {
          Array.from(tempDoc.documentElement.childNodes).forEach(node => {
             p.appendChild(xmlDoc.importNode(node, true));
          });
        }
      }
    } else {
      currentTikzNodes.push(p);
      currentTikzCode += '\n' + rawText;
      if (rawText.includes('\\end{tikzpicture}')) {
        inTikz = false;
        blockPromises.push(processTikzBlock(loadedZip, xmlDoc, currentTikzNodes, currentTikzCode, preambleExtras));
        currentTikzNodes = [];
        currentTikzCode = '';
      }
    }
  }

  // Wait for all TikZ generations to finish!
  if (blockPromises.length > 0) {
    if (onProgress) onProgress(`Đang tải và chèn ${blockPromises.length} hình ảnh TikZ...`);
    await Promise.all(blockPromises);
  }

  if (onProgress) onProgress("Đang đóng gói file mới...");
  
  const serializer = new XMLSerializer();
  const modifiedDocXml = serializer.serializeToString(xmlDoc);
  
  loadedZip.file("word/document.xml", modifiedDocXml);

  return await loadedZip.generateAsync({ type: 'blob' });
}
