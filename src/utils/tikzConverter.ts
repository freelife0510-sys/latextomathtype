/**
 * Utility for converting TikZ code to a PNG image URL using QuickLaTeX API
 */

export async function convertTikzToImageUrl(tikzCode: string, preambleExtras: string = ""): Promise<string> {
  try {
    // We add common tikz libraries that might be used
    const preamble = `
\\usepackage{tikz}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usetikzlibrary{calc,angles,quotes,intersections,patterns,arrows.meta,decorations.markings,decorations.pathmorphing}
${preambleExtras}
    `.trim();

    const body = encodeURIComponent(
      `\\begin{document}\n${tikzCode}\n\\end{document}`
    );
    const preambleEncoded = encodeURIComponent(preamble);

    // QuickLaTeX API expects form data
    const formData = `formula=${body}&preamble=${preambleEncoded}&fsize=18px&fcolor=000000&mode=0&out=1&remhost=quicklatex.com`;

    const response = await fetch("https://quicklatex.com/latex3.f", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    const text = await response.text();
    
    const lines = text.split('\n');
    if (lines[0].trim() !== '0') {
       console.error("QuickLaTeX Error:", text);
       throw new Error("Failed to compile TikZ");
    }

    const imageUrl = lines[1].trim();
    return imageUrl;
  } catch (err) {
    console.error("TikZ conversion error", err);
    throw err;
  }
}
