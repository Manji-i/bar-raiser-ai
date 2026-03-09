import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

export const parseFile = async (file: File): Promise<string> => {
  const fileType = file.type;
  
  try {
    if (fileType === "application/pdf") {
      return await readPdfFile(file);
    } else if (
      fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return await readDocxFile(file);
    } else if (fileType === "text/plain" || fileType === "text/markdown") {
      return await readTextFile(file);
    } else {
      // Fallback: try reading as text
      return await readTextFile(file);
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

const readPdfFile = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Try to use the worker from the same CDN (esm.sh) to ensure version compatibility
    // Fallback to a generic version if pdfjsLib.version is not available
    const version = pdfjsLib.version || '5.4.530'; 
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += `--- Page ${i} ---\n${pageText}\n`;
    }

    if (!fullText.trim()) {
      throw new Error("PDF text extraction resulted in empty content. It might be an image-only PDF.");
    }

    return fullText;
  } catch (e: any) {
    console.error("PDF Parse Error details:", e);
    throw new Error("Could not parse PDF. This may be due to browser security restrictions or file format issues. Please copy and paste the text instead.");
  }
};
