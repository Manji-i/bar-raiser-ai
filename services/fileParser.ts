import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

export interface ParsedFileContent {
  content: string;
  pageCount: number;
}

export const parseFile = async (file: File): Promise<string> => {
  const parsed = await parseFileWithMetadata(file);
  if (!parsed.content.trim()) {
    throw new Error(`Failed to parse file: ${file.name}. Please try pasting the text directly.`);
  }
  return parsed.content;
};

export const parseFileWithMetadata = async (file: File): Promise<ParsedFileContent> => {
  const fileType = file.type;
  
  try {
    if (fileType === "application/pdf") {
      return await readPdfFileWithMetadata(file);
    } else if (
      fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return { content: await readDocxFile(file), pageCount: 1 };
    } else if (fileType === "text/plain" || fileType === "text/markdown") {
      return { content: await readTextFile(file), pageCount: 1 };
    } else {
      // Fallback: try reading as text
      return { content: await readTextFile(file), pageCount: 1 };
    }
  } catch (error) {
    console.error("File Parsing Error:", error);
    throw new Error(`Failed to parse file: ${file.name}. Please try pasting the text directly.`);
  }
};

const readTextFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};

const readDocxFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const result = await mammoth.extractRawText({ arrayBuffer });
        resolve(result.value);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

const readPdfFileWithMetadata = async (file: File): Promise<ParsedFileContent> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Try to use the worker from the same CDN (esm.sh) to ensure version compatibility
    // Fallback to a generic version if pdfjsLib.version is not available
    const version = pdfjsLib.version || '5.4.530'; 
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      pages.push(pageText);
    }
    return { content: pages.join("\n"), pageCount: pdf.numPages };
  } catch (e: any) {
    console.error("PDF Parse Error details:", e);
    throw new Error("Could not parse PDF. This may be due to browser security restrictions or file format issues. Please copy and paste the text instead.");
  }
};
