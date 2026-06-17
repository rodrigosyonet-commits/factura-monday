import fs from "fs";

const MONDAY_API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY2Mjc0MDM4OCwiYWFpIjoxMSwidWlkIjoxMDMyMTE3MDQsImlhZCI6IjIwMjYtMDUtMjVUMjI6NDE6NDAuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjgzMjY0MTAsInJnbiI6InVzZTEifQ.aCSoGeqhkzLvJ_TUn4xuIisR3seqR5VGbaBSR-2Os3w";

export const config = {
  api: { bodyParser: true }
};

/ ======================
// ✅ OBTENER TIPO (Emitidos / Recibidos)
// ======================
async function obtenerTipoFactura(itemId) {

  const query = `
    query {
      items(ids: ${itemId}) {
        column_values(ids: ["color_mm4csect"]) {
          id
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

  console.log("📅 Enviando fecha:", fecha);

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

  console.log("📥 RESPUESTA MONDAY DATE:");
  console.log(text);
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

  const response = await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: {
      Authorization: MONDAY_API_KEY
    },
    body: formData
  });

  const text = await response.text();

  console.log("📥 RESPUESTA MONDAY FILE:");
  console.log(text);

  if (!text) {
    throw new Error("Monday respondió vacío");
  }
}
// ======================
// ✅ WEBHOOK
// ======================

xport default async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store");

  console.log("🚨 WEBHOOK RECIBIDO");

  // ✅ Challenge Monday
  if (req.method === "GET" && req.query?.challenge) {
    return res.status(200).json({ challenge: req.query.challenge });
  }

  if (req.method === "POST" && req.body?.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  try {

    const itemId = req.body?.event?.pulseId;

    if (!itemId) {
      return res.status(200).json({ ok: true });
    }

    console.log("📌 ITEM:", itemId);

    // ======================
    // ✅ 1. FILTRO POR TIPO
    // ======================
    const tipo = await obtenerTipoFactura(itemId);

    if ((tipo || "").toLowerCase() !== "emitidos") {
      console.log("⛔ Ignorado (no Emitidos)");
      return res.status(200).json({ ignored: true });
    }

    console.log("✅ Procesando Emitido");

    // ======================
    // ✅ 2. FOLIO
    // ======================
    const folio = Date.now();

    // ======================
    // ✅ 3. XML + PDF
    // ======================
    const xml = generarXMLPrueba(folio);
    const pdf = generarPDF(xml, folio);

    // ======================
    // ✅ 4. GUARDAR
    // ======================
    const xmlPath = saveFile(Buffer.from(xml), `factura-${folio}.xml`);
    const pdfPath = saveFile(pdf, `factura-${folio}.pdf`);

    // ======================
    // ✅ 5. SUBIR
    // ======================
    await uploadFile(itemId, xmlPath);
    await uploadFile(itemId, pdfPath);

    // ======================
    // ✅ 6. FECHA
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
