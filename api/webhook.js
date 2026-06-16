import fetch from "node-fetch";
import fs from "fs";
import FormData from "form-data";

// =====================================
// ✅ CHALLENGE MONDAY (OBLIGATORIO)
// =====================================

// 1. GET challenge (cuando registras webhook)
if (req.method === "GET" && req.query?.challenge) {
  console.log("✅ Challenge GET:", req.query.challenge);
  return res.status(200).json({ challenge: req.query.challenge });
}

// 2. POST challenge (algunas validaciones)
if (req.method === "POST" && req.body?.challenge) {
  console.log("✅ Challenge POST:", req.body.challenge);
  return res.status(200).json({ challenge: req.body.challenge });
}
// ======================
// ✅ CONFIG
// ======================
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;

const SINUBE = {
  URL: "http://ep-dot-facturanube.appspot.com/blob",
  RFC: "COR120522TD6",
  SUC: "Matriz",
  USER: "sistemas1.qsitservices@gmail.com",
  PASS: "COR120522TD6",
  SIS: "Stylos",
  CERT: "00001000000711090217",
  SERIE: "F"
};

// ======================
// ✅ VERCEL CONFIG
// ======================
export const config = {
  api: {
    bodyParser: true
  }
};

// ======================
// ✅ BASE64
// ======================
function encodeParams(params) {
  const raw = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  return Buffer.from(raw).toString("base64");
}

// ======================
// ✅ FOLIO
// ======================
async function getFolio() {
  const params = encodeParams({
    tipo: "10",
    emp: SINUBE.RFC,
    suc: SINUBE.SUC,
    usu: SINUBE.USER,
    pwd: SINUBE.PASS,
    sis: SINUBE.SIS,
    cer: SINUBE.CERT,
    ser: SINUBE.SERIE
  });

  const res = await fetch(`${SINUBE.URL}?par=${params}`);
  const xml = await res.text();

  const match = xml.match(/siguienteFolio="(\d+)"/);

  if (!match) throw new Error("Error obteniendo folio");

  return match[1];
}

// ======================
// ✅ XML FIJO
// ======================
function generarXML(folio) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Comprobante sistema="Stylos" generar="Factura" version="CFDI 4.0"
  rfcEmisor="${SINUBE.RFC}"
  sucursal="${SINUBE.SUC}"
  serie="${SINUBE.SERIE}"
  folio="${folio}"
  formaDePago="99"
  metodoDePago="PPD"
  subtotal="100"
  montoIVA="16"
  total="116">

  <Receptor 
    rfc="SALR901217B89"
    razonSocial="RODRIGO SANTIAGO LÓPEZ"
    usoCFDI="S01"
    regimenFiscal="612" />

  <ReceptorDireccion
    pais="México"
    codigoPostal="57610" />

  <Conceptos>
    <Concepto 
      productoSAT="10101504"
      descripcion="Servicio de tecnología"
      cantidad="1"
      unidadSAT="E48"
      valorUnitario="100"
      importe="100"
      montoIVA="16"
      objetoImp="02" />
  </Conceptos>

</Comprobante>`;
}

// ======================
// ✅ TIMBRAR SINUBE
// ======================
async function enviarASinube(xml) {

  const base64XML = Buffer.from(xml).toString("base64");

  const params = encodeParams({
    tipo: "20",
    emp: SINUBE.RFC,
    suc: SINUBE.SUC,
    usu: SINUBE.USER,
    pwd: SINUBE.PASS,
    sis: SINUBE.SIS,
    xml: base64XML
  });

  const res = await fetch(`${SINUBE.URL}?par=${params}`);
  return await res.text();
}

// ======================
// ✅ EXTRAER XML + PDF
// ======================
function extraerArchivos(xmlResponse) {

  const xmlMatch = xmlResponse.match(/<xml>([\s\S]*?)<\/xml>/);
  const pdfMatch = xmlResponse.match(/<pdf>([\s\S]*?)<\/pdf>/);

  return {
    xml: xmlMatch ? Buffer.from(xmlMatch[1], "base64") : null,
    pdf: pdfMatch ? Buffer.from(pdfMatch[1], "base64") : null
  };
}

// ======================
// ✅ SAVE FILE
// ======================
function saveFile(buffer, filename) {
  const filePath = `/tmp/${filename}`;
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// ======================
// ✅ SUBIR A MONDAY
// ======================
async function uploadFile(itemId, filePath) {

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

  const formData = new FormData();
  formData.append("query", query);
  formData.append("variables[file]", fs.createReadStream(filePath));

  await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: {
      Authorization: MONDAY_API_KEY
    },
    body: formData
  });
}

// ======================
// ✅ WEBHOOK
// ======================
export default async function handler(req, res) {

  // ✅ NO CACHE
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );

  // ✅ CHALLENGE
  if (req.method === "GET" && req.query?.challenge) {
    return res.status(200).json({ challenge: req.query.challenge });
  }

  if (req.method === "POST" && req.body?.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  try {

    const event = req.body.event;
    const itemId = event?.pulseId;

    if (!itemId) return res.status(200).json({ ok: true });

    // ✅ Flujo directo
    const folio = await getFolio();
    const xml = generarXML(folio);

    const response = await enviarASinube(xml);
    const files = extraerArchivos(response);

    if (!files.xml || !files.pdf) {
      throw new Error("SINUBE no regresó archivos");
    }

    const xmlPath = saveFile(files.xml, `factura-${folio}.xml`);
    const pdfPath = saveFile(files.pdf, `factura-${folio}.pdf`);

    await uploadFile(itemId, xmlPath);
    await uploadFile(itemId, pdfPath);

    return res.status(200).json({
      success: true,
      folio
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}
