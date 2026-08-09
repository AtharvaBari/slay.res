const fs = require('fs');
// Create a minimal valid PDF
const pdfData = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
  "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
  "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n" +
  "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n" +
  "5 0 obj\n<< /Length 44 >>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Test PDF) Tj\nET\nendstream\nendobj\n" +
  "xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000223 00000 n \n0000000311 00000 n \n" +
  "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n404\n%%EOF",
  "utf8"
);
fs.writeFileSync('test.pdf', pdfData);

(async () => {
  const form = new FormData();
  form.append('file', new Blob([pdfData], { type: 'application/pdf' }), 'test.pdf');
  console.log("Sending request...");
  const start = Date.now();
  try {
    const res = await fetch('http://localhost:3000/api/parse', {
      method: 'POST',
      body: form
    });
    console.log("Response status:", res.status);
    const text = await res.text();
    console.log("Response text:", text.slice(0, 200));
  } catch (err) {
    console.error("Fetch error:", err);
  }
  console.log("Took:", Date.now() - start, "ms");
})();
