import JSZip from 'jszip';

// Helper to get image buffer from URL
export async function fetchImageAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load image");
  return response.arrayBuffer();
}

/**
 * Checks and adds PNG extension to [Content_Types].xml if it doesn't exist.
 */
export async function ensurePngContentType(zip: JSZip) {
  const contentTypesPath = '[Content_Types].xml';
  const file = zip.file(contentTypesPath);
  if (!file) return;
  
  let xml = await file.async('string');
  if (!xml.includes('Extension="png"')) {
    xml = xml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
    zip.file(contentTypesPath, xml);
  }
}

/**
 * Adds relationship to word/_rels/document.xml.rels and returns the generated rId.
 */
export async function addImageRelationship(zip: JSZip, imagePath: string): Promise<string> {
  const relsPath = 'word/_rels/document.xml.rels';
  const file = zip.file(relsPath);
  if (!file) return "rId1"; // Fallback, shouldn't happen
  
  let xml = await file.async('string');
  
  // Find highest rId
  const rIdMatches = [...xml.matchAll(/Id="rId(\d+)"/g)];
  let maxId = 0;
  for (const match of rIdMatches) {
    const id = parseInt(match[1], 10);
    if (id > maxId) maxId = id;
  }
  
  const newId = `rId${maxId + 1}`;
  
  const newRel = `<Relationship Id="${newId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${imagePath}"/>`;
  xml = xml.replace('</Relationships>', `${newRel}</Relationships>`);
  
  zip.file(relsPath, xml);
  return newId;
}

/**
 * Adds an image to the docx zip and returns the XML string for <w:drawing>
 */
export async function addImageToDocx(zip: JSZip, imageBuffer: ArrayBuffer, widthEmus: number, heightEmus: number): Promise<string> {
  // Generate unique filename
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 10000);
  const fileName = `image_${ts}_${rand}.png`;
  const internalPath = `media/${fileName}`;
  const zipPath = `word/${internalPath}`;
  
  // Add file to zip
  zip.file(zipPath, imageBuffer);
  
  // Ensure Content-Type
  await ensurePngContentType(zip);
  
  // Add Relationship
  const rId = await addImageRelationship(zip, internalPath);
  
  // Create Drawing XML
  // We use standard inline Word drawing XML
  const drawingXml = `
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="${widthEmus}" cy="${heightEmus}"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="${rand}" name="Picture ${rand}"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
          </wp:cNvGraphicFramePr>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="${rand}" name="${fileName}"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                  <a:stretch>
                    <a:fillRect/>
                  </a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="${widthEmus}" cy="${heightEmus}"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect">
                    <a:avLst/>
                  </a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  `;
  
  return drawingXml;
}
