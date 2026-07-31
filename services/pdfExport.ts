type PdfExportRoot = Pick<ParentNode, 'querySelectorAll'>;

const PDF_EXCLUDED_SELECTOR = '[data-html2canvas-ignore="true"]';

export const withPdfExportLayout = async <T>(
  root: PdfExportRoot,
  exportPdf: () => Promise<T>,
): Promise<T> => {
  const excludedElements = Array.from(root.querySelectorAll<HTMLElement>(PDF_EXCLUDED_SELECTOR));
  const previousDisplays = excludedElements.map((element) => element.style.display);

  excludedElements.forEach((element) => {
    element.style.display = 'none';
  });

  try {
    return await exportPdf();
  } finally {
    excludedElements.forEach((element, index) => {
      element.style.display = previousDisplays[index];
    });
  }
};
