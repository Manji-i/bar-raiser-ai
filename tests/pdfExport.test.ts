import assert from 'node:assert/strict';
import test from 'node:test';

const pdfExportModule = await import('../services/pdfExport.ts').catch(() => ({}));

test('PDF 导出前隐藏 html2canvas 忽略节点并在成功后恢复', async () => {
  assert.equal(typeof pdfExportModule.withPdfExportLayout, 'function');

  const toolbar = { style: { display: 'flex' } };
  const sectionNav = { style: { display: '' } };
  let selector = '';
  const root = {
    querySelectorAll: (value: string) => {
      selector = value;
      return [toolbar, sectionNav];
    },
  };

  await pdfExportModule.withPdfExportLayout(root, async () => {
    assert.equal(toolbar.style.display, 'none');
    assert.equal(sectionNav.style.display, 'none');
  });

  assert.equal(selector, '[data-html2canvas-ignore="true"]');
  assert.equal(toolbar.style.display, 'flex');
  assert.equal(sectionNav.style.display, '');
});

test('PDF 导出失败时也恢复被隐藏节点', async () => {
  assert.equal(typeof pdfExportModule.withPdfExportLayout, 'function');

  const toolbar = { style: { display: 'flex' } };
  const root = {
    querySelectorAll: () => [toolbar],
  };

  await assert.rejects(
    pdfExportModule.withPdfExportLayout(root, async () => {
      assert.equal(toolbar.style.display, 'none');
      throw new Error('PDF export failed');
    }),
    /PDF export failed/,
  );

  assert.equal(toolbar.style.display, 'flex');
});
