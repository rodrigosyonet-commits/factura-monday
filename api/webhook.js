import fs from "fs";
import FormData from "form-data";

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
// ✅ VALIDACIONES
// ================================

function limpiarDatos(data) {
  return {
    rfc: data.rfc?.trim().toUpperCase(),
    cliente: data.cliente?.trim(),
    uso_cfdi: data.uso_cfdi?.trim().toUpperCase(),
    monto: Number(data.monto)
  };
}

function validarCampos(data) {
  const errores = [];

  if (!data.rfc) errores.push("RFC requerido");
  if (!data.cliente) errores.push("Nombre requerido");
  if (!data.uso_cfdi) errores.push("Uso CFDI requerido");
  if (!data.monto) errores.push("Monto requerido");

  if (errores.length) {
    throw new Error("Campos faltantes: " + errores.join(", "));
  }
}

function validarFormato(data) {
  const errores = [];

  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(data.rfc)) {
    errores.push("RFC inválido");
  }

  if (isNaN(data.monto) || data.monto <= 0) {
    errores.push("Monto inválido");
  }

  if (errores.length) {
    throw new Error("Formato inválido: " + errores.join(", "));
  }
}

// ================================
// 🔐 SW AUTH
// ================================

async function getToken() {
  const res = await fetch("https://api.sw.com.mx/security/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: process.env.SW_USER,
      password: process.env.SW_PASSWORD
    })
  });

  const data = await res.json();
  return data.token;
}

// ================================
// 🧾 TIMBRADO
// ================================

async function timbrarCFDI(payload) {
  const token = await getToken();

  const res = await fetch("https://api.sw.com.mx/cfdi40/stamp/json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}

// ================================
// 📤 SUBIR ARCHIVO A MONDAY
// ================================

async function subirArchivoMonday(itemId, filePath, columnId) {
  const formData = new FormData();

  formData.append("query", `
    mutation ($file: File!) {
      add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) {
        id
      }
    }
  `);

  formData.append("variables", JSON.stringify({}));
  formData.append("map", JSON.stringify({ file: ["variables.file"] }));
  formData.append("file", fs.createReadStream(filePath));

  const res = await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: {
      Authorization: process.env.MONDAY_API_KEY
    },
    body: formData
  });

  return res.json();
}

// ================================
// 🧱 ARMAR CFDI
// ================================

function construirCFDI(data) {
  return {
    credentials: {
      certificate: process.env.SW_CER,
      key: process.env.SW_KEY,
      password: process.env.SW_CERT_PASSWORD
    },
    cfdi: {
      Comprobante: {
        TipoDeComprobante: "I",
        MetodoPago: "PUE",
        Moneda: "MXN"
      },
      Emisor: {
        Rfc: process.env.RFC_EMISOR,
        Nombre: process.env.NOMBRE_EMISOR,
        RegimenFiscal: "601"
      },
      Receptor: {
        Rfc: data.rfc,
        Nombre: data.cliente,
        UsoCFDI: data.uso_cfdi
      },
      Conceptos: [
        {
          ClaveProdServ: "01010101",
          Cantidad: 1,
          ClaveUnidad: "ACT",
          Descripcion: "Servicio",
          ValorUnitario: data.monto,
          Importe: data.monto
        }
      ]
    }
  };
}

// ================================
// 🚀 WEBHOOK PRINCIPAL
// ================================

export default async function handler(req, res) {

  // ✅ 🔥 MONDAY VERIFICATION
  if (req.method === "GET") {
    return res.status(200).send(req.query.challenge);
  }

  try {
    console.log("📩 BODY:", JSON.stringify(req.body, null, 2));

    const event = req.body.event || req.body;

    const itemId = event.pulseId || event.itemId;

    if (!itemId) {
      throw new Error("No se encontró itemId");
    }

    const values = event.columnValues || event;

    let data = {
      rfc: values.rfc,
      cliente: values.cliente,
      uso_cfdi: values.uso_cfdi,
      monto: values.monto
    };

    // ✅ limpieza y validación
    data = limpiarDatos(data);
    validarCampos(data);
    validarFormato(data);

    console.log("✅ DATA VALIDADA:", data);

    // ✅ CFDI
    const cfdi = construirCFDI(data);

    // ✅ Timbrado
    const result = await timbrarCFDI(cfdi);

    console.log("✅ TIMBRADO:", result);

    // ✅ XML
    const xmlBase64 = result?.data?.xml;

    if (!xmlBase64) {
      throw new Error("SW no devolvió XML");
    }

    const xmlBuffer = decodeBase64(xmlBase64);
    const xmlPath = saveFile(xmlBuffer, "factura.xml");

    // ✅ subir a Monday
    await subirArchivoMonday(itemId, xmlPath, "archivo_xml");

    return res.status(200).json({
      success: true,
      message: "Factura generada correctamente"
    });

  } catch (error) {
    console.error("❌ ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
