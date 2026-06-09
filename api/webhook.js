import { construirCFDI } from "../lib/cfdi.js";
import { timbrarCFDI } from "../lib/sw.js";
import { subirArchivoMonday } from "../lib/monday.js";
import { decodeBase64, saveFile } from "../lib/files.js";

// ================================
// 🚀 WEBHOOK PRINCIPAL
// ================================

export default async function handler(req, res) {

  // ✅ 🔥 Verificación de Monday
  if (req.method === "GET") {
    return res.status(200).send(req.query.challenge);
  }

  try {
    console.log("📩 BODY:", JSON.stringify(req.body, null, 2));

    // ================================
    // 🧠 EVENTO
    // ================================

    const event = req.body.event || req.body;

    const itemId = event.pulseId || event.itemId;

    if (!itemId) {
      throw new Error("No se encontró itemId");
    }

    // ================================
    // 📊 DATOS DESDE MONDAY
    // ================================

    const values = event.columnValues || event;

    let data = {
      rfc: values.rfc,
      cliente: values.cliente,
      uso_cfdi: values.uso_cfdi,
      monto: values.monto
    };

    console.log("📊 RAW:", data);

    // ================================
    // ✅ LIMPIEZA
    // ================================

    data = {
      rfc: data.rfc?.trim().toUpperCase(),
      cliente: data.cliente?.trim(),
      uso_cfdi: data.uso_cfdi?.trim().toUpperCase(),
      monto: Number(data.monto)
    };

    if (!data.rfc || !data.cliente || !data.monto) {
      throw new Error("Datos incompletos desde Monday");
    }

    console.log("✅ DATA LIMPIA:", data);

    // ================================
    // 🧾 CFDI
    // ================================

    const cfdi = construirCFDI(data);

    // ================================
    // 🔥 TIMBRADO
    // ================================

    const result = await timbrarCFDI(cfdi);

    console.log("✅ TIMBRADO:", result);

    // ================================
    // 📄 XML
    // ================================

    const xmlBase64 = result?.data?.xml;

    if (!xmlBase64) {
      throw new Error("SW no devolvió XML");
    }

    const xmlBuffer = decodeBase64(xmlBase64);
    const xmlPath = saveFile(xmlBuffer, "factura.xml");

    // ================================
    // 📤 SUBIR A MONDAY
    // ================================

    await subirArchivoMonday(itemId, xmlPath, "archivo_xml");

    return res.status(200).json({
      success: true,
      message: "Factura generada OK"
    });

  } catch (error) {
    console.error("❌ ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
