import fs from "fs";
import FormData from "form-data";

const MONDAY_API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY2Mjc0MDM4OCwiYWFpIjoxMSwidWlkIjoxMDMyMTE3MDQsImlhZCI6IjIwMjYtMDUtMjVUMjI6NDE6NDAuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjgzMjY0MTAsInJnbiI6InVzZTEifQ.aCSoGeqhkzLvJ_TUn4xuIisR3seqR5VGbaBSR-2Os3w";

export const config = {
  api: { bodyParser: true }
};

// ======================
// ✅ FECHA ISO
// ======================
function getFechaISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ======================
// ✅ ACTUALIZAR FECHA EN MONDAY
// ======================
async function actualizarFecha(itemId) {
  const fecha = getFechaISO();

  const query = `
    mutation {
      change_column_value(
        item_id: ${itemId},
        column_id: "date4",
        value: "{\\"date\\": \\"${fecha}\\"}"
      ) {
        id
      }
    }
  `;

  await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: MONDAY_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });
}

// ======================
// ✅ XML DE PRUEBA
// ======================
function generarXMLPrueba(folio) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Comprobante
  sistema="PRUEBA"
  version="CFDI 4.0"
  serie="F"
  folio="${folio}"
  uuid="ESTO ES UNA PRUEBA NO ES VÁLIDO PARA SAT"
  fecha="${new Date().toISOString()}">

  <Emisor rfc="AAA010101AAA" nombre="EMPRESA PRUEBA" />

  <Receptor 
    rfc="SALR901217B89"
    nombre="RODRIGO SANTIAGO LÓPEZ"
    usoCFDI="S01" />

  <Conceptos>
    <Concepto 
      descripcion="Servicio de prueba"
      cantidad="1"
      valorUnitario="100"
      importe="100" />
  </Conceptos>

</Comprobante>`;
}

// ======================
// ✅ PDF MOCK SIMPLE
// ======================
function generarPDF(xml, folio) {

  const content = `
FACTURA DE PRUEBA

UUID:
ESTO ES UNA PRUEBA NO ES VÁLIDO PARA SAT

FOLIO: ${folio}

---------------------------------------

XML:
${xml.substring(0, 400)}

---------------------------------------
  `;

  return Buffer.from(content);
}

// ======================
// ✅ GUARDAR ARCHIVO
// ======================
function saveFile(buffer, filename) {
  const path = `/tmp/${filename}`;
  fs.writeFileSync(path, buffer);
  return path;
}

// ======================
// ✅ SUBIR ARCHIVO A MONDAY
// ======================
async function uploadFile(itemId, filePath) {

  console.log("📤 Subiendo archivo:", filePath);

  const query = `
    mutation ($file: File!) {
      add_file_to_column(
        item_id: ${itemId},
        column_id: "file_mm4be9tf",
        file: $file
      ) {
        id
      }
    }
  `;

  const form = new FormData();
  form.append("query", query);
  form.append("variables[file]", fs.createReadStream(filePath));

  const res = await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: {
      Authorization: MONDAY_API_KEY,
      ...form.getHeaders()
    },
    body: form
  });

  // 🔥 CRÍTICO
  const text = await res.text();

  console.log("📥 RESPUESTA MONDAY FILE:");
  console.log(text);
}

// ======================
// ✅ WEBHOOK
// ======================
export default async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store");

  console.log("🚨 WEBHOOK RECIBIDO");

  // ======================
  // ✅ CHALLENGE
  // ======================
  if (req.method === "GET" && req.query?.challenge) {
    return res.status(200).json({ challenge: req.query.challenge });
  }

  if (req.method === "POST" && req.body?.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  try {

    console.log("📩 EVENTO:", JSON.stringify(req.body));

    const itemId = req.body?.event?.pulseId;

    if (!itemId) {
      console.log("⚠️ Sin itemId");
      return res.status(200).json({ ok: true });
    }

    console.log("📌 ITEM ID:", itemId);

    // ======================
    // ✅ 1. FOLIO FAKE
    // ======================
    const folio = Date.now();

    // ======================
    // ✅ 2. XML
    // ======================
    const xml = generarXMLPrueba(folio);

    console.log("📄 XML generado");

    // ======================
    // ✅ 3. PDF
    // ======================
    const pdfBuffer = generarPDF(xml, folio);

    console.log("📄 PDF generado");

    // ======================
    // ✅ 4. GUARDAR
    // ======================
    const xmlPath = saveFile(Buffer.from(xml), `factura-${folio}.xml`);
    const pdfPath = saveFile(pdfBuffer, `factura-${folio}.pdf`);

    console.log("📁 Archivos guardados");

    // ======================
    // ✅ 5. SUBIR A MONDAY
    // ======================
    await uploadFile(itemId, xmlPath);
    await uploadFile(itemId, pdfPath);

    console.log("✅ Archivos subidos a Monday");

    // ======================
    // ✅ 6. ACTUALIZAR FECHA
    // ======================
    await actualizarFecha(itemId);

    console.log("✅ Fecha actualizada");

    return res.status(200).json({
      success: true,
      folio
    });

  } catch (err) {

    console.error("❌ ERROR:", err);

    // ✅ IMPORTANTE PARA MONDAY
    return res.status(200).json({
      error: err.message
    });
  }
}
