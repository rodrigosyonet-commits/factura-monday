import { construirCFDI } from "../lib/cfdi.js";
import { timbrarCFDI } from "../lib/sw.js";
import { subirArchivoMonday } from "../lib/monday.js";
import { decodeBase64, saveFile } from "../lib/files.js";

// ================================
// 🚀 WEBHOOK PRINCIPAL
// ================================

export default async function handler(req, res) {

  // =====================================
  // ✅ 1. VERIFICACIÓN DE MONDAY (challenge)
  // =====================================
  if (req.method === "GET") {
    console.log("✅ Verificación Monday");
    return res.status(200).send(req.query.challenge);
  }

  // =====================================
  // ✅ 2. EVENTO REAL (POST)
  // =====================================
  try {
    console.log("📩 BODY COMPLETO:", JSON.stringify(req.body, null, 2));

    const event = req.body.event || req.body;

    // =====================================
    // ✅ OBTENER ITEM ID (robusto)
    // =====================================
    const itemId =
      req.body?.event?.pulseId ||
      req.body?.pulseId ||
      req.body?.itemId;

    // 🔴 MUY IMPORTANTE: NO TRUENA SI NO HAY itemId
    if (!itemId) {
      console.log("⚠️ Evento sin itemId (probablemente test o conexión)");

      return res.status(200).json({
        success: true,
        message: "Evento recibido sin itemId (ignorado)",
        body: req.body
      });
    }

    console.log("📌 ITEM ID:", itemId);

    // =====================================
    // ✅ DATOS DESDE MONDAY
    // =====================================

    const values = event.columnValues || event;

    console.log("📊 VALUES RAW:", values);

    let data = {
      rfc: values.rfc,
      cliente: values.cliente,
      uso_cfdi: values.uso_cfdi,
      monto: values.monto
    };

    // =====================================
    // ✅ LIMPIAR DATA
    // =====================================

    data = {
      rfc: data.rfc?.trim().toUpperCase(),
      cliente: data.cliente?.trim(),
      uso_cfdi: data.uso_cfdi?.trim().toUpperCase(),
      monto: Number(data.monto)
    };

    console.log("✅ DATA LIMPIA:", data);

    // =====================================
    // ✅ VALIDACIONES
    // =====================================

    if (!data.rfc || !data.cliente || !data.monto) {
      return res.status(200).json({
        success: false,
        error: "Datos incompletos",
        data
      });
    }

    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(data.rfc)) {
      return res.status(200).json({
        success: false,
        error: "RFC inválido",
        data
      });
    }

    if (isNaN(data.monto) || data.monto <= 0) {
      return res.status(200).json({
        success: false,
        error: "Monto inválido",
        data
      });
    }

    // =====================================
    // ✅ CONSTRUIR CFDI
    // =====================================

    const cfdi = construirCFDI(data);

    console.log("📦 CFDI:", JSON.stringify(cfdi, null, 2));

    // =====================================
    // ✅ TIMBRAR EN SW
    // =====================================

    const result = await timbrarCFDI(cfdi);

    console.log("✅ RESPUESTA SW:", result);

    // =====================================
    // ✅ OBTENER XML
    // =====================================

    const xmlBase64 = result?.data?.xml;

    if (!xmlBase64) {
      return res.status(200).json({
        success: false,
        error: "SW no devolvió XML",
        result
      });
    }

    // =====================================
    // ✅ GUARDAR XML
    // =====================================

    const xmlBuffer = decodeBase64(xmlBase64);
    const xmlPath = saveFile(xmlBuffer, "factura.xml");

    console.log("📄 XML guardado:", xmlPath);

    // =====================================
    // ✅ SUBIR XML A MONDAY
    // =====================================

    await subirArchivoMonday(itemId, xmlPath, "archivo_xml"); 
    // 🔴 CAMBIA "archivo_xml" por tu ID real

    console.log("✅ XML subido a Monday");

    // =====================================
    // ✅ RESPUESTA FINAL
    // =====================================

    return res.status(200).json({
      success: true,
      message: "Factura generada correctamente",
      itemId
    });

  } catch (error) {
    console.error("❌ ERROR GENERAL:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
