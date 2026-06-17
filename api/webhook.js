import fs from "fs";
import FormData from "form-data";

const MONDAY_API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY2Mjc0MDM4OCwiYWFpIjoxMSwidWlkIjoxMDMyMTE3MDQsImlhZCI6IjIwMjYtMDUtMjVUMjI6NDE6NDAuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjgzMjY0MTAsInJnbiI6InVzZTEifQ.aCSoGeqhkzLvJ_TUn4xuIisR3seqR5VGbaBSR-2Os3w";
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

export const config = {
  api: { bodyParser: true }
};

// ======================
// BASE64
// ======================
function encodeParams(params) {
  return Buffer.from(
    Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")
  ).toString("base64");
}

// ======================
// FECHA ISO
// ======================
function getFechaISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ======================
// UPDATE MONDAY DATE
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
// FOLIO
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

  const url = `${SINUBE.URL}?par=${params}`;

  console.log("📤 URL SINUBE:", url);

  const res = await fetch(url);
  const xml = await res.text();

  // ✅ ESTO ES LO MÁS IMPORTANTE
  console.log("📥 RESPUESTA COMPLETA SINUBE:");
  console.log("----------------------------------");
  console.log(xml);
  console.log("----------------------------------");

  return "TEST"; // 👈 temporal para que no truene
}

// ======================
// XML CFDI CORRECTO
// ======================
function generarXML(folio) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Comprobante 
  sistema="Stylos"
  generar="Factura"
  version="CFDI 4.0"
  exportacion="01"
  rfcEmisor="${SINUBE.RFC}"
  sucursal="${SINUBE.SUC}"
  codigoReporte="CFDI 4.0"
  permiteAgregarProductosNoInv="1"
  serie="${SINUBE.SERIE}"
  folio="${folio}"
  formaDePago="99"
  metodoDePago="PPD"
  subtotal="100"
  montoIVA="16"
  total="116"
  monedaSAT="MXN"
  difZonaHoraria="-6">

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
// TIMBRAR SINUBE
// ======================
async function timbrar(xml) {
  const params = encodeParams({
    tipo: "20",
    emp: SINUBE.RFC,
    suc: SINUBE.SUC,
    usu: SINUBE.USER,
    pwd: SINUBE.PASS,
    sis: SINUBE.SIS,
    xml: Buffer.from(xml).toString("base64")
  });

  const res = await fetch(`${SINUBE.URL}?par=${params}`);
  return await res.text();
}

// ======================
// EXTRAER XML + PDF
// ======================
function extraerArchivos(resp) {
  const xml = resp.match(/<xml>([\s\S]*?)<\/xml>/);
  const pdf = resp.match(/<pdf>([\s\S]*?)<\/pdf>/);

  return {
    xml: xml ? Buffer.from(xml[1], "base64") : null,
    pdf: pdf ? Buffer.from(pdf[1], "base64") : null
  };
}

// ======================
// FALLBACK PDF
// ======================
async function descargarPDF(serie, folio) {

  const params = encodeParams({
    tipo: "1007",
    emprep: "neoreportes",
    emp: SINUBE.RFC,
    suc: SINUBE.SUC,
    reporte: "CFDI 4.0",
    serie: serie,
    folio: folio,
    usu: SINUBE.USER,
    pwd: SINUBE.PASS,
    sist: SINUBE.SIS,
    difzh: "-6",
    nompdf: `FACT_${folio}`
  });

  const res = await fetch(`${SINUBE.URL}?par=${params}`);
  const buffer = await res.arrayBuffer();

  return Buffer.from(buffer);
}

// ======================
// SAVE FILE
// ======================
function saveFile(buffer, name) {
  const path = `/tmp/${name}`;
  fs.writeFileSync(path, buffer);
  return path;
}

// ======================
// SUBIR A MONDAY
// ======================
async function uploadFile(itemId, path) {

  const query = `
    mutation ($file: File!) {
      add_file_to_column(
        item_id: ${itemId},
        column_id: "file_mm4be9tf",
        file: $file
      ) { id }
    }
  `;

  const form = new FormData();
  form.append("query", query);
  form.append("variables[file]", fs.createReadStream(path));

  await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: { Authorization: MONDAY_API_KEY },
    body: form
  });
}

// ======================
// WEBHOOK
// ======================
export default async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store");

  // ✅ Challenge
  if (req.method === "GET" && req.query?.challenge) {
    return res.status(200).json({ challenge: req.query.challenge });
  }

  if (req.method === "POST" && req.body?.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  try {

    const itemId = req.body?.event?.pulseId;
    if (!itemId) return res.status(200).json({ ok: true });

    // ======================
    // ✅ FLUJO
    // ======================

    const folio = await getFolio();

    const xml = generarXML(folio);

    // ✅ TIMBRADO
    const resp = await timbrar(xml);

    // ✅ LOG CRÍTICO (debug SINUBE)
    console.log("📥 SINUBE TIMBRADO RAW:");
    console.log("----------------------------------");
    console.log(resp);
    console.log("----------------------------------");
    // ✅ DETECTAR ERROR REAL DE SINUBE
const errorMatch = resp.match(/<error>([\s\S]*?)<\/error>/);


// ✅ forzar detección de error en cualquier formato
if (resp.toLowerCase().includes("error")) {
  throw new Error(`SINUBE RESPONDIÓ ERROR:\n${resp}`);
}

    // ✅ SOLO UNA DECLARACIÓN
    let { xml: xmlFile, pdf } = extraerArchivos(resp);

    // ✅ fallback PDF
    if (!pdf) {
      pdf = await descargarPDF(SINUBE.SERIE, folio);
    }

    if (!xmlFile) throw new Error("SINUBE no generó XML");

    const xmlPath = saveFile(xmlFile, `factura-${folio}.xml`);
    const pdfPath = saveFile(pdf, `factura-${folio}.pdf`);

    await uploadFile(itemId, xmlPath);
    await uploadFile(itemId, pdfPath);

    await actualizarFecha(itemId);

    return res.status(200).json({
      success: true,
      folio
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message
    });
  }
}
