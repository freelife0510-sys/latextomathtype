import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, PenTool, FileText, CheckCircle, AlertCircle, Copy, Download, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import appCode from './App.tsx?raw';
import mainCode from './main.tsx?raw';
import cssCode from './index.css?raw';

export default function App() {
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionSuccess, setConversionSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [latexInput, setLatexInput] = useState('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
  const [mathmlOutput, setMathmlOutput] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    
    // Thư mục src
    const src = zip.folder("src");
    if (src) {
      src.file("App.tsx", appCode);
      src.file("main.tsx", mainCode);
      src.file("index.css", cssCode);
      src.file("vite-env.d.ts", `/// <reference types="vite/client" />`);
    }
    
    // Các file cấu hình gốc
    zip.file("index.html", `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Latex to Mathtype PRO</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>`);
    
    zip.file("package.json", JSON.stringify({
      "name": "latex-to-mathtype",
      "private": true,
      "version": "1.0.0",
      "type": "module",
      "scripts": {
        "dev": "vite",
        "build": "tsc && vite build",
        "preview": "vite preview"
      },
      "dependencies": {
        "file-saver": "^2.0.5",
        "jszip": "^3.10.1",
        "katex": "^0.16.9",
        "lucide-react": "^0.344.0",
        "motion": "^12.23.24",
        "react": "^19.0.0",
        "react-dom": "^19.0.0"
      },
      "devDependencies": {
        "@tailwindcss/vite": "^4.1.14",
        "@types/file-saver": "^2.0.7",
        "@types/katex": "^0.16.7",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@vitejs/plugin-react": "^4.2.1",
        "tailwindcss": "^4.1.14",
        "typescript": "^5.2.2",
        "vite": "^6.2.0"
      }
    }, null, 2));

    zip.file("vite.config.ts", `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport tailwindcss from '@tailwindcss/vite';\n\nexport default defineConfig({\n  plugins: [react(), tailwindcss()],\n});`);

    zip.file("tsconfig.json", `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "useDefineForClassFields": true,\n    "lib": ["ES2020", "DOM", "DOM.Iterable"],\n    "module": "ESNext",\n    "skipLibCheck": true,\n    "moduleResolution": "bundler",\n    "allowImportingTsExtensions": true,\n    "resolveJsonModule": true,\n    "isolatedModules": true,\n    "noEmit": true,\n    "jsx": "react-jsx",\n    "strict": true\n  },\n  "include": ["src"]\n}`);

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, "latex-to-mathtype-source.zip");
  };

  // Render LaTeX preview and generate MathML
  useEffect(() => {
    if (previewRef.current) {
      try {
        katex.render(latexInput, previewRef.current, {
          throwOnError: false,
          displayMode: true,
          output: 'htmlAndMathml',
        });
        
        // Extract MathML
        const mathmlNode = previewRef.current.querySelector('math');
        if (mathmlNode) {
          // Word requires the xmlns attribute
          if (!mathmlNode.getAttribute('xmlns')) {
            mathmlNode.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
          }
          setMathmlOutput(mathmlNode.outerHTML);
        } else {
          setMathmlOutput('');
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [latexInput, activeTab]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.docx')) {
        setFile(droppedFile);
        setError(null);
        setConversionSuccess(false);
      } else {
        setError('Vui lòng chọn file định dạng .docx');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.docx')) {
        setFile(selectedFile);
        setError(null);
        setConversionSuccess(false);
      } else {
        setError('Vui lòng chọn file định dạng .docx');
      }
    }
  };

  const handleConvertFile = async () => {
    if (!file) return;
    
    setIsConverting(true);
    setError(null);
    setConversionSuccess(false);
    
    try {
      const { processDocxFile } = await import('./utils/docxConverter');
      
      const blob = await processDocxFile(file, (msg) => {
        // Here we could update a progress state if we want
        console.log(msg);
      });
      
      saveAs(blob, `mathtype_${file.name}`);
      setConversionSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi trong quá trình chuyển đổi. Vui lòng thử lại.');
      console.error(err);
    } finally {
      setIsConverting(false);
    }
  };

  const handleCopyMathml = () => {
    if (mathmlOutput) {
      navigator.clipboard.writeText(mathmlOutput).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-100 via-violet-50 to-fuchsia-100 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] border border-white/40 p-8 max-w-2xl w-full relative overflow-hidden"
      >
        {/* Decorative background elements */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-fuchsia-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl"></div>

        <div className="relative z-10">
          {/* Nút tải source code */}
          <button
            onClick={handleDownloadZip}
            className="absolute top-0 right-0 p-2.5 bg-violet-100 text-violet-600 hover:bg-violet-200 hover:text-violet-700 rounded-full transition-all duration-200 group shadow-sm z-20"
            title="Tải Source Code (.zip)"
          >
            <Download size={20} />
            <span className="absolute -bottom-10 right-0 w-max bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg pointer-events-none">
              Tải Source Code
            </span>
          </button>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 flex items-center justify-center gap-3 mb-2">
              Latex to Mathtype
              <span className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-xs px-2.5 py-1 rounded-full font-semibold tracking-wide shadow-sm">
                PRO
              </span>
            </h1>
            <p className="text-slate-500 font-medium">Chuyển đổi Latex trong word sang dạng mathtype</p>
          </div>

          {/* Tabs */}
          <div className="flex p-1 bg-slate-100/80 rounded-2xl mb-8">
            <button
              onClick={() => setActiveTab('file')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === 'file' 
                  ? 'bg-white text-violet-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <FileText size={18} />
              Tải lên File .docx
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === 'text' 
                  ? 'bg-white text-violet-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <PenTool size={18} />
              Nhập văn bản Latex
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'file' ? (
              <motion.div
                key="file-tab"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <div 
                  className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-200 mb-6 ${
                    isDragging 
                      ? 'border-violet-500 bg-violet-50/50' 
                      : file 
                        ? 'border-emerald-500 bg-emerald-50/30' 
                        : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50/50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !file && fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".docx" 
                    className="hidden" 
                  />
                  
                  {file ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2">
                        <FileText size={32} />
                      </div>
                      <p className="text-slate-700 font-medium text-lg">{file.name}</p>
                      <p className="text-slate-400 text-sm">{(file.size / 1024).toFixed(2)} KB</p>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          setConversionSuccess(false);
                        }}
                        className="mt-4 text-red-500 hover:text-red-600 flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={16} /> Xóa file
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 cursor-pointer">
                      <div className="w-20 h-20 bg-violet-50 text-violet-500 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <UploadCloud size={40} strokeWidth={1.5} />
                      </div>
                      <p className="text-slate-600 font-medium text-lg">Kéo thả file hoặc click để tải lên file Word (.docx)</p>
                      <p className="text-slate-400 text-sm">Hỗ trợ định dạng .docx chứa mã Latex, TikZ</p>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm font-medium">
                    <AlertCircle size={18} />
                    {error}
                  </div>
                )}

                {conversionSuccess && (
                  <div className="mb-6 p-4 bg-emerald-50 text-emerald-600 rounded-xl flex items-center gap-3 text-sm font-medium">
                    <CheckCircle size={18} />
                    Chuyển đổi thành công! File đã được tải xuống.
                  </div>
                )}

                <button
                  onClick={handleConvertFile}
                  disabled={!file || isConverting}
                  className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-violet-500/25 ${
                    !file 
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                      : isConverting
                        ? 'bg-violet-400 text-white cursor-wait'
                        : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 hover:shadow-violet-500/40 hover:-translate-y-0.5'
                  }`}
                >
                  {isConverting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Đang xử lý...
                    </>
                  ) : (
                    <>
                      <PenTool size={20} />
                      Chuyển đổi ngay
                    </>
                  )}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="text-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-6"
              >
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Nhập mã LaTeX:</label>
                  <textarea
                    value={latexInput}
                    onChange={(e) => setLatexInput(e.target.value)}
                    className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all resize-none font-mono text-sm text-slate-700"
                    placeholder="Ví dụ: \int_{0}^{\infty} e^{-x^2} dx"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-slate-700">Xem trước:</label>
                    <button
                      onClick={handleCopyMathml}
                      className="text-xs font-medium text-violet-600 hover:text-violet-700 flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {copySuccess ? <CheckCircle size={14} /> : <Copy size={14} />}
                      {copySuccess ? 'Đã copy MathML!' : 'Copy cho Word'}
                    </button>
                  </div>
                  <div className="w-full min-h-[8rem] p-6 bg-white border border-slate-200 rounded-xl flex items-center justify-center overflow-x-auto shadow-inner">
                    <div ref={previewRef} className="text-xl"></div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3 text-center">
                    * Click "Copy cho Word" và dán (Ctrl+V) trực tiếp vào file Word để tạo Equation.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="mt-8 text-center text-sm text-slate-600 flex flex-col gap-1 font-medium">
        <p>© 2026 Math Tools Utility</p>
        <p>Xây dựng bởi <span className="font-bold text-violet-700">Hồ Sỹ Long - Zalo 0943278804</span></p>
      </div>
    </div>
  );
}
