import fs from "fs";

const MONDAY_API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY2Mjc0MDM4OCwiYWFpIjoxMSwidWlkIjoxMDMyMTE3MDQsImlhZCI6IjIwMjYtMDUtMjVUMjI6NDE6NDAuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjgzMjY0MTAsInJnbiI6InVzZTEifQ.aCSoGeqhkzLvJ_TUn4xuIisR3seqR5VGbaBSR-2Os3w";

export const config = {
  api: { bodyParser: true }
};

// ======================
// ✅ OBTENER TIPO (Emitidos / Recibidos)
// ======================
async function obtenerTipoFactura(itemId) {
  const query = `
    query {
      items(ids: ${itemId}) {
        column_values(ids: ["color_mm4csect"]) {
          text
        }
      }
    }
  `;

  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: MONDAY_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });

  const data = await res.json();
  const valor = data?.data?.items?.[0]?.column_values?.[0]?.text;

  console.log("🎯 Tipo factura:", valor);
  return valor;
}

// ======================
// ✅ FECHA (CORTO)
// ======================
function getFecha() {
  const d = new Date();
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const año = d.getFullYear();
  return `${dia}/${mes}/${año}`;
}

// ======================
// ✅ ACTUALIZAR FECHA
// ======================
async function actualizarFecha(itemId) {

  const fecha = getFecha();

  const values = JSON.stringify({
    text_mm4dca2d: fecha
  });

  const query = `
    mutation {
      change_multiple_column_values(
        item_id: ${itemId},
        board_id: 18417889549,
        column_values: ${JSON.stringify(values)}
      ) {
        id
      }
    }
  `;

  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: MONDAY_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });

  const text = await res.text();
  console.log("📥 RESPUESTA DATE:", text);
}

// ======================
// ✅ XML
// ======================
function generarXMLPrueba(folio) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Comprobante
  sistema="PRUEBA"
  version="CFDI 4.0"
  serie="F"
  folio="${folio}"
  uuid="ESTO ES UNA PRUEBA NO ES VALIDO PARA SAT"
  fecha="${new Date().toISOString()}">

  <Emisor rfc="AAA010101AAA" nombre="EMPRESA PRUEBA" />

  <Receptor 
    rfc="SALR901217B89"
    nombre="RODRIGO SANTIAGO LOPEZ"
    usoCFDI="S01" />

  <Conceptos>
    <Concepto descripcion="Servicio prueba" cantidad="1" valorUnitario="100" importe="100" />
  </Conceptos>

</Comprobante>`;
}

// ======================
// ✅ PDF SIMPLE
// ======================
function generarPDF(xml, folio) {
  return Buffer.from(`
FACTURA DE PRUEBA

UUID:
ESTO ES UNA PRUEBA NO ES VALIDO PARA SAT

FOLIO: ${folio}

----------------------------

${xml.substring(0, 300)}
`);
}

// ======================
// ✅ SAVE
// ======================
function saveFile(buffer, filename) {
  const path = `/tmp/${filename}`;
  fs.writeFileSync(path, buffer);
  return path;
}

// ======================
// ✅ UPLOAD FILE (100% FIX)
// ======================
async function uploadFile(itemId, filePath) {

  console.log("📤 Subiendo:", filePath);

  const buffer = fs.readFileSync(filePath);
  const fileName = filePath.split("/").pop();

  const formData = new FormData();

  formData.append("query", `
    mutation ($file: File!) {
      add_file_to_column(
        item_id: ${itemId},
        column_id: "file_mm4be9tf",
        file: $file
      ) {
        id
      }
    }
  `);

  formData.append(
    "variables[file]",
    new Blob([buffer]),
    fileName
  );

  const res = await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: {
      Authorization: MONDAY_API_KEY
    },
    body: formData
  });

  const text = await res.text();

  console.log("📥 RESPUESTA FILE:", text);

  if (!text) {
    throw new Error("Monday respondió vacío");
  }
}

// ======================
// ✅ HANDLER
// ======================
export default async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store");

  console.log("🚨 WEBHOOK RECIBIDO");

  // ✅ CHALLENGE
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
      return res.status(200).json({ ok: true });
    }

    console.log("📌 ITEM:", itemId);

    // ======================
    // ✅ FILTRO Emitidos
    // ======================
    const tipo = await obtenerTipoFactura(itemId);
const tipoNormalizado = (tipo || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");

if (!tipoNormalizado.startsWith("emitid")) {
  console.log("⛔ Ignorado");
  return res.status(200).json({ ignored: true });
}

    console.log("✅ Procesando Emitido");

    // ======================
    // ✅ FOLIO
    // ======================
    const folio = Date.now();

    // ======================
    // ✅ XML + PDF
    // ======================
    const xml = generarXMLPrueba(folio);
    const pdf = generarPDF(xml, folio);

    // ======================
    // ✅ SAVE
    // ======================
    const xmlPath = saveFile(Buffer.from(xml), `factura-${folio}.xml`);
    const pdfPath = saveFile(pdf, `factura-${folio}.pdf`);

    // ======================
    // ✅ UPLOAD
    // ======================
    await uploadFile(itemId, xmlPath);
    await uploadFile(itemId, pdfPath);

    // ======================
    // ✅ FECHA
    // ======================
    await actualizarFecha(itemId);

    return res.status(200).json({ success: true });

  } catch (err) {

    console.error("❌ ERROR:", err);

    return res.status(200).json({
      error: err.message
    });
  }
}
