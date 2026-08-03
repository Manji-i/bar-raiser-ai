import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import pdfMake from 'pdfmake/build/pdfmake.js';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { buildReportDocumentModel } from '../services/reportDocumentModel.ts';
import { buildReportPdfDocument } from '../services/pdf/reportPdfDocument.ts';
import {
  candidateFixture,
  longParagraphFixture,
  recruiterFixture,
} from '../tests/fixtures/pdfReportFixture.ts';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = resolve(rootDirectory, 'tmp/pdfs/verification');
const fixtureDefinitions = {
  recruiter: {
    input: recruiterFixture,
    fileName: 'recruiter-long.pdf',
  },
  candidate: {
    input: candidateFixture,
    fileName: 'candidate.pdf',
  },
  'long-paragraph': {
    input: longParagraphFixture,
    fileName: 'long-paragraph.pdf',
  },
};

let fontsConfigured = false;

const configureFonts = async () => {
  if (fontsConfigured) return;
  const regular = await readFile(resolve(rootDirectory, 'public/fonts/NotoSansSC-Regular-v1.otf'));
  const bold = await readFile(resolve(rootDirectory, 'public/fonts/NotoSansSC-Bold-v1.otf'));
  pdfMake.addVirtualFileSystem({
    'NotoSansSC-Regular-v1.otf': regular.toString('base64'),
    'NotoSansSC-Bold-v1.otf': bold.toString('base64'),
  });
  pdfMake.addFonts({
    NotoSansSC: {
      normal: 'NotoSansSC-Regular-v1.otf',
      bold: 'NotoSansSC-Bold-v1.otf',
      italics: 'NotoSansSC-Regular-v1.otf',
      bolditalics: 'NotoSansSC-Bold-v1.otf',
    },
  });
  fontsConfigured = true;
};

const normalizeText = (text) => text.replace(/\s+/g, '');

const expectedMarkers = (model) => {
  if (model.mode === 'candidate' && model.candidate) {
    const markers = [
      model.candidate.conclusion.title,
      model.candidate.strengths?.title,
      model.candidate.problems.title,
      model.candidate.checklist?.title,
      ...model.candidate.problems.items.map((item) => item.rootCause),
    ].filter(Boolean);
    const source = normalizeText(model.result);
    return new Map([
      [model.title, 1],
      ...markers.map((marker) => [
        marker,
        Math.max(1, countOccurrences(source, normalizeText(marker))),
      ]),
    ]);
  }

  return new Map([
    [model.title, 1],
    ...model.sections.map((section) => [section.title, 1]),
    ...model.dimensions.map((dimension) => [dimension.name, 2]),
  ]);
};

const countOccurrences = (text, marker) => {
  let count = 0;
  let cursor = 0;
  while ((cursor = text.indexOf(marker, cursor)) !== -1) {
    count += 1;
    cursor += marker.length;
  }
  return count;
};

const inspectPdf = async (buffer, model) => {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const document = await loadingTask.promise;
  const pageTexts = [];
  let fullPageImageCount = 0;
  const imageOperations = new Set([
    OPS.paintImageMaskXObject,
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
  ]);

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pageTexts.push(textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' '));
      const operatorList = await page.getOperatorList();
      fullPageImageCount += operatorList.fnArray.filter((operation) => imageOperations.has(operation)).length;
    }

    const rawExtractedText = pageTexts.join('\n');
    const extractedText = normalizeText(rawExtractedText);
    const missingMarkers = [];
    const duplicateMarkers = [];
    for (const [marker, expectedCount] of expectedMarkers(model)) {
      const normalizedMarker = normalizeText(marker);
      const count = countOccurrences(extractedText, normalizedMarker);
      if (count < expectedCount) missingMarkers.push(marker);
      if (count > expectedCount) duplicateMarkers.push(marker);
    }

    return {
      pageCount: document.numPages,
      extractedChars: rawExtractedText.length,
      missingMarkers,
      duplicateMarkers,
      fullPageImageCount,
    };
  } finally {
    await document.destroy();
  }
};

export const generateAndInspectFixture = async (fixtureName) => {
  const definition = fixtureDefinitions[fixtureName];
  if (!definition) throw new Error(`Unknown PDF fixture: ${fixtureName}`);
  await configureFonts();
  const model = buildReportDocumentModel(definition.input);
  const blob = await pdfMake.createPdf(buildReportPdfDocument(model)).getBlob();
  const buffer = Buffer.from(await blob.arrayBuffer());
  const outputPath = resolve(outputDirectory, definition.fileName);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
  return {
    path: outputPath,
    ...(await inspectPdf(buffer, model)),
  };
};

const run = async () => {
  const results = [];
  for (const fixtureName of Object.keys(fixtureDefinitions)) {
    const result = await generateAndInspectFixture(fixtureName);
    results.push({
      fixture: fixtureName,
      path: result.path,
      pageCount: result.pageCount,
      extractedChars: result.extractedChars,
      missingMarkers: result.missingMarkers,
      duplicateMarkers: result.duplicateMarkers,
      fullPageImageCount: result.fullPageImageCount,
    });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
