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
function extraerUrls(resp) {

  const xmlMatch = resp.match(/<xml>([\s\S]*?)<\/xml>/);
  const pdfMatch = resp.match(/<pdf>([\s\S]*?)<\/pdf>/);

  return {
    xmlUrl: xmlMatch ? xmlMatch[1].trim() : null,
    pdfUrl: pdfMatch ? pdfMatch[1].trim() : null
  };
}

// ======================
// DESCARGA XML + PDF
// ======================
async function descargarArchivo(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer);
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

  // ======================
  // ✅ CHALLENGE MONDAY
  // ======================
  if (req.method === "GET" && req.query?.challenge) {
    console.log("✅ Challenge GET");
    return res.status(200).json({ challenge: req.query.challenge });
  }

  if (req.method === "POST" && req.body?.challenge) {
    console.log("✅ Challenge POST");
    return res.status(200).json({ challenge: req.body.challenge });
  }

  try {

    console.log("📩 EVENTO COMPLETO:", JSON.stringify(req.body, null, 2));

    const itemId = req.body?.event?.pulseId;

    if (!itemId) {
      console.log("⚠️ No hay itemId");
      return res.status(200).json({ ok: true });
    }

    console.log("📌 ITEM ID:", itemId);

    // ======================
    // ✅ 1. OBTENER FOLIO
    // ======================
    console.log("🔄 Obteniendo folio...");

    const folio = await getFolio();

    console.log("✅ FOLIO:", folio);

    // ======================
    // ✅ 2. GENERAR XML
    // ======================
    const xml = generarXML(folio);

    console.log("📄 XML GENERADO:");
    console.log("----------------------------------");
    console.log(xml);
    console.log("----------------------------------");

    // ======================
    // ✅ 3. TIMBRAR
    // ======================
    console.log("🚀 Enviando XML a SINUBE...");

    let resp;

    try {
      resp = await timbrar(xml);

      console.log("📥 SINUBE TIMBRADO RAW:");
      console.log("----------------------------------");
      console.log(resp);
      console.log("----------------------------------");

    } catch (err) {
      console.error("❌ ERROR EN FETCH SINUBE:");
      console.error(err);
      throw new Error("Fallo en llamada a SINUBE");
    }

    if (!resp) {
      throw new Error("SINUBE respondió vacío");
    }

    // ======================
    // ✅ 4. DETECTAR ERROR SINUBE
    // ======================
    if (resp.toLowerCase().includes("error")) {
      console.error("❌ SINUBE ERROR DETECTADO:");
      console.error(resp);
      throw new Error(`Error SINUBE:\n${resp}`);
    }

    // ======================
    // ✅ 5. EXTRAER URLS
    // ======================
    console.log("🔍 Extrayendo URLs...");

    const xmlMatch = resp.match(/<xml>([\s\S]*?)<\/xml>/);
    const pdfMatch = resp.match(/<pdf>([\s\S]*?)<\/pdf>/);

    const xmlUrl = xmlMatch ? xmlMatch[1].trim() : null;
    const pdfUrl = pdfMatch ? pdfMatch[1].trim() : null;

    console.log("🌐 XML URL:", xmlUrl);
    console.log("🌐 PDF URL:", pdfUrl);

    if (!xmlUrl) {
      throw new Error("SINUBE no devolvió URL XML");
    }

    // ======================
    // ✅ 6. DESCARGAR XML
    // ======================
    console.log("⬇️ Descargando XML...");

    const xmlRes = await fetch(xmlUrl);
    const xmlBuffer = Buffer.from(await xmlRes.arrayBuffer());

    console.log("✅ XML descargado (bytes):", xmlBuffer.length);

    // ======================
    // ✅ 7. DESCARGAR PDF
    // ======================
    let pdfBuffer;

    if (pdfUrl) {
      console.log("⬇️ Descargando PDF...");
      const pdfRes = await fetch(pdfUrl);
      pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
      console.log("✅ PDF descargado (bytes):", pdfBuffer.length);
    } else {
      console.log("⚠️ PDF no vino, usando fallback...");
      pdfBuffer = await descargarPDF(SINUBE.SERIE, folio);
    }

    // ======================
    // ✅ 8. GUARDAR ARCHIVOS
    // ======================
    const xmlPath = saveFile(xmlBuffer, `factura-${folio}.xml`);
    const pdfPath = saveFile(pdfBuffer, `factura-${folio}.pdf`);

    console.log("📁 XML Path:", xmlPath);
    console.log("📁 PDF Path:", pdfPath);

    // ======================
    // ✅ 9. SUBIR A MONDAY
    // ======================
    console.log("📤 Subiendo archivos a Monday...");

    await uploadFile(itemId, xmlPath);
    await uploadFile(itemId, pdfPath);

    console.log("✅ Archivos subidos");

    // ======================
    // ✅ 10. ACTUALIZAR FECHA
    // ======================
    console.log("📅 Actualizando fecha...");

    await actualizarFecha(itemId);

    console.log("✅ Proceso completo");

    return res.status(200).json({
      success: true,
      folio
    });

  } catch (err) {

    console.error("❌ ERROR GENERAL:");
    console.error(err);

    return res.status(500).json({
      error: err.message
    });
  }
}
