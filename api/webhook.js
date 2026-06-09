import { construirCFDI } from "../lib/cfdi.js";
import { timbrarCFDI } from "../lib/sw.js";
import { subirArchivoMonday } from "../lib/monday.js";
import fs from "fs";

// ================================
// 🔧 UTILIDADES
// ================================

function decodeBase64(base64) {
  return Buffer.from(base64, "base64");
}

function saveFile(buffer, filename) {
  const filePath = `/tmp/${filename}`;
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// ================================
// 🚀 WEBHOOK PRINCIPAL
// ================================

export default async function handler(req, res) {

  // ✅ Verificación de Monday
  if (req.method === "GET") {
    return res.status(200).send(req.query.challenge);
  }

  try {
    console.log("📩 BODY COMPLETO:", JSON.stringify(req.body, null, 2));

    /**
     * 🔴 IMPORTANTE:
     * Hay dos escenarios:
     * 1. Monday webhook automático → viene en req.body.event
     * 2. Payload custom → viene directo en req.body
     */

    const event = req.body.event || req.body;

    // ================================
    // 🧠 OBTENER ITEM ID
    // ================================

    const itemId =
      event.pulseId ||  // webhook normal de Monday
      event.itemId;     // payload custom

    if (!itemId) {
      throw new Error("No se encontró itemId");
    }

    // ================================
    // 🧾 DATOS DESDE MONDAY
    // ================================

    /**
     * 🔴 AJUSTA ESTO SEGÚN TU CONFIGURACIÓN EN MONDAY
     * Si envías payload custom:
     * {
     *   rfc, cliente, monto, uso_cfdi
     * }
     */

    const values = event.columnValues || event;

    const data = {
      rfc: values.rfc,
      cliente: values.cliente,
      uso_cfdi: values.uso_cfdi,
      monto: Number(values.monto)
    };

    console.log("📊 DATOS PROCESADOS:", data);

    // ================================
    // 🧱 CONSTRUIR CFDI
    // ================================

    const cfdiPayload = construirCFDI(data);

    console.log("📦 CFDI:", JSON.stringify(cfdiPayload, null, 2));

    // ================================
    // 🧾 TIMBRAR EN SW
    // ================================

    const result = await timbrarCFDI(cfdiPayload);

    console.log("✅ RESPUESTA SW:", result);

    // ================================
    // 📄 PROCESAR XML
    // ================================

    const xmlBase64 = result?.data?.xml;

    if (!xmlBase64) {
      throw new Error("No se recibió XML desde SW");
    }

    const xmlBuffer = decodeBase64(xmlBase64);
    const xmlPath = saveFile(xmlBuffer, "factura.xml");

    // ================================
    // 📤 SUBIR XML A MONDAY
    // ================================

    /**
     * 🔴 IMPORTANTE:
     * Cambia "archivo_xml" por el ID REAL de tu columna tipo Files
     */

    await subirArchivoMonday(
      itemId,
      xmlPath,
      "archivo_xml"
    );

    // ================================
    // 📄 (OPCIONAL) PDF
    // ================================

    /**
     * 🔴 Si tu endpoint de SW devuelve PDF:
     */

    /*
    const pdfBase64 = result?.data?.pdf;

    if (pdfBase64) {
      const pdfBuffer = decodeBase64(pdfBase64);
      const pdfPath = saveFile(pdfBuffer, "factura.pdf");

      await subirArchivoMonday(
        itemId,
        pdfPath,
        "archivo_pdf"
      );
    }
    */

    // ================================
    // ✅ RESPUESTA FINAL
    // ================================

    return res.status(200).json({
      success: true,
      message: "CFDI timbrado y XML guardado en Monday"
    });

  } catch (error) {

    console.error("❌ ERROR GENERAL:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
