import { convertTikzToImageUrl } from './src/utils/tikzConverter';

const testCode = `
\\begin{tikzpicture}[tdplot_main_coords, scale=3, line cap=round, line join=round]
\\def\\R{1}
\\draw[thick, ->] (0,0,0) -- (1.5,0,0) node[anchor=north east]{$x$};
\\draw[thick, ->] (0,0,0) -- (0,1.5,0) node[anchor=north west]{$y$};
\\draw[thick, ->] (0,0,0) -- (0,0,1.5) node[anchor=south]{$z$};
\\end{tikzpicture}
`;

const preambleExtras = `
\\usepackage{tikz-3dplot}
\\tdplotsetmaincoords{70}{110}
`;

convertTikzToImageUrl(testCode, preambleExtras)
  .then(url => console.log('Success:', url))
  .catch(err => console.error('Failed:', err));
