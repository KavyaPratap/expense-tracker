const fs = require('fs');
async function test() {
  const buf = fs.readFileSync('package.json'); // Dummy (though it will fail to parse as PDF, let's see)
  try {
    const pdfModule = await import('pdf-parse');
    let rawText = '';
    if (pdfModule.PDFParse) {
      console.log("Using v2");
      const instance = new pdfModule.PDFParse(buf);
      await instance.load();
      rawText = await instance.getText();
    } else {
      console.log("Using v1");
    }
    console.log("TEXT EXTRACTED:", rawText.slice(0, 20));
  } catch (e) {
    console.log("Expected crash since package.json isn't a PDF, but API is solid:", e.message);
  }
}
test();
